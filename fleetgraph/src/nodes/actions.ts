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
    description: f.recommendation,
    requiresConfirmation: true,
  }));

  console.log(`[propose_actions] ${actions.length} actions proposed`);
  return { proposedActions: actions };
}

/**
 * Human-in-the-loop confirmation gate.
 * Pauses graph execution via interrupt() and surfaces proposed actions to the user.
 * On resume, records the human decision (confirm or dismiss) in state.
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
  const response = userResponse as { decision?: string } | undefined;
  const decision = response?.decision === "confirm" ? "confirm" : "dismiss";

  if (decision === "confirm") {
    console.log(
      `[confirmation_gate] CONFIRMED — ${state.proposedActions.length} action(s) approved`
    );
    for (const action of state.proposedActions) {
      console.log(`  ✓ ${action.findingId}: ${action.description}`);
    }
  } else {
    console.log(
      `[confirmation_gate] DISMISSED — ${state.proposedActions.length} action(s) rejected`
    );
    for (const action of state.proposedActions) {
      console.log(`  ✗ ${action.findingId}: ${action.description}`);
    }
  }

  return { humanDecision: decision };
}

/**
 * Log a clean proactive run (LLM analyzed and found no problems).
 */
export async function logCleanRun(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
  console.log("[log_clean_run] No findings — project is healthy");
  return {};
}

/**
 * Log a skipped run (data unchanged since last analysis — no LLM call needed).
 */
export async function dataUnchanged(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
  console.log("[data_unchanged] Data unchanged — no new analysis needed");
  return {};
}

/**
 * Graceful degradation node — runs when data fetches failed.
 */
export async function gracefulDegrade(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
  console.error(
    `[graceful_degrade] All data fetches failed. Skipping analysis. Errors: ${state.errors.join("; ")}`
  );
  return {
    findings: [],
    severity: "clean",
    proposedActions: [],
  };
}
