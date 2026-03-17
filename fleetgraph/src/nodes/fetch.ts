import type { FleetGraphStateType } from "../state.js";
import { shipApi } from "../utils/ship-api.js";

/**
 * Fetch issues from Ship API.
 */
export async function fetchIssues(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
  try {
    const data = await shipApi.getIssues();
    const raw = Array.isArray(data) ? data : [];

    // Filter out done/cancelled, cap at 100, extract essential fields only
    const cap = state.triggerType === "on-demand" ? 50 : 100;
    const issues = raw
      .filter((issue: Record<string, unknown>) => {
        const props = issue.properties as Record<string, unknown> | undefined;
        const status = (props?.status as string) || "";
        return status !== "done" && status !== "cancelled";
      })
      .slice(0, cap)
      .map((issue: Record<string, unknown>) => {
        const props = issue.properties as Record<string, unknown> | undefined;
        return {
          id: issue.id,
          title: issue.title,
          status: props?.status,
          assignee_id: props?.assignee_id,
          priority: props?.priority,
          updated_at: issue.updated_at,
          created_at: issue.created_at,
        };
      });

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
 */
export async function fetchSprint(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
  try {
    // Fetch all sprints and find the active one
    const data = await shipApi.getIssues("document_type=sprint&status=active");
    const sprints = Array.isArray(data) ? data : [];
    if (sprints.length > 1) {
      console.warn(
        `[fetch_sprint] ${sprints.length} active sprints found — using first, others ignored`
      );
    }
    const activeSprint = sprints[0] || null;

    if (activeSprint) {
      // Fetch the issues assigned to this sprint so reasoning can check membership
      try {
        const sprintId = (activeSprint as Record<string, unknown>).id as string;
        const sprintIssues = await shipApi.getSprintIssues(sprintId);
        const issueList = Array.isArray(sprintIssues) ? sprintIssues : [];
        (activeSprint as Record<string, unknown>).sprintIssues = issueList;
        console.log(
          `[fetch_sprint] active sprint found with ${issueList.length} assigned issues`
        );
      } catch (issueErr) {
        // Sprint found but couldn't fetch its issues — still usable
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
