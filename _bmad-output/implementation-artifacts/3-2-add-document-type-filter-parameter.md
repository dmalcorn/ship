# Story 3.2: Add Document Type Filter Parameter

Status: done

## Story

As a user navigating the sidebar,
I want the documents endpoint to filter by document type at the SQL level,
So that the sidebar can fetch only the document types it needs instead of downloading all 547 documents on every page load.

## Acceptance Criteria

1. **Given** `GET /api/documents` accepts an optional `?type=` query parameter
   **When** `GET /api/documents?type=wiki` is called
   **Then** only documents with `document_type = 'wiki'` are returned (no issues, projects, etc.)

2. **Given** the `?type=` parameter is absent
   **When** `GET /api/documents` is called without a type parameter
   **Then** all accessible documents are returned (existing behaviour unchanged)

3. **Given** the implementation is complete
   **When** the SQL is reviewed
   **Then** the filter uses a parameterized query — no string interpolation — and the filter is applied in the `WHERE` clause, not in application code after the full result is fetched

4. **Given** the changes are applied
   **When** `pnpm test` is run
   **Then** all tests pass with no new failures

## Tasks / Subtasks

- [x] Task 1: Verify current state of type filter in documents route (AC: #1, #3)
  - [x] Read `api/src/routes/documents.ts` `GET /` handler (the list endpoint, around line 104)
  - [x] Confirm `?type=` filter exists and is applied using parameterized SQL (`$N` placeholder, no string interpolation)
  - [x] If already correct: document it as-is and note in commit that filter was already parameterized — story verified
  - [x] If filter uses string interpolation or client-side filtering: fix it to use `AND document_type = $${params.length + 1}` with `params.push(type)`

- [x] Task 2: Harden with input validation (AC: #1, #3)
  - [x] Check whether the `type` param is validated against the known enum of document types before being passed to SQL
  - [x] If not validated: add a guard that rejects unknown type values with HTTP 400 or silently ignores them
  - [x] Valid values: `'wiki' | 'issue' | 'program' | 'project' | 'sprint' | 'person' | 'weekly_plan' | 'weekly_retro'`
  - [x] This prevents potential SQL injection vector from unvalidated query param (even with parameterized queries, type hygiene is good practice)

- [x] Task 3: Verify frontend already uses the filter (AC: #1)
  - [x] Check `web/src/hooks/useDocumentsQuery.ts` `fetchDocuments()` function
  - [x] Confirm it calls `/api/documents?type=${type}` — if it does, the frontend is already passing the filter
  - [x] Note: `useDocumentsQuery('wiki')` already passes `?type=wiki` (line 29 of useDocumentsQuery.ts)

- [x] Task 4: Smoke test the filter (AC: #1, #2)
  - [x] Start API and authenticate
  - [x] `curl ... http://127.0.0.1:3000/api/documents?type=wiki | jq 'length'` — should return only wiki count
  - [x] `curl ... http://127.0.0.1:3000/api/documents?type=issue | jq 'length'` — should return only issue count
  - [x] `curl ... http://127.0.0.1:3000/api/documents | jq 'length'` — should return all documents
  - [x] Compare type=wiki payload size vs unfiltered — document savings

- [x] Task 5: Run unit tests (AC: #4)
  - [x] `cd /workspace && pnpm test`
  - [x] Confirm only the 6 pre-existing `auth.test.ts` failures remain

## Dev Notes

### Context

**Current state (as of fix/error-handling branch):** The `GET /api/documents` endpoint in `api/src/routes/documents.ts` already has a `?type=` filter implemented (lines ~104–128). The filter uses parameterized SQL: `AND document_type = $${params.length + 1}`. The `useDocumentsQuery` hook in the frontend also already calls `/api/documents?type=${type}`.

**This story's primary value** is therefore: (1) verify the filter is correctly implemented and parameterized, (2) add input validation so unknown type values don't hit the DB, and (3) document this as a deliberate Cat 3 improvement with payload evidence showing filtered response vs full response.

**If the filter is already fully correct**, the story's deliverable is:
- A commit confirming the filter exists and is parameterized (with a test proving it)
- Payload size evidence: filtered vs unfiltered

### Exact Implementation

**If type validation is missing**, add this guard near the top of the `GET /` handler in `api/src/routes/documents.ts`:

```typescript
const VALID_DOC_TYPES = ['wiki', 'issue', 'program', 'project', 'sprint', 'person', 'weekly_plan', 'weekly_retro'] as const;

// Inside GET / handler:
const { type, parent_id } = req.query;
if (type && !VALID_DOC_TYPES.includes(type as typeof VALID_DOC_TYPES[number])) {
  res.status(400).json({ error: 'Invalid document type' });
  return;
}
```

**If the filter pattern needs updating** to always-parameterized form:

Current (conditional append):
```typescript
if (type) {
  query += ` AND document_type = $${params.length + 1}`;
  params.push(type as string);
}
```

This is already correct — keep it. The `$N` placeholder is parameterized, no string interpolation.

### File Locations

- **Primary file:** `api/src/routes/documents.ts`
- **Change location:** `router.get('/', ...)` handler — type filter area (around line 104–128)
- **Frontend reference:** `web/src/hooks/useDocumentsQuery.ts` line 29 — already uses `?type=`

### Payload Evidence to Capture

Run these after implementation and record in Story 3.5:
```bash
# Unfiltered (all 547 docs)
curl -s -b cookies.jar http://127.0.0.1:3000/api/documents | wc -c

# Wiki only (typically ~50-80 docs out of 547)
curl -s -b cookies.jar "http://127.0.0.1:3000/api/documents?type=wiki" | wc -c
```

### Commit Message

```
fix(api): validate type param and confirm SQL-level filtering on documents endpoint
```

### References

- [Source: gauntlet_docs/ShipShape-fix-plan.md] — FR9 root cause and fix description
- [Source: api/src/routes/documents.ts#L104-L128] — Existing GET / handler with type filter
- [Source: web/src/hooks/useDocumentsQuery.ts#L29] — Frontend already uses ?type= filter

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Confirmed existing filter used parameterized SQL: `AND document_type = $${params.length + 1}` at line 126
- Type validation guard was absent — added `VALID_DOC_TYPES` check returning HTTP 400 for unknown types
- Frontend `fetchDocuments` already used `?type=${type}` — confirmed at line 29 of `useDocumentsQuery.ts`
- Tests: 445 passed, 6 failed (all pre-existing `auth.test.ts` rate-limit failures)

### Completion Notes List

- Filter was already correctly parameterized — no SQL change needed
- Added `VALID_DOC_TYPES` const and guard check at top of `GET /` handler in `documents.ts`
- Unknown type values now return `400 { error: 'Invalid document type' }`

### File List

- `api/src/routes/documents.ts` (modified — added type validation guard; parameterized filter confirmed)
