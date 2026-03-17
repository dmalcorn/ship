# Story 1.8: Graceful Degradation on Ship API Failures

Status: done

## Story

As an **operator**,
I want the agent to handle Ship API failures without crashing or producing false findings,
so that a single API timeout doesn't bring down the monitoring system or surface incorrect results.

## Acceptance Criteria

1. **Given** one or more Ship API fetch nodes fail (timeout, 5xx, rate limit)
   **When** other fetch nodes succeed
   **Then** the reasoning node runs with available data and the `errors` array accumulates the failure details
   **And** the agent does not produce findings about data it couldn't fetch

2. **Given** all Ship API fetch nodes fail
   **When** the graph reaches the conditional edge after reasoning
   **Then** the graph routes to `graceful_degrade` → END
   **And** `graceful_degrade` logs the failure, returns `severity: "clean"`, and produces no findings
   **And** the next cron cycle executes normally with no state corruption from the failed run

## Tasks / Subtasks

- [x] Ensure each fetch node handles failures gracefully (AC: #1)
  - [x] Wrap each fetch in try/catch
  - [x] On failure: return empty data for that category (e.g., `issues: []`, `sprintData: null`)
  - [x] Append descriptive error string to `errors` array (e.g., `"fetch_issues failed: HTTP 500"`)
  - [x] Never throw — let the graph continue with partial data
- [x] Update reasoning node to handle partial data (AC: #1)
  - [x] Add prompt instruction: "Only analyze data categories that are present. If issues array is empty, do not produce issue-related findings. If sprint data is null, do not produce sprint-related findings."
  - [x] Ensure Claude doesn't hallucinate findings about missing data
- [x] Implement `graceful_degrade` node (AC: #2)
  - [x] Log all errors from `errors` array
  - [x] Return `{ severity: 'clean', findings: [], proposedActions: [] }`
  - [x] Log: `[graceful_degrade] All data fetches failed. Skipping analysis.`
- [x] Ensure conditional edge routes to `graceful_degrade` correctly (AC: #2)
  - [x] Route when: `errors.length > 0 AND issues.length === 0 AND sprintData === null`
- [x] Verify cron resilience — no state corruption between runs (AC: #2)
  - [x] Each proactive run uses a fresh thread ID
  - [x] MemorySaver state is per-thread — failed runs don't contaminate next run
  - [x] Cron handler catches all errors from graph invocation

## Dev Notes

### Architecture Compliance

- **Error accumulation via reducer**: The `errors` field uses `(prev, next) => [...prev, ...next]`. When parallel fetch nodes run, each appends its errors independently.
- **Partial data is better than no data**: If `fetch_team` fails but `fetch_issues` succeeds, the reasoning node still runs with issue data.
- **No state persistence between cron runs**: Each cron cycle creates a new thread ID. MemorySaver keeps state per thread.

### Partial Data Handling in Reasoning Prompt

The `analyze_health` prompt includes explicit instructions:
```
IMPORTANT: Only analyze data categories that were successfully fetched.
- If the issues array is empty, do NOT produce any issue-related findings.
- If sprint data is null/missing, do NOT produce sprint-related findings.
- If team data is null/missing, do NOT produce team-related findings.
- If standup data is null/missing, do NOT produce standup-related findings.
Never infer or hallucinate findings about data you did not receive.
```

### References

- [Source: architecture.md#4-node-design-decisions] — Error accumulation pattern
- [Source: architecture.md#6-ship-api-integration] — Resilience pattern, retry at fetch level
- [Source: prd.md#NFR8] — Graceful degradation requirement
- [Source: prd.md#NFR9] — Cron resilience requirement
- [Source: epics.md#story-1.8] — Story definition with acceptance criteria

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (Amelia, Dev Agent) — fix pass aligning rogue implementation with story specs

### Completion Notes List

- Fetch node error handling and conditional edge routing were already correctly implemented
- Fix pass: added explicit partial data handling instructions to `analyze_health` prompt (AC #1 — "agent does not produce findings about data it couldn't fetch")
- Fix pass: improved `gracefulDegrade` node to log actual errors array and return `proposedActions: []`
- Cron resilience verified: fresh thread ID per run, try/catch wrapping, MemorySaver isolation

### File List

- `fleetgraph/src/nodes/reasoning.ts`
- `fleetgraph/src/nodes/actions.ts`
- `fleetgraph/src/nodes/fetch.ts`
- `fleetgraph/src/graph/proactive.ts`
- `fleetgraph/src/index.ts`
