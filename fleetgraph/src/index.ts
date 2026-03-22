import express from "express";
import cron from "node-cron";
import { randomUUID } from "crypto";
import { Command } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { buildProactiveGraph } from "./graph/proactive.js";
import { buildOnDemandGraph } from "./graph/on-demand.js";
import { isInterruptedResult, extractInterruptPayloadFromState } from "./utils/graph-helpers.js";
import { shipApi } from "./utils/ship-api.js";
import { invalidateDataHash, resetDataHash } from "./nodes/change-detection.js";

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

// --- Track last proactive run timestamp and diagnostics ---
let lastRunTimestamp: string | null = null;
let proactiveRunning = false;
let lastRunPath: string = "none";  // Which terminal node was hit
let lastRunFindingsCount: number = 0;  // How many findings the LLM returned
let lastRunErrors: string[] = [];  // Errors from the last run

// --- Automated action types for one-click fixes ---
interface AutomatedAction {
  /** Machine-readable action type for the apply-action endpoint */
  actionType: "close_empty_sprint" | "archive_duplicate" | "assign_to_sprint";
  /** Human-readable explanation shown on the finding card */
  label: string;
  /** Button text (short, fits a small button) */
  buttonLabel: string;
  /** IDs and context needed to execute the action */
  payload: Record<string, string>;
}

// --- In-memory findings store (populated by proactive cron, served to frontend) ---
interface StoredFinding {
  id: string;
  threadId: string;
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
  category: string;
  detectionCategory: string;
  programId: string | null;
  programPrefix: string | null;
  affectedDocumentId: string | null;
  affectedDocumentType: string | null;
  affectedDocumentTitle: string | null;
  affectedDocumentCount: number;
  proposedActions: Array<{ id: string; label: string; description: string }>;
  automatedAction: AutomatedAction | null;
  createdAt: string;
}
let storedFindings: StoredFinding[] = [];

// --- Snoozed findings (compositeKey → expiry timestamp) ---
// Keyed by composite key (not finding ID) so snoozes survive finding regeneration across cron runs
const snoozedFindings = new Map<string, number>();

// --- Dismissed finding keys (persists across cron runs so dismissed findings don't reappear) ---
// Uses a composite key of stable, data-derived fields instead of LLM-generated titles/IDs
const dismissedKeys = new Set<string>();

/** Build a composite key from stable, data-derived fields.
 *  Uses detectionCategory (constrained enum) instead of LLM-generated title for stability. */
function buildCompositeKey(f: { affectedDocumentId: string | null; affectedDocumentType: string | null; severity: string; detectionCategory: string }): string {
  const docType = f.affectedDocumentType || "unknown";
  const docId = f.affectedDocumentId || "none";
  return `${docType}|${docId}|${f.severity}|${f.detectionCategory}`;
}

/** Remove expired snoozes */
function pruneExpiredSnoozes(): void {
  const now = Date.now();
  for (const [id, expiry] of snoozedFindings) {
    if (expiry <= now) {
      snoozedFindings.delete(id);
    }
  }
}


/** Determine if a finding has an automatable fix and return the action descriptor. */
function buildAutomatedAction(
  category: string,
  docIds: string[],
  docType: string | undefined,
  sprintData: Record<string, unknown> | null,
): AutomatedAction | null {
  const docId = docIds.length === 1 ? docIds[0] : undefined;

  switch (category) {
    case "empty_sprint":
      // Empty sprint with 0 issues can be closed automatically
      if (docId && docType === "sprint") {
        return {
          actionType: "close_empty_sprint",
          label: "This sprint has no issues. It can be closed automatically since there's nothing to lose.",
          buttonLabel: "Close Sprint",
          payload: { sprintId: docId },
        };
      }
      return null;

    case "duplicate":
      // If exactly 2 issues flagged, the newer one can be archived
      if (docIds.length === 2) {
        return {
          actionType: "archive_duplicate",
          label: "These issues appear to be duplicates. The second issue can be archived, keeping the original.",
          buttonLabel: "Archive Duplicate",
          payload: { keepId: docIds[0]!, archiveId: docIds[1]! },
        };
      }
      return null;

    case "missing_sprint":
    case "unscheduled_high_priority": {
      // Unscheduled issues can be assigned to the current sprint.
      // We don't pre-compute sprintId here because the issue's program determines
      // which sprint it should go to. The apply-action endpoint resolves the correct
      // sprint at execution time by looking up the issue's program association.
      if (docId) {
        return {
          actionType: "assign_to_sprint",
          label: "This issue isn't in any sprint. It can be added to the current active sprint.",
          buttonLabel: "Add to Sprint",
          payload: { issueId: docId },
        };
      }
      return null;
    }

    default:
      return null;
  }
}

/** Convert graph output to the StoredFinding shape the frontend expects. */
function toStoredFindings(
  threadId: string,
  findings: Array<{ id: string; severity: string; category?: string; title: string; description: string; evidence: string; recommendation: string; affectedDocumentIds?: string[]; affectedDocumentType?: string }>,
  proposedActions: Array<{ findingId: string; description: string; requiresConfirmation: boolean }>,
  sprintData?: Record<string, unknown> | null,
): StoredFinding[] {
  const now = new Date().toISOString();
  return findings.map((f) => {
    const actions = proposedActions
      .filter((a) => a.findingId === f.id)
      .map((a) => ({ id: randomUUID(), label: a.description, description: a.description }));
    // Single affected document → link directly; multiple → navigate to list view
    const docIds = f.affectedDocumentIds || [];
    const docId = docIds.length === 1 ? (docIds[0] ?? null) : null;
    const detectionCategory = f.category || "other";
    return {
      id: f.id,
      threadId,
      title: f.title,
      description: f.description,
      severity: f.severity as StoredFinding["severity"],
      category: "proactive",
      detectionCategory,
      programId: null, // enriched async by enrichFindingsWithPrograms()
      programPrefix: null,
      affectedDocumentId: docId,
      affectedDocumentType: f.affectedDocumentType || null,
      affectedDocumentTitle: null,
      affectedDocumentCount: docIds.length,
      proposedActions: actions,
      automatedAction: buildAutomatedAction(detectionCategory, docIds, f.affectedDocumentType, sprintData ?? null),
      createdAt: now,
    };
  });
}

/** Batch-resolve program IDs for findings by looking up associations for affected documents. */
async function enrichFindingsWithPrograms(
  findings: StoredFinding[],
  rawFindings?: Array<{ id: string; affectedDocumentIds?: string[] }>,
): Promise<void> {
  // Build a map from finding ID to first affected doc ID (for multi-ID findings where affectedDocumentId is null)
  const findingToFirstDoc = new Map<string, string>();
  if (rawFindings) {
    for (const rf of rawFindings) {
      const firstId = rf.affectedDocumentIds?.[0];
      if (firstId) findingToFirstDoc.set(rf.id, firstId);
    }
  }

  // Collect unique doc IDs: from stored findings + first doc of multi-ID findings
  const docIds = [...new Set([
    ...findings.map((f) => f.affectedDocumentId).filter(Boolean) as string[],
    ...findingToFirstDoc.values(),
  ])];
  if (docIds.length === 0) return;

  // Batch lookup: fetch associations for each doc to find its program
  const docToProgram = new Map<string, string>();
  await Promise.allSettled(
    docIds.map(async (docId) => {
      try {
        const assocs = (await shipApi.getDocumentAssociations(docId)) as Array<{
          related_id: string;
          relationship_type: string;
        }>;
        const programAssoc = assocs.find((a) => a.relationship_type === "program");
        if (programAssoc) {
          docToProgram.set(docId, programAssoc.related_id);
        }
      } catch {
        // Skip — finding will have programId: null
      }
    }),
  );

  // Fetch program prefixes for each unique program ID
  const uniqueProgramIds = [...new Set(docToProgram.values())];
  const programPrefixes = new Map<string, string>();
  await Promise.allSettled(
    uniqueProgramIds.map(async (programId) => {
      try {
        const doc = (await shipApi.getDocument(programId)) as { properties?: { prefix?: string } };
        if (doc?.properties?.prefix) {
          programPrefixes.set(programId, doc.properties.prefix);
        }
      } catch { /* skip */ }
    }),
  );

  // Apply program IDs and prefixes to findings
  for (const f of findings) {
    // Use affectedDocumentId if available, otherwise fall back to first doc from raw findings
    const lookupId = f.affectedDocumentId ?? findingToFirstDoc.get(f.id);
    if (lookupId && docToProgram.has(lookupId)) {
      const pid = docToProgram.get(lookupId)!;
      f.programId = pid;
      f.programPrefix = programPrefixes.get(pid) ?? null;
    } else {
      console.log(`[enrichFindingsWithPrograms] no program for finding "${f.id}" (lookupId=${lookupId ?? "none"}, firstDoc=${findingToFirstDoc.get(f.id) ?? "none"})`);
    }
  }

  // Fallback: if some findings have no program but others do, inherit the most common prefix
  const resolvedPrefix = findings.find((f) => f.programPrefix)?.programPrefix ?? null;
  const resolvedProgramId = findings.find((f) => f.programId)?.programId ?? null;
  if (resolvedPrefix) {
    for (const f of findings) {
      if (!f.programPrefix) {
        f.programId = resolvedProgramId;
        f.programPrefix = resolvedPrefix;
        console.log(`[enrichFindingsWithPrograms] inherited prefix "${resolvedPrefix}" for finding "${f.id}"`);
      }
    }
  }

  console.log(`[enrichFindingsWithPrograms] resolved programs for ${docToProgram.size}/${docIds.length} documents, ${programPrefixes.size} prefixes`);
}

// --- Build graphs ---
const proactiveGraph = buildProactiveGraph();
const onDemandGraph = buildOnDemandGraph();

// --- Express app ---
const app = express();
app.use(express.json());

// Health check with diagnostics
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "fleetgraph",
    tracing: process.env.LANGSMITH_TRACING === "true",
    uptime: process.uptime(),
    lastRunTimestamp,
    lastRunPath,
    lastRunFindingsCount,
    lastRunErrors,
    storedFindingsCount: storedFindings.length,
    dismissedKeysCount: dismissedKeys.size,
    snoozedCount: snoozedFindings.size,
  });
});

/**
 * Findings endpoint — returns proactive findings stored in memory.
 * Polled by the Ship frontend every 30 seconds.
 */
app.get("/api/fleetgraph/findings", (req, res) => {
  pruneExpiredSnoozes();
  const programId = req.query.programId as string | undefined;
  let visibleFindings = storedFindings.filter((f) => !snoozedFindings.has(buildCompositeKey(f)));
  if (programId) {
    visibleFindings = visibleFindings.filter((f) => f.programId === programId);
  }
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
      // Snooze hides the finding until the duration expires — it stays in the store.
      // Keyed by composite key so snooze survives finding regeneration across cron runs.
      const duration = typeof snoozeDurationMs === "number" && snoozeDurationMs > 0
        ? snoozeDurationMs
        : 60 * 60 * 1000; // default 1 hour
      const expiry = Date.now() + duration;
      if (findingId) {
        const finding = storedFindings.find((f) => f.id === findingId);
        if (finding) {
          const key = buildCompositeKey(finding);
          snoozedFindings.set(key, expiry);
          console.log(`[resume] finding ${findingId} (key: ${key}) snoozed until ${new Date(expiry).toISOString()}`);
        }
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
      // Record the composite key so this finding doesn't reappear on the next cron run
      const dismissed = storedFindings.find((f) => f.id === findingId);
      if (dismissed) {
        const key = buildCompositeKey(dismissed);
        dismissedKeys.add(key);
        snoozedFindings.delete(key); // clear any snooze too
      }
      storedFindings = storedFindings.filter((f) => f.id !== findingId);
      console.log(`[resume] finding ${findingId} ${decision}ed — ${storedFindings.length} findings remaining`);
    } else {
      // Legacy: no findingId — cannot identify which finding was acted on, so do nothing.
      // The new frontend always sends findingId; this path only runs for stale clients.
      console.warn(`[resume] no findingId provided — cannot identify finding to ${decision}. Ignoring.`);
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
 * Apply an automated action for a finding.
 * The user clicked "Apply Fix" on a finding card — execute the pre-defined action.
 */
app.post("/api/fleetgraph/apply-action", async (req, res) => {
  try {
    const { findingId, actionType, payload } = req.body;

    if (!findingId || !actionType || !payload) {
      res.status(400).json({ error: "findingId, actionType, and payload are required" });
      return;
    }

    const finding = storedFindings.find((f) => f.id === findingId);
    if (!finding) {
      res.status(404).json({ error: "Finding not found" });
      return;
    }

    console.log(`[apply-action] executing ${actionType} for finding ${findingId}`);

    switch (actionType) {
      case "close_empty_sprint": {
        const { sprintId } = payload;
        if (!sprintId) { res.status(400).json({ error: "sprintId required" }); return; }
        await shipApi.updateSprint(sprintId, { properties: { state: "cancelled" } });
        console.log(`[apply-action] closed empty sprint ${sprintId}`);
        break;
      }

      case "archive_duplicate": {
        const { archiveId } = payload;
        if (!archiveId) { res.status(400).json({ error: "archiveId required" }); return; }
        await shipApi.deleteIssue(archiveId);
        console.log(`[apply-action] archived duplicate issue ${archiveId}`);
        break;
      }

      case "assign_to_sprint": {
        const { issueId } = payload;
        if (!issueId) { res.status(400).json({ error: "issueId required" }); return; }

        // Resolve the correct sprint by finding the issue's program, then matching
        // to the current sprint for that program
        const issueAssocs = await shipApi.getDocumentAssociations(issueId) as Array<{ related_id: string; relationship_type: string }>;
        const programId = issueAssocs.find((a) => a.relationship_type === "program")?.related_id;
        if (!programId) {
          res.status(400).json({ error: "Issue has no program association — cannot determine sprint" });
          return;
        }

        // Fetch all current sprints and find the one matching this program
        const weeksData = await shipApi.getWeeks() as Record<string, unknown>;
        const allSprints = (Array.isArray((weeksData).weeks) ? (weeksData).weeks : (Array.isArray(weeksData) ? weeksData : [])) as Array<Record<string, unknown>>;
        const matchingSprint = allSprints.find((s) => s.program_id === programId);
        if (!matchingSprint) {
          res.status(400).json({ error: `No current sprint found for program ${programId}` });
          return;
        }

        const sprintId = matchingSprint.id as string;
        await shipApi.addSprintAssociation(issueId, sprintId);
        console.log(`[apply-action] assigned issue ${issueId} to sprint ${sprintId} (program ${programId})`);
        break;
      }

      default:
        res.status(400).json({ error: `Unknown actionType: ${actionType}` });
        return;
    }

    // Remove the finding from the store (action was taken — finding is resolved)
    const key = buildCompositeKey(finding);
    dismissedKeys.add(key);
    snoozedFindings.delete(key);
    storedFindings = storedFindings.filter((f) => f.id !== findingId);

    // Invalidate the change detection cache so the next cron run re-analyzes
    invalidateDataHash();

    res.json({
      status: "applied",
      actionType,
      findingId,
      remainingFindings: storedFindings.length,
    });
  } catch (err) {
    console.error("[apply-action] error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to apply action",
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
      const findings = (payload?.findings ?? []) as Array<{ id: string; severity: string; title: string; description: string; evidence: string; recommendation: string; affectedDocumentIds?: string[]; affectedDocumentType?: string }>;
      const actions = (payload?.proposedActions ?? []) as Array<{ findingId: string; description: string; requiresConfirmation: boolean }>;
      const sprintCtx = (result.sprintData ?? null) as Record<string, unknown> | null;
      storedFindings = toStoredFindings(threadId, findings, actions, sprintCtx);
      await enrichFindingsWithPrograms(storedFindings, findings);
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

// --- Proactive health-check logic (shared by cron + startup) ---
async function runProactiveHealthCheck(): Promise<void> {
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

    // Log raw result for diagnostics
    lastRunErrors = result.errors ?? [];
    console.log(`[cron] result: dataChanged=${result.dataChanged}, severity=${result.severity}, findings=${result.findings?.length ?? 0}, errors=${lastRunErrors.length}, interrupted=${isInterruptedResult(result)}`);

    // Check for non-throwing interrupt (MemorySaver pattern)
    if (isInterruptedResult(result)) {
      const payload = await extractInterruptPayloadFromState(proactiveGraph, config);
      const findings = (payload?.findings ?? []) as Array<{ id: string; severity: string; title: string; description: string; evidence: string; recommendation: string; affectedDocumentIds?: string[]; affectedDocumentType?: string }>;
      const actions = (payload?.proposedActions ?? []) as Array<{ findingId: string; description: string; requiresConfirmation: boolean }>;
      const sprintCtx = (result.sprintData ?? null) as Record<string, unknown> | null;
      const newFindings = toStoredFindings(threadId, findings, actions, sprintCtx)
        .filter((f) => !dismissedKeys.has(buildCompositeKey(f)));
      await enrichFindingsWithPrograms(newFindings, findings);
      storedFindings = newFindings;
      lastRunPath = "confirmation_gate (findings)";
      lastRunFindingsCount = findings.length;
      console.log(
        `[cron] findings detected — paused at confirmation_gate (thread: ${threadId})`
      );
      console.log(
        `[cron] ${findings.length} raw finding(s), ${newFindings.length} after filtering dismissed — stored and awaiting review`
      );
      return;
    }

    // Data unchanged — change_detection skipped the LLM. Keep existing findings.
    if (!result.dataChanged) {
      if (storedFindings.length === 0) {
        // No findings to keep — force re-analysis next cycle so we don't get stuck
        invalidateDataHash();
        lastRunPath = "data_unchanged (no findings — hash invalidated)";
        console.log("[cron] data unchanged but no findings stored — will re-analyze next cycle");
      } else {
        lastRunPath = "data_unchanged (keeping findings)";
        console.log("[cron] data unchanged — keeping existing findings");
      }
      lastRunFindingsCount = 0;
      return;
    }

    // Clean run (LLM ran but found nothing) — reset hash so next cron re-analyzes
    resetDataHash();
    storedFindings = [];
    lastRunPath = "log_clean_run (LLM found nothing)";
    lastRunFindingsCount = 0;
    console.log("[cron] clean run, no issues detected — will re-analyze next cycle");
  } catch (err) {
    console.error("[cron] proactive run failed:", err);
  } finally {
    proactiveRunning = false;
  }
}

// Schedule recurring cron
cron.schedule(CRON_INTERVAL, runProactiveHealthCheck);

// --- Start server ---
app.listen(PORT, () => {
  console.log(`FleetGraph service running on port ${PORT}`);
  console.log(`Ship API: ${SHIP_API_URL || "http://localhost:3000"}`);

  // Run first health check 10s after startup (gives Ship API time to be ready)
  setTimeout(() => {
    console.log("[startup] triggering initial proactive health check");
    runProactiveHealthCheck().catch((err) =>
      console.error("[startup] initial health check failed:", err)
    );
  }, 10_000);
});
