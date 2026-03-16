import { END, StateGraph } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { FleetGraphState } from "../state.js";
import { resolveContext } from "../nodes/context.js";
import { fetchIssues, fetchSprint, fetchTeam, fetchStandups } from "../nodes/fetch.js";
import { analyzeHealth } from "../nodes/reasoning.js";
import {
  proposeActions,
  confirmationGate,
  logCleanRun,
  gracefulDegrade,
} from "../nodes/actions.js";

/**
 * Build the proactive health-check graph.
 *
 * Flow:
 *   START -> resolve_context -> [fetch_issues, fetch_sprint, fetch_team, fetch_standups] (parallel)
 *         -> analyze_health -> (clean? -> log_clean_run -> END)
 *                           -> (findings? -> propose_actions -> confirmation_gate -> END)
 *         -> (errors? -> graceful_degrade -> END)
 */
export function buildProactiveGraph() {
  const graph = new StateGraph(FleetGraphState)
    // Nodes
    .addNode("resolve_context", resolveContext)
    .addNode("fetch_issues", fetchIssues)
    .addNode("fetch_sprint", fetchSprint)
    .addNode("fetch_team", fetchTeam)
    .addNode("fetch_standups", fetchStandups)
    .addNode("analyze_health", analyzeHealth)
    .addNode("propose_actions", proposeActions)
    .addNode("confirmation_gate", confirmationGate)
    .addNode("log_clean_run", logCleanRun)
    .addNode("graceful_degrade", gracefulDegrade)

    // Entry
    .addEdge("__start__", "resolve_context")

    // Parallel fan-out from context to all fetch nodes
    .addEdge("resolve_context", "fetch_issues")
    .addEdge("resolve_context", "fetch_sprint")
    .addEdge("resolve_context", "fetch_team")
    .addEdge("resolve_context", "fetch_standups")

    // All fetches converge into analysis
    .addEdge("fetch_issues", "analyze_health")
    .addEdge("fetch_sprint", "analyze_health")
    .addEdge("fetch_team", "analyze_health")
    .addEdge("fetch_standups", "analyze_health")

    // Conditional branching after analysis
    .addConditionalEdges("analyze_health", (state) => {
      if (state.errors.length > 0 && state.issues.length === 0) {
        return "graceful_degrade";
      }
      if (state.severity === "clean") {
        return "log_clean_run";
      }
      return "propose_actions";
    })

    // Terminal edges
    .addEdge("log_clean_run", END)
    .addEdge("graceful_degrade", END)
    .addEdge("propose_actions", "confirmation_gate")
    .addEdge("confirmation_gate", END);

  // Compile with checkpointer for interrupt/resume support
  const checkpointer = new MemorySaver();
  return graph.compile({ checkpointer });
}
