import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock traceable to be a passthrough
vi.mock("langsmith/traceable", () => ({
  traceable: (fn: Function) => fn,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Set env vars before import
process.env.SHIP_API_URL = "https://test-ship.example.com";
process.env.FLEETGRAPH_API_TOKEN = "ship_testtoken123";

const { fetchWithRetry, shipApi } = await import("./ship-api.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchWithRetry", () => {
  it("makes request with Bearer token and correct URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: "test" }),
    });

    await fetchWithRetry("/api/issues");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://test-ship.example.com/api/issues");
    expect(opts.headers.Authorization).toBe("Bearer ship_testtoken123");
    expect(opts.headers["Content-Type"]).toBe("application/json");
  });

  it("includes AbortSignal.timeout(10000)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    await fetchWithRetry("/api/issues");

    const [, opts] = mockFetch.mock.calls[0]!;
    expect(opts.signal).toBeDefined();
  });

  it("returns parsed JSON on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: "1", title: "Issue" }],
    });

    const result = await fetchWithRetry("/api/issues");
    expect(result).toEqual([{ id: "1", title: "Issue" }]);
  });

  it("retries on failure with exponential backoff", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    mockFetch
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

    const result = await fetchWithRetry("/api/issues", 2);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ success: true });

    vi.useRealTimers();
  });

  it("throws after exhausting retries", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    mockFetch.mockRejectedValue(new Error("Persistent failure"));

    await expect(fetchWithRetry("/api/issues", 2)).rejects.toThrow(
      "Persistent failure"
    );
    expect(mockFetch).toHaveBeenCalledTimes(3); // initial + 2 retries

    vi.useRealTimers();
  });

  it("throws on non-ok HTTP response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    vi.useFakeTimers({ shouldAdvanceTime: true });

    await expect(fetchWithRetry("/api/issues", 0)).rejects.toThrow(
      "HTTP 500: Internal Server Error"
    );

    vi.useRealTimers();
  });
});

describe("shipApi wrappers", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    });
  });

  it("getIssues calls /api/issues", async () => {
    await shipApi.getIssues();
    expect(mockFetch.mock.calls[0]![0]).toBe(
      "https://test-ship.example.com/api/issues"
    );
  });

  it("getIssues passes query params", async () => {
    await shipApi.getIssues("document_type=sprint&status=active");
    expect(mockFetch.mock.calls[0]![0]).toBe(
      "https://test-ship.example.com/api/issues?document_type=sprint&status=active"
    );
  });

  it("getSprintIssues calls /api/weeks/:id/issues", async () => {
    await shipApi.getSprintIssues("sprint-123");
    expect(mockFetch.mock.calls[0]![0]).toBe(
      "https://test-ship.example.com/api/weeks/sprint-123/issues"
    );
  });

  it("getTeamGrid calls /api/team/grid", async () => {
    await shipApi.getTeamGrid();
    expect(mockFetch.mock.calls[0]![0]).toBe(
      "https://test-ship.example.com/api/team/grid"
    );
  });

  it("getStandupStatus calls /api/standups/status", async () => {
    await shipApi.getStandupStatus();
    expect(mockFetch.mock.calls[0]![0]).toBe(
      "https://test-ship.example.com/api/standups/status"
    );
  });

  it("getDocument calls /api/documents/:id", async () => {
    await shipApi.getDocument("doc-456");
    expect(mockFetch.mock.calls[0]![0]).toBe(
      "https://test-ship.example.com/api/documents/doc-456"
    );
  });
});
