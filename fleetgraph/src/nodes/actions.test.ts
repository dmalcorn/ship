import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FleetGraphStateType, Finding } from "../state.js";

// Track interrupt mock for per-test control
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let interruptMock: any;

vi.mock("@langchain/langgraph", async () => {
  const actual = await vi.importActual("@langchain/langgraph");
  interruptMock = vi.fn(() => ({ decision: "confirm" }));
  return {
    ...actual,
    interrupt: (...args: unknown[]) => interruptMock(...args),
  };
});

const { proposeActions, confirmationGate, logCleanRun, gracefulDegrade } =
  await import("./actions.js");

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

const sampleFindings: Finding[] = [
  {
    id: "finding-1",
    severity: "warning",
    category: "unassigned",
    title: "Unassigned issue",
    description: "Issue has no owner",
    evidence: "Issue #abc: Fix login",
    recommendation: "Assign an owner to prevent orphaned work",
  },
  {
    id: "finding-2",
    severity: "critical",
    category: "security",
    title: "Unowned security issue",
    description: "Security issue without assignee",
    evidence: "Issue #def: Fix XSS vulnerability",
    recommendation: "Assign an owner immediately",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

// --- proposeActions ---

describe("proposeActions", () => {
  it("maps each finding to a ProposedAction with requiresConfirmation", async () => {
    const state = makeState({ findings: sampleFindings });
    const result = await proposeActions(state);

    expect(result.proposedActions).toHaveLength(2);
    expect(result.proposedActions![0]).toEqual({
      findingId: "finding-1",
      description: "Assign an owner to prevent orphaned work",
      requiresConfirmation: true,
    });
    expect(result.proposedActions![1]).toEqual({
      findingId: "finding-2",
      description: "Assign an owner immediately",
      requiresConfirmation: true,
    });
  });

  it("returns empty array when no findings", async () => {
    const state = makeState({ findings: [] });
    const result = await proposeActions(state);

    expect(result.proposedActions).toEqual([]);
  });
});

// --- confirmationGate ---

describe("confirmationGate", () => {
  it("calls interrupt with findings and proposed actions payload", async () => {
    const state = makeState({
      findings: sampleFindings,
      proposedActions: [
        { findingId: "finding-1", description: "Assign owner", requiresConfirmation: true },
      ],
    });

    await confirmationGate(state);

    expect(interruptMock).toHaveBeenCalledWith({
      type: "confirmation_required",
      findings: state.findings,
      proposedActions: state.proposedActions,
      message: "Found 2 issue(s) requiring attention. Review proposed actions.",
    });
  });

  it("returns humanDecision 'confirm' when user confirms", async () => {
    interruptMock.mockReturnValueOnce({ decision: "confirm" });

    const state = makeState({
      findings: sampleFindings,
      proposedActions: [
        { findingId: "finding-1", description: "Assign owner", requiresConfirmation: true },
        { findingId: "finding-2", description: "Assign security owner", requiresConfirmation: true },
      ],
    });

    const result = await confirmationGate(state);
    expect(result.humanDecision).toBe("confirm");
  });

  it("returns humanDecision 'dismiss' when user dismisses", async () => {
    interruptMock.mockReturnValueOnce({ decision: "dismiss" });

    const state = makeState({
      findings: sampleFindings,
      proposedActions: [
        { findingId: "finding-1", description: "Assign owner", requiresConfirmation: true },
      ],
    });

    const result = await confirmationGate(state);
    expect(result.humanDecision).toBe("dismiss");
  });

  it("defaults to 'dismiss' when decision is unknown (fail-closed)", async () => {
    interruptMock.mockReturnValueOnce({ decision: "unknown-value" });

    const state = makeState({
      findings: sampleFindings,
      proposedActions: [
        { findingId: "finding-1", description: "Assign owner", requiresConfirmation: true },
      ],
    });

    const result = await confirmationGate(state);
    expect(result.humanDecision).toBe("dismiss");
  });

  it("defaults to 'dismiss' when response has no decision field (fail-closed)", async () => {
    interruptMock.mockReturnValueOnce(undefined);

    const state = makeState({
      findings: sampleFindings,
      proposedActions: [],
    });

    const result = await confirmationGate(state);
    expect(result.humanDecision).toBe("dismiss");
  });
});

// --- logCleanRun ---

describe("logCleanRun", () => {
  it("returns empty object (no state changes)", async () => {
    const state = makeState();
    const result = await logCleanRun(state);

    expect(result).toEqual({});
  });
});

// --- gracefulDegrade ---

describe("gracefulDegrade", () => {
  it("returns empty findings, clean severity, and empty proposedActions", async () => {
    const state = makeState({
      errors: [
        "fetch_issues: HTTP 500",
        "fetch_sprint: timeout",
        "fetch_team: HTTP 503",
        "fetch_standups: Network error",
      ],
    });
    const result = await gracefulDegrade(state);

    expect(result.findings).toEqual([]);
    expect(result.severity).toBe("clean");
    expect(result.proposedActions).toEqual([]);
  });
});
