import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "@langchain/langgraph";
import { isInterruptedResult } from "../utils/graph-helpers.js";

// Mock all external dependencies to test graph wiring in isolation

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

vi.mock("langsmith/traceable", () => ({
  traceable: (fn: Function) => fn,
}));

// Mock fetch globally for ship-api calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Reset change detection hash between tests
const { invalidateDataHash } = await import("../nodes/change-detection.js");
const { buildProactiveGraph } = await import("./proactive.js");

// LLM response with tool_calls (native Anthropic format used by analyze_health)
function makeLlmResponse(findings: Record<string, unknown>[]) {
  return {
    tool_calls: [
      {
        args: {
          findings,
          summary: `${findings.length} issue(s) found`,
        },
      },
    ],
    content: [],
  };
}

// Standard finding for tests
const testFinding = {
  id: "finding-1",
  severity: "warning",
  category: "unassigned",
  title: "Unassigned issue",
  description: "Issue has no owner",
  evidence: "Issue issue-1: Fix auth bug has no assignee",
  recommendation: "Assign an owner",
  affectedDocumentIds: ["issue-1"],
  affectedDocumentType: "issue",
};

// Reusable mock setup for findings path
function setupFindingsMocks() {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => [
      {
        id: "issue-1",
        title: "Fix auth bug",
        properties: { status: "todo", assignee_id: null, priority: "high" },
        updated_at: "2026-03-15",
        created_at: "2026-03-10",
      },
    ],
    status: 200,
    statusText: "OK",
  });

  // Single LLM call for analyze_health
  mockInvoke.mockResolvedValueOnce(makeLlmResponse([testFinding]));
}

beforeEach(() => {
  vi.clearAllMocks();
  // Ensure change detection doesn't skip on cached hash
  invalidateDataHash();
});

describe("proactive graph topology", () => {
  it("builds without throwing", () => {
    const graph = buildProactiveGraph();
    expect(graph).toBeDefined();
  });

  it("routes to log_clean_run when LLM returns no findings", async () => {
    // Mock Ship API responses — all return empty/valid data
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
      status: 200,
      statusText: "OK",
    });

    // Mock LLM — clean run (single call)
    mockInvoke.mockResolvedValueOnce(makeLlmResponse([]));

    const graph = buildProactiveGraph();
    const result = await graph.invoke(
      {
        triggerType: "proactive" as const,
        workspaceId: "test-ws",
      },
      { configurable: { thread_id: "test-clean-run" } }
    );

    expect(result.severity).toBe("clean");
    expect(result.findings).toEqual([]);
    // confirmation_gate never reached — humanDecision stays null
    expect(result.humanDecision).toBeNull();
    expect(result.proposedActions).toEqual([]);
  });

  it("interrupts at confirmation_gate with correct payload when findings exist", async () => {
    setupFindingsMocks();

    const graph = buildProactiveGraph();
    const threadId = "test-interrupt-payload";
    const config = { configurable: { thread_id: threadId } };

    // Graph should interrupt — returns with __interrupt__ key
    const result = await graph.invoke(
      {
        triggerType: "proactive" as const,
        workspaceId: "test-ws",
      },
      config
    );

    expect(isInterruptedResult(result)).toBe(true);
    // humanDecision should still be null — gate hasn't been passed yet
    expect(result.humanDecision).toBeNull();

    // Verify interrupt payload via getState
    const state = await graph.getState(config);
    expect(state.next).toContain("confirmation_gate");
    const task = state.tasks?.[0];
    expect(task).toBeDefined();
    expect(task!.name).toBe("confirmation_gate");
    const interruptValue = task!.interrupts?.[0]?.value as Record<string, unknown>;
    expect(interruptValue.type).toBe("confirmation_required");
    expect(interruptValue.findings).toHaveLength(1);
    expect(interruptValue.proposedActions).toHaveLength(1);
    expect(interruptValue.message).toContain("1 issue(s)");
  });

  it("resumes with 'confirm' and completes graph with humanDecision set", async () => {
    setupFindingsMocks();

    const graph = buildProactiveGraph();
    const threadId = "test-resume-confirm";
    const config = { configurable: { thread_id: threadId } };

    // First invoke — hits interrupt
    const initial = await graph.invoke(
      { triggerType: "proactive" as const, workspaceId: "test-ws" },
      config
    );
    expect(isInterruptedResult(initial)).toBe(true);

    // Resume with confirm — graph completes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resumeCmd = new Command({ resume: { decision: "confirm" } }) as any;
    const result = await graph.invoke(resumeCmd, config);

    expect(result.humanDecision).toBe("confirm");
    expect(result.findings).toHaveLength(1);
    expect(result.proposedActions).toHaveLength(1);
    expect(isInterruptedResult(result)).toBe(false);
  });

  it("resumes with 'dismiss' and completes graph with humanDecision set", async () => {
    setupFindingsMocks();

    const graph = buildProactiveGraph();
    const threadId = "test-resume-dismiss";
    const config = { configurable: { thread_id: threadId } };

    // First invoke — hits interrupt
    const initial = await graph.invoke(
      { triggerType: "proactive" as const, workspaceId: "test-ws" },
      config
    );
    expect(isInterruptedResult(initial)).toBe(true);

    // Resume with dismiss — graph completes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resumeCmd = new Command({ resume: { decision: "dismiss" } }) as any;
    const result = await graph.invoke(resumeCmd, config);

    expect(result.humanDecision).toBe("dismiss");
    expect(result.findings).toHaveLength(1);
    expect(isInterruptedResult(result)).toBe(false);
  });

  it("each thread has isolated state — separate threadIds don't interfere", async () => {
    setupFindingsMocks();
    const graph = buildProactiveGraph();

    // Thread A — interrupt
    const configA = { configurable: { thread_id: "thread-isolation-A" } };
    const initialA = await graph.invoke(
      { triggerType: "proactive" as const, workspaceId: "test-ws" },
      configA
    );
    expect(isInterruptedResult(initialA)).toBe(true);

    // Thread B — clean run (fresh mocks needed)
    invalidateDataHash();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
      status: 200,
      statusText: "OK",
    });
    mockInvoke.mockResolvedValueOnce(makeLlmResponse([]));

    const configB = { configurable: { thread_id: "thread-isolation-B" } };
    const resultB = await graph.invoke(
      { triggerType: "proactive" as const, workspaceId: "test-ws" },
      configB
    );

    // Thread B should be clean — not affected by Thread A's interrupted state
    expect(resultB.severity).toBe("clean");
    expect(resultB.humanDecision).toBeNull();
    expect(isInterruptedResult(resultB)).toBe(false);

    // Thread A can still be resumed independently
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resumeCmd = new Command({ resume: { decision: "confirm" } }) as any;
    const resultA = await graph.invoke(resumeCmd, configA);
    expect(resultA.humanDecision).toBe("confirm");
    expect(isInterruptedResult(resultA)).toBe(false);
  });

  it("double-resume on already-completed thread returns completed state", async () => {
    setupFindingsMocks();
    const graph = buildProactiveGraph();
    const threadId = "test-double-resume";
    const config = { configurable: { thread_id: threadId } };

    // Initial invoke — interrupt
    const initial = await graph.invoke(
      { triggerType: "proactive" as const, workspaceId: "test-ws" },
      config
    );
    expect(isInterruptedResult(initial)).toBe(true);

    // First resume — completes graph
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resumeCmd = new Command({ resume: { decision: "confirm" } }) as any;
    const firstResume = await graph.invoke(resumeCmd, config);
    expect(firstResume.humanDecision).toBe("confirm");
    expect(isInterruptedResult(firstResume)).toBe(false);

    // After completion, getState should show no pending next nodes
    const state = await graph.getState(config);
    expect(state.next).toEqual([]);
  });

  it("routes to graceful_degrade when all fetches fail", async () => {
    mockFetch.mockRejectedValue(new Error("Network unreachable"));

    const graph = buildProactiveGraph();
    const result = await graph.invoke(
      {
        triggerType: "proactive" as const,
        workspaceId: "test-ws",
      },
      { configurable: { thread_id: "test-degrade-run" } }
    );

    expect(result.severity).toBe("clean");
    expect(result.findings).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
    // confirmation_gate should NOT be reached on degrade path
    expect(result.humanDecision).toBeNull();
  });

  it("skips LLM call when data is unchanged (change detection)", async () => {
    // First run: data present, LLM called
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
      status: 200,
      statusText: "OK",
    });
    mockInvoke.mockResolvedValueOnce(makeLlmResponse([]));

    const graph = buildProactiveGraph();
    const result1 = await graph.invoke(
      { triggerType: "proactive" as const, workspaceId: "test-ws" },
      { configurable: { thread_id: "test-cache-1" } }
    );
    expect(result1.severity).toBe("clean");
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    // Second run: same data — LLM should NOT be called, routes to log_skipped_run
    const result2 = await graph.invoke(
      { triggerType: "proactive" as const, workspaceId: "test-ws" },
      { configurable: { thread_id: "test-cache-2" } }
    );
    expect(result2.severity).toBe("clean");
    expect(result2.dataChanged).toBe(false);
    // Still only 1 LLM call total — second run was skipped by change detection
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
});
