# ShipShape Fix Plan

**Date:** 2026-03-10
**Based on:** GFA Week 4 ShipShape requirements + Audit Deliverable (2026-03-09)
**Goal:** Measurable improvement across all 7 categories to meet Phase 2 implementation targets

---

## Summary of Targets

| # | Category | Severity | Improvement Target | Baseline |
|---|---|---|---|---|
| 1 | Type Safety | Low | Eliminate ≥25% of violations (878 → ≤659) | 878 total violations |
| 2 | Bundle Size | **High** | ≥15% total reduction OR ≥20% initial-load reduction via code splitting | 2,073 KB raw / 589 KB gz |
| 3 | API Response Time | **High** | ≥20% P95 reduction on ≥2 endpoints | docs P95=439ms, issues P95=216ms at c=50 |
| 4 | DB Query Efficiency | Medium | ≥20% query count reduction on ≥1 flow OR ≥50% improvement on slowest query | 17 queries on main page load |
| 5 | Test Coverage | Medium | Add 3 meaningful tests for untested paths OR fix 3 flaky tests with root cause | 836/869 pass; 33 failures |
| 6 | Runtime Error Handling | **High** | Fix 3 error handling gaps (≥1 user-facing data loss scenario) | Stack traces leaked; no crash guards |
| 7 | Accessibility | Medium | Fix all Serious violations on 3 most important pages | 2 pages with `color-contrast` failures; missing skip-nav |

---

## Category 1: Type Safety

### Target
Eliminate **≥25% of the 878 total violations** (reduce to ≤659). Every fix must use correct, meaningful types — replacing `any` with `unknown` without narrowing does not count.

### Root Cause
- The API's 304 non-null assertions (`!`) arise because Express `req` is not augmented with the properties middleware attaches (`req.workspaceId`, `req.userId`). The type system cannot see these additions, so every access requires `!`.
- `as any` casts in route files (`projects.ts`, `weeks.ts`) occur at database row destructuring where `pg` returns `any`-typed rows.
- `api/src/utils/yjsConverter.ts` uses structural `any` to bridge untyped Yjs/ProseMirror internals.
- The web package's 210 `as SomeType` assertions are concentrated in component prop casting and event handler typing.

### Fix Steps

#### Fix 1-A: Type Express request augmentation (eliminates ~200+ non-null assertions)
**File:** `api/src/types/express.d.ts` (create) + all route files

Declare a module augmentation so TypeScript knows about middleware-added properties:
```typescript
// api/src/types/express.d.ts
declare global {
  namespace Express {
    interface Request {
      workspaceId: string;
      userId: string;
      workspaceMembership: WorkspaceMembership;
    }
  }
}
```
This makes `req.workspaceId` typed without `!` everywhere. This is a one-file addition that cascades to eliminate the majority of non-null assertions in route handlers.

**Estimated reduction:** ~150–200 non-null assertions in `api/src/routes/`

#### Fix 1-B: Type database row results in top violation-dense files
**Files:** `api/src/routes/projects.ts`, `api/src/routes/weeks.ts`

Define typed row interfaces that match the SQL query shape and cast the `pg` result rows once at the query site using a typed helper instead of scattering `as any` throughout the handler:
```typescript
interface ProjectRow {
  id: string;
  title: string;
  // ...
}
const rows = result.rows as ProjectRow[];  // single cast at boundary
```
This replaces multiple `as any` casts per file with a single typed cast at the DB boundary — a meaningful improvement because the type now reflects the actual data shape.

**Estimated reduction:** ~25–30 `as any` violations across the two files

#### Fix 1-C: Type Yjs converter with `unknown` + narrowing guards
**File:** `api/src/utils/yjsConverter.ts`

Replace structural `any` usages with `unknown` + runtime type guards where the Yjs/ProseMirror types are genuinely unknown, and use the actual library types (`Y.Map`, `Y.Array`, `Y.XmlFragment`) where they are known. This is more work than 1-A/1-B but addresses a file the auditors flagged specifically.

**Estimated reduction:** ~8–10 violations

#### Fix 1-D: Align `web/tsconfig.json` with root strict flags
**File:** `web/tsconfig.json`

The web tsconfig does not extend the root config and lacks the three extra strictness flags present in the root. Add `"extends": "../../tsconfig.json"` or copy the missing strict options (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, etc.) into the web config. Resolve any new errors this surfaces.

**Estimated reduction:** Structural improvement; may surface latent violations to fix

### Measurement
Before/after: re-run the violation-counting script used in the audit. Target: total ≤659 (25% reduction from 878). All existing tests must still pass (`pnpm test` + E2E green).

### Implementation rules
- Each fix in its own commit with message `fix(types): <what changed>`
- No `any` → `unknown` without a narrowing guard — the grader will check
- Run `pnpm type-check` after each step to confirm zero new compiler errors

---

## Category 2: Bundle Size

### Target
**≥20% reduction in initial-load bundle** via code splitting (preferred path, since removing functionality is not allowed). Before/after visualizer output required.

### Root Cause
1. `ReactQueryDevtools` is imported unconditionally in `main.tsx` — ships 516 KB raw / 105 KB gz to every production user with zero runtime value.
2. No `manualChunks` in `vite.config.ts` — stable vendor libraries re-download on every deploy.
3. `emoji-picker-react` (400 KB raw) is not lazy-loaded despite being used in only one context menu.
4. `@tanstack/query-sync-storage-persister` is declared in `package.json` with zero imports — dead dependency.
5. All page components and the TipTap editor are in the monolithic bundle.

### Fix Steps

#### Fix 2-A: Gate ReactQueryDevtools behind `import.meta.env.DEV` (quick win — 105 KB gz saved)
**File:** `web/src/main.tsx`

```typescript
// Before
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
// ...
<ReactQueryDevtools initialIsOpen={false} />

// After
const ReactQueryDevtools = import.meta.env.DEV
  ? (await import('@tanstack/react-query-devtools')).ReactQueryDevtools
  : null;
```
Or simpler: wrap the import with a dynamic `React.lazy` conditional. This alone eliminates ~15% of the gzipped bundle from production.

**Estimated saving:** 105 KB gz (~18% of 589 KB)

#### Fix 2-B: Lazy-load emoji picker
**File:** Wherever `emoji-picker-react` is imported (context menu component)

```typescript
const EmojiPicker = React.lazy(() => import('emoji-picker-react'));
// Wrap usage in <Suspense fallback={null}>
```
The picker is behind a user interaction (opening a context menu), making this a natural lazy-load boundary.

**Estimated saving:** 72 KB gz (~12% of 589 KB)

#### Fix 2-C: Add `manualChunks` for stable vendors
**File:** `web/vite.config.ts`

```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom'],
        'vendor-yjs': ['yjs', 'lib0', 'y-protocols'],
        'vendor-prosemirror': ['prosemirror-view', 'prosemirror-model', 'prosemirror-transform', 'prosemirror-tables'],
        'vendor-tiptap': ['@tiptap/core', '@tiptap/extension-code-block-lowlight'],
      },
    },
  },
}
```
Stable chunks are cached across deploys. This does not reduce total bundle bytes but dramatically improves cache hit rates — the initial-load chunk shrinks by pulling vendors out of `index.js`.

**Estimated initial-load saving:** Moves ~900 KB raw of stable libs out of the initial chunk

#### Fix 2-D: Remove dead dependency
**File:** `web/package.json`

Remove `@tanstack/query-sync-storage-persister`. Verify no imports exist (`grep -r query-sync-storage-persister web/src` should return nothing). This cleans up `package.json` and shrinks the lockfile.

### Measurement
Run `pnpm build` in `web/` before and after each fix with `rollup-plugin-visualizer` active. Record gzip size of `index-*.js` from Vite console. Target: initial-load gzip ≤ 471 KB (20% reduction from 589 KB). The combination of Fix 2-A + 2-B alone (~187 KB gz saved) should exceed the 20% target.

### Implementation rules
- Each fix in its own commit: `fix(bundle): gate devtools behind DEV flag`, etc.
- Do not remove any user-visible functionality
- Verify the app loads correctly after each change with `pnpm build && pnpm preview`

---

## Category 3: API Response Time

### Target
**≥20% P95 reduction on ≥2 endpoints.** Before/after benchmarks under identical conditions (same data volume, same concurrency, same hardware). Document root cause.

### Root Cause
1. `GET /api/documents` returns all 501 documents (249 KB) with no pagination — every page load downloads full document metadata.
2. `GET /api/issues` includes the full `content` column (TipTap JSON) for all 163 issues — only title/status/priority/assignee are displayed in list view. Payload is 152 KB; stripping `content` reduces it to ~15–20 KB.
3. Connection pool contention at c=50 (pool max=10) multiplies latency 2.8× on the documents endpoint.

### Fix Steps

#### Fix 3-A: Strip `content` column from issues list query (highest single-query optimization)
**File:** `api/src/routes/issues.ts` (or wherever the issues list SQL is)

Find the `SELECT *` or equivalent on the issues list query and replace with an explicit column list that excludes `content` and `yjs_state`:
```sql
-- Before
SELECT * FROM documents WHERE document_type = 'issue' ...

-- After
SELECT id, title, status, priority, assignee_id, created_at, updated_at, properties
FROM documents WHERE document_type = 'issue' ...
```
This reduces payload from 152 KB to ~15–20 KB — a 7–8× reduction. At c=50 this directly reduces serialization time and network transfer time, improving P95.

**Expected P95 improvement:** >50% reduction on `GET /api/issues` (from 216 ms to ~80–100 ms at c=50)

#### Fix 3-B: Add `document_type` filter parameter to `GET /api/documents`
**File:** `api/src/routes/documents.ts`

Accept an optional `?type=wiki` query parameter and push the filter into the SQL `WHERE` clause:
```sql
WHERE workspace_id = $1
  AND ($2::text IS NULL OR document_type = $2)
```
The frontend sidebar only needs documents of specific types to build navigation. Callers can filter server-side, reducing the payload dramatically for type-specific queries.

**Expected P95 improvement on filtered calls:** ~60% reduction in payload and proportional latency reduction

#### Fix 3-C: Add pagination to `GET /api/documents`
**File:** `api/src/routes/documents.ts`

Add `limit` / `offset` query parameters with a safe default cap (e.g., `LIMIT 100`):
```sql
SELECT id, title, document_type, ...
FROM documents
WHERE workspace_id = $1
ORDER BY updated_at DESC
LIMIT $2 OFFSET $3
```
Update the frontend sidebar fetch to use `limit=100` initially. This caps the worst-case response size regardless of workspace growth.

**Expected P95 improvement:** >20% reduction at 501 documents (payload drops from 249 KB to ~50 KB for 100-doc page)

### Measurement
Re-run `autocannon` with identical flags: `-d 30 -R 100 -c 50` on same data volume (501 docs, 163 issues). Record P50/P95/P99 before and after. Target: P95 at c=50 drops ≥20% on at least 2 endpoints. Priority endpoints: `GET /api/issues` and `GET /api/documents`.

### Implementation rules
- Each fix in its own commit: `fix(api): exclude content column from issues list`, etc.
- Update any frontend code that depends on `content` being present in list responses
- Verify list views still render correctly after removing `content` from the payload

---

## Category 4: Database Query Efficiency

### Target
**≥20% query count reduction on ≥1 user flow** OR **≥50% improvement on the slowest query**. Provide before/after `EXPLAIN ANALYZE` output.

### Root Cause
1. Every API request executes 2 session queries (SELECT session + UPDATE last_activity), regardless of whether session state changed. The main page load (3 HTTP requests) generates 17 total DB queries, 6 of which are session bookkeeping.
2. `GET /api/search/mentions` uses `ILIKE '%term%'` — confirmed full sequential scan. At current scale (501 rows) this is fast, but it scales O(N) with no index.
3. No `statement_timeout` configured — runaway queries hold connections indefinitely.

### Fix Steps

#### Fix 4-A: Add `pg_trgm` GIN index for ILIKE search (prevents guaranteed future regression)
**File:** new migration `api/src/db/migrations/NNN_add_trgm_search_index.sql`

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY idx_documents_title_trgm
  ON documents USING GIN (title gin_trgm_ops);
```
This converts the full sequential scan on `ILIKE '%term%'` to a GIN index scan. `EXPLAIN ANALYZE` should show plan type change from `Seq Scan` to `Bitmap Index Scan`.

**Expected improvement:** O(1) search at any document count (currently O(N)); at 501 rows the wall time improvement is small but the structural regression is prevented. The `EXPLAIN ANALYZE` output will show the plan change as proof.

#### Fix 4-B: Skip session `UPDATE` when last_activity is recent (reduces query count per request)
**File:** `api/src/middleware/auth.ts` (or wherever session UPDATE runs)

Add a condition: only UPDATE `last_activity` if the current value is older than 30 seconds:
```typescript
const thirtySecondsAgo = new Date(Date.now() - 30_000);
if (session.last_activity < thirtySecondsAgo) {
  await db.query('UPDATE sessions SET last_activity = NOW() WHERE id = $1', [session.id]);
}
```
This halves the per-request DB writes for active users. On the main page load (3 requests in quick succession), this reduces from 6 session UPDATEs to 1–2, bringing the total query count from 17 to ~12–13 (a ~25% reduction).

**Expected improvement:** ≥20% query count reduction on the "Load main page" flow (17 → ≤13)

#### Fix 4-C: Add `statement_timeout` to connection pool
**File:** `api/src/db/client.ts`

```typescript
const pool = new Pool({
  // ... existing config
  statement_timeout: 10_000, // 10 seconds
});
```
This closes a production safety gap. A runaway query no longer holds its connection indefinitely, preventing pool exhaustion under load.

### Measurement
Re-enable `log_statement = 'all'` and count queries per user flow before and after Fix 4-B. Run `EXPLAIN (ANALYZE, BUFFERS)` on the search query before and after Fix 4-A and include both outputs in the improvement documentation. Target: main page flow ≤13 queries (down from 17).

### Implementation rules
- Migration file must follow the `NNN_description.sql` naming convention
- Test that search still returns correct results after adding the trigram index
- The session optimization must not break session timeout behavior (15-min inactivity / 12-hr absolute limits must still work)

---

## Category 5: Test Coverage and Quality

### Target
**Add 3 meaningful tests for previously untested critical paths** (each with a comment explaining the risk it mitigates), OR **fix 3 flaky tests with documented root cause analysis**.

Given that the audit identified 33 failures concentrated in file-attachment and timing-sensitive specs, the recommended path is: **fix 3 flaky tests** (targeted, demonstrable, root cause is known) while also **adding 1–2 new tests** for untested critical paths.

### Root Cause of Failures
- `file-attachments.spec` cluster (13 of 33 failures): file upload/attachment workflows — likely timing issues between upload completion and UI state update, or test environment missing file upload support
- `race-conditions`, `performance`, `data-integrity` specs: timing-sensitive assertions without adequate waits

### Fix Steps

#### Fix 5-A: Fix file-attachments spec flakiness (addresses 13 of 33 failures)
**Files:** `e2e/file-attachments.spec.ts` (and related fixtures)

**Root cause analysis required first:** Read the spec file to identify whether failures are:
- Missing `await` on file upload response
- Race condition between upload POST and the UI polling for attachment state
- Test environment missing multipart form data support

**Fix approach:** Add explicit `waitFor` assertions after upload actions that wait for the uploaded file to appear in the DOM, rather than using fixed timeouts:
```typescript
await page.setInputFiles('input[type="file"]', testFilePath);
// Wait for the specific upload result, not a timer
await expect(page.locator('[data-testid="attachment-list"]')).toContainText(filename);
```
Document: what the test covers, why it was flaky, what the fix ensures.

#### Fix 5-B: Add test for untested critical path — document creation with invalid input
**File:** new test in `e2e/documents.spec.ts` or a new `e2e/error-handling.spec.ts`

```typescript
test('creates document with defaults when empty body is submitted', async ({ page }) => {
  // Risk mitigated: POST /api/documents with empty body returns 200 and creates junk documents.
  // This test ensures the UI does not expose a code path that creates empty documents
  // and that the API's silent-default behavior is not user-accessible without intent.
  // ...
});
```

#### Fix 5-C: Add test for untested critical path — session expiry redirects to login
**File:** `e2e/auth.spec.ts`

```typescript
test('expired session redirects to login page without data loss', async ({ page }) => {
  // Risk mitigated: if session middleware silently fails, users could lose unsaved work
  // or see stale data from another session. This test confirms the redirect behavior.
  // ...
});
```

#### Fix 5-D: Add test for untested critical path — search returns correct results
**File:** `e2e/search.spec.ts`

```typescript
test('mention search finds documents by partial title match', async ({ page }) => {
  // Risk mitigated: the ILIKE search has no index; regressions here could silently
  // return wrong results after a schema change. This test pins the contract.
  // ...
});
```

### Measurement
Before: 836/869 pass (96.2%). After: target ≥859/869 pass (fixing 13+ attachment failures moves to ~99%). Run the full suite with `/e2e-test-runner`. Each new test must fail on a broken implementation and pass on the correct one — include a note explaining how to verify this.

### Implementation rules
- Each fix/new test in its own commit: `test(e2e): fix file-attachment upload race condition`, etc.
- Each test file must include a comment block at the top of each new test explaining the risk it mitigates
- Do not use `test.skip()` — use `test.fixme()` for genuinely unimplemented tests
- `test.fixme()` is required for any stub tests

---

## Category 6: Runtime Error Handling

### Target
**Fix 3 error handling gaps.** At least one must involve a real user-facing data loss or confusion scenario. Each fix requires: reproduction steps, before/after behavior description, and evidence (screenshot or log diff).

### Root Cause
1. `body-parser` (invalid JSON) and `csrf-sync` (missing CSRF token) bypass all route-level `try/catch` and reach Express's default error handler, which returns an HTML page with a full Node.js stack trace — leaking internal file paths and source locations.
2. No `process.on('unhandledRejection')` or `process.on('uncaughtException')` registered. An unhandled async rejection (e.g., from Yjs WebSocket callbacks) silently kills the Elastic Beanstalk instance.
3. No global Express error middleware (`(err, req, res, next)` 4-arg handler) registered after routes.
4. `PATCH /api/documents/not-a-uuid` returns HTTP 500 (PostgreSQL UUID parse error reaches the client).
5. `initializeCAIA().catch((err) => console.warn(...))` swallows OAuth init failures silently.

### Fix Steps

#### Fix 6-A (Critical — information disclosure): Add global Express error middleware
**File:** `api/src/app.ts`

Add a 4-argument error handler after all route registrations:
```typescript
// MUST be registered after all routes and other middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  // Log full error internally
  console.error('[unhandled-error]', err.message, err.stack);

  // Never expose stack traces or internal paths to clients
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});
```
This catches:
- `body-parser` JSON parse errors → returns `{ error: 'Invalid request body' }` with 400
- `csrf-sync` errors → returns `{ error: 'CSRF token missing or invalid' }` with 403
- Any exception escaping route-level `try/catch`

**User-facing impact (data loss / confusion scenario):** Before this fix, any user submitting a request from a client with an expired CSRF token (e.g., after a long tab was left open) receives an HTML page with a stack trace instead of a meaningful error. The user sees a broken page with no guidance, may assume data was saved when it was not, and cannot recover without a manual refresh. After this fix, they receive a clear JSON error that the frontend can display.

**Reproduction:** `curl -X POST http://localhost:3000/api/documents -d 'NOT JSON' -H 'Content-Type: application/json'`
- Before: HTML page with full stack trace, HTTP 500
- After: `{"error":"Invalid request body"}`, HTTP 400

#### Fix 6-B (Critical — server crash): Register process-level crash guards
**File:** `api/src/index.ts`

```typescript
process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection] Unhandled promise rejection:', reason);
  // Log and continue — do not exit. In production, alert via CloudWatch.
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] Uncaught exception:', err.message, err.stack);
  // Flush logs, then exit cleanly — uncaughtException leaves the process in unknown state
  process.exit(1);
});
```
Without this, a single unhandled async rejection in a Yjs WebSocket callback kills the Elastic Beanstalk instance with no log flush and no alert, causing a silent outage.

**User-facing impact:** Every user in an active collaborative editing session loses their WebSocket connection with no reconnection message. Any unsaved Yjs state is lost. The server does not restart until the health check fails and EB replaces the instance (minutes of downtime).

#### Fix 6-C (High): Return 400 instead of 500 for invalid UUID path parameters
**File:** `api/src/routes/documents.ts` (and other route files with `:id` params)

Add a UUID validation helper at the route layer before the DB is touched:
```typescript
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireValidUUID(id: string, res: Response): boolean {
  if (!UUID_RE.test(id)) {
    res.status(400).json({ error: 'Invalid document ID format' });
    return false;
  }
  return true;
}

// In route handler:
router.patch('/:id', async (req, res) => {
  if (!requireValidUUID(req.params.id, res)) return;
  // ... rest of handler
});
```

**Reproduction:** `curl -X PATCH http://localhost:3000/api/documents/not-a-uuid -d '{}'`
- Before: HTTP 500 + PostgreSQL error `invalid input syntax for type uuid` in server logs
- After: HTTP 400 `{"error":"Invalid document ID format"}`

### Measurement
Re-run the 17 malformed-input test cases from the audit methodology. Document before/after HTTP status codes and response bodies for each. At minimum, the three fixes above must show:
- Fix 6-A: non-JSON body → 400 JSON (not HTML with stack trace)
- Fix 6-B: verify handlers registered (inspect process listeners after startup)
- Fix 6-C: invalid UUID → 400 (not 500)

### Implementation rules
- Each fix in its own commit with message `fix(errors): <what changed>`
- The global error handler must be registered after ALL route registrations in `app.ts` (Express requires 4-arg handlers to be last)
- Verify that SQL injection and XSS tests still return safe responses after adding the error handler
- Screenshot or `curl` output required as evidence for each fix

---

## Category 7: Accessibility

### Target
**Fix all Critical/Serious violations on the 3 most important pages** (Issues list, Projects list, Issue detail). Current state: 2 Serious violations (`color-contrast`) on Projects page and Issue detail; 0 violations on Issues list. Provide before/after axe-core scan output.

The audit also found a missing skip-navigation link, which is a WCAG 2.1 criterion 2.4.1 failure — fix this as the third improvement.

### Root Cause
1. **Color contrast failures (15 affected nodes, 2 pages):** CSS variables `--muted` and `--border` produce insufficient contrast when used as foreground on light backgrounds. The `bg-muted/30` pattern (30% opacity) renders near-white, making `text-muted` text on those backgrounds fall below the 4.5:1 WCAG AA minimum.
2. **Missing skip-nav link:** `tabIndex={-1}` exists on `<main>` in `App.tsx` (the skip-link target) but no `<a href="#main-content">` exists anywhere — keyboard users must tab through the entire 4-panel navigation on every page.
3. **Three custom modal dialogs** (`ConversionDialog.tsx`, `BacklogPickerModal.tsx`, `MergeProgramDialog.tsx`) implement `role="dialog"` without Radix's focus trapping — a latent focus management risk not yet caught by automated testing.

### Fix Steps

#### Fix 7-A: Fix color-contrast violations (resolves all 15 affected nodes)
**File:** `web/src/index.css` or the Tailwind theme config (`tailwind.config.ts`)

Identify the CSS variables causing the failure. The audit identified two patterns:
- Issue count badge: `bg-muted/30 text-muted` — the 30% opacity background makes the effective contrast too low
- Inline action button: `bg-border text-muted`

**Fix approach:** Either:
1. Darken the `--muted` foreground token so it meets 4.5:1 against white and near-white backgrounds, OR
2. Replace `bg-muted/30` with a solid color that provides sufficient contrast with `text-muted`

Use a contrast checker tool (e.g., `webaim.org/resources/contrastchecker`) to verify the new values meet 4.5:1 before committing.

**Reproduction:**
- Before: `npx @axe-core/playwright` on `/projects` → 1 serious `color-contrast` violation, 12 affected nodes
- After: same scan → 0 violations

#### Fix 7-B: Add skip-navigation link (WCAG 2.1 criterion 2.4.1)
**File:** `web/src/App.tsx`

Add a visually-hidden skip link as the first focusable element in the page, revealed on focus:
```tsx
{/* Skip navigation link — appears on keyboard focus */}
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded"
>
  Skip to main content
</a>
```
Ensure the `<main>` element has `id="main-content"` (update from `tabIndex={-1}` alone to `id="main-content" tabIndex={-1}`).

**User-facing impact:** Keyboard-only users (common in government/Treasury environments where mouse use is restricted or assistive technology is in use) can skip the 4-panel navigation and jump directly to content.

#### Fix 7-C: Replace hand-rolled dialog with Radix Dialog in `ConversionDialog.tsx`
**File:** `web/src/components/ConversionDialog.tsx`

Replace the custom `role="dialog"` implementation with `@radix-ui/react-dialog` (already a project dependency):
```tsx
import * as Dialog from '@radix-ui/react-dialog';

// Replace custom implementation with:
<Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
  <Dialog.Portal>
    <Dialog.Overlay className="..." />
    <Dialog.Content className="..." aria-describedby={undefined}>
      <Dialog.Title>Convert Document</Dialog.Title>
      {/* ... content */}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```
Radix provides automatic: focus trapping, `Escape` to close, scroll lock, `aria-modal`, and correct focus restoration on close. Prioritize `ConversionDialog.tsx` as it is likely the most user-facing of the three.

### Measurement
Re-run `@axe-core/playwright` on the 3 priority pages (Issues list, Projects list, Issue detail) after each fix. Record before/after violation counts. Run Lighthouse on the same pages. Target: 0 Critical/Serious violations on all 3 pages, and WCAG 2.1 criterion 2.4.1 met (skip link present and functional).

### Implementation rules
- Each fix in its own commit: `fix(a11y): fix color-contrast on muted badge`, etc.
- Verify color changes do not break the visual design (new colors should be within the existing Tailwind palette)
- Test the skip link with keyboard: Tab once from page load should reveal and focus the skip link; Enter should move focus to `#main-content`
- Do not break any passing accessibility E2E spec

---

## Implementation Schedule (4.5-day window)

| Day | Focus | Commits |
|---|---|---|
| Day 1 (AM) | Cat 6: Error handling fixes (6-A, 6-B, 6-C) | 3 commits |
| Day 1 (PM) | Cat 2: Bundle fixes (2-A devtools gate, 2-D dead dep removal) | 2 commits |
| Day 2 (AM) | Cat 3: API fixes (3-A strip content, 3-B type filter) | 2 commits |
| Day 2 (PM) | Cat 4: DB fixes (4-A trgm index, 4-B session optimization, 4-C statement_timeout) | 3 commits |
| Day 3 (AM) | Cat 2: Bundle fixes (2-B emoji lazy, 2-C manualChunks) | 2 commits |
| Day 3 (PM) | Cat 3: API fix (3-C pagination) + measure before/after benchmarks | 1 commit + data |
| Day 4 (AM) | Cat 1: Type safety (1-A express augmentation) | 1 commit |
| Day 4 (PM) | Cat 1: Type safety (1-B route files, 1-C yjsConverter) | 2 commits |
| Day 5 (AM) | Cat 7: Accessibility (7-A contrast, 7-B skip-nav, 7-C dialog) | 3 commits |
| Day 5 (PM) | Cat 5: Tests (5-A fix attachments, 5-B/5-C/5-D new tests) | 4 commits |
| Day 5 (eve) | Full E2E run, measurement capture, documentation | — |

**Rationale for order:** High-severity categories (6, 2, 3) are addressed first while the fix work is lowest-risk. Type safety (Cat 1) is deferred because it touches the most files and has the highest risk of breaking tests. Tests (Cat 5) are last so they can cover the new behavior added in other categories.

---

## Before/After Proof Requirements

For each category, the following evidence must be produced:

| Category | Evidence Required |
|---|---|
| 1 | Re-run violation-counting script; show per-package breakdown before/after |
| 2 | `rollup-plugin-visualizer` output (gzip size) before/after each fix |
| 3 | `autocannon` output at c=50 before/after for the two target endpoints |
| 4 | `EXPLAIN ANALYZE` output before/after for search query; query log count before/after for main page flow |
| 5 | E2E run summary (`test-results/summary.json`) before/after; each new test shown failing on broken implementation |
| 6 | `curl` output showing before (HTML stack trace) and after (JSON error) for each fix |
| 7 | `@axe-core/playwright` violation output before/after for the 3 priority pages |

---

## Risk Register

| Risk | Mitigation |
|---|---|
| Fix 1-A (Express augmentation) breaks route handler types | Run `pnpm type-check` after each file; revert individual route files if needed |
| Fix 3-A (remove content from issues list) breaks frontend | Audit all components that consume the issues list response before committing; grep for `.content` usage on list data |
| Fix 3-C (pagination) breaks sidebar navigation | Add `?limit=500` default to maintain current behavior; migrate frontend incrementally |
| Fix 4-B (session skip-update) breaks timeout logic | Unit test the timeout calculation before/after; verify 15-min inactivity and 12-hr absolute limits still trigger correctly |
| Fix 6-A (global error handler) catches errors that were previously silently swallowed | Monitor server logs for 48h after deploy; any new log entries indicate previously-hidden bugs now surfaced |
| Fix 7-A (color token changes) causes visual regression | Screenshot comparison before/after; check all pages that use `bg-muted` or `text-muted` |
