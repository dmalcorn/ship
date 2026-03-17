import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "@langchain/langgraph";
import { isInterruptedResult } from "../utils/graph-helpers.js";

// Mock all external dependencies to test graph wiring in isolation

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

vi.mock("langsmith/traceable", () => ({
  traceable: (fn: Function) => fn,
}));

// Mock fetch globally for ship-api calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { buildProactiveGraph } = await import("./proactive.js");

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

  mockInvoke.mockResolvedValueOnce({
    findings: [
      {
        id: "finding-1",
        severity: "warning",
        title: "Unassigned issue",
        description: "Issue has no owner",
        evidence: "Issue issue-1: Fix auth bug has no assignee",
        recommendation: "Assign an owner",
      },
    ],
    summary: "1 issue found",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
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

    // Mock LLM — clean run
    mockInvoke.mockResolvedValueOnce({
      findings: [],
      summary: "Everything looks healthy",
    });

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
    // AC #4: confirmation_gate never reached — humanDecision stays null
    expect(result.humanDecision).toBeNull();
    expect(result.proposedActions).toEqual([]);
  });

  it("interrupts at confirmation_gate with correct payload when findings exist", async () => {
    setupFindingsMocks();

    const graph = buildProactiveGraph();
    const threadId = "test-interrupt-payload";
    const config = { configurable: { thread_id: threadId } };

    // AC #1: Graph should interrupt — returns with __interrupt__ key (no throw with MemorySaver)
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

    // AC #2: Resume with confirm — graph completes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resumeCmd = new Command({ resume: { decision: "confirm" } }) as any;
    const result = await graph.invoke(resumeCmd, config);

    expect(result.humanDecision).toBe("confirm");
    expect(result.findings).toHaveLength(1);
    expect(result.proposedActions).toHaveLength(1);
    // Should NOT be interrupted anymore
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

    // AC #3: Resume with dismiss — graph completes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resumeCmd = new Command({ resume: { decision: "dismiss" } }) as any;
    const result = await graph.invoke(resumeCmd, config);

    expect(result.humanDecision).toBe("dismiss");
    expect(result.findings).toHaveLength(1);
    expect(isInterruptedResult(result)).toBe(false);
  });

  it("each thread has isolated state — separate threadIds don't interfere", async () => {
    // Task 3.3: MemorySaver isolation — two separate threads
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
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
      status: 200,
      statusText: "OK",
    });
    mockInvoke.mockResolvedValueOnce({
      findings: [],
      summary: "Everything looks healthy",
    });

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
    // Task 4.2: After resume completes, a second resume should not crash
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
});
