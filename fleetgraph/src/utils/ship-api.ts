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
 * Write to the Ship API (no retry — writes should not be retried blindly).
 */
async function shipWrite(method: string, path: string, body?: unknown): Promise<unknown> {
  const url = `${SHIP_API_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${FLEETGRAPH_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`shipWrite ${method} ${path}: HTTP ${res.status} ${res.statusText}`);
  }

  return res.json();
}

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

  // --- Write operations (used by automated actions) ---

  /** Soft-delete an issue (e.g., archive a duplicate) */
  deleteIssue: (issueId: string) =>
    shipWrite("DELETE", `/api/issues/${issueId}`),

  /** Add a sprint association to an issue */
  addSprintAssociation: (issueId: string, sprintId: string) =>
    shipWrite("POST", `/api/documents/${issueId}/associations`, {
      related_id: sprintId,
      relationship_type: "sprint",
    }),

  /** Update a sprint's properties (e.g., close an empty sprint) */
  updateSprint: (sprintId: string, updates: Record<string, unknown>) =>
    shipWrite("PATCH", `/api/weeks/${sprintId}`, updates),
};
