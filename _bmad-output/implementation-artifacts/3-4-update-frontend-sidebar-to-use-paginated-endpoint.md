# Story 3.4: Update Frontend Sidebar to Use Paginated Endpoint

Status: ready-for-dev

## Story

As a user loading any page,
I want the sidebar to use the paginated documents endpoint,
So that the frontend stops downloading all 547 documents on every navigation event.

## Acceptance Criteria

1. **Given** the `fetchDocuments` function in `web/src/hooks/useDocumentsQuery.ts` is updated to include a `limit` parameter
   **When** the app loads any page with a documents sidebar
   **Then** the network request to `/api/documents` includes `?limit=500` (or `?limit=100`) in the URL

2. **Given** the limit parameter is added
   **When** the wiki/documents sidebar renders
   **Then** all document types used in navigation render correctly (titles, tree structure, position ordering)

3. **Given** the sidebar uses the paginated endpoint
   **When** existing sidebar interactions are performed (create, rename, delete, reorder)
   **Then** no existing sidebar functionality is broken

4. **Given** the changes are applied
   **When** `pnpm test` is run
   **Then** all tests pass with no new failures

## Tasks / Subtasks

- [ ] Task 1: Update `fetchDocuments` to include `limit` parameter (AC: #1)
  - [ ] Open `web/src/hooks/useDocumentsQuery.ts`
  - [ ] Find the `fetchDocuments` function (around line 28–36):
    ```typescript
    async function fetchDocuments(type: string = 'wiki'): Promise<WikiDocument[]> {
      const res = await apiGet(`/api/documents?type=${type}`);
      ...
    }
    ```
  - [ ] Add `&limit=500` to the URL as a conservative fallback:
    ```typescript
    const res = await apiGet(`/api/documents?type=${type}&limit=500`);
    ```
  - [ ] **Decision note:** Use `500` (not `100`) because the workspace currently has 547 documents total, but any single type (e.g., `wiki`) is far fewer. With the `?type=` filter already in place, `?limit=100` would be fine for most types. Use `500` as a safe ceiling if you want to be extra conservative. If workspace growth is expected, `100` is better and more impactful. Choose based on risk tolerance — document the choice in the commit message.

- [ ] Task 2: Verify network request in browser dev tools (AC: #1)
  - [ ] Run `pnpm dev`
  - [ ] Open browser dev tools → Network tab → filter for `api/documents`
  - [ ] Navigate to any page with a sidebar
  - [ ] Confirm request URL includes `?type=wiki&limit=500` (or whichever limit was chosen)

- [ ] Task 3: Verify sidebar renders correctly (AC: #2, #3)
  - [ ] Navigate to the wiki/documents section
  - [ ] Confirm document tree renders with correct titles and nesting
  - [ ] Create a new document — confirm it appears in the sidebar
  - [ ] Rename a document — confirm sidebar updates
  - [ ] Delete a document — confirm it disappears from sidebar

- [ ] Task 4: Check for other `fetchDocuments` call sites that need updating (AC: #1)
  - [ ] Run: `grep -rn "api/documents" web/src --include="*.ts" --include="*.tsx" | grep -v "api/documents/"`
  - [ ] For each hit, check whether it should also include the `limit` param
  - [ ] `CommandPalette.tsx` line ~153: `apiGet('/api/documents')` — this fetches for search/command palette. Consider adding `?limit=200` here too (or leave as-is if it's an infrequent operation)
  - [ ] Do NOT add `limit` to single-document fetches (`/api/documents/:id`, `/api/documents/:id/content`, etc.)

- [ ] Task 5: Run unit tests (AC: #4)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm only the 6 pre-existing `auth.test.ts` failures remain

## Dev Notes

### Context

`useDocumentsQuery.ts` is the central hook for fetching the sidebar documents list. It calls `fetchDocuments(type)` which builds the URL `/api/documents?type=${type}`. After Story 3.3 adds `LIMIT` support to the backend, this story wires up the frontend to pass a `limit` param.

**Why `limit=500` as the conservative choice:** The workspace has 547 total documents but they are distributed across 8 document types. Any single `?type=wiki` call might return 50–80 documents. Using `limit=500` ensures no documents are silently truncated while still providing the server-side cap against unbounded growth. Using `limit=100` is the more impactful choice if wiki count is expected to stay below 100.

**The `?type=` filter is already in place** from Story 3.2 / existing code — this story only adds `&limit=N`.

**`CommandPalette.tsx`** has its own `apiGet('/api/documents')` call (around line 153) for the command palette search. This is an infrequent user-triggered call, so adding a limit is lower priority, but worth considering.

### Exact Implementation

**File: `web/src/hooks/useDocumentsQuery.ts`** — `fetchDocuments` function (line 28–36):

Change FROM:
```typescript
async function fetchDocuments(type: string = 'wiki'): Promise<WikiDocument[]> {
  const res = await apiGet(`/api/documents?type=${type}`);
  if (!res.ok) {
    const error = new Error('Failed to fetch documents') as Error & { status: number };
    error.status = res.status;
    throw error;
  }
  return res.json();
}
```

Change TO:
```typescript
async function fetchDocuments(type: string = 'wiki'): Promise<WikiDocument[]> {
  const res = await apiGet(`/api/documents?type=${type}&limit=500`);
  if (!res.ok) {
    const error = new Error('Failed to fetch documents') as Error & { status: number };
    error.status = res.status;
    throw error;
  }
  return res.json();
}
```

That's the entire change. One line, one URL update.

**Optionally (lower priority):** also update `CommandPalette.tsx` line ~153:
```typescript
// Before
const res = await apiGet('/api/documents');
// After
const res = await apiGet('/api/documents?limit=200');
```

### File Locations

- **Primary file:** `web/src/hooks/useDocumentsQuery.ts`
- **Change location:** `fetchDocuments` function, line 29 — the `apiGet` URL
- **Secondary (optional):** `web/src/components/CommandPalette.tsx` line ~153

### Commit Message

```
fix(web): pass limit=500 to documents endpoint in sidebar fetch
```

### References

- [Source: gauntlet_docs/ShipShape-fix-plan.md] — FR11 root cause and fix description
- [Source: web/src/hooks/useDocumentsQuery.ts#L28-L36] — fetchDocuments function
- [Source: web/src/components/CommandPalette.tsx#L153] — Secondary call site

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `web/src/hooks/useDocumentsQuery.ts` (modified — add `&limit=500` to fetchDocuments URL)
- `web/src/components/CommandPalette.tsx` (optionally modified — add `?limit=200` to documents fetch)
