import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FleetGraphStateType, Finding } from "../state.js";

// Mock ChatAnthropic before importing the module
const mockInvoke = vi.fn();
const mockWithStructuredOutput = vi.fn((_schema?: unknown, _opts?: unknown) => ({ invoke: mockInvoke }));

vi.mock("@langchain/anthropic", () => {
  return {
    ChatAnthropic: class MockChatAnthropic {
      constructor() {}
      withStructuredOutput(_schema: unknown, _opts: unknown) {
        return mockWithStructuredOutput(_schema, _opts);
      }
    },
  };
});

// Import after mock setup
const { determineSeverity, analyzeHealth, analyzeContext } = await import(
  "./reasoning.js"
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

describe("determineSeverity", () => {
  it("returns 'clean' for empty findings", () => {
    expect(determineSeverity([])).toBe("clean");
  });

  it("returns 'info' when only info findings exist", () => {
    const findings: Finding[] = [
      {
        id: "f-1",
        severity: "info",
        title: "t",
        description: "d",
        evidence: "e",
        recommendation: "r",
      },
    ];
    expect(determineSeverity(findings)).toBe("info");
  });

  it("returns 'warning' when warning is highest", () => {
    const findings: Finding[] = [
      {
        id: "f-1",
        severity: "info",
        title: "t",
        description: "d",
        evidence: "e",
        recommendation: "r",
      },
      {
        id: "f-2",
        severity: "warning",
        title: "t",
        description: "d",
        evidence: "e",
        recommendation: "r",
      },
    ];
    expect(determineSeverity(findings)).toBe("warning");
  });

  it("returns 'critical' when any critical finding exists", () => {
    const findings: Finding[] = [
      {
        id: "f-1",
        severity: "info",
        title: "t",
        description: "d",
        evidence: "e",
        recommendation: "r",
      },
      {
        id: "f-2",
        severity: "critical",
        title: "t",
        description: "d",
        evidence: "e",
        recommendation: "r",
      },
    ];
    expect(determineSeverity(findings)).toBe("critical");
  });

  it("returns 'critical' even with mixed severities", () => {
    const findings: Finding[] = [
      {
        id: "f-1",
        severity: "warning",
        title: "t",
        description: "d",
        evidence: "e",
        recommendation: "r",
      },
      {
        id: "f-2",
        severity: "critical",
        title: "t",
        description: "d",
        evidence: "e",
        recommendation: "r",
      },
      {
        id: "f-3",
        severity: "info",
        title: "t",
        description: "d",
        evidence: "e",
        recommendation: "r",
      },
    ];
    expect(determineSeverity(findings)).toBe("critical");
  });
});

describe("analyzeHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips LLM when all data sources are empty", async () => {
    const state = makeState({
      errors: ["fetch_issues: timeout"],
      issues: [],
      sprintData: null,
      teamGrid: null,
      standupStatus: null,
    });

    const result = await analyzeHealth(state);

    expect(result.findings).toEqual([]);
    expect(result.severity).toBe("clean");
    expect(result.errors).toContain(
      "analyze_health: no data available for analysis"
    );
    expect(mockWithStructuredOutput).not.toHaveBeenCalled();
  });

  it("calls LLM when issues are empty but sprint data exists", async () => {
    mockInvoke.mockResolvedValueOnce({
      findings: [
        {
          id: "finding-1",
          severity: "critical",
          title: "Empty sprint",
          description: "Sprint has no issues",
          evidence: "Sprint 'Sprint 5' has 0 issues",
          recommendation: "Populate or close the sprint",
        },
      ],
      summary: "Empty sprint detected",
    });

    const state = makeState({
      errors: ["fetch_issues: timeout"],
      issues: [],
      sprintData: { id: "sprint-1", title: "Sprint 5", sprintIssues: [] },
    });

    const result = await analyzeHealth(state);

    expect(mockWithStructuredOutput).toHaveBeenCalled();
    expect(result.findings).toHaveLength(1);
    expect(result.severity).toBe("critical");
  });

  it("calls LLM with structured output when issues exist", async () => {
    const finding: Finding = {
      id: "finding-1",
      severity: "warning",
      title: "Unassigned issue",
      description: "Issue has no owner",
      evidence: "Issue #abc: Fix login",
      recommendation: "Assign an owner",
    };

    mockInvoke.mockResolvedValueOnce({
      findings: [finding],
      summary: "1 issue found",
    });

    const state = makeState({
      issues: [
        {
          id: "abc",
          title: "Fix login",
          status: "todo",
          assignee_id: null,
          priority: "medium",
          updated_at: "2026-03-15",
          created_at: "2026-03-10",
        },
      ],
    });

    const result = await analyzeHealth(state);

    expect(mockWithStructuredOutput).toHaveBeenCalledWith(expect.anything(), {
      name: "project_health_analysis",
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings?.[0]?.evidence).toBe("Issue #abc: Fix login");
    expect(result.severity).toBe("warning");
  });

  it("returns clean severity on LLM failure", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("API rate limit"));

    const state = makeState({
      issues: [{ id: "abc", title: "Test", status: "todo" }],
    });

    const result = await analyzeHealth(state);

    expect(result.findings).toEqual([]);
    expect(result.severity).toBe("clean");
    expect(result.errors).toEqual(["analyze_health: API rate limit"]);
  });

  it("includes sprint and team data in prompt when available", async () => {
    mockInvoke.mockResolvedValueOnce({
      findings: [],
      summary: "All healthy",
    });

    const state = makeState({
      issues: [{ id: "abc", title: "Test", status: "todo" }],
      sprintData: { id: "sprint-1", title: "Sprint 5" },
      teamGrid: { members: ["alice", "bob"] },
      standupStatus: { submitted: 2, total: 3 },
    });

    await analyzeHealth(state);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promptContent = (mockInvoke.mock.calls[0] as any)[0][0].content as string;
    expect(promptContent).toContain("Sprint 5");
    expect(promptContent).toContain("alice");
    expect(promptContent).toContain("STANDUP STATUS");
    expect(promptContent).not.toContain("No standup data available");
  });

  it("includes all 7 detection categories in prompt", async () => {
    mockInvoke.mockResolvedValueOnce({
      findings: [],
      summary: "Healthy",
    });

    const state = makeState({
      issues: [{ id: "abc", title: "Test", status: "todo" }],
    });

    await analyzeHealth(state);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promptContent = (mockInvoke.mock.calls[0] as any)[0][0].content as string;
    expect(promptContent).toContain("UNASSIGNED ISSUES");
    expect(promptContent).toContain("MISSING SPRINT ASSIGNMENT");
    expect(promptContent).toContain("DUPLICATE ISSUES");
    expect(promptContent).toContain("EMPTY ACTIVE SPRINTS");
    expect(promptContent).toContain("MISSING TICKET NUMBERS");
    expect(promptContent).toContain("UNOWNED SECURITY ISSUES");
    expect(promptContent).toContain("UNSCHEDULED HIGH-PRIORITY WORK");
  });

  it("includes partial data handling instructions in prompt", async () => {
    mockInvoke.mockResolvedValueOnce({
      findings: [],
      summary: "Healthy",
    });

    const state = makeState({
      issues: [{ id: "abc", title: "Test", status: "todo" }],
    });

    await analyzeHealth(state);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promptContent = (mockInvoke.mock.calls[0] as any)[0][0].content as string;
    expect(promptContent).toContain(
      "Only analyze data categories that were successfully fetched"
    );
    expect(promptContent).toContain(
      "Never infer or hallucinate findings about data you did not receive"
    );
  });
});

describe("analyzeContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses user message as query", async () => {
    mockInvoke.mockResolvedValueOnce({
      findings: [],
      summary: "Sprint looks on track",
    });

    const state = makeState({
      triggerType: "on-demand",
      documentId: "doc-123",
      documentType: "sprint",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "human", content: "Is this sprint on track?" }] as any,
    });

    await analyzeContext(state);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promptContent = (mockInvoke.mock.calls[0] as any)[0][0].content as string;
    expect(promptContent).toContain("Is this sprint on track?");
    expect(promptContent).toContain("doc-123");
    expect(promptContent).toContain("sprint");
  });

  it("returns clean severity on LLM failure", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("timeout"));

    const state = makeState({
      triggerType: "on-demand",
      issues: [{ id: "abc", title: "Test", status: "todo" }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "human", content: "Analyze" }] as any,
    });

    const result = await analyzeContext(state);

    expect(result.findings).toEqual([]);
    expect(result.severity).toBe("clean");
    expect(result.errors).toEqual(["analyze_context: timeout"]);
  });

  it("uses context_analysis as tool name", async () => {
    mockInvoke.mockResolvedValueOnce({
      findings: [],
      summary: "OK",
    });

    const state = makeState({
      triggerType: "on-demand",
      issues: [{ id: "abc", title: "Test", status: "todo" }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "human", content: "Analyze" }] as any,
    });

    await analyzeContext(state);

    expect(mockWithStructuredOutput).toHaveBeenCalledWith(expect.anything(), {
      name: "context_analysis",
    });
  });
});
