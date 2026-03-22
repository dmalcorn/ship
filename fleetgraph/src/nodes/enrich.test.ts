import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("langsmith/traceable", () => ({
  traceable: (fn: Function) => fn,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { enrichAssociations } = await import("./enrich.js");

// Minimal state factory
function makeState(issues: Record<string, unknown>[]): Parameters<typeof enrichAssociations>[0] {
  return {
    triggerType: "proactive" as const,
    documentId: null,
    documentType: null,
    workspaceId: "ws-1",
    userId: null,
    contextDocument: null,
    issues,
    sprintData: null,
    allSprints: [],
    teamGrid: null,
    standupStatus: null,
    findings: [],
    severity: "clean" as const,
    proposedActions: [],
    humanDecision: null,
    errors: [],
    messages: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("enrichAssociations", () => {
  it("returns empty partial when no issues", async () => {
    const result = await enrichAssociations(makeState([]));
    expect(result).toEqual({});
  });

  it("does not modify issues that already have program associations", async () => {
    const issues = [
      {
        id: "i-1",
        title: "Complete issue",
        belongs_to: [
          { id: "proj-1", type: "project", title: "Core Features" },
          { id: "prog-1", type: "program", title: "Ship Core" },
        ],
      },
    ];

    const result = await enrichAssociations(makeState(issues));
    const enriched = result.issues!;
    expect(enriched).toHaveLength(1);
    expect(enriched[0]!.belongs_to).toHaveLength(2);
    // No API calls needed
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("infers program from project using other issues in the same batch", async () => {
    const issues = [
      // This issue has both project and program — provides the mapping
      {
        id: "i-1",
        title: "Complete issue",
        belongs_to: [
          { id: "proj-1", type: "project", title: "Core Features" },
          { id: "prog-1", type: "program", title: "Ship Core" },
        ],
      },
      // This issue has project but no program — should be enriched
      {
        id: "i-2",
        title: "Orphaned issue",
        belongs_to: [
          { id: "proj-1", type: "project", title: "Core Features" },
        ],
      },
    ];

    const result = await enrichAssociations(makeState(issues));
    const enriched = result.issues!;

    expect(enriched).toHaveLength(2);
    // First issue unchanged
    expect(enriched[0]!.belongs_to).toHaveLength(2);
    // Second issue now has program inferred
    const orphanBelongsTo = enriched[1]!.belongs_to as Array<{ id: string; type: string }>;
    expect(orphanBelongsTo).toHaveLength(2);
    expect(orphanBelongsTo.find((a) => a.type === "program")).toEqual({
      id: "prog-1",
      type: "program",
      title: "Ship Core",
    });

    // No API calls — resolved from batch data
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches project associations from API when no batch mapping exists", async () => {
    const issues = [
      // Only has project, no other issue provides the mapping
      {
        id: "i-1",
        title: "Orphaned issue",
        belongs_to: [
          { id: "proj-1", type: "project", title: "Core Features" },
        ],
      },
    ];

    // Mock the API response for project associations
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          target_document_id: "prog-1",
          relationship_type: "program",
          target_title: "Ship Core",
        },
      ],
      status: 200,
      statusText: "OK",
    });

    const result = await enrichAssociations(makeState(issues));
    const enriched = result.issues!;

    expect(enriched).toHaveLength(1);
    const belongsTo = enriched[0]!.belongs_to as Array<{ id: string; type: string }>;
    expect(belongsTo).toHaveLength(2);
    expect(belongsTo.find((a) => a.type === "program")).toEqual({
      id: "prog-1",
      type: "program",
      title: "Ship Core",
    });

    // One API call for the orphaned project
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("handles API failure gracefully — leaves issue unenriched", async () => {
    const issues = [
      {
        id: "i-1",
        title: "Orphaned issue",
        belongs_to: [
          { id: "proj-1", type: "project", title: "Core Features" },
        ],
      },
    ];

    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await enrichAssociations(makeState(issues));
    const enriched = result.issues!;

    // Issue unchanged — still only has project
    expect(enriched).toHaveLength(1);
    const belongsTo = enriched[0]!.belongs_to as Array<{ id: string; type: string }>;
    expect(belongsTo).toHaveLength(1);
    expect(belongsTo[0]!.type).toBe("project");
  });

  it("deduplicates API calls — one call per unique orphaned project", async () => {
    const issues = [
      {
        id: "i-1",
        title: "Orphan A",
        belongs_to: [{ id: "proj-1", type: "project" }],
      },
      {
        id: "i-2",
        title: "Orphan B",
        belongs_to: [{ id: "proj-1", type: "project" }],
      },
      {
        id: "i-3",
        title: "Orphan C",
        belongs_to: [{ id: "proj-2", type: "project" }],
      },
    ];

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { target_document_id: "prog-1", relationship_type: "program", target_title: "Ship Core" },
        ],
        status: 200,
        statusText: "OK",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { target_document_id: "prog-2", relationship_type: "program", target_title: "Auth" },
        ],
        status: 200,
        statusText: "OK",
      });

    const result = await enrichAssociations(makeState(issues));
    const enriched = result.issues!;

    // 2 API calls — one per unique project, not one per issue
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // All 3 issues should now have program
    for (const issue of enriched) {
      const bt = issue.belongs_to as Array<{ type: string }>;
      expect(bt.some((a) => a.type === "program")).toBe(true);
    }
  });

  it("handles issues with no belongs_to at all", async () => {
    const issues = [
      { id: "i-1", title: "No associations" },
      { id: "i-2", title: "Empty array", belongs_to: [] },
    ];

    const result = await enrichAssociations(makeState(issues));
    const enriched = result.issues!;

    // No crash, no API calls, issues returned as-is
    expect(enriched).toHaveLength(2);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
