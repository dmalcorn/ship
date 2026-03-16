import type { FleetGraphStateType } from "../state.js";

/**
 * Resolve context node — determines trigger type, user, and document context.
 */
export async function resolveContext(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
  console.log(
    `[resolve_context] trigger=${state.triggerType}, doc=${state.documentId || "none"}`
  );

  return {
    triggerType: state.triggerType || "proactive",
    workspaceId: state.workspaceId,
    documentId: state.documentId,
    documentType: state.documentType,
  };
}
