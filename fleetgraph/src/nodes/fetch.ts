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
    const issues = Array.isArray(data) ? data : [];
    console.log(`[fetch_issues] fetched ${issues.length} issues`);
    return { issues, errors: [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[fetch_issues] failed: ${msg}`);
    return { issues: [], errors: [`fetch_issues: ${msg}`] };
  }
}

/**
 * Fetch active sprint data from Ship API.
 */
export async function fetchSprint(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
  try {
    // Fetch all sprints and find the active one
    const data = await shipApi.getIssues("document_type=sprint&status=active");
    const sprints = Array.isArray(data) ? data : [];
    const activeSprint = sprints[0] || null;
    console.log(
      `[fetch_sprint] active sprint: ${activeSprint ? "found" : "none"}`
    );
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
