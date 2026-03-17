import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FleetGraphStateType } from "../state.js";

// Mock ship-api module
const mockGetIssues = vi.fn();
const mockGetSprintIssues = vi.fn();
const mockGetTeamGrid = vi.fn();
const mockGetStandupStatus = vi.fn();

vi.mock("../utils/ship-api.js", () => ({
  shipApi: {
    getIssues: (...args: unknown[]) => mockGetIssues(...args),
    getSprint: vi.fn(),
    getSprintIssues: (...args: unknown[]) => mockGetSprintIssues(...args),
    getTeamGrid: () => mockGetTeamGrid(),
    getStandupStatus: () => mockGetStandupStatus(),
    getDocument: vi.fn(),
    getDocumentAssociations: vi.fn(),
    getIssueHistory: vi.fn(),
  },
}));

const { fetchIssues, fetchSprint, fetchTeam, fetchStandups } = await import(
  "./fetch.js"
);

function makeState(
  overrides: Partial<FleetGraphStateType> = {}
): FleetGraphStateType {
  return {
    messages: [],
    triggerType: "proactive",
    documentId: null,
    documentType: null,
    workspaceId: "ws-1",
    userId: null,
    issues: [],
    sprintData: null,
    teamGrid: null,
    standupStatus: null,
    findings: [],
    severity: "clean",
    proposedActions: [],
    humanDecision: null,
    errors: [],
    ...overrides,
  };
}

describe("fetchIssues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters out done and cancelled issues", async () => {
    mockGetIssues.mockResolvedValueOnce([
      { id: "1", title: "Active", properties: { status: "todo" }, updated_at: "2026-03-15", created_at: "2026-03-10" },
      { id: "2", title: "Done", properties: { status: "done" }, updated_at: "2026-03-15", created_at: "2026-03-10" },
      { id: "3", title: "Cancelled", properties: { status: "cancelled" }, updated_at: "2026-03-15", created_at: "2026-03-10" },
      { id: "4", title: "In Progress", properties: { status: "in_progress" }, updated_at: "2026-03-15", created_at: "2026-03-10" },
    ]);

    const result = await fetchIssues(makeState());

    expect(result.issues).toHaveLength(2);
    expect(result.issues!.map((i: Record<string, unknown>) => i.id)).toEqual(["1", "4"]);
  });

  it("extracts only essential fields", async () => {
    mockGetIssues.mockResolvedValueOnce([
      {
        id: "1",
        title: "Fix bug",
        content: "HUGE JSON BLOB SHOULD NOT APPEAR",
        properties: { status: "todo", assignee_id: "user-1", priority: "high", extra_field: "ignored" },
        updated_at: "2026-03-15",
        created_at: "2026-03-10",
        some_other_field: "should not appear",
      },
    ]);

    const result = await fetchIssues(makeState());
    const issue = result.issues![0] as Record<string, unknown>;

    expect(issue).toEqual({
      id: "1",
      title: "Fix bug",
      status: "todo",
      assignee_id: "user-1",
      priority: "high",
      updated_at: "2026-03-15",
      created_at: "2026-03-10",
    });
    expect(issue).not.toHaveProperty("content");
    expect(issue).not.toHaveProperty("some_other_field");
  });

  it("caps at 100 issues for proactive mode", async () => {
    const issues = Array.from({ length: 150 }, (_, i) => ({
      id: `issue-${i}`,
      title: `Issue ${i}`,
      properties: { status: "todo" },
      updated_at: "2026-03-15",
      created_at: "2026-03-10",
    }));
    mockGetIssues.mockResolvedValueOnce(issues);

    const result = await fetchIssues(makeState({ triggerType: "proactive" }));

    expect(result.issues).toHaveLength(100);
  });

  it("caps at 50 issues for on-demand mode", async () => {
    const issues = Array.from({ length: 80 }, (_, i) => ({
      id: `issue-${i}`,
      title: `Issue ${i}`,
      properties: { status: "todo" },
      updated_at: "2026-03-15",
      created_at: "2026-03-10",
    }));
    mockGetIssues.mockResolvedValueOnce(issues);

    const result = await fetchIssues(makeState({ triggerType: "on-demand" }));

    expect(result.issues).toHaveLength(50);
  });

  it("returns empty issues and error on API failure", async () => {
    mockGetIssues.mockRejectedValueOnce(new Error("HTTP 500: Internal Server Error"));

    const result = await fetchIssues(makeState());

    expect(result.issues).toEqual([]);
    expect(result.errors).toEqual(["fetch_issues: HTTP 500: Internal Server Error"]);
  });

  it("handles non-array response gracefully", async () => {
    mockGetIssues.mockResolvedValueOnce({ error: "unexpected format" });

    const result = await fetchIssues(makeState());

    expect(result.issues).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});

describe("fetchSprint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns sprint data with sprint issues on success", async () => {
    const sprint = { id: "sprint-1", title: "Sprint 5", properties: { status: "active" } };
    const sprintIssues = [
      { id: "issue-1", title: "Task A" },
      { id: "issue-2", title: "Task B" },
    ];
    mockGetIssues.mockResolvedValueOnce([sprint]);
    mockGetSprintIssues.mockResolvedValueOnce(sprintIssues);

    const result = await fetchSprint(makeState());

    expect(result.sprintData).toBeDefined();
    expect((result.sprintData as Record<string, unknown>).id).toBe("sprint-1");
    expect((result.sprintData as Record<string, unknown>).sprintIssues).toHaveLength(2);
    expect(result.errors).toEqual([]);
  });

  it("returns sprint with empty issues when sprint issue fetch fails", async () => {
    const sprint = { id: "sprint-2", title: "Sprint 6" };
    mockGetIssues.mockResolvedValueOnce([sprint]);
    mockGetSprintIssues.mockRejectedValueOnce(new Error("HTTP 500"));

    const result = await fetchSprint(makeState());

    expect(result.sprintData).toBeDefined();
    expect((result.sprintData as Record<string, unknown>).sprintIssues).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("returns null when no active sprints exist", async () => {
    mockGetIssues.mockResolvedValueOnce([]);

    const result = await fetchSprint(makeState());

    expect(result.sprintData).toBeNull();
    expect(result.errors).toEqual([]);
  });

  it("returns null and error when sprint fetch fails entirely", async () => {
    mockGetIssues.mockRejectedValueOnce(new Error("HTTP 503"));

    const result = await fetchSprint(makeState());

    expect(result.sprintData).toBeNull();
    expect(result.errors).toEqual(["fetch_sprint: HTTP 503"]);
  });
});

describe("fetchTeam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns team grid data on success", async () => {
    const teamData = { members: [{ id: "u1", name: "Alice" }] };
    mockGetTeamGrid.mockResolvedValueOnce(teamData);

    const result = await fetchTeam(makeState());

    expect(result.teamGrid).toEqual(teamData);
    expect(result.errors).toEqual([]);
  });

  it("returns null and error on failure", async () => {
    mockGetTeamGrid.mockRejectedValueOnce(new Error("HTTP 401 Unauthorized"));

    const result = await fetchTeam(makeState());

    expect(result.teamGrid).toBeNull();
    expect(result.errors).toEqual(["fetch_team: HTTP 401 Unauthorized"]);
  });
});

describe("fetchStandups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns standup data on success", async () => {
    const standupData = { submitted: 3, total: 5 };
    mockGetStandupStatus.mockResolvedValueOnce(standupData);

    const result = await fetchStandups(makeState());

    expect(result.standupStatus).toEqual(standupData);
    expect(result.errors).toEqual([]);
  });

  it("returns null and error on failure", async () => {
    mockGetStandupStatus.mockRejectedValueOnce(new Error("Network error"));

    const result = await fetchStandups(makeState());

    expect(result.standupStatus).toBeNull();
    expect(result.errors).toEqual(["fetch_standups: Network error"]);
  });
});
