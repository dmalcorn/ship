import type { FleetGraphStateType } from "../state.js";
import { shipApi } from "../utils/ship-api.js";

/**
 * Resolve context node — determines trigger type, user, and document context.
 * In on-demand mode with a documentId, fetches document metadata and associations
 * to enrich context for downstream fetch nodes.
 */
export async function resolveContext(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
  const triggerType = state.triggerType || "proactive";
  console.log(
    `[resolve_context] trigger=${triggerType}, doc=${state.documentId || "none"}`
  );

  const base: Partial<FleetGraphStateType> = {
    triggerType,
    workspaceId: state.workspaceId,
    documentId: state.documentId,
    documentType: state.documentType,
  };

  // Only enrich context when on-demand with a specific document
  if (triggerType === "on-demand" && state.documentId) {
    try {
      const document = await shipApi.getDocument(state.documentId) as Record<string, unknown>;

      let associations: Record<string, unknown>[] = [];
      try {
        const assocData = await shipApi.getDocumentAssociations(state.documentId);
        associations = Array.isArray(assocData) ? assocData : [];
      } catch (assocErr) {
        const msg = assocErr instanceof Error ? assocErr.message : String(assocErr);
        console.warn(`[resolve_context] associations fetch failed: ${msg}`);
      }

      console.log(
        `[resolve_context] enriched context: doc="${document.title}", ${associations.length} associations`
      );

      return {
        ...base,
        contextDocument: { document, associations },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[resolve_context] document fetch failed: ${msg}`);
      return {
        ...base,
        contextDocument: null,
        errors: [`resolve_context: ${msg}`],
      };
    }
  }

  return base;
}
