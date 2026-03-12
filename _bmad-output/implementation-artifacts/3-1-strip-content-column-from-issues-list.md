# Story 3.1: Strip Content Column from Issues List

Status: ready-for-dev

## Story

As a user viewing the issues board,
I want the issues list to load with only the fields the UI actually displays,
So that the 327 KB payload drops to ~15–20 KB and the board renders significantly faster under load.

## Acceptance Criteria

1. **Given** all frontend components that consume the issues list have been audited for `.content` usage
   **When** `grep -rn "issue\.content\|issues.*\.content" web/src` is run
   **Then** zero results reference `.content` from the issues list response (confirmed: `IssuesList.tsx` only references content via a separate `/api/documents/:id/content` endpoint when opening a document)

2. **Given** the issues list SQL query in `api/src/routes/issues.ts` is updated to exclude `d.content` and `d.yjs_state`
   **When** `GET /api/issues` is called
   **Then** the JSON response objects contain no `content` or `yjs_state` fields

3. **Given** the column is removed from the list query
   **When** the issues board renders
   **Then** all issue fields the UI uses — title, state, priority, assignee, ticket_number, dates, belongs_to — render correctly with no visual regression

4. **Given** the changes are applied
   **When** `pnpm test` is run
   **Then** all tests pass with no new failures (baseline: 6 pre-existing failures in `auth.test.ts` only)

## Tasks / Subtasks

- [ ] Task 1: Audit frontend for `content` usage from issues list (AC: #1)
  - [ ] Run: `grep -rn "issue\.content\|\.content" web/src/components/IssuesList.tsx` — confirm zero usages read `.content` from list payloads
  - [ ] Run: `grep -rn "content" web/src/pages/IssuesPage.tsx web/src/components/IssuesList.tsx 2>/dev/null` — confirm no list-level content reads
  - [ ] Document audit result in commit message: "Frontend audit: no component reads .content from issues list"

- [ ] Task 2: Remove `d.content` from the main issues list SELECT (AC: #2)
  - [ ] Open `api/src/routes/issues.ts`
  - [ ] Locate the main list query starting at `router.get('/', ...)` (around line 115)
  - [ ] In the SELECT clause (around line 124–128), remove `d.content,` — leave all other columns intact
  - [ ] Also verify `d.yjs_state` is not in this SELECT (it was not present in the list query — confirm with grep)
  - [ ] Do NOT remove `content` from individual-issue GET routes (e.g., `GET /:id`, `GET /ticket/:number`) — those are single-document fetches that need content for the editor

- [ ] Task 3: Remove `content` from the response mapping (AC: #2)
  - [ ] Scan `issues.ts` for any `content: row.content` mapping in the list route handler
  - [ ] If a `mapIssue` or inline mapping function includes `content`, remove that field from the list mapper only
  - [ ] Verify individual-issue GET routes still return `content` (they must — the editor depends on it)

- [ ] Task 4: Verify payload size reduction (AC: #2, #3)
  - [ ] Start the API: `cd api && pnpm build && DATABASE_URL=... E2E_TEST=1 node dist/index.js`
  - [ ] Authenticate and capture the issues list size:
    ```bash
    curl -s -b /tmp/cookies.jar http://127.0.0.1:3000/api/issues | wc -c
    ```
  - [ ] Confirm payload is significantly smaller than baseline 335,325 bytes
  - [ ] Note the new byte count for Story 3.5 after-evidence

- [ ] Task 5: Verify board renders correctly (AC: #3)
  - [ ] Run `pnpm dev` and navigate to the Issues page
  - [ ] Confirm all columns render: title, state, priority, assignee, ticket number
  - [ ] Click into an issue — confirm the editor still loads content (uses separate `/api/documents/:id/content` endpoint)

- [ ] Task 6: Run unit tests (AC: #4)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm only the 6 pre-existing `auth.test.ts` failures remain

## Dev Notes

### Context

The issues list endpoint (`GET /api/issues`) returns **all** documents of `document_type = 'issue'`. The list query currently selects `d.content` — the full TipTap JSON body of every issue's editor content. With 384 issues in the seeded DB and rich editor content per issue, this balloons the response to **335,325 bytes (327 KB)**. The content field is never rendered by the issues board UI; it's only needed when the editor opens (which uses a separate `/api/documents/:id/content` endpoint). Removing it from the list query is a pure server-side change with zero frontend impact.

**The `yjs_state` column** (Yjs binary CRDT data) was also mentioned in the audit but does not appear in the current issues list SELECT — only `d.content` is there. Confirm with grep and leave `yjs_state` alone if it's already absent.

### Exact Implementation

**File: `api/src/routes/issues.ts`** — main list query (around line 124–128):

Change FROM:
```sql
SELECT d.id, d.title, d.properties, d.ticket_number,
       d.content,
       d.created_at, d.updated_at, d.created_by,
       d.started_at, d.completed_at, d.cancelled_at, d.reopened_at,
       d.converted_from_id,
       ...
```

Change TO:
```sql
SELECT d.id, d.title, d.properties, d.ticket_number,
       d.created_at, d.updated_at, d.created_by,
       d.started_at, d.completed_at, d.cancelled_at, d.reopened_at,
       d.converted_from_id,
       ...
```

**Do not touch** the SELECT statements in:
- `GET /:id` (single issue fetch, editor needs content)
- `GET /ticket/:number` (single issue by ticket, editor needs content)
- Any sub-issue fetches that return full document objects

### File Locations

- **Primary file:** `api/src/routes/issues.ts`
- **Change location:** Main list query in `router.get('/', ...)` — only the SELECT columns
- **Audit targets:** `web/src/components/IssuesList.tsx`, `web/src/pages/IssuesPage.tsx`

### Baseline Numbers (for Story 3.5 comparison)

From `gauntlet_docs/baselines.md`:
- Baseline payload: **335,325 bytes (327 KB)** with 384 issues
- Autocannon P97.5: 282 ms at c=50 (our run) / audit P95: 216 ms
- Target: ≤173 ms P95 (≥20% reduction from audit 216 ms baseline)

### Commit Message

```
fix(api): strip content column from issues list query
```

### References

- [Source: gauntlet_docs/ShipShape-fix-plan.md] — FR8 root cause and fix description
- [Source: api/src/routes/issues.ts#L124-L128] — List SELECT clause to modify
- [Source: gauntlet_docs/baselines.md#Cat-3] — Before payload 335,325 bytes

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `api/src/routes/issues.ts` (modified — remove `d.content` from list SELECT only)
