# Story 1.2: Ship API Client with Parallel Data Fetching

Status: done

## Story

As an **agent**,
I want to fetch issues, sprint data, team allocation, and standup status from Ship's REST API in parallel with retry and timeout handling,
so that the reasoning node has fresh project data to analyze on every polling cycle.

## Acceptance Criteria

1. **Given** the Ship API is accessible and `FLEETGRAPH_API_TOKEN` is configured
   **When** the proactive graph executes
   **Then** four fetch nodes (`fetch_issues`, `fetch_sprint`, `fetch_team`, `fetch_standups`) execute in parallel after `resolve_context`

2. **Given** a fetch node makes an API call
   **When** the call fails
   **Then** `fetchWithRetry` retries 2 times with exponential backoff (1s, 2s) before giving up

3. **Given** a fetch node makes an API call
   **When** the call exceeds 10 seconds
   **Then** it is aborted via `AbortSignal.timeout(10000)`

4. **Given** all four fetch nodes execute in parallel
   **When** measured end-to-end
   **Then** total fetch time is bounded by the slowest single call, not the sum

5. **Given** issues are fetched
   **When** the fetch_issues node processes the response
   **Then** issues with status `done` or `cancelled` are excluded
   **And** results are capped at 100 items
   **And** only essential fields are extracted: `id`, `title`, `status`, `assignee_id`, `priority`, `updated_at`, `created_at`

6. **Given** each fetch node
   **When** an API call fails after all retries
   **Then** the node returns empty data + appends an error string to the `errors` state array
   **And** does NOT throw an exception

## Tasks / Subtasks

- [x] Create Ship API client utility `src/utils/ship-api.ts` (AC: #2, #3)
  - [x] Implement `fetchWithRetry(url, options)` with exponential backoff (2 retries, delays: 1s, 2s)
  - [x] Add `AbortSignal.timeout(10000)` to every request
  - [x] Wrap with LangSmith `traceable()` for observability
  - [x] Use Bearer token auth from `FLEETGRAPH_API_TOKEN` env var
  - [x] Implement endpoint wrappers: `getIssues()`, `getSprint()`, `getSprintIssues()`, `getTeamGrid()`, `getStandupStatus()`, `getDocument()`, `getDocumentAssociations()`, `getIssueHistory()`
- [x] Create `resolve_context` node in `src/nodes/context.ts` (AC: #1)
  - [x] Pass through triggerType, workspaceId, documentId, documentType from initial state
  - [x] Log run configuration
- [x] Create fetch nodes in `src/nodes/fetch.ts` (AC: #1, #4, #5, #6)
  - [x] `fetch_issues`: Call `/api/issues`, filter out done/cancelled, cap at 100 (50 for on-demand), extract essential fields
  - [x] `fetch_sprint`: Call `/api/issues?document_type=sprint&status=active`
  - [x] `fetch_team`: Call `/api/team/grid`
  - [x] `fetch_standups`: Call `/api/standups/status`
  - [x] Each node: try/catch, return empty data + error on failure, never throw
- [x] Wire parallel execution in proactive graph (AC: #1, #4)
  - [x] `resolve_context` → all four fetch nodes simultaneously
  - [x] All four fetch nodes → reasoning node (fan-in)

## Dev Notes

### Architecture Compliance

- **Bearer token auth**: Use `Authorization: Bearer ${FLEETGRAPH_API_TOKEN}` header. Do NOT use session cookies — Ship's 15-minute session timeout is unsuitable for a polling service.
- **No shared types**: FleetGraph consumes Ship REST JSON. Do NOT import types from Ship's `shared/` package. Define local interfaces for the data you need.
- **Error accumulation**: Fetch nodes append to `errors[]` via the accumulating reducer. This means parallel fetch failures are collected, not overwritten.

### Ship API Endpoints

| Ship Endpoint | Fetch Node | Notes |
|---------------|-----------|-------|
| `GET /api/issues` | `fetch_issues` | Returns all issues; you must filter client-side |
| `GET /api/weeks/{id}` | `fetch_sprint` | Single sprint by ID |
| `GET /api/weeks/{id}/issues` | `fetch_sprint` | Issues in a sprint |
| `GET /api/team/grid` | `fetch_team` | Team allocation grid |
| `GET /api/standups/status` | `fetch_standups` | Standup completion status |
| `GET /api/documents/{id}` | (on-demand) | Single document detail |
| `GET /api/documents/{id}/associations` | (on-demand) | Document relationships |

### Issue Filtering (Critical for Cost Control)

The reasoning node has a token budget. Filter issues at the fetch level:
- Exclude statuses: `done`, `cancelled`
- Cap at 100 items (proactive) / 50 items (on-demand)
- Extract only: `id`, `title`, `status`, `assignee_id`, `priority`, `updated_at`, `created_at`
- Never send `content` field (JSONB blob, huge)

### File Structure

```
fleetgraph/src/
├── nodes/
│   ├── context.ts    # resolve_context node
│   └── fetch.ts      # fetch_issues, fetch_sprint, fetch_team, fetch_standups
├── utils/
│   └── ship-api.ts   # fetchWithRetry + Ship API endpoint wrappers
└── graph/
    └── proactive.ts   # Wire the graph topology
```

### References

- [Source: architecture.md#6-ship-api-integration] — API endpoints, auth, resilience pattern
- [Source: architecture.md#4-node-design-decisions] — Fetch node design, error accumulation
- [Source: architecture.md#3-graph-architecture] — Parallel execution topology
- [Source: epics.md#story-1.2] — Story definition with acceptance criteria

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (Amelia, Dev Agent) — fix pass aligning rogue implementation with story specs

### Completion Notes List

- Original implementation passed full issue objects through to reasoning; fix pass added fetch-level filtering: exclude done/cancelled, cap at 100/50, extract essential fields only
- `fetchWithRetry` correctly implements exponential backoff (1s, 2s), 10s timeout, Bearer auth, and traceable wrapping — no changes needed
- Parallel wiring in `proactive.ts` correct: resolve_context → 4 fetch nodes → analyze_health

### File List

- `fleetgraph/src/utils/ship-api.ts`
- `fleetgraph/src/utils/ship-api.test.ts`
- `fleetgraph/src/nodes/context.ts`
- `fleetgraph/src/nodes/context.test.ts`
- `fleetgraph/src/nodes/fetch.ts`
- `fleetgraph/src/nodes/fetch.test.ts`
- `fleetgraph/src/graph/proactive.ts`
