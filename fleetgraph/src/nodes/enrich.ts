import type { FleetGraphStateType } from "../state.js";
import { shipApi } from "../utils/ship-api.js";

/**
 * Association entry as returned by the Ship API's `belongs_to` array.
 */
interface BelongsToEntry {
  id: string;
  type: string; // "program" | "project" | "sprint" | "parent"
  title?: string;
  color?: string;
}

/**
 * Extract the belongs_to array from an issue, handling missing/malformed data.
 */
function getBelongsTo(issue: Record<string, unknown>): BelongsToEntry[] {
  const raw = issue.belongs_to;
  return Array.isArray(raw) ? (raw as BelongsToEntry[]) : [];
}

/**
 * Check if an issue has an association of a given type.
 */
function hasAssocType(belongsTo: BelongsToEntry[], type: string): boolean {
  return belongsTo.some((a) => a.type === type);
}

/**
 * Find an association of a given type.
 */
function findAssoc(belongsTo: BelongsToEntry[], type: string): BelongsToEntry | undefined {
  return belongsTo.find((a) => a.type === type);
}

/**
 * Enrich issue associations by inferring missing program, project, and sprint
 * associations when they can be derived from existing data.
 *
 * Strategy:
 *   1. Build a project→program map from issues that already have both associations.
 *   2. For issues missing a program but having a project, infer program from the map.
 *   3. If any projects still have no known program, batch-fetch their associations
 *      from the Ship API (at most one call per unique orphaned project).
 *   4. Re-apply the now-complete map to fill remaining gaps.
 *
 * This node is purely in-memory enrichment — it never writes to the Ship API.
 */
export async function enrichAssociations(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
  const issues = state.issues;
  if (issues.length === 0) {
    console.log("[enrich_associations] no issues to enrich, skipping");
    return {};
  }

  // Step 1: Build project→program map from issues that have both
  const projectToProgramMap = new Map<string, BelongsToEntry>();
  const orphanedProjectIds = new Set<string>();

  for (const issue of issues) {
    const belongsTo = getBelongsTo(issue);
    const project = findAssoc(belongsTo, "project");
    const program = findAssoc(belongsTo, "program");

    if (project && program) {
      // Known mapping: this project belongs to this program
      projectToProgramMap.set(project.id, program);
    } else if (project && !program) {
      // Orphaned: has project but no program
      orphanedProjectIds.add(project.id);
    }
  }

  // Remove projects we already have mappings for
  for (const projectId of orphanedProjectIds) {
    if (projectToProgramMap.has(projectId)) {
      orphanedProjectIds.delete(projectId);
    }
  }

  // Step 2: Fetch associations for projects we couldn't resolve from existing data
  if (orphanedProjectIds.size > 0) {
    console.log(
      `[enrich_associations] fetching associations for ${orphanedProjectIds.size} orphaned project(s)`
    );

    const fetchPromises = [...orphanedProjectIds].map(async (projectId) => {
      try {
        const assocs = await shipApi.getDocumentAssociations(projectId);
        const assocArray = Array.isArray(assocs)
          ? (assocs as Record<string, unknown>[])
          : [];
        // Look for a program association on this project
        const programAssoc = assocArray.find(
          (a) => a.relationship_type === "program"
        );
        if (programAssoc) {
          projectToProgramMap.set(projectId, {
            id: programAssoc.target_document_id as string,
            type: "program",
            title: programAssoc.target_title as string | undefined,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[enrich_associations] failed to fetch associations for project ${projectId}: ${msg}`
        );
      }
    });

    await Promise.all(fetchPromises);
  }

  // Step 3: Enrich issues in-memory
  let enrichedCount = 0;
  const enrichedIssues = issues.map((issue) => {
    const belongsTo = getBelongsTo(issue);
    let modified = false;
    const newBelongsTo = [...belongsTo];

    // Infer program from project
    if (!hasAssocType(belongsTo, "program")) {
      const project = findAssoc(belongsTo, "project");
      if (project) {
        const program = projectToProgramMap.get(project.id);
        if (program) {
          newBelongsTo.push(program);
          modified = true;
        }
      }
    }

    if (modified) {
      enrichedCount++;
      return { ...issue, belongs_to: newBelongsTo };
    }
    return issue;
  });

  console.log(
    `[enrich_associations] enriched ${enrichedCount}/${issues.length} issues ` +
      `(${projectToProgramMap.size} project→program mappings resolved)`
  );

  return { issues: enrichedIssues };
}
