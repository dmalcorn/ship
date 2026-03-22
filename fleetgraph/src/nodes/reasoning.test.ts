import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FleetGraphStateType, Finding } from "../state.js";

// Mock ChatAnthropic — we now use model.invoke() with native tool format
const mockInvoke = vi.fn();

vi.mock("@langchain/anthropic", () => {
  return {
    ChatAnthropic: class MockChatAnthropic {
      constructor() {}
      invoke(...args: unknown[]) {
        return mockInvoke(...args);
      }
    },
  };
});

// Import after mock setup
const {
  determineSeverity,
  analyzeIssues,
  analyzeSprints,
  analyzeTeam,
  mergeFindings,
  analyzeContext,
  buildAnalysisMode,
} = await import("./reasoning.js");

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
    allSprints: [],
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

/** Helper: create a mock LLM response with tool_calls */
function mockToolCallResponse(findings: unknown[], summary = "") {
  return {
    tool_calls: [{ name: "test", args: { findings, summary } }],
    content: [],
  };
}

describe("determineSeverity", () => {
  it("returns 'clean' for empty findings", () => {
    expect(determineSeverity([])).toBe("clean");
  });

  it("returns 'info' when only info findings exist", () => {
    const findings: Finding[] = [
      { id: "f-1", severity: "info", category: "other", title: "t", description: "d", evidence: "e", recommendation: "r" },
    ];
    expect(determineSeverity(findings)).toBe("info");
  });

  it("returns 'warning' when warning is highest", () => {
    const findings: Finding[] = [
      { id: "f-1", severity: "info", category: "other", title: "t", description: "d", evidence: "e", recommendation: "r" },
      { id: "f-2", severity: "warning", category: "other", title: "t", description: "d", evidence: "e", recommendation: "r" },
    ];
    expect(determineSeverity(findings)).toBe("warning");
  });

  it("returns 'critical' when any critical finding exists", () => {
    const findings: Finding[] = [
      { id: "f-1", severity: "info", category: "other", title: "t", description: "d", evidence: "e", recommendation: "r" },
      { id: "f-2", severity: "critical", category: "other", title: "t", description: "d", evidence: "e", recommendation: "r" },
    ];
    expect(determineSeverity(findings)).toBe("critical");
  });
});

describe("analyzeIssues", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips LLM when no issues", async () => {
    const state = makeState({ issues: [] });
    const result = await analyzeIssues(state);
    expect(result.findings).toEqual([]);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("returns findings from LLM", async () => {
    const finding = {
      id: "issue-1", severity: "warning", category: "unassigned",
      title: "Unassigned issues", description: "3 issues have no owner",
      evidence: "Fix login, Add tests, Update docs", recommendation: "Assign owners",
      affectedDocumentIds: ["a", "b", "c"], affectedDocumentType: "issue",
    };
    mockInvoke.mockResolvedValueOnce(mockToolCallResponse([finding]));

    const state = makeState({
      issues: [
        { id: "a", title: "Fix login", status: "todo", assignee_id: null, priority: "high" },
        { id: "b", title: "Add tests", status: "todo", assignee_id: null, priority: "medium" },
        { id: "c", title: "Update docs", status: "todo", assignee_id: null, priority: "low" },
      ],
    });

    const result = await analyzeIssues(state);
    expect(result.findings).toHaveLength(1);
    expect(result.findings?.[0]?.category).toBe("unassigned");
  });

  it("returns empty findings on LLM failure", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("API error"));
    const state = makeState({ issues: [{ id: "a", title: "Test", status: "todo" }] });
    const result = await analyzeIssues(state);
    expect(result.findings).toEqual([]);
  });
});

describe("analyzeSprints", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips LLM when no sprint data", async () => {
    const state = makeState({ sprintData: null, allSprints: [] });
    const result = await analyzeSprints(state);
    expect(result.findings).toEqual([]);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("detects empty sprints", async () => {
    const finding = {
      id: "sprint-1", severity: "critical", category: "empty_sprint",
      title: "Empty sprint", description: "Sprint has no issues",
      evidence: "Sprint 5 has 0 issues", recommendation: "Populate or close",
      affectedDocumentIds: ["s1"], affectedDocumentType: "sprint",
    };
    mockInvoke.mockResolvedValueOnce(mockToolCallResponse([finding]));

    const state = makeState({
      allSprints: [{ id: "s1", name: "Sprint 5", issue_count: 0 }],
      sprintData: { id: "s1", name: "Sprint 5", issue_count: 0, sprintIssues: [] },
    });

    const result = await analyzeSprints(state);
    expect(result.findings).toHaveLength(1);
    expect(result.findings?.[0]?.category).toBe("empty_sprint");
  });
});

describe("analyzeTeam", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips LLM when no issues", async () => {
    const state = makeState({ issues: [] });
    const result = await analyzeTeam(state);
    expect(result.findings).toEqual([]);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("detects overloaded team members", async () => {
    const finding = {
      id: "team-1", severity: "info", category: "overloaded",
      title: "Overloaded assignee", description: "user-1 has 5 issues",
      evidence: "5 active issues assigned", recommendation: "Redistribute work",
      affectedDocumentIds: ["a", "b", "c", "d", "e"], affectedDocumentType: "issue",
    };
    mockInvoke.mockResolvedValueOnce(mockToolCallResponse([finding]));

    const state = makeState({
      issues: [
        { id: "a", title: "T1", status: "todo", assignee_id: "user-1" },
        { id: "b", title: "T2", status: "in_progress", assignee_id: "user-1" },
        { id: "c", title: "T3", status: "in_progress", assignee_id: "user-1" },
        { id: "d", title: "T4", status: "todo", assignee_id: "user-1" },
        { id: "e", title: "T5", status: "todo", assignee_id: "user-1" },
      ],
    });

    const result = await analyzeTeam(state);
    expect(result.findings).toHaveLength(1);
    expect(result.findings?.[0]?.category).toBe("overloaded");
  });
});

describe("mergeFindings", () => {
  it("computes severity from accumulated findings", async () => {
    const state = makeState({
      findings: [
        { id: "f-1", severity: "warning", category: "unassigned", title: "t", description: "d", evidence: "e", recommendation: "r" },
        { id: "f-2", severity: "critical", category: "empty_sprint", title: "t", description: "d", evidence: "e", recommendation: "r" },
        { id: "f-3", severity: "info", category: "overloaded", title: "t", description: "d", evidence: "e", recommendation: "r" },
      ],
    });
    const result = await mergeFindings(state);
    expect(result.severity).toBe("critical");
  });

  it("returns clean when no findings", async () => {
    const state = makeState({ findings: [] });
    const result = await mergeFindings(state);
    expect(result.severity).toBe("clean");
  });
});

describe("analyzeContext", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses user message as query", async () => {
    mockInvoke.mockResolvedValueOnce(mockToolCallResponse([], "Sprint looks on track"));

    const state = makeState({
      triggerType: "on-demand",
      documentId: "doc-123",
      documentType: "sprint",
      issues: [{ id: "i1", title: "Task", status: "todo" }],
      sprintData: { id: "doc-123", title: "Sprint 5" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "human", content: "Is this sprint on track?" }] as any,
    });

    await analyzeContext(state);

    const promptContent = (mockInvoke.mock.calls[0] as unknown[])[0] as Array<{ content: string }>;
    expect(promptContent[0]!.content).toContain("Is this sprint on track?");
  });

  it("returns clean severity on LLM failure", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("timeout"));

    const state = makeState({
      triggerType: "on-demand",
      issues: [{ id: "abc", title: "Test", status: "todo" }],
      sprintData: { id: "sprint-1", title: "Sprint 5" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "human", content: "Analyze" }] as any,
    });

    const result = await analyzeContext(state);
    expect(result.findings).toEqual([]);
    expect(result.severity).toBe("clean");
  });

  it("skips LLM when all data sources are empty", async () => {
    const state = makeState({
      triggerType: "on-demand",
      documentType: "sprint",
      issues: [],
      sprintData: null,
      teamGrid: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "human", content: "Analyze" }] as any,
    });

    const result = await analyzeContext(state);
    expect(result.findings).toEqual([]);
    expect(result.severity).toBe("clean");
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe("buildAnalysisMode", () => {
  it("returns sprint mode for sprint documentType", () => {
    const result = buildAnalysisMode("sprint", "sprint-123");
    expect(result).toContain("SPRINT HEALTH ANALYSIS MODE");
  });

  it("returns issue mode with documentId for issue documentType", () => {
    const result = buildAnalysisMode("issue", "issue-456");
    expect(result).toContain("ISSUE CONTEXT ANALYSIS MODE");
    expect(result).toContain("issue-456");
  });

  it("returns general mode for null documentType", () => {
    const result = buildAnalysisMode(null, null);
    expect(result).toContain("GENERAL PROJECT ANALYSIS MODE");
  });
});
