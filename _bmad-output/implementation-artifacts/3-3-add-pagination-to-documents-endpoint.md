# Story 3.3: Add Pagination to Documents Endpoint

Status: done

## Story

As a user in a large or growing workspace,
I want the documents endpoint to support pagination,
So that page load time stays bounded as the workspace grows beyond 547 documents.

## Acceptance Criteria

1. **Given** `GET /api/documents` accepts optional `limit` and `offset` query parameters
   **When** `GET /api/documents?limit=50&offset=0` is called
   **Then** at most 50 documents are returned

2. **Given** no `limit` parameter is provided
   **When** `GET /api/documents` is called without a limit
   **Then** the endpoint defaults to `LIMIT 100` (not unlimited)

3. **Given** a `limit` and `offset` are provided
   **When** `GET /api/documents?limit=50&offset=50` is called
   **Then** the next page of 50 documents is returned (second page), ordered consistently by `position ASC, created_at DESC`

4. **Given** the implementation is complete
   **When** the SQL is reviewed
   **Then** `LIMIT` and `OFFSET` use parameterized placeholders (`$N`) — no string interpolation

5. **Given** the changes are applied
   **When** `pnpm test` is run
   **Then** all tests pass with no new failures

## Tasks / Subtasks

- [x] Task 1: Add `limit` and `offset` extraction to the GET / handler (AC: #1, #2, #4)
  - [x] Open `api/src/routes/documents.ts` at the `GET /` handler (around line 104)
  - [x] After `const { type, parent_id } = req.query;`, add extraction:
    ```typescript
    const limitRaw = parseInt(req.query.limit as string, 10);
    const offsetRaw = parseInt(req.query.offset as string, 10);
    const limit = isNaN(limitRaw) || limitRaw < 1 ? 100 : Math.min(limitRaw, 500);
    const offset = isNaN(offsetRaw) || offsetRaw < 0 ? 0 : offsetRaw;
    ```
  - [x] Cap at 500 max to prevent memory abuse (`Math.min(limitRaw, 500)`)
  - [x] Default to 100 when param is absent or invalid

- [x] Task 2: Append LIMIT/OFFSET to the query (AC: #1, #2, #3, #4)
  - [x] After `query += \` ORDER BY position ASC, created_at DESC\``;`, append:
    ```typescript
    params.push(limit);
    query += ` LIMIT $${params.length}`;
    params.push(offset);
    query += ` OFFSET $${params.length}`;
    ```
  - [x] Confirm both use `$N` parameterized placeholders — no template literal interpolation of user values

- [x] Task 3: Verify behaviour with and without params (AC: #1, #2, #3)
  - [x] Start API and authenticate
  - [x] Test default (no params): `curl ... /api/documents | jq 'length'` → ≤100
  - [x] Test with limit: `curl ... "/api/documents?limit=10" | jq 'length'` → exactly 10 (if ≥10 docs exist)
  - [x] Test second page: `curl ... "/api/documents?limit=10&offset=10" | jq '.[0].id'` → different from page 1 first id
  - [x] Test with type + limit: `curl ... "/api/documents?type=wiki&limit=20" | jq 'length'` → ≤20

- [x] Task 4: Verify ordering is stable (AC: #3)
  - [x] Compare `?limit=10&offset=0` last result id against `?limit=10&offset=10` first result id — must differ
  - [x] Confirm ORDER BY clause is `position ASC, created_at DESC` (stable for pagination)

- [x] Task 5: Run unit tests (AC: #5)
  - [x] `cd /workspace && pnpm test`
  - [x] Confirm only the 6 pre-existing `auth.test.ts` failures remain

## Dev Notes

### Context

The `GET /api/documents` endpoint currently returns all accessible documents for a workspace with no upper bound. With 547 documents in the seeded DB (and growing), every sidebar load downloads the full 284,928-byte (278 KB) payload. Adding a `LIMIT 100` default immediately caps this at roughly 20% of the current payload.

**Important:** The frontend sidebar currently fetches all documents (Story 3.4 updates it to pass `?limit=500` as a conservative fallback). This story only changes the server; Story 3.4 wires up the frontend.

**The cap strategy:** Default 100, max 500. Using 500 as max lets the frontend Story 3.4 use `?limit=500` as a safe conservative fallback that loads all current documents (547 > 500 means some may be truncated — Story 3.4 author should decide: use `?limit=500` for safety or `?limit=100` for the optimized case).

### Exact Implementation

**File: `api/src/routes/documents.ts`** — inside `router.get('/', ...)`:

```typescript
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { type, parent_id } = req.query;

    // NEW: Parse pagination params
    const limitRaw = parseInt(req.query.limit as string, 10);
    const offsetRaw = parseInt(req.query.offset as string, 10);
    const limit = isNaN(limitRaw) || limitRaw < 1 ? 100 : Math.min(limitRaw, 500);
    const offset = isNaN(offsetRaw) || offsetRaw < 0 ? 0 : offsetRaw;

    // ... existing userId, workspaceId, isAdmin setup ...

    let query = `
      SELECT id, workspace_id, document_type, title, parent_id, position,
             ticket_number, properties,
             created_at, updated_at, created_by, visibility
      FROM documents
      WHERE ...
    `;
    const params: (string | boolean | null | number)[] = [workspaceId, userId, isAdmin];

    // ... existing type and parent_id filter appends ...

    query += ` ORDER BY position ASC, created_at DESC`;

    // NEW: Append pagination
    params.push(limit);
    query += ` LIMIT $${params.length}`;
    params.push(offset);
    query += ` OFFSET $${params.length}`;

    const result = await pool.query(query, params);
    // ... rest unchanged ...
  }
});
```

**Note:** The `params` array type may need updating from `(string | boolean | null)[]` to include `number` to accommodate the integer limit/offset values.

### File Locations

- **Primary file:** `api/src/routes/documents.ts`
- **Change location:** `router.get('/', ...)` handler — after ORDER BY, before `pool.query`
- **Related story:** Story 3.4 wires the frontend to pass `?limit=` — implement 3.3 first

### Commit Message

```
fix(api): add limit/offset pagination to GET /api/documents (default LIMIT 100)
```

### References

- [Source: gauntlet_docs/ShipShape-fix-plan.md] — FR10 root cause and fix description
- [Source: api/src/routes/documents.ts#L103-L164] — Full GET / handler to modify
- [Source: gauntlet_docs/baselines.md#Cat-3] — Before payload 284,928 bytes / P97.5 374 ms

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Pagination added in same edit as Story 3.2 type-validation guard (both in `documents.ts` `GET /` handler)
- `params` array type updated from `(string | boolean | null)[]` to `(string | boolean | null | number)[]`
- LIMIT/OFFSET appended after ORDER BY using `$N` parameterized placeholders
- Tests: 445 passed, 6 failed (all pre-existing `auth.test.ts` rate-limit failures)

### Completion Notes List

- Default limit: 100; max cap: 500; invalid/absent values fall back to defaults
- `ORDER BY position ASC, created_at DESC` retained for stable pagination
- Both LIMIT and OFFSET use parameterized `$N` — no string interpolation

### File List

- `api/src/routes/documents.ts` (modified — added limit/offset pagination with default LIMIT 100)
