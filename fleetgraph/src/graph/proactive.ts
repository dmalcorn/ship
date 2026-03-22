import { END, StateGraph } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { FleetGraphState } from "../state.js";
import { resolveContext } from "../nodes/context.js";
import { fetchIssues, fetchSprint, fetchTeam, fetchStandups } from "../nodes/fetch.js";
import { enrichAssociations } from "../nodes/enrich.js";
import { changeDetection } from "../nodes/change-detection.js";
import { analyzeHealth } from "../nodes/reasoning.js";
import {
  proposeActions,
  confirmationGate,
  logCleanRun,
  logSkippedRun,
  gracefulDegrade,
} from "../nodes/actions.js";

/**
 * Build the proactive health-check graph.
 *
 * Flow:
 *   START -> resolve_context -> [fetch_issues, fetch_sprint, fetch_team, fetch_standups] (parallel)
 *         -> enrich_associations
 *         -> change_detection -> (unchanged? -> log_skipped_run -> END)
 *                             -> (changed? -> analyze_health -> clean/findings/errors routing)
 *         -> analyze_health -> (clean? -> log_clean_run -> END)
 *                           -> (findings? -> propose_actions -> confirmation_gate -> END)
 *                           -> (errors? -> graceful_degrade -> END)
 */
export function buildProactiveGraph() {
  const graph = new StateGraph(FleetGraphState)
    // Nodes
    .addNode("resolve_context", resolveContext)
    .addNode("fetch_issues", fetchIssues)
    .addNode("fetch_sprint", fetchSprint)
    .addNode("fetch_team", fetchTeam)
    .addNode("fetch_standups", fetchStandups)
    .addNode("enrich_associations", enrichAssociations)
    .addNode("change_detection", changeDetection)
    .addNode("analyze_health", analyzeHealth)
    .addNode("propose_actions", proposeActions)
    .addNode("confirmation_gate", confirmationGate)
    .addNode("log_clean_run", logCleanRun)
    .addNode("log_skipped_run", logSkippedRun)
    .addNode("graceful_degrade", gracefulDegrade)

    // Entry
    .addEdge("__start__", "resolve_context")

    // Parallel fan-out: context → all fetch nodes
    .addEdge("resolve_context", "fetch_issues")
    .addEdge("resolve_context", "fetch_sprint")
    .addEdge("resolve_context", "fetch_team")
    .addEdge("resolve_context", "fetch_standups")

    // All fetches converge into enrichment
    .addEdge("fetch_issues", "enrich_associations")
    .addEdge("fetch_sprint", "enrich_associations")
    .addEdge("fetch_team", "enrich_associations")
    .addEdge("fetch_standups", "enrich_associations")

    // Enrichment → change detection gate
    .addEdge("enrich_associations", "change_detection")

    // Change detection: skip LLM if data unchanged
    .addConditionalEdges("change_detection", (state) => {
      if (!state.dataChanged) return "log_skipped_run";
      return "analyze_health";
    })

    // After analysis: route by result
    .addConditionalEdges("analyze_health", (state) => {
      // All data sources failed — degrade gracefully
      if (
        state.errors.length > 0 &&
        state.issues.length === 0 &&
        state.sprintData === null &&
        state.teamGrid === null &&
        state.standupStatus === null
      ) {
        return "graceful_degrade";
      }
      if (state.severity === "clean") return "log_clean_run";
      return "propose_actions";
    })

    // Terminal edges
    .addEdge("log_clean_run", END)
    .addEdge("log_skipped_run", END)
    .addEdge("graceful_degrade", END)
    .addEdge("propose_actions", "confirmation_gate")
    .addEdge("confirmation_gate", END);

  // Compile with checkpointer for interrupt/resume support
  const checkpointer = new MemorySaver();
  return graph.compile({ checkpointer });
}
