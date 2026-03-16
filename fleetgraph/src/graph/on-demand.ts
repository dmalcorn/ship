import { END, StateGraph } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { FleetGraphState } from "../state.js";
import { resolveContext } from "../nodes/context.js";
import { fetchIssues, fetchSprint, fetchTeam } from "../nodes/fetch.js";
import { analyzeContext } from "../nodes/reasoning.js";
import { proposeActions, confirmationGate, logCleanRun } from "../nodes/actions.js";

/**
 * Build the on-demand chat graph.
 *
 * Flow:
 *   START -> resolve_context -> [fetch_issues, fetch_sprint, fetch_team] (parallel)
 *         -> analyze_context -> (clean? -> log_clean_run -> END)
 *                            -> (findings? -> propose_actions -> confirmation_gate -> END)
 */
export function buildOnDemandGraph() {
  const graph = new StateGraph(FleetGraphState)
    .addNode("resolve_context", resolveContext)
    .addNode("fetch_issues", fetchIssues)
    .addNode("fetch_sprint", fetchSprint)
    .addNode("fetch_team", fetchTeam)
    .addNode("analyze_context", analyzeContext)
    .addNode("propose_actions", proposeActions)
    .addNode("confirmation_gate", confirmationGate)
    .addNode("log_clean_run", logCleanRun)

    .addEdge("__start__", "resolve_context")

    // Parallel fetch
    .addEdge("resolve_context", "fetch_issues")
    .addEdge("resolve_context", "fetch_sprint")
    .addEdge("resolve_context", "fetch_team")

    // Converge into context analysis
    .addEdge("fetch_issues", "analyze_context")
    .addEdge("fetch_sprint", "analyze_context")
    .addEdge("fetch_team", "analyze_context")

    // Conditional branching
    .addConditionalEdges("analyze_context", (state) => {
      if (state.severity === "clean") return "log_clean_run";
      return "propose_actions";
    })

    .addEdge("log_clean_run", END)
    .addEdge("propose_actions", "confirmation_gate")
    .addEdge("confirmation_gate", END);

  const checkpointer = new MemorySaver();
  return graph.compile({ checkpointer });
}
