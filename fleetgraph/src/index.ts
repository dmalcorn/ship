import express from "express";
import cron from "node-cron";
import { randomUUID } from "crypto";
import { Command } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { buildProactiveGraph } from "./graph/proactive.js";
import { buildOnDemandGraph } from "./graph/on-demand.js";

// --- Environment validation ---
const PORT = process.env.PORT || 3001;
const SHIP_API_URL = process.env.SHIP_API_URL;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is required");
  process.exit(1);
}

if (!SHIP_API_URL) {
  console.warn("SHIP_API_URL not set — defaulting to http://localhost:3000");
}

// Log LangSmith tracing status
console.log(
  `LangSmith tracing: ${process.env.LANGSMITH_TRACING === "true" ? "ENABLED" : "DISABLED"}`
);

// --- Build graphs ---
const proactiveGraph = buildProactiveGraph();
const onDemandGraph = buildOnDemandGraph();

// --- Express app ---
const app = express();
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "fleetgraph",
    tracing: process.env.LANGSMITH_TRACING === "true",
    uptime: process.uptime(),
  });
});

/**
 * On-demand chat endpoint.
 * Called from Ship's embedded chat UI with document context.
 */
app.post("/api/fleetgraph/chat", async (req, res) => {
  try {
    const { documentId, documentType, message, threadId, workspaceId } =
      req.body;

    const config = {
      configurable: { thread_id: threadId || randomUUID() },
    };

    const result = await onDemandGraph.invoke(
      {
        triggerType: "on-demand" as const,
        documentId: documentId || null,
        documentType: documentType || null,
        workspaceId: workspaceId || "",
        messages: [new HumanMessage(message || "Analyze current state")],
      },
      config
    );

    res.json({
      threadId: config.configurable.thread_id,
      findings: result.findings,
      severity: result.severity,
      proposedActions: result.proposedActions,
      errors: result.errors,
    });
  } catch (err) {
    console.error("[chat] error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Internal error",
    });
  }
});

/**
 * Resume endpoint for human-in-the-loop confirmation.
 */
app.post("/api/fleetgraph/resume", async (req, res) => {
  try {
    const { threadId, decision } = req.body;

    if (!threadId || !decision) {
      res.status(400).json({ error: "threadId and decision are required" });
      return;
    }

    const config = { configurable: { thread_id: threadId } };
    const result = await proactiveGraph.invoke(
      new Command({ resume: { decision } }),
      config
    );

    res.json({
      threadId,
      status: "resumed",
      findings: result.findings,
    });
  } catch (err) {
    console.error("[resume] error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Internal error",
    });
  }
});

/**
 * Manual trigger for proactive analysis (useful for testing).
 */
app.post("/api/fleetgraph/analyze", async (req, res) => {
  try {
    const threadId = randomUUID();
    const config = { configurable: { thread_id: threadId } };

    const result = await proactiveGraph.invoke(
      {
        triggerType: "proactive" as const,
        workspaceId: req.body.workspaceId || "",
      },
      config
    );

    res.json({
      threadId,
      findings: result.findings,
      severity: result.severity,
      proposedActions: result.proposedActions,
      errors: result.errors,
    });
  } catch (err) {
    console.error("[analyze] error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Internal error",
    });
  }
});

// --- Proactive polling (every 3 minutes) ---
cron.schedule("*/3 * * * *", async () => {
  console.log(`[cron] proactive health check at ${new Date().toISOString()}`);
  try {
    const threadId = `proactive-${Date.now()}`;
    const config = { configurable: { thread_id: threadId } };

    const result = await proactiveGraph.invoke(
      {
        triggerType: "proactive" as const,
        workspaceId: "",
      },
      config
    );

    if (result.findings.length > 0) {
      console.log(
        `[cron] ${result.findings.length} findings (severity: ${result.severity})`
      );
      // TODO: deliver findings to Ship agent findings panel
    } else {
      console.log("[cron] clean run, no issues detected");
    }
  } catch (err) {
    console.error("[cron] proactive run failed:", err);
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`FleetGraph service running on port ${PORT}`);
  console.log(`Ship API: ${SHIP_API_URL || "http://localhost:3000"}`);
});
