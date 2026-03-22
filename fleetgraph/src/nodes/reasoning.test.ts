import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FleetGraphStateType, Finding } from "../state.js";

// Mock ChatAnthropic — we use model.invoke() with native tool format
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
  analyzeHealth,
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
    dataChanged: true,
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

describe("analyzeHealth", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips LLM when no data available", async () => {
    const state = makeState({
      issues: [],
      sprintData: null,
      allSprints: [],
      teamGrid: null,
      standupStatus: null,
    });
    const result = await analyzeHealth(state);
    expect(result.findings).toEqual([]);
    expect(result.severity).toBe("clean");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("returns findings from LLM (single call)", async () => {
    const finding = {
      id: "finding-1", severity: "warning", category: "unassigned",
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

    const result = await analyzeHealth(state);
    expect(result.findings).toHaveLength(1);
    expect(result.findings?.[0]?.category).toBe("unassigned");
    expect(result.severity).toBe("warning");
    // Only 1 LLM call (not 4)
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("includes sprint data in prompt when available", async () => {
    mockInvoke.mockResolvedValueOnce(mockToolCallResponse([]));

    const state = makeState({
      issues: [{ id: "a", title: "Test", status: "todo" }],
      allSprints: [{ id: "s1", name: "Sprint 5", issue_count: 0 }],
      sprintData: { id: "s1", name: "Sprint 5", issue_count: 0, sprintIssues: [] },
    });

    await analyzeHealth(state);

    const promptContent = (mockInvoke.mock.calls[0] as unknown[])[0] as Array<{ content: string }>;
    expect(promptContent[0]!.content).toContain("Sprint 5");
    expect(promptContent[0]!.content).toContain("EMPTY SPRINTS");
  });

  it("includes workload and standup data in prompt", async () => {
    mockInvoke.mockResolvedValueOnce(mockToolCallResponse([]));

    const state = makeState({
      issues: [
        { id: "a", title: "T1", status: "in_progress", assignee_id: "user-1" },
        { id: "b", title: "T2", status: "todo", assignee_id: "user-1" },
      ],
      standupStatus: { submitted: 2, total: 5 },
    });

    await analyzeHealth(state);

    const promptContent = (mockInvoke.mock.calls[0] as unknown[])[0] as Array<{ content: string }>;
    const prompt = promptContent[0]!.content;
    expect(prompt).toContain("ASSIGNEE WORKLOAD");
    expect(prompt).toContain("STANDUP DATA");
    expect(prompt).toContain("user-1");
  });

  it("returns clean severity on LLM failure", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("API error"));
    const state = makeState({ issues: [{ id: "a", title: "Test", status: "todo" }] });
    const result = await analyzeHealth(state);
    expect(result.findings).toEqual([]);
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
