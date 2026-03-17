import express from "express";
import cron from "node-cron";
import { randomUUID } from "crypto";
import { Command } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { buildProactiveGraph } from "./graph/proactive.js";
import { buildOnDemandGraph } from "./graph/on-demand.js";
import { isInterruptedResult, extractInterruptPayloadFromState } from "./utils/graph-helpers.js";

// --- Environment validation ---
const PORT = process.env.PORT || 3001;
const SHIP_API_URL = process.env.SHIP_API_URL;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is required");
  process.exit(1);
}

if (!process.env.FLEETGRAPH_API_TOKEN) {
  console.warn("FLEETGRAPH_API_TOKEN not set — Ship API calls will fail");
}

if (!SHIP_API_URL) {
  console.warn("SHIP_API_URL not set — defaulting to http://localhost:3000");
}

// Log LangSmith tracing status
console.log(
  `LangSmith tracing: ${process.env.LANGSMITH_TRACING === "true" ? "ENABLED" : "DISABLED"}`
);

// --- Configurable polling interval ---
const CRON_INTERVAL = process.env.FLEETGRAPH_CRON_INTERVAL || "*/3 * * * *";

// --- Track last proactive run timestamp ---
let lastRunTimestamp: string | null = null;
let proactiveRunning = false;

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
    lastRunTimestamp,
  });
});

/**
 * On-demand chat endpoint.
 * Called from Ship's embedded chat UI with document context.
 */
app.post("/api/fleetgraph/chat", async (req, res) => {
  try {
    const { documentId, documentType, message, threadId, workspaceId } =
      req.body || {};

    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "message is required and must be a string" });
      return;
    }

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

    // Check for non-throwing interrupt (MemorySaver pattern)
    if (isInterruptedResult(result)) {
      const payload = await extractInterruptPayloadFromState(onDemandGraph, config);
      res.json({
        threadId: config.configurable.thread_id,
        status: "pending_confirmation",
        ...payload,
      });
      return;
    }

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
 * Supports both proactive and on-demand graphs.
 */
app.post("/api/fleetgraph/resume", async (req, res) => {
  try {
    const { threadId, decision } = req.body;

    if (!threadId || !decision) {
      res.status(400).json({ error: "threadId and decision are required" });
      return;
    }

    if (decision !== "confirm" && decision !== "dismiss") {
      res.status(400).json({ error: "decision must be 'confirm' or 'dismiss'" });
      return;
    }

    const config = { configurable: { thread_id: threadId } };

    // Check if thread exists and has a pending interrupt in either graph
    let targetGraph = null;
    for (const graph of [proactiveGraph, onDemandGraph]) {
      try {
        const state = await graph.getState(config);
        if (state?.next?.length > 0) {
          targetGraph = graph;
          break;
        }
      } catch {
        // Thread not found in this graph — try next
      }
    }

    if (!targetGraph) {
      res.status(404).json({
        error: `No pending interrupt found for thread '${threadId}'. The thread may not exist, may have already been resumed, or the service may have restarted (MemorySaver is in-memory only).`,
      });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resumeCmd = new Command({ resume: { decision } }) as any;
    const result = await targetGraph.invoke(resumeCmd, config);

    console.log(`[resume] thread ${threadId} resumed with decision: ${decision}`);

    res.json({
      threadId,
      status: "resumed",
      decision,
      findings: result.findings,
      humanDecision: result.humanDecision,
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
 * Returns interrupt payload when findings trigger confirmation gate.
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

    // Check for non-throwing interrupt (MemorySaver pattern)
    if (isInterruptedResult(result)) {
      const payload = await extractInterruptPayloadFromState(proactiveGraph, config);
      console.log(
        `[analyze] paused at confirmation_gate — thread ${threadId}`
      );
      res.json({
        threadId,
        status: "pending_confirmation",
        ...payload,
      });
      return;
    }

    // Clean run or graceful degrade — no interrupt
    res.json({
      threadId,
      status: "complete",
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

// --- Proactive polling (configurable interval, default every 3 minutes) ---
cron.schedule(CRON_INTERVAL, async () => {
  if (proactiveRunning) {
    console.log("[cron] skipping — previous run still in progress");
    return;
  }
  proactiveRunning = true;
  const now = new Date().toISOString();
  lastRunTimestamp = now;
  console.log(`[cron] Proactive health check triggered at ${now}`);
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

    // Check for non-throwing interrupt (MemorySaver pattern)
    if (isInterruptedResult(result)) {
      const payload = await extractInterruptPayloadFromState(proactiveGraph, config);
      console.log(
        `[cron] findings detected — paused at confirmation_gate (thread: ${threadId})`
      );
      console.log(
        `[cron] ${(payload?.findings as unknown[])?.length ?? 0} finding(s) awaiting review via POST /api/fleetgraph/resume`
      );
      return;
    }

    console.log("[cron] clean run, no issues detected");
  } catch (err) {
    console.error("[cron] proactive run failed:", err);
  } finally {
    proactiveRunning = false;
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`FleetGraph service running on port ${PORT}`);
  console.log(`Ship API: ${SHIP_API_URL || "http://localhost:3000"}`);
});
