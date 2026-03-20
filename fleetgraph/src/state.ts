import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

/**
 * Finding produced by reasoning nodes.
 */
export interface Finding {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  evidence: string;
  recommendation: string;
  affectedDocumentIds?: string[];
}

/**
 * Enriched document context from resolve_context (on-demand mode only).
 */
export interface ContextDocument {
  document: Record<string, unknown>;
  associations: Record<string, unknown>[];
}

/**
 * Action proposed to the user for confirmation.
 */
export interface ProposedAction {
  findingId: string;
  description: string;
  requiresConfirmation: boolean;
}

/**
 * FleetGraph shared state passed between all nodes.
 */
export const FleetGraphState = Annotation.Root({
  // Inherit message history for on-demand chat mode
  ...MessagesAnnotation.spec,

  // --- Context ---
  triggerType: Annotation<"proactive" | "on-demand">({
    reducer: (_, next) => next,
    default: () => "proactive" as const,
  }),
  documentId: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  documentType: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  workspaceId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  userId: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // --- Context enrichment (populated by resolve_context in on-demand mode) ---
  contextDocument: Annotation<ContextDocument | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // --- Fetched data (populated by fetch nodes) ---
  issues: Annotation<Record<string, unknown>[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  sprintData: Annotation<Record<string, unknown> | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  teamGrid: Annotation<Record<string, unknown> | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  standupStatus: Annotation<Record<string, unknown> | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // --- Reasoning output ---
  findings: Annotation<Finding[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  severity: Annotation<"clean" | "info" | "warning" | "critical">({
    reducer: (_, next) => next,
    default: () => "clean" as const,
  }),

  // --- Action proposals ---
  proposedActions: Annotation<ProposedAction[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // --- Human-in-the-loop decision ---
  humanDecision: Annotation<"confirm" | "dismiss" | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // --- Error tracking (accumulates across nodes) ---
  errors: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
});

export type FleetGraphStateType = typeof FleetGraphState.State;
