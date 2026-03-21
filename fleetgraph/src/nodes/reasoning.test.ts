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
const { determineSeverity, analyzeHealth, analyzeContext, buildAnalysisMode } = await import(
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

describe("determineSeverity", () => {
  it("returns 'clean' for empty findings", () => {
    expect(determineSeverity([])).toBe("clean");
  });

  it("returns 'info' when only info findings exist", () => {
    const findings: Finding[] = [
      {
        id: "f-1",
        severity: "info",
        category: "other",
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
        category: "other",
        title: "t",
        description: "d",
        evidence: "e",
        recommendation: "r",
      },
      {
        id: "f-2",
        severity: "warning",
        category: "other",
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
        category: "other",
        title: "t",
        description: "d",
        evidence: "e",
        recommendation: "r",
      },
      {
        id: "f-2",
        severity: "critical",
        category: "other",
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
        category: "other",
        title: "t",
        description: "d",
        evidence: "e",
        recommendation: "r",
      },
      {
        id: "f-2",
        severity: "critical",
        category: "other",
        title: "t",
        description: "d",
        evidence: "e",
        recommendation: "r",
      },
      {
        id: "f-3",
        severity: "info",
        category: "other",
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
      category: "unassigned",
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
      issues: [{ id: "i1", title: "Task", status: "todo" }],
      sprintData: { id: "doc-123", title: "Sprint 5" },
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
      sprintData: { id: "sprint-1", title: "Sprint 5" },
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

  it("includes sprint health analysis instructions when documentType is sprint", async () => {
    mockInvoke.mockResolvedValueOnce({
      findings: [],
      summary: "Sprint on track",
    });

    const state = makeState({
      triggerType: "on-demand",
      documentId: "sprint-123",
      documentType: "sprint",
      issues: [
        { id: "i1", title: "Task A", status: "done", priority: "medium" },
        { id: "i2", title: "Task B", status: "todo", priority: "high" },
      ],
      sprintData: { id: "sprint-123", title: "Sprint 5", startDate: "2026-03-10", endDate: "2026-03-24" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "human", content: "Is this sprint on track?" }] as any,
    });

    await analyzeContext(state);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promptContent = (mockInvoke.mock.calls[0] as any)[0][0].content as string;
    expect(promptContent).toContain("SPRINT HEALTH ANALYSIS");
    expect(promptContent).toContain("completion rate");
    expect(promptContent).toContain("Is this sprint on track?");
    expect(promptContent).not.toContain("ISSUE CONTEXT ANALYSIS");
    expect(promptContent).not.toContain("GENERAL PROJECT ANALYSIS");
  });

  it("includes blocker/dependency detection instructions when documentType is sprint", async () => {
    mockInvoke.mockResolvedValueOnce({
      findings: [
        {
          id: "finding-1",
          severity: "warning",
          title: "Blocker detected",
          description: "High priority unstarted",
          evidence: "Issue i2",
          recommendation: "Prioritize",
        },
      ],
      summary: "Blockers found",
    });

    const state = makeState({
      triggerType: "on-demand",
      documentId: "sprint-123",
      documentType: "sprint",
      issues: [
        { id: "i1", title: "Task A", status: "in_progress", priority: "medium", assignee_id: "user-1" },
        { id: "i2", title: "Critical Bug", status: "backlog", priority: "urgent", assignee_id: null },
      ],
      sprintData: { id: "sprint-123", title: "Sprint 5" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "human", content: "Are there any blockers?" }] as any,
    });

    const result = await analyzeContext(state);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promptContent = (mockInvoke.mock.calls[0] as any)[0][0].content as string;
    expect(promptContent).toContain("BLOCKER/DEPENDENCY DETECTION");
    expect(promptContent).toContain("Are there any blockers?");
    expect(result.findings).toHaveLength(1);
    expect(result.severity).toBe("warning");
  });

  it("includes risk assessment instructions in sprint mode", async () => {
    mockInvoke.mockResolvedValueOnce({
      findings: [],
      summary: "Low risk",
    });

    const state = makeState({
      triggerType: "on-demand",
      documentId: "sprint-123",
      documentType: "sprint",
      issues: [{ id: "i1", title: "Task", status: "todo" }],
      sprintData: { id: "sprint-123", title: "Sprint 5" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "human", content: "Any risks?" }] as any,
    });

    await analyzeContext(state);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promptContent = (mockInvoke.mock.calls[0] as any)[0][0].content as string;
    expect(promptContent).toContain("RISK ASSESSMENT");
    expect(promptContent).toContain("velocity");
  });

  it("uses issue-scoped analysis when documentType is issue", async () => {
    mockInvoke.mockResolvedValueOnce({
      findings: [],
      summary: "Issue is in progress",
    });

    const state = makeState({
      triggerType: "on-demand",
      documentId: "issue-456",
      documentType: "issue",
      issues: [
        { id: "issue-456", title: "Fix auth", status: "in_progress", assignee_id: "user-1", priority: "high" },
        { id: "issue-789", title: "Add tests", status: "todo", assignee_id: "user-1", priority: "medium" },
      ],
      sprintData: { id: "sprint-123", title: "Sprint 5" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "human", content: "What's the status of this issue?" }] as any,
    });

    await analyzeContext(state);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promptContent = (mockInvoke.mock.calls[0] as any)[0][0].content as string;
    expect(promptContent).toContain("ISSUE CONTEXT ANALYSIS");
    expect(promptContent).toContain("issue-456");
    expect(promptContent).toContain("assignee workload");
    expect(promptContent).not.toContain("SPRINT HEALTH ANALYSIS");
    expect(promptContent).not.toContain("GENERAL PROJECT ANALYSIS");
  });

  it("uses general analysis when no documentType provided", async () => {
    mockInvoke.mockResolvedValueOnce({
      findings: [],
      summary: "General overview",
    });

    const state = makeState({
      triggerType: "on-demand",
      documentId: null,
      documentType: null,
      issues: [{ id: "i1", title: "Task", status: "todo" }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "human", content: "How is the project?" }] as any,
    });

    await analyzeContext(state);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promptContent = (mockInvoke.mock.calls[0] as any)[0][0].content as string;
    expect(promptContent).toContain("GENERAL PROJECT ANALYSIS");
    expect(promptContent).toContain("How is the project?");
    expect(promptContent).not.toContain("SPRINT HEALTH ANALYSIS");
    expect(promptContent).not.toContain("ISSUE CONTEXT ANALYSIS");
  });

  it("includes document context metadata in prompt", async () => {
    mockInvoke.mockResolvedValueOnce({
      findings: [],
      summary: "OK",
    });

    const state = makeState({
      triggerType: "on-demand",
      documentId: "doc-abc",
      documentType: "sprint",
      contextDocument: {
        document: { id: "doc-abc", title: "Sprint 5", properties: { startDate: "2026-03-10" } },
        associations: [{ type: "project", id: "proj-1", title: "Main Project" }],
      },
      issues: [{ id: "i1", title: "Task", status: "todo" }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "human", content: "Analyze" }] as any,
    });

    await analyzeContext(state);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promptContent = (mockInvoke.mock.calls[0] as any)[0][0].content as string;
    expect(promptContent).toContain("DOCUMENT CONTEXT");
    expect(promptContent).toContain("Sprint 5");
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
    expect(result.errors).toContainEqual(expect.stringContaining("no data available"));
    expect(mockWithStructuredOutput).not.toHaveBeenCalled();
  });

  it("includes partial data handling rules", async () => {
    mockInvoke.mockResolvedValueOnce({
      findings: [],
      summary: "OK",
    });

    const state = makeState({
      triggerType: "on-demand",
      documentType: "sprint",
      issues: [{ id: "i1", title: "Task", status: "todo" }],
      sprintData: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "human", content: "Analyze" }] as any,
    });

    await analyzeContext(state);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promptContent = (mockInvoke.mock.calls[0] as any)[0][0].content as string;
    expect(promptContent).toContain("PARTIAL DATA HANDLING");
    expect(promptContent).toContain("Never infer or hallucinate");
  });

  it("returns clean severity with empty findings for informational response", async () => {
    mockInvoke.mockResolvedValueOnce({
      findings: [],
      summary: "Sprint is on track: 8/12 issues done, 3 days remaining.",
    });

    const state = makeState({
      triggerType: "on-demand",
      documentType: "sprint",
      documentId: "sprint-123",
      issues: [{ id: "i1", title: "Task", status: "done" }],
      sprintData: { id: "sprint-123", title: "Sprint 5" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "human", content: "Is this sprint on track?" }] as any,
    });

    const result = await analyzeContext(state);

    expect(result.findings).toEqual([]);
    expect(result.severity).toBe("clean");
    expect(result.errors).toEqual([]);
  });

  it("defaults query to 'Summarize the current state' when no messages", async () => {
    mockInvoke.mockResolvedValueOnce({
      findings: [],
      summary: "Summary",
    });

    const state = makeState({
      triggerType: "on-demand",
      documentType: "sprint",
      issues: [{ id: "i1", title: "Task", status: "todo" }],
      messages: [],
    });

    await analyzeContext(state);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promptContent = (mockInvoke.mock.calls[0] as any)[0][0].content as string;
    expect(promptContent).toContain("Summarize the current state");
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
    expect(result.errors).toContain("analyze_context: no data available for analysis");
    expect(mockWithStructuredOutput).not.toHaveBeenCalled();
  });

  it("uses documentId-only fallback when contextDocument is null", async () => {
    mockInvoke.mockResolvedValueOnce({
      findings: [],
      summary: "OK",
    });

    const state = makeState({
      triggerType: "on-demand",
      documentId: "doc-xyz",
      documentType: "issue",
      contextDocument: null,
      issues: [{ id: "i1", title: "Task", status: "todo" }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "human", content: "Analyze" }] as any,
    });

    await analyzeContext(state);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promptContent = (mockInvoke.mock.calls[0] as any)[0][0].content as string;
    expect(promptContent).toContain("Document ID: doc-xyz");
    expect(promptContent).toContain("Document Type: issue");
    expect(promptContent).not.toContain("Associations:");
  });

  it("omits document context section when no documentId or contextDocument", async () => {
    mockInvoke.mockResolvedValueOnce({
      findings: [],
      summary: "OK",
    });

    const state = makeState({
      triggerType: "on-demand",
      documentId: null,
      documentType: null,
      contextDocument: null,
      issues: [{ id: "i1", title: "Task", status: "todo" }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "human", content: "Analyze" }] as any,
    });

    await analyzeContext(state);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promptContent = (mockInvoke.mock.calls[0] as any)[0][0].content as string;
    expect(promptContent).not.toContain("DOCUMENT CONTEXT");
    expect(promptContent).not.toContain("Document ID:");
  });
});

describe("buildAnalysisMode", () => {
  it("returns sprint mode for sprint documentType", () => {
    const result = buildAnalysisMode("sprint", "sprint-123");
    expect(result).toContain("SPRINT HEALTH ANALYSIS MODE");
    expect(result).toContain("completion rate");
    expect(result).toContain("BLOCKER/DEPENDENCY DETECTION");
    expect(result).toContain("RISK ASSESSMENT");
  });

  it("returns issue mode with documentId for issue documentType", () => {
    const result = buildAnalysisMode("issue", "issue-456");
    expect(result).toContain("ISSUE CONTEXT ANALYSIS MODE");
    expect(result).toContain("issue-456");
    expect(result).toContain("ASSIGNEE WORKLOAD");
    expect(result).toContain("SPRINT MEMBERSHIP");
    expect(result).toContain("SIBLING ISSUE ANALYSIS");
  });

  it("returns general mode for null documentType", () => {
    const result = buildAnalysisMode(null, null);
    expect(result).toContain("GENERAL PROJECT ANALYSIS MODE");
    expect(result).not.toContain("SPRINT HEALTH");
    expect(result).not.toContain("ISSUE CONTEXT");
  });

  it("returns general mode for unknown documentType", () => {
    const result = buildAnalysisMode("wiki", "doc-789");
    expect(result).toContain("GENERAL PROJECT ANALYSIS MODE");
  });
});
