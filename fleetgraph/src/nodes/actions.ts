import { interrupt } from "@langchain/langgraph";
import type { FleetGraphStateType, ProposedAction } from "../state.js";

/**
 * Propose actions based on findings — formats for human review.
 */
export async function proposeActions(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
  const actions: ProposedAction[] = state.findings.map((f) => ({
    findingId: f.id,
    description: f.suggestedAction,
    requiresConfirmation: true,
  }));

  console.log(`[propose_actions] ${actions.length} actions proposed`);
  return { proposedActions: actions };
}

/**
 * Human-in-the-loop confirmation gate.
 * Pauses graph execution and surfaces proposed actions to the user.
 */
export async function confirmationGate(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
  console.log(
    `[confirmation_gate] awaiting human decision on ${state.proposedActions.length} actions`
  );

  // Interrupt pauses graph, returns payload to caller
  const userResponse = interrupt({
    type: "confirmation_required",
    findings: state.findings,
    proposedActions: state.proposedActions,
    message: `Found ${state.findings.length} issue(s) requiring attention. Review proposed actions.`,
  });

  // Execution resumes here after user responds via Command({ resume: ... })
  const decision = (userResponse as Record<string, unknown>)?.decision;
  console.log(`[confirmation_gate] user decision: ${decision}`);

  return {};
}

/**
 * Log a clean proactive run (no findings).
 */
export async function logCleanRun(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
  console.log("[log_clean_run] no issues detected, run complete");
  return {};
}

/**
 * Graceful degradation node — runs when data fetches failed.
 */
export async function gracefulDegrade(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
  console.log(
    `[graceful_degrade] running with ${state.errors.length} errors, limited data`
  );
  return {
    findings: [],
    severity: "clean",
  };
}
