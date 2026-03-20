import type { FleetGraphStateType } from "../state.js";
import type { ContextDocument } from "../state.js";
import { shipApi } from "../utils/ship-api.js";

/**
 * Extract essential fields from a raw issue object.
 */
function extractIssueFields(issue: Record<string, unknown>): Record<string, unknown> {
  const props = issue.properties as Record<string, unknown> | undefined;
  // Ship stores issue status in properties.state (not .status)
  const status = props?.state ?? props?.status;
  return {
    id: issue.id,
    title: issue.title,
    status,
    assignee_id: props?.assignee_id,
    priority: props?.priority,
    updated_at: issue.updated_at,
    created_at: issue.created_at,
  };
}

/**
 * Filter out done/cancelled issues.
 */
function filterActive(issues: Record<string, unknown>[]): Record<string, unknown>[] {
  return issues.filter((issue) => {
    const props = issue.properties as Record<string, unknown> | undefined;
    // Ship stores issue status in properties.state (not .status)
    const status = (props?.state as string) || (props?.status as string) || "";
    return status !== "done" && status !== "cancelled";
  });
}

/**
 * Deduplicate issues by id.
 */
function deduplicateById(issues: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<unknown>();
  return issues.filter((issue) => {
    if (seen.has(issue.id)) return false;
    seen.add(issue.id);
    return true;
  });
}

/**
 * Find a sprint association from contextDocument associations.
 */
function findSprintId(ctx: ContextDocument): string | null {
  const assoc = ctx.associations.find(
    (a) => (a as Record<string, unknown>).relationship_type === "sprint"
  ) as Record<string, unknown> | undefined;
  return (assoc?.target_document_id as string) || null;
}

/**
 * Fetch issues scoped to issue context: viewed issue + sprint siblings + assignee's active issues.
 */
async function fetchIssuesForIssueContext(
  ctx: ContextDocument,
  documentId: string
): Promise<Record<string, unknown>[]> {
  const allIssues: Record<string, unknown>[] = [];

  // Always include the viewed issue itself as baseline
  try {
    const viewedDoc = await shipApi.getDocument(documentId);
    if (viewedDoc) {
      allIssues.push(viewedDoc as Record<string, unknown>);
    }
  } catch (err) {
    console.warn(`[fetch_issues] viewed issue fetch failed: ${err instanceof Error ? err.message : err}`);
  }

  // Find parent sprint from associations
  const sprintId = findSprintId(ctx);

  if (sprintId) {
    // Fetch sprint sibling issues (includes the viewed issue itself)
    try {
      const sprintIssues = await shipApi.getSprintIssues(sprintId);
      const raw = Array.isArray(sprintIssues) ? sprintIssues : [];
      allIssues.push(...raw);
    } catch (err) {
      console.warn(`[fetch_issues] sprint issues fetch failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Fetch assignee's other active issues
  const docProps = ctx.document.properties as Record<string, unknown> | undefined;
  const assigneeId = docProps?.assignee_id as string | undefined;
  if (assigneeId) {
    try {
      const assigneeIssues = await shipApi.getIssues(`assignee_id=${assigneeId}`);
      const raw = Array.isArray(assigneeIssues) ? assigneeIssues : [];
      allIssues.push(...raw);
    } catch (err) {
      console.warn(`[fetch_issues] assignee issues fetch failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  return allIssues;
}

/**
 * Fetch issues scoped to sprint context: all issues in the sprint.
 */
async function fetchIssuesForSprintContext(
  documentId: string
): Promise<Record<string, unknown>[]> {
  const sprintIssues = await shipApi.getSprintIssues(documentId);
  return Array.isArray(sprintIssues) ? sprintIssues : [];
}

/**
 * Fetch issues from Ship API.
 * In on-demand mode with contextDocument, scopes issues by document context.
 */
export async function fetchIssues(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
  try {
    const cap = state.triggerType === "on-demand" ? 50 : 100;

    // On-demand with context: scope by document type
    if (state.triggerType === "on-demand" && state.contextDocument && state.documentId) {
      let rawIssues: Record<string, unknown>[];

      if (state.documentType === "issue") {
        rawIssues = await fetchIssuesForIssueContext(state.contextDocument, state.documentId);
      } else if (state.documentType === "sprint") {
        rawIssues = await fetchIssuesForSprintContext(state.documentId);
      } else {
        // Unknown document type — fall through to generic fetch
        const data = await shipApi.getIssues();
        rawIssues = Array.isArray(data) ? data : [];
      }

      const issues = deduplicateById(filterActive(rawIssues))
        .slice(0, cap)
        .map(extractIssueFields);

      console.log(`[fetch_issues] scoped fetch: ${rawIssues.length} raw, filtered to ${issues.length} active issues`);
      return { issues, errors: [] };
    }

    // Generic fallback: fetch all issues
    const data = await shipApi.getIssues();
    const raw = Array.isArray(data) ? data : [];

    const issues = deduplicateById(filterActive(raw))
      .slice(0, cap)
      .map(extractIssueFields);

    console.log(`[fetch_issues] fetched ${raw.length} raw, filtered to ${issues.length} active issues`);
    return { issues, errors: [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[fetch_issues] failed: ${msg}`);
    return { issues: [], errors: [`fetch_issues: ${msg}`] };
  }
}

/**
 * Fetch active sprint data from Ship API, including sprint issues for membership checks.
 * In on-demand mode with contextDocument, scopes to the specific sprint.
 */
export async function fetchSprint(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
  try {
    // On-demand with context: scope by document type
    if (state.triggerType === "on-demand" && state.contextDocument && state.documentId) {
      let sprintId: string | null = null;

      if (state.documentType === "sprint") {
        sprintId = state.documentId;
      } else if (state.documentType === "issue") {
        sprintId = findSprintId(state.contextDocument);
      }

      if (sprintId) {
        const sprint = await shipApi.getSprint(sprintId) as Record<string, unknown>;

        // Enrich with sprint issues
        try {
          const sprintIssues = await shipApi.getSprintIssues(sprintId);
          sprint.sprintIssues = Array.isArray(sprintIssues) ? sprintIssues : [];
          console.log(`[fetch_sprint] scoped sprint "${sprint.title}" with ${(sprint.sprintIssues as unknown[]).length} issues`);
        } catch (issueErr) {
          const msg = issueErr instanceof Error ? issueErr.message : String(issueErr);
          console.warn(`[fetch_sprint] sprint found but issue fetch failed: ${msg}`);
          sprint.sprintIssues = [];
        }

        return { sprintData: sprint, errors: [] };
      }
      // No sprint association found — fall through to generic fetch
    }

    // Generic fallback: find any active sprint
    const data = await shipApi.getIssues("document_type=sprint&status=active");
    const sprints = Array.isArray(data) ? data : [];
    if (sprints.length > 1) {
      console.warn(
        `[fetch_sprint] ${sprints.length} active sprints found — using first, others ignored`
      );
    }
    const activeSprint = sprints[0] || null;

    if (activeSprint) {
      try {
        const sprintId = (activeSprint as Record<string, unknown>).id as string;
        const sprintIssues = await shipApi.getSprintIssues(sprintId);
        const issueList = Array.isArray(sprintIssues) ? sprintIssues : [];
        (activeSprint as Record<string, unknown>).sprintIssues = issueList;
        console.log(
          `[fetch_sprint] active sprint found with ${issueList.length} assigned issues`
        );
      } catch (issueErr) {
        const issueMsg = issueErr instanceof Error ? issueErr.message : String(issueErr);
        console.warn(`[fetch_sprint] sprint found but issue fetch failed: ${issueMsg}`);
        (activeSprint as Record<string, unknown>).sprintIssues = [];
      }
    } else {
      console.log("[fetch_sprint] no active sprint found");
    }

    return { sprintData: activeSprint as Record<string, unknown> | null, errors: [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[fetch_sprint] failed: ${msg}`);
    return { sprintData: null, errors: [`fetch_sprint: ${msg}`] };
  }
}

/**
 * Fetch team grid data from Ship API.
 */
export async function fetchTeam(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
  try {
    const data = await shipApi.getTeamGrid();
    console.log(`[fetch_team] team grid fetched`);
    return { teamGrid: data as Record<string, unknown>, errors: [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[fetch_team] failed: ${msg}`);
    return { teamGrid: null, errors: [`fetch_team: ${msg}`] };
  }
}

/**
 * Fetch standup status from Ship API.
 */
export async function fetchStandups(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
  try {
    const data = await shipApi.getStandupStatus();
    console.log(`[fetch_standups] standup status fetched`);
    return { standupStatus: data as Record<string, unknown>, errors: [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[fetch_standups] failed: ${msg}`);
    return { standupStatus: null, errors: [`fetch_standups: ${msg}`] };
  }
}
