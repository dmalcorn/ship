import { describe, it, expect } from "vitest";
import type { FleetGraphStateType } from "../state.js";

const { resolveContext } = await import("./context.js");

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

describe("resolveContext", () => {
  it("passes through proactive trigger type and workspace", async () => {
    const state = makeState({
      triggerType: "proactive",
      workspaceId: "ws-abc",
    });
    const result = await resolveContext(state);

    expect(result.triggerType).toBe("proactive");
    expect(result.workspaceId).toBe("ws-abc");
    expect(result.documentId).toBeNull();
    expect(result.documentType).toBeNull();
  });

  it("passes through on-demand context with document info", async () => {
    const state = makeState({
      triggerType: "on-demand",
      workspaceId: "ws-xyz",
      documentId: "doc-123",
      documentType: "issue",
    });
    const result = await resolveContext(state);

    expect(result.triggerType).toBe("on-demand");
    expect(result.documentId).toBe("doc-123");
    expect(result.documentType).toBe("issue");
  });

  it("defaults triggerType to proactive when not set", async () => {
    const state = makeState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (state as any).triggerType = undefined;
    const result = await resolveContext(state);

    expect(result.triggerType).toBe("proactive");
  });
});
