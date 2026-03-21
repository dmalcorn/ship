import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FleetGraphStateType } from "../state.js";

// Mock ship-api module
const mockGetIssues = vi.fn();
const mockGetSprintIssues = vi.fn();
const mockGetTeamGrid = vi.fn();
const mockGetStandupStatus = vi.fn();
const mockGetDocument = vi.fn();
const mockGetDocumentAssociations = vi.fn();
const mockGetSprint = vi.fn();
const mockGetWeeks = vi.fn();

vi.mock("../utils/ship-api.js", () => ({
  shipApi: {
    getIssues: (...args: unknown[]) => mockGetIssues(...args),
    getSprint: (...args: unknown[]) => mockGetSprint(...args),
    getSprintIssues: (...args: unknown[]) => mockGetSprintIssues(...args),
    getWeeks: () => mockGetWeeks(),
    getTeamGrid: () => mockGetTeamGrid(),
    getStandupStatus: () => mockGetStandupStatus(),
    getDocument: (...args: unknown[]) => mockGetDocument(...args),
    getDocumentAssociations: (...args: unknown[]) => mockGetDocumentAssociations(...args),
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
    contextDocument: null,
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

  it("caps at FLEETGRAPH_ISSUE_CAP (default 50) issues for proactive mode", async () => {
    const issues = Array.from({ length: 150 }, (_, i) => ({
      id: `issue-${i}`,
      title: `Issue ${i}`,
      properties: { status: "todo" },
      updated_at: "2026-03-15",
      created_at: "2026-03-10",
    }));
    mockGetIssues.mockResolvedValueOnce(issues);

    const result = await fetchIssues(makeState({ triggerType: "proactive" }));

    expect(result.issues).toHaveLength(50);
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

  it("scopes to issue context: fetches viewed issue, sprint siblings, and assignee issues", async () => {
    // The viewed issue
    const viewedIssue = {
      id: "issue-1", title: "Fix login", properties: { status: "in_progress", assignee_id: "user-1", priority: "high" },
      updated_at: "2026-03-15", created_at: "2026-03-10",
    };
    // Context document from resolveContext enrichment
    const contextDocument = {
      document: { id: "issue-1", title: "Fix login", document_type: "issue", properties: { status: "in_progress", assignee_id: "user-1" } },
      associations: [
        { id: "assoc-1", source_document_id: "issue-1", target_document_id: "sprint-1", relationship_type: "sprint" },
      ],
    };
    // Sprint sibling issues
    const sprintIssues = [
      { id: "issue-1", title: "Fix login", properties: { status: "in_progress", assignee_id: "user-1", priority: "high" }, updated_at: "2026-03-15", created_at: "2026-03-10" },
      { id: "issue-2", title: "Add signup", properties: { status: "todo", assignee_id: "user-2", priority: "medium" }, updated_at: "2026-03-14", created_at: "2026-03-09" },
      { id: "issue-3", title: "Done task", properties: { status: "done", assignee_id: "user-1", priority: "low" }, updated_at: "2026-03-13", created_at: "2026-03-08" },
    ];
    // Assignee's other issues
    const assigneeIssues = [
      { id: "issue-4", title: "Other task", properties: { status: "todo", assignee_id: "user-1", priority: "low" }, updated_at: "2026-03-12", created_at: "2026-03-07" },
    ];

    mockGetDocument.mockResolvedValueOnce(viewedIssue);
    mockGetSprintIssues.mockResolvedValueOnce(sprintIssues);
    mockGetIssues.mockResolvedValueOnce(assigneeIssues);

    const result = await fetchIssues(makeState({
      triggerType: "on-demand",
      documentId: "issue-1",
      documentType: "issue",
      contextDocument,
    }));

    // Should include: viewed issue (issue-1), sibling (issue-2), and assignee issue (issue-4)
    // issue-3 is done so filtered out; issue-1 is deduped
    const ids = result.issues!.map((i: Record<string, unknown>) => i.id);
    expect(ids).toContain("issue-1");
    expect(ids).toContain("issue-2");
    expect(ids).toContain("issue-4");
    expect(ids).not.toContain("issue-3"); // done - filtered
    expect(mockGetSprintIssues).toHaveBeenCalledWith("sprint-1");
  });

  it("scopes to sprint context: fetches all sprint issues", async () => {
    const sprintIssues = [
      { id: "issue-1", title: "Task A", properties: { status: "todo", assignee_id: "user-1", priority: "high" }, updated_at: "2026-03-15", created_at: "2026-03-10" },
      { id: "issue-2", title: "Task B", properties: { status: "in_progress", assignee_id: "user-2", priority: "medium" }, updated_at: "2026-03-14", created_at: "2026-03-09" },
    ];
    const contextDocument = {
      document: { id: "sprint-1", title: "Sprint 5", document_type: "sprint" },
      associations: [],
    };

    mockGetSprintIssues.mockResolvedValueOnce(sprintIssues);

    const result = await fetchIssues(makeState({
      triggerType: "on-demand",
      documentId: "sprint-1",
      documentType: "sprint",
      contextDocument,
    }));

    expect(result.issues).toHaveLength(2);
    expect(mockGetSprintIssues).toHaveBeenCalledWith("sprint-1");
    // Should NOT call generic getIssues
    expect(mockGetIssues).not.toHaveBeenCalled();
  });

  it("falls back to generic fetch when on-demand but no contextDocument", async () => {
    const issues = Array.from({ length: 5 }, (_, i) => ({
      id: `issue-${i}`, title: `Issue ${i}`, properties: { status: "todo" },
      updated_at: "2026-03-15", created_at: "2026-03-10",
    }));
    mockGetIssues.mockResolvedValueOnce(issues);

    const result = await fetchIssues(makeState({
      triggerType: "on-demand",
      documentId: "doc-123",
      documentType: "issue",
      contextDocument: null,
    }));

    expect(result.issues).toHaveLength(5);
    expect(mockGetIssues).toHaveBeenCalled();
  });

  it("always includes viewed issue even with no sprint and no assignee", async () => {
    const viewedIssue = {
      id: "orphan-1", title: "Orphan issue", properties: { status: "todo" },
      updated_at: "2026-03-15", created_at: "2026-03-10",
    };
    const contextDocument = {
      document: { id: "orphan-1", title: "Orphan issue", document_type: "issue", properties: {} },
      associations: [], // No sprint association
    };

    mockGetDocument.mockResolvedValueOnce(viewedIssue);
    // No sprint issues call, no assignee issues call

    const result = await fetchIssues(makeState({
      triggerType: "on-demand",
      documentId: "orphan-1",
      documentType: "issue",
      contextDocument,
    }));

    expect(result.issues).toHaveLength(1);
    expect((result.issues![0] as Record<string, unknown>).id).toBe("orphan-1");
    expect(mockGetDocument).toHaveBeenCalledWith("orphan-1");
  });

  it("deduplicates issues in scoped fetch", async () => {
    const contextDocument = {
      document: { id: "issue-1", title: "Fix login", document_type: "issue", properties: { assignee_id: "user-1" } },
      associations: [
        { id: "assoc-1", source_document_id: "issue-1", target_document_id: "sprint-1", relationship_type: "sprint" },
      ],
    };
    // Same issue appears in viewed doc, sprint, and assignee results
    const viewedIssue = { id: "issue-1", title: "Fix login", properties: { status: "in_progress", assignee_id: "user-1", priority: "high" }, updated_at: "2026-03-15", created_at: "2026-03-10" };
    const sprintIssues = [
      { id: "issue-1", title: "Fix login", properties: { status: "in_progress", assignee_id: "user-1", priority: "high" }, updated_at: "2026-03-15", created_at: "2026-03-10" },
    ];
    const assigneeIssues = [
      { id: "issue-1", title: "Fix login", properties: { status: "in_progress", assignee_id: "user-1", priority: "high" }, updated_at: "2026-03-15", created_at: "2026-03-10" },
    ];

    mockGetDocument.mockResolvedValueOnce(viewedIssue);
    mockGetSprintIssues.mockResolvedValueOnce(sprintIssues);
    mockGetIssues.mockResolvedValueOnce(assigneeIssues);

    const result = await fetchIssues(makeState({
      triggerType: "on-demand",
      documentId: "issue-1",
      documentType: "issue",
      contextDocument,
    }));

    // Should deduplicate — only one issue-1
    const ids = result.issues!.map((i: Record<string, unknown>) => i.id);
    const issue1Count = ids.filter((id: unknown) => id === "issue-1").length;
    expect(issue1Count).toBe(1);
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
    mockGetWeeks.mockResolvedValueOnce({ weeks: [sprint] });
    mockGetSprintIssues.mockResolvedValueOnce(sprintIssues);

    const result = await fetchSprint(makeState());

    expect(result.sprintData).toBeDefined();
    expect((result.sprintData as Record<string, unknown>).id).toBe("sprint-1");
    expect((result.sprintData as Record<string, unknown>).sprintIssues).toHaveLength(2);
    expect(result.errors).toEqual([]);
  });

  it("returns sprint with empty issues when sprint issue fetch fails", async () => {
    const sprint = { id: "sprint-2", title: "Sprint 6" };
    mockGetWeeks.mockResolvedValueOnce({ weeks: [sprint] });
    mockGetSprintIssues.mockRejectedValueOnce(new Error("HTTP 500"));

    const result = await fetchSprint(makeState());

    expect(result.sprintData).toBeDefined();
    expect((result.sprintData as Record<string, unknown>).sprintIssues).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("returns null when no active sprints exist", async () => {
    mockGetWeeks.mockResolvedValueOnce({ weeks: [] });

    const result = await fetchSprint(makeState());

    expect(result.sprintData).toBeNull();
    expect(result.errors).toEqual([]);
  });

  it("returns null and error when sprint fetch fails entirely", async () => {
    mockGetWeeks.mockRejectedValueOnce(new Error("HTTP 503"));

    const result = await fetchSprint(makeState());

    expect(result.sprintData).toBeNull();
    expect(result.errors).toEqual(["fetch_sprint: HTTP 503"]);
  });

  it("fetches specific sprint by documentId when documentType is sprint", async () => {
    const sprint = { id: "sprint-1", title: "Sprint 5", properties: { status: "active" } };
    const sprintIssues = [{ id: "issue-1", title: "Task A" }];
    const contextDocument = {
      document: { id: "sprint-1", title: "Sprint 5", document_type: "sprint" },
      associations: [],
    };

    mockGetSprint.mockResolvedValueOnce(sprint);
    mockGetSprintIssues.mockResolvedValueOnce(sprintIssues);

    const result = await fetchSprint(makeState({
      triggerType: "on-demand",
      documentId: "sprint-1",
      documentType: "sprint",
      contextDocument,
    }));

    expect(mockGetSprint).toHaveBeenCalledWith("sprint-1");
    expect(mockGetIssues).not.toHaveBeenCalled(); // Should NOT query generic sprint list
    expect(result.sprintData).toBeDefined();
    expect((result.sprintData as Record<string, unknown>).id).toBe("sprint-1");
    expect((result.sprintData as Record<string, unknown>).sprintIssues).toHaveLength(1);
  });

  it("finds parent sprint from associations when documentType is issue", async () => {
    const contextDocument = {
      document: { id: "issue-1", title: "Fix bug", document_type: "issue" },
      associations: [
        { id: "assoc-1", source_document_id: "issue-1", target_document_id: "sprint-1", relationship_type: "sprint" },
        { id: "assoc-2", source_document_id: "issue-1", target_document_id: "proj-1", relationship_type: "project" },
      ],
    };
    const sprint = { id: "sprint-1", title: "Sprint 5", properties: { status: "active" } };
    const sprintIssues = [{ id: "issue-1", title: "Fix bug" }, { id: "issue-2", title: "Add feature" }];

    mockGetSprint.mockResolvedValueOnce(sprint);
    mockGetSprintIssues.mockResolvedValueOnce(sprintIssues);

    const result = await fetchSprint(makeState({
      triggerType: "on-demand",
      documentId: "issue-1",
      documentType: "issue",
      contextDocument,
    }));

    expect(mockGetSprint).toHaveBeenCalledWith("sprint-1");
    expect(mockGetIssues).not.toHaveBeenCalled();
    expect(result.sprintData).toBeDefined();
    expect((result.sprintData as Record<string, unknown>).id).toBe("sprint-1");
    expect((result.sprintData as Record<string, unknown>).sprintIssues).toHaveLength(2);
  });

  it("falls back to generic sprint fetch when on-demand but no contextDocument", async () => {
    const sprint = { id: "sprint-1", title: "Sprint 5" };
    mockGetWeeks.mockResolvedValueOnce({ weeks: [sprint] });
    mockGetSprintIssues.mockResolvedValueOnce([]);

    const result = await fetchSprint(makeState({
      triggerType: "on-demand",
      documentId: "issue-1",
      documentType: "issue",
      contextDocument: null,
    }));

    expect(mockGetWeeks).toHaveBeenCalled();
    expect(result.sprintData).toBeDefined();
  });

  it("falls back to generic when issue has no sprint association", async () => {
    const contextDocument = {
      document: { id: "issue-1", title: "Orphan issue", document_type: "issue" },
      associations: [
        { id: "assoc-1", source_document_id: "issue-1", target_document_id: "proj-1", relationship_type: "project" },
      ],
    };
    const sprint = { id: "sprint-1", title: "Sprint 5" };
    mockGetWeeks.mockResolvedValueOnce({ weeks: [sprint] });
    mockGetSprintIssues.mockResolvedValueOnce([]);

    const result = await fetchSprint(makeState({
      triggerType: "on-demand",
      documentId: "issue-1",
      documentType: "issue",
      contextDocument,
    }));

    // Falls back to generic because no sprint association found
    expect(mockGetWeeks).toHaveBeenCalled();
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
