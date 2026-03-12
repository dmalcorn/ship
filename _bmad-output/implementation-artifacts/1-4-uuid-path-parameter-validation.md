# Story 1.4: UUID Path Parameter Validation

Status: done

## Story

As an end user or API client,
I want invalid document IDs to return a clear client error,
So that a malformed URL returns HTTP 400 instead of leaking a PostgreSQL internal error via HTTP 500.

## Acceptance Criteria

1. **Given** a UUID validation helper is present in `api/src/routes/documents.ts` and checked before any DB query
   **When** `PATCH /api/documents/not-a-uuid` is called (authenticated)
   **Then** the response is HTTP 400 with body `{"error":"Invalid document ID format"}`

2. **Given** UUID validation is applied
   **When** a valid UUID is provided (e.g., `PATCH /api/documents/550e8400-e29b-41d4-a716-446655440000`)
   **Then** the request proceeds normally and behavior is unchanged

3. **Given** UUID validation is applied
   **When** any request with a malformed `:id` parameter hits any of the `/:id` routes in `documents.ts`
   **Then** the PostgreSQL error `invalid input syntax for type uuid` no longer appears in server logs for that request

4. **Given** the changes are applied
   **When** `pnpm test` is run
   **Then** all tests pass with no new failures

## Tasks / Subtasks

- [ ] Task 1: Add UUID validation helper to `api/src/routes/documents.ts` (AC: #1, #2, #3)
  - [ ] Add UUID regex constant near the top of the file (after imports):
    ```typescript
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    ```
  - [ ] Add a `requireValidUUID` helper function that checks the ID and sends 400 if invalid:
    ```typescript
    function requireValidUUID(id: string, res: Response): boolean {
      if (!UUID_RE.test(id)) {
        res.status(400).json({ error: 'Invalid document ID format' });
        return false;
      }
      return true;
    }
    ```

- [ ] Task 2: Apply validation to all `/:id` routes in `documents.ts` (AC: #1, #3)
  - [ ] `GET /:id` (line ~221) — add `if (!requireValidUUID(req.params.id, res)) return;` as first line of handler body
  - [ ] `GET /:id/content` (line ~373) — add validation
  - [ ] `PATCH /:id/content` (line ~428) — add validation
  - [ ] `PATCH /:id` (line ~594) — add validation
  - [ ] `DELETE /:id` (line ~1102) — add validation
  - [ ] `POST /:id/convert` (line ~1144) — add validation
  - [ ] `POST /:id/undo-conversion` (line ~1346) — add validation

- [ ] Task 3: Verify with curl (AC: #1, #2)
  - [ ] Start API: `cd /workspace/api && pnpm build && E2E_TEST=1 node dist/index.js &`
  - [ ] Authenticate to get session cookie (see Dev Notes)
  - [ ] Test invalid UUID: `curl -s -b /tmp/bb.jar -X PATCH http://127.0.0.1:3000/api/documents/not-a-uuid -H 'Content-Type: application/json' -d '{}'`
    - Expect: HTTP 400, `{"error":"Invalid document ID format"}`
  - [ ] Test another malformed format: `curl -s -b /tmp/bb.jar http://127.0.0.1:3000/api/documents/12345`
    - Expect: HTTP 400, same body
  - [ ] Confirm server logs do NOT contain `invalid input syntax for type uuid` for these requests

- [ ] Task 4: Run unit tests (AC: #4)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm no new failures (baseline: 6 pre-existing failures in auth.test.ts)

## Dev Notes

### Context

Before this fix, `PATCH /api/documents/not-a-uuid` triggers a PostgreSQL query with the malformed string as a UUID parameter. PostgreSQL responds with:
```
ERROR: invalid input syntax for type uuid: "not-a-uuid"
```
This error propagates to the client as HTTP 500 (or, after Story 1-2 is merged, as a generic `{"error":"Internal server error"}`). Either way, the correct HTTP status for a malformed client request is 400, not 500.

**Note:** Story 1-2 (global error middleware) should ideally be merged before or alongside this story. UUID validation prevents the PostgreSQL error entirely — it is a defense-in-depth fix that is correct regardless of Story 1-2's status.

### UUID Regex

```typescript
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

This matches UUID v1–v5 in standard hyphenated format. It does **not** accept:
- UUIDs without hyphens (`550e8400e29b41d4a716446655440000`)
- Uppercase only (the `i` flag makes it case-insensitive, so both work)
- Random strings like `not-a-uuid` or `12345`

### Routes to Patch in `api/src/routes/documents.ts`

All routes with `:id` in `documents.ts` (current line numbers from grep):

| Line | Method + Path |
|------|--------------|
| ~221 | `GET /:id` |
| ~373 | `GET /:id/content` |
| ~428 | `PATCH /:id/content` |
| ~594 | `PATCH /:id` |
| ~1102 | `DELETE /:id` |
| ~1144 | `POST /:id/convert` |
| ~1346 | `POST /:id/undo-conversion` |

**Pattern for each handler:**
```typescript
router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  if (!requireValidUUID(req.params.id, res)) return;   // ← ADD THIS LINE FIRST
  // ... existing handler body unchanged
});
```

### Scope Decision: documents.ts Only

Limit this story to `documents.ts`. Other route files (`issues.ts`, `projects.ts`, etc.) also have `/:id` routes but:
1. The Gauntlet audit specifically tested `PATCH /api/documents/not-a-uuid`
2. After Story 1-2's global error handler is in place, other routes will return a generic 500 (not an HTML stack trace) — an acceptable interim state
3. Adding validation to all route files risks inadvertently breaking other routes outside the story's scope

If time permits, the pattern can be extended to `issues.ts` as a bonus — but it is not required for this story's acceptance criteria.

### Auth Setup for curl Testing

```bash
# Get CSRF token
CSRF_TOKEN=$(curl -s -c /tmp/bb.jar http://127.0.0.1:3000/api/csrf-token | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')

# Login
curl -s -b /tmp/bb.jar -c /tmp/bb.jar -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"email":"dev@ship.local","password":"admin123"}'

# Test UUID validation (authenticated)
curl -s -b /tmp/bb.jar -X PATCH http://127.0.0.1:3000/api/documents/not-a-uuid \
  -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{}'
```

### Evidence Required (for Story 1-5)

Save the curl output from Task 3 — it becomes the "after" evidence in `gauntlet_docs/improvements/cat6-error-handling.md`.

The "before" evidence is in `gauntlet_docs/baselines.md` Cat 6 section (unauthenticated UUID test returned 401; authenticated test returns 500 with Postgres error).

### Commit Message

```
fix(errors): return HTTP 400 for invalid UUID path parameters in documents routes
```

### References

- [Source: gauntlet_docs/ShipShape-fix-plan.md#Fix-6-C] — Root cause + fix approach
- [Source: api/src/routes/documents.ts] — All /:id route locations (grep lines ~221, 373, 428, 594, 1102, 1144, 1346)
- [Source: gauntlet_docs/baselines.md] — Cat 6 baseline (UUID test result)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (Amelia - Dev Agent)

### Debug Log References

- TypeScript build failed: `req.params.id` is `string | string[] | undefined` in Express types; fixed all 7 call sites to use `String(req.params.id)` cast

### Completion Notes List

- Added `UUID_RE` constant and `requireValidUUID()` helper after router setup in `documents.ts`
- Applied `if (!requireValidUUID(String(req.params.id), res)) return;` to all 7 `/:id` handlers
- Verified: PATCH .../not-a-uuid → HTTP 400 `{"error":"Invalid document ID format"}`
- Verified: GET .../12345 → HTTP 400 `{"error":"Invalid document ID format"}`
- Tests: no new failures

### File List

- `api/src/routes/documents.ts` (modified — UUID_RE constant, requireValidUUID helper, validation in 7 route handlers)
