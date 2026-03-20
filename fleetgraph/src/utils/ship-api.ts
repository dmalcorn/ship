import { traceable } from "langsmith/traceable";

const SHIP_API_URL = process.env.SHIP_API_URL || "http://localhost:3000";
const FLEETGRAPH_API_TOKEN = process.env.FLEETGRAPH_API_TOKEN || "";

/**
 * Fetch with retry and exponential backoff.
 * Wrapped with LangSmith traceable for observability.
 */
export const fetchWithRetry = traceable(
  async (path: string, retries = 2): Promise<unknown> => {
    const url = `${SHIP_API_URL}${path}`;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${FLEETGRAPH_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        return await res.json();
      } catch (err) {
        if (attempt === retries) throw err;
        const delay = 1000 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw new Error(`fetchWithRetry: exhausted ${retries} retries for ${path}`);
  },
  { name: "fetch_ship_api", run_type: "retriever" }
);

/**
 * Convenience wrappers for Ship API endpoints.
 */
export const shipApi = {
  getIssues: (params?: string) =>
    fetchWithRetry(`/api/issues${params ? `?${params}` : ""}`),

  /** Fetch all current sprints (GET /api/weeks returns sprints for the current sprint number) */
  getWeeks: () =>
    fetchWithRetry("/api/weeks"),

  getSprint: (sprintId: string) =>
    fetchWithRetry(`/api/weeks/${sprintId}`),

  getSprintIssues: (sprintId: string) =>
    fetchWithRetry(`/api/weeks/${sprintId}/issues`),

  getTeamGrid: () =>
    fetchWithRetry(`/api/team/grid`),

  getStandupStatus: () =>
    fetchWithRetry(`/api/standups/status`),

  getDocument: (docId: string) =>
    fetchWithRetry(`/api/documents/${docId}`),

  getDocumentAssociations: (docId: string) =>
    fetchWithRetry(`/api/documents/${docId}/associations`),

  getIssueHistory: (issueId: string) =>
    fetchWithRetry(`/api/issues/${issueId}/history`),
};
