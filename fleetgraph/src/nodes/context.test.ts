import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FleetGraphStateType } from "../state.js";

// Mock ship-api module
const mockGetDocument = vi.fn();
const mockGetDocumentAssociations = vi.fn();

vi.mock("../utils/ship-api.js", () => ({
  shipApi: {
    getDocument: (...args: unknown[]) => mockGetDocument(...args),
    getDocumentAssociations: (...args: unknown[]) => mockGetDocumentAssociations(...args),
    getIssues: vi.fn(),
    getSprint: vi.fn(),
    getSprintIssues: vi.fn(),
    getTeamGrid: vi.fn(),
    getStandupStatus: vi.fn(),
    getIssueHistory: vi.fn(),
  },
}));

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
    contextDocument: null,
    errors: [],
    ...overrides,
  };
}

describe("resolveContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("fetches document metadata and associations when on-demand with documentId", async () => {
    const doc = { id: "doc-123", title: "Fix login bug", document_type: "issue", properties: { status: "in_progress" } };
    const associations = [
      { id: "assoc-1", source_document_id: "doc-123", target_document_id: "sprint-1", relationship_type: "sprint" },
    ];
    mockGetDocument.mockResolvedValueOnce(doc);
    mockGetDocumentAssociations.mockResolvedValueOnce(associations);

    const state = makeState({
      triggerType: "on-demand",
      documentId: "doc-123",
      documentType: "issue",
    });
    const result = await resolveContext(state);

    expect(mockGetDocument).toHaveBeenCalledWith("doc-123");
    expect(mockGetDocumentAssociations).toHaveBeenCalledWith("doc-123");
    expect(result.triggerType).toBe("on-demand");
    expect(result.documentId).toBe("doc-123");
    expect(result.documentType).toBe("issue");
    // contextDocument should contain enriched data
    expect(result.contextDocument).toBeDefined();
    expect(result.contextDocument!.document).toEqual(doc);
    expect(result.contextDocument!.associations).toEqual(associations);
  });

  it("does not fetch document metadata in proactive mode", async () => {
    const state = makeState({ triggerType: "proactive" });
    await resolveContext(state);

    expect(mockGetDocument).not.toHaveBeenCalled();
    expect(mockGetDocumentAssociations).not.toHaveBeenCalled();
  });

  it("does not fetch document metadata when no documentId provided", async () => {
    const state = makeState({ triggerType: "on-demand", documentId: null });
    await resolveContext(state);

    expect(mockGetDocument).not.toHaveBeenCalled();
    expect(mockGetDocumentAssociations).not.toHaveBeenCalled();
  });

  it("handles document fetch failure gracefully", async () => {
    mockGetDocument.mockRejectedValueOnce(new Error("HTTP 404"));
    mockGetDocumentAssociations.mockResolvedValueOnce([]);

    const state = makeState({
      triggerType: "on-demand",
      documentId: "doc-missing",
      documentType: "issue",
    });
    const result = await resolveContext(state);

    expect(result.contextDocument).toBeNull();
    expect(result.errors).toContainEqual(expect.stringContaining("resolve_context"));
  });

  it("handles associations fetch failure gracefully", async () => {
    const doc = { id: "doc-123", title: "Test" };
    mockGetDocument.mockResolvedValueOnce(doc);
    mockGetDocumentAssociations.mockRejectedValueOnce(new Error("HTTP 500"));

    const state = makeState({
      triggerType: "on-demand",
      documentId: "doc-123",
      documentType: "issue",
    });
    const result = await resolveContext(state);

    // Should still return document with empty associations
    expect(result.contextDocument).toBeDefined();
    expect(result.contextDocument!.document).toEqual(doc);
    expect(result.contextDocument!.associations).toEqual([]);
  });
});
