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

// --- Snoozed findings (findingId → expiry timestamp) ---
const snoozedFindings = new Map<string, number>();

// --- Dismissed finding titles (persists across cron runs so dismissed findings don't reappear) ---
// Uses title instead of ID because the LLM generates new IDs each run
const dismissedFindingTitles = new Set<string>();

/** Remove expired snoozes */
function pruneExpiredSnoozes(): void {
  const now = Date.now();
  for (const [id, expiry] of snoozedFindings) {
    if (expiry <= now) {
      snoozedFindings.delete(id);
    }
  }
}

/** Convert graph output to the StoredFinding shape the frontend expects. */
function toStoredFindings(
  threadId: string,
  findings: Array<{ id: string; severity: string; title: string; description: string; evidence: string; recommendation: string; affectedDocumentIds?: string[] }>,
  proposedActions: Array<{ findingId: string; description: string; requiresConfirmation: boolean }>,
): StoredFinding[] {
  const now = new Date().toISOString();
  return findings.map((f) => {
    const actions = proposedActions
      .filter((a) => a.findingId === f.id)
      .map((a) => ({ id: randomUUID(), label: a.description, description: a.description }));
    // Use the first affected document ID if available
    const docId = f.affectedDocumentIds?.[0] || null;
    return {
      id: f.id,
      threadId,
      title: f.title,
      description: f.description,
      severity: f.severity as StoredFinding["severity"],
      category: "proactive",
      affectedDocumentId: docId,
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
  pruneExpiredSnoozes();
  const visibleFindings = storedFindings.filter((f) => !snoozedFindings.has(f.id));
  res.json({
    findings: visibleFindings,
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
    const { threadId, decision, findingId, snoozeDurationMs } = req.body;

    if (!threadId || !decision) {
      res.status(400).json({ error: "threadId and decision are required" });
      return;
    }

    if (decision !== "confirm" && decision !== "dismiss" && decision !== "snooze") {
      res.status(400).json({ error: "decision must be 'confirm', 'dismiss', or 'snooze'" });
      return;
    }

    if (decision === "snooze") {
      // Snooze hides the finding until the duration expires — it stays in the store
      const duration = typeof snoozeDurationMs === "number" && snoozeDurationMs > 0
        ? snoozeDurationMs
        : 60 * 60 * 1000; // default 1 hour
      const expiry = Date.now() + duration;
      if (findingId) {
        snoozedFindings.set(findingId, expiry);
        console.log(`[resume] finding ${findingId} snoozed until ${new Date(expiry).toISOString()}`);
      }
      res.json({
        threadId,
        status: "snoozed",
        decision,
        findingId: findingId || null,
        snoozeUntil: new Date(expiry).toISOString(),
      });
      return;
    }

    // Confirm or dismiss: remove this finding from the store
    if (findingId) {
      // Record the title so this finding doesn't reappear on the next cron run
      const dismissed = storedFindings.find((f) => f.id === findingId);
      if (dismissed) {
        dismissedFindingTitles.add(dismissed.title);
      }
      storedFindings = storedFindings.filter((f) => f.id !== findingId);
      snoozedFindings.delete(findingId); // clear any snooze too
      console.log(`[resume] finding ${findingId} ${decision}ed — ${storedFindings.length} findings remaining`);
    } else {
      // Legacy: no findingId — only remove the SINGLE FIRST finding for this thread (not all)
      const first = storedFindings.find((f) => f.threadId === threadId);
      if (first) {
        dismissedFindingTitles.add(first.title);
        storedFindings = storedFindings.filter((f) => f.id !== first.id);
        console.log(`[resume] finding ${first.id} ${decision}ed (legacy path) — ${storedFindings.length} findings remaining`);
      }
    }

    // Resume the graph if all findings for this thread have been acted on
    const remainingForThread = storedFindings.filter((f) => f.threadId === threadId);
    if (remainingForThread.length === 0) {
      const config = { configurable: { thread_id: threadId } };
      for (const graph of [proactiveGraph, onDemandGraph]) {
        try {
          const state = await graph.getState(config);
          if (state?.next?.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const resumeCmd = new Command({ resume: { decision } }) as any;
            await graph.invoke(resumeCmd, config);
            console.log(`[resume] graph resumed for thread ${threadId} (all findings handled)`);
            break;
          }
        } catch {
          // Thread not found in this graph — try next
        }
      }
    }

    res.json({
      threadId,
      status: "resumed",
      decision,
      findingId: findingId || null,
      remainingFindings: storedFindings.filter((f) => f.threadId === threadId).length,
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
      const findings = (payload?.findings ?? []) as Array<{ id: string; severity: string; title: string; description: string; evidence: string; recommendation: string; affectedDocumentIds?: string[] }>;
      const actions = (payload?.proposedActions ?? []) as Array<{ findingId: string; description: string; requiresConfirmation: boolean }>;
      const newFindings = toStoredFindings(threadId, findings, actions)
        .filter((f) => !dismissedFindingTitles.has(f.title));
      storedFindings = newFindings;
      console.log(
        `[cron] findings detected — paused at confirmation_gate (thread: ${threadId})`
      );
      console.log(
        `[cron] ${findings.length} raw finding(s), ${newFindings.length} after filtering dismissed — stored and awaiting review`
      );
      return;
    }

    // Clean run — clear stale findings (but keep dismissed titles so they don't return)
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
