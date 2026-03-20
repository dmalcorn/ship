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

// --- In-memory findings store (populated by proactive cron, served to frontend) ---
interface StoredFinding {
  id: string;
  threadId: string;
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
  category: string;
  affectedDocumentId: string | null;
  affectedDocumentTitle: string | null;
  proposedActions: Array<{ id: string; label: string; description: string }>;
  createdAt: string;
}
let storedFindings: StoredFinding[] = [];

/** Convert graph output to the StoredFinding shape the frontend expects. */
function toStoredFindings(
  threadId: string,
  findings: Array<{ id: string; severity: string; title: string; description: string; evidence: string; recommendation: string }>,
  proposedActions: Array<{ findingId: string; description: string; requiresConfirmation: boolean }>,
): StoredFinding[] {
  const now = new Date().toISOString();
  return findings.map((f) => {
    const actions = proposedActions
      .filter((a) => a.findingId === f.id)
      .map((a) => ({ id: randomUUID(), label: a.description, description: a.description }));
    return {
      id: f.id,
      threadId,
      title: f.title,
      description: f.description,
      severity: f.severity as StoredFinding["severity"],
      category: "proactive",
      affectedDocumentId: null,
      affectedDocumentTitle: null,
      proposedActions: actions,
      createdAt: now,
    };
  });
}

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
 * Findings endpoint — returns proactive findings stored in memory.
 * Polled by the Ship frontend every 30 seconds.
 */
app.get("/api/fleetgraph/findings", (_req, res) => {
  res.json({
    findings: storedFindings,
    lastScanAt: lastRunTimestamp,
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

    // Remove findings for this thread from the store on dismiss, or mark confirmed
    if (decision === "dismiss") {
      storedFindings = storedFindings.filter((f) => f.threadId !== threadId);
    }

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
      const findings = (payload?.findings ?? []) as Array<{ id: string; severity: string; title: string; description: string; evidence: string; recommendation: string }>;
      const actions = (payload?.proposedActions ?? []) as Array<{ findingId: string; description: string; requiresConfirmation: boolean }>;
      storedFindings = toStoredFindings(threadId, findings, actions);
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
    storedFindings = [];
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
      const findings = (payload?.findings ?? []) as Array<{ id: string; severity: string; title: string; description: string; evidence: string; recommendation: string }>;
      const actions = (payload?.proposedActions ?? []) as Array<{ findingId: string; description: string; requiresConfirmation: boolean }>;
      storedFindings = toStoredFindings(threadId, findings, actions);
      console.log(
        `[cron] findings detected — paused at confirmation_gate (thread: ${threadId})`
      );
      console.log(
        `[cron] ${findings.length} finding(s) stored and awaiting review`
      );
      return;
    }

    // Clean run — clear stale findings
    storedFindings = [];
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
