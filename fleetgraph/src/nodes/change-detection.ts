import { createHash } from "crypto";
import type { FleetGraphStateType } from "../state.js";

/**
 * Module-level hash of the last analyzed data snapshot.
 * Persists across graph invocations (within the same process),
 * resets on deploy (acceptable for MVP with MemorySaver).
 */
let previousDataHash: string | null = null;

/** Reset the hash cache (called when an automated action modifies data). */
export function invalidateDataHash(): void {
  previousDataHash = null;
}

/**
 * Change detection gate — hashes the fetched state and short-circuits
 * the graph if data hasn't changed since the last analysis.
 *
 * Sits between enrich_associations and analyze_health in the proactive graph.
 * Returns { dataChanged: true } to proceed or { dataChanged: false } to skip.
 */
export async function changeDetection(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
  // Build a deterministic snapshot from the already-fetched data
  const snapshot = JSON.stringify([
    state.issues,
    state.sprintData,
    state.allSprints,
    state.teamGrid,
    state.standupStatus,
  ]);

  const currentHash = createHash("sha256").update(snapshot).digest("hex");

  if (previousDataHash !== null && currentHash === previousDataHash) {
    console.log("[change_detection] data unchanged — skipping LLM analysis");
    return { dataChanged: false };
  }

  console.log("[change_detection] data changed (or first run) — proceeding to analysis");
  // Store hash now; the graph router will decide what happens next.
  // On findings path: hash stays cached so next cron skips.
  // On clean path: the cron handler resets it so we re-check next cycle.
  previousDataHash = currentHash;
  return { dataChanged: true };
}

/** Reset the cached hash so the next cron run re-analyzes (used after clean runs). */
export function resetDataHash(): void {
  previousDataHash = null;
}
