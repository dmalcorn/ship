---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics", "step-03-create-stories", "step-04-final-validation"]
inputDocuments:
  - "gauntlet_docs/ShipShape-fix-plan.md"
  - "_bmad-output/planning-artifacts/analyst-discovery-report.md"
  - "gauntlet_docs/audit-deliverable.md"
  - "gauntlet_docs/GFA_week_4-shipshape.pdf"
---

# ShipShape Week 4 — Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for the ShipShape Week 4 Gauntlet project, decomposing requirements from the fix plan, analyst discovery report, audit deliverable, and GFA assignment PDF into implementable stories organized by delivery order.

---

## Requirements Inventory

### Functional Requirements

**Cat 6 — Runtime Error Handling (implement first)**

FR1: Add global Express error middleware (4-arg handler) to `api/src/app.ts`, registered after all routes, returning JSON errors — never HTML stack traces
FR2: Register `process.on('unhandledRejection')` and `process.on('uncaughtException')` crash guards in `api/src/index.ts`
FR3: Add UUID validation at the route layer for `/:id` parameters, returning HTTP 400 for invalid UUIDs before any database query

**Cat 2 — Bundle Size**

FR4: Gate `ReactQueryDevtools` behind `import.meta.env.DEV` in `web/src/main.tsx` (never ship to production)
FR5: Lazy-load `emoji-picker-react` using `React.lazy()` with `<Suspense>` in the context menu component
FR6: Add `manualChunks` configuration to `web/vite.config.ts` for stable vendor libraries (react, yjs, prosemirror, tiptap)
FR7: Remove dead dependency `@tanstack/query-sync-storage-persister` from `web/package.json`

**Cat 3 — API Response Time**

FR8: Exclude `content` and `yjs_state` columns from `GET /api/issues` list query
FR9: Add optional `?type=` filter query parameter to `GET /api/documents` endpoint (SQL-level filtering, not client-side)
FR10: Add `limit`/`offset` pagination to `GET /api/documents` with safe default cap (LIMIT 100)
FR11: Update frontend sidebar fetch to use `?limit=100` parameter for the paginated documents endpoint

**Cat 4 — DB Query Efficiency**

FR12: Create migration file adding `pg_trgm` GIN index on `documents.title` for ILIKE search
FR13: Add conditional session UPDATE in auth middleware — skip `UPDATE last_activity` if within 30 seconds of last update
FR14: Add `statement_timeout` (10 seconds) to pg connection pool configuration in `api/src/db/client.ts`

**Cat 1 — Type Safety**

FR15: Create `api/src/types/express.d.ts` with Express Request augmentation for `workspaceId`, `userId`, and `workspaceMembership`
FR16: Define typed row interfaces for database results in `api/src/routes/projects.ts` and `api/src/routes/weeks.ts`
FR17: Replace structural `any` in `api/src/utils/yjsConverter.ts` with `unknown` + narrowing guards and actual library types (`Y.Map`, `Y.Array`, `Y.XmlFragment`)
FR18: Align `web/tsconfig.json` with root strict flags (add `extends` or copy missing strict options; resolve any new errors surfaced)

**Cat 7 — Accessibility**

FR19: Fix color-contrast violations by adjusting `--muted` and `--border` CSS variable values in `web/src/index.css` or `tailwind.config.ts` to meet WCAG AA 4.5:1 minimum
FR20: Add skip-navigation link as first focusable element in `web/src/App.tsx` targeting `#main-content`; add `id="main-content"` to `<main>` element
FR21: Replace hand-rolled `role="dialog"` in `web/src/components/ConversionDialog.tsx` with Radix `<Dialog.Root>` component

**Cat 5 — Test Coverage**

FR22: Fix `file-attachments.spec` flakiness — replace fixed timeouts with explicit `waitFor` assertions after upload actions; document root cause
FR23: Add E2E test for document creation with invalid/empty input with comment explaining risk mitigated
FR24: Add E2E test for session expiry redirect to login page (auth.spec.ts) with comment explaining risk mitigated
FR25: Add E2E test for mention search returning correct results by partial title match (search.spec.ts) with comment explaining risk mitigated

**Submission Deliverables**

FR26: Write Improvement Documentation for all 7 categories covering: before measurement, root cause explanation, fix description, after measurement, proof of reproducibility (curl output + screenshot/recording for Cat 6)
FR27: Write Discovery Write-up documenting 3 new codebase discoveries (file path + line range + what it does + why it matters + how to apply in future)
FR28: Record Demo Video (3–5 min) walking through audit findings and all 7 improvements with before/after measurements and reasoning
FR29: Complete AI Cost Analysis (LLM API costs, total tokens input/output, number of API calls, coding agent costs + all 4 reflection questions from PDF)
FR30: Deploy improved fork's `master` branch to AWS Elastic Beanstalk publicly accessible
FR31: Publish social post on X or LinkedIn about auditing a government codebase with key findings, tag @GauntletAI
FR32: Update README with complete setup guide (clone, prerequisites, configure `.env.local`, run locally, run tests)
FR33: Verify Codebase Orientation Checklist (`gauntlet_docs/ShipShape_codebase_orientation_checklist.md`) is complete and included in submission materials

---

### NonFunctional Requirements

NFR1: Bundle initial-load gzip ≤471 KB (≥20% reduction from 589 KB baseline)
NFR2: API P95 response time ≥20% reduction on ≥2 endpoints at c=50 (target: documents ≤351ms, issues ≤173ms)
NFR3: Main page load DB query count ≤13 (down from 17, ≥20% reduction)
NFR4: Total TypeScript violations ≤659 (down from 878, ≥25% reduction); every fix must use correct meaningful types — `any` → `unknown` without narrowing does NOT count
NFR5: E2E test pass rate ≥99% (target: fix ≥13 attachment failures + add 3 new meaningful tests passing)
NFR6: Zero Critical/Serious axe-core violations on Issues list, Projects list, and Issue detail pages
NFR7: No removal of user-visible functionality to achieve any improvement target (disqualification risk)
NFR8: All existing passing tests must remain passing after each fix, or broken tests must be fixed with documented justification
NFR9: Before/after proof required for every improvement; benchmarks run under identical conditions (same data volume: 501 docs, 163 issues, 35 sprints, 21 users)
NFR10: Each improvement in its own commit with descriptive message format `fix(category): description`; improvements on clearly labeled per-category branches
NFR11: All improvement documentation must cover: what was changed, why original was suboptimal, why approach is better, tradeoffs made
NFR12: Final submission deadline: Sunday, 2026-03-15, 10:59 PM CT (hard deadline)
NFR13: Audit Report (Phase 1, audit-deliverable.md) acts as pass/fail gate — already complete

---

### Additional Requirements

**Evidence Format Per Category (identical measurement conditions required):**
- Cat 1: violation-counting script output (before + after, per package)
- Cat 2: `rollup-plugin-visualizer` gzip sizes (before + after each fix)
- Cat 3: `autocannon -c 50 -d 30 -R 100` P95 numbers (before + after, same dataset: 501 docs/163 issues)
- Cat 4: `EXPLAIN ANALYZE` output for search query (before + after) + query log counts for main page flow
- Cat 5: `test-results/summary.json` (before + after); each new test shown failing on broken implementation
- Cat 6: `curl` output showing JSON error (not HTML stack trace) + screenshot or recording per fix
- Cat 7: `@axe-core/playwright` violation output for 3 pages (before + after)

**Implementation Constraints:**
- No cosmetic changes (renaming variables, reformatting code, updating comments without functional impact do not count)
- Branch per category merged to `master` for deployment; individual category branches kept for reviewer inspection
- Session optimization (FR13) must not break 15-min inactivity or 12-hr absolute session timeout limits
- Frontend code consuming `content` from issues list must be audited before removing column (FR8)
- Pagination (FR10/FR11) default must maintain current behavior — use `?limit=500` fallback if needed during migration

---

### FR Coverage Map

| FR | Epic | Description |
|---|---|---|
| FR1 | Epic 1 | Global Express error middleware |
| FR2 | Epic 1 | Process-level crash guards |
| FR3 | Epic 1 | UUID validation → 400 |
| FR4 | Epic 2 | Gate ReactQueryDevtools behind DEV flag |
| FR5 | Epic 2 | Lazy-load emoji picker |
| FR6 | Epic 2 | manualChunks for stable vendors |
| FR7 | Epic 2 | Remove dead dependency |
| FR8 | Epic 3 | Strip content column from issues list |
| FR9 | Epic 3 | Type filter param on documents endpoint |
| FR10 | Epic 3 | Pagination on documents endpoint |
| FR11 | Epic 3 | Frontend fetch uses limit param |
| FR12 | Epic 4 | pg_trgm GIN index migration |
| FR13 | Epic 4 | Conditional session UPDATE (skip if recent) |
| FR14 | Epic 4 | statement_timeout on connection pool |
| FR15 | Epic 5 | Express Request augmentation |
| FR16 | Epic 5 | Typed DB row interfaces (projects, weeks) |
| FR17 | Epic 5 | yjsConverter unknown + narrowing guards |
| FR18 | Epic 5 | web tsconfig strict alignment |
| FR19 | Epic 6 | Color contrast CSS variable fix |
| FR20 | Epic 6 | Skip-nav link in App.tsx |
| FR21 | Epic 6 | ConversionDialog → Radix Dialog |
| FR22 | Epic 7 | Fix attachment spec flakiness |
| FR23 | Epic 7 | New test: invalid document creation |
| FR24 | Epic 7 | New test: session expiry redirect |
| FR25 | Epic 7 | New test: mention search correctness |
| FR26 | Epics 1–7 | After-evidence + improvement doc (one story per epic) |
| FR27 | Epic 8 | Discovery write-up (3 codebase discoveries) |
| FR28 | Epic 8 | Demo video (3–5 min) |
| FR29 | Epic 8 | AI cost analysis + reflection questions |
| FR30 | Epic 8 | Deploy improved fork to AWS |
| FR31 | Epic 8 | Social post on X or LinkedIn |
| FR32 | Epic 8 | README setup guide |
| FR33 | Epic 8 | Orientation checklist verification |

---

## Epic List

### Epic 1: Crash-Safe & Secure API Responses
Users receive meaningful JSON errors instead of HTML stack traces; the server no longer silently crashes on unhandled async rejections. All 7 category baselines are captured before any code changes begin.
**FRs covered:** FR1, FR2, FR3, FR26 (Cat 6 after-evidence)

### Epic 2: Faster Initial Page Load
Government users on constrained networks experience significantly faster app startup; developer tooling never ships to production.
**FRs covered:** FR4, FR5, FR6, FR7, FR26 (Cat 2 after-evidence)

### Epic 3: Faster API & Scalable Data Fetching
Issue boards load 7–8× faster; document navigation stays fast as the workspace grows; list endpoints are pagination-ready.
**FRs covered:** FR8, FR9, FR10, FR11, FR26 (Cat 3 after-evidence)

### Epic 4: Reliable Database Performance
Search queries stay fast regardless of document count; redundant session writes are eliminated; runaway queries cannot exhaust the connection pool.
**FRs covered:** FR12, FR13, FR14, FR26 (Cat 4 after-evidence)

### Epic 5: Type-Safe, Maintainable Codebase
Developers get compiler-enforced safety on request properties and DB rows; ≥25% violation reduction achieved with correct meaningful types.
**FRs covered:** FR15, FR16, FR17, FR18, FR26 (Cat 1 after-evidence)

### Epic 6: Accessible to All Users
Keyboard-only and screen reader users (common in government environments) can fully navigate the application; WCAG 2.1 AA compliance met on 3 priority pages.
**FRs covered:** FR19, FR20, FR21, FR26 (Cat 7 after-evidence)

### Epic 7: Reliable Test Suite
Attachment flakiness resolved; 3 critical paths covered with meaningful tests; the test suite is a trustworthy regression net across all 7 improvement areas.
**FRs covered:** FR22, FR23, FR24, FR25, FR26 (Cat 5 after-evidence)

### Epic 8: Submission Package
All required Gauntlet deliverables produced and organized; submission qualifies for Austin admission gate by Sunday 2026-03-15 11:59 PM CT.
**FRs covered:** FR27, FR28, FR29, FR30, FR31, FR32, FR33

---

## Epic 1: Crash-Safe & Secure API Responses

Users receive meaningful JSON errors instead of HTML stack traces; the server no longer silently crashes on unhandled async rejections. All 7 category baselines are locked in before any code changes begin.

### Story 1.1: Capture All 7 Category Baselines

As a developer submitting the Gauntlet project,
I want all 7 category before-measurements captured and recorded before any code changes are made,
So that every before/after comparison is valid under identical conditions and cannot be invalidated by measurement order.

**Acceptance Criteria:**

**Given** the codebase is unmodified on the `fix/error-handling` branch
**When** the baseline capture script/commands are run
**Then** the following are recorded in `gauntlet_docs/baselines.md`:
- Cat 1: violation-counting script output (per-package breakdown matching audit-deliverable.md)
- Cat 2: `pnpm build` with `rollup-plugin-visualizer` — gzip size of `index-*.js` recorded
- Cat 3: `autocannon -c 50 -d 30 -R 100` P95 on `/api/documents` and `/api/issues` with 501 docs / 163 issues dataset confirmed via DB query
- Cat 4: query log count for "Load main page" flow (3 HTTP requests); `EXPLAIN ANALYZE` output on ILIKE search query
- Cat 5: `test-results/summary.json` from full E2E run (pass/fail/total counts)
- Cat 6: `curl` output for non-JSON body POST and missing-CSRF POST (showing HTML stack trace response)
- Cat 7: `@axe-core/playwright` violation output for `/issues`, `/projects`, `/documents/:id`

**And** all numbers match the audit-deliverable.md baselines within ±5% for benchmarks, or discrepancies are noted with explanation

---

### Story 1.2: Global Express Error Middleware

As an end user submitting data to the application,
I want server errors to return structured JSON responses,
So that I receive a meaningful error message instead of an HTML page exposing internal server file paths and stack traces.

**Acceptance Criteria:**

**Given** a 4-argument error handler is registered after all routes in `api/src/app.ts`
**When** a POST request is sent with a non-JSON body (`curl -X POST .../api/documents -d 'NOT JSON' -H 'Content-Type: application/json'`)
**Then** the response is HTTP 400 with body `{"error":"Invalid request body"}` — not an HTML page

**And** when a POST is made without a valid CSRF token
**Then** the response is HTTP 403 with body `{"error":"CSRF token missing or invalid"}`

**And** when any uncaught exception escapes route-level try/catch
**Then** the response is HTTP 500 with body `{"error":"Internal server error"}` and the full error + stack is logged internally only

**And** `res.headersSent` is checked before writing the error response to prevent double-response crashes

**And** `pnpm test` passes with no new failures after this change

---

### Story 1.3: Process-Level Crash Guards

As an end user in an active collaborative editing session,
I want the server to survive unhandled async rejections,
So that a single Yjs WebSocket callback failure doesn't silently kill the server and drop all active sessions with no log flush.

**Acceptance Criteria:**

**Given** crash guards are registered in `api/src/index.ts`
**When** an unhandled Promise rejection occurs anywhere in the process
**Then** the error is logged with `[unhandledRejection]` prefix and the process continues running

**And** when an uncaught synchronous exception occurs
**Then** the error is logged with `[uncaughtException]` prefix and `process.exit(1)` is called (allowing Elastic Beanstalk health check to trigger restart)

**And** `process.listenerCount('unhandledRejection')` and `process.listenerCount('uncaughtException')` both return `1` after server startup

**And** `pnpm test` passes with no new failures

---

### Story 1.4: UUID Path Parameter Validation

As an end user or API client,
I want invalid document IDs to return a clear client error,
So that a malformed URL returns HTTP 400 instead of leaking a PostgreSQL internal error via HTTP 500.

**Acceptance Criteria:**

**Given** a UUID validation helper is added to document route handlers, checked before any DB query
**When** `PATCH /api/documents/not-a-uuid` is called
**Then** the response is HTTP 400 with body `{"error":"Invalid document ID format"}`

**And** when a valid UUID is provided
**Then** the request proceeds normally and behavior is unchanged

**And** the PostgreSQL error `invalid input syntax for type uuid` no longer appears in server logs for malformed-ID requests

**And** `pnpm test` passes with no new failures

---

### Story 1.5: Cat 6 After-Evidence & Improvement Documentation

As a Gauntlet submitter,
I want the Cat 6 improvements documented with before/after curl evidence and a screenshot or recording for each fix,
So that graders can reproduce and verify all 3 error handling gaps are resolved and award full credit.

**Acceptance Criteria:**

**Given** Stories 1.2, 1.3, and 1.4 are fully implemented
**When** the improvement documentation is written to `gauntlet_docs/improvements/cat6-error-handling.md`
**Then** it contains for each of the 3 fixes: exact `curl` reproduction command, before HTTP status + response body, after HTTP status + response body, and a screenshot or terminal recording

**And** the document covers for each fix: what was changed, why the original code was suboptimal, why the approach is better, and tradeoffs made

**And** `pnpm test` runs green with no regressions from this epic's changes

---

## Epic 2: Faster Initial Page Load

Government users on constrained networks experience significantly faster app startup; developer tooling never ships to production.

### Story 2.1: Gate ReactQueryDevtools Behind DEV Flag

As a government user on a VPN or CAC workstation,
I want the app to not ship developer debugging tools to production,
So that my initial page load is ~105 KB gzip smaller and parses faster on constrained hardware.

**Acceptance Criteria:**

**Given** the `ReactQueryDevtools` import in `web/src/main.tsx` is wrapped behind `import.meta.env.DEV`
**When** `pnpm build` is run (production build)
**Then** `@tanstack/react-query-devtools` does not appear in the production bundle (verified via visualizer or grep of `dist/`)

**And** when running `pnpm dev` (development mode)
**Then** the devtools panel is still available and functional

**And** `pnpm build && pnpm preview` loads the app correctly with no console errors

---

### Story 2.2: Remove Dead Dependency

As a developer maintaining the project,
I want unused dependencies removed from `package.json`,
So that the lockfile is clean and dependency scanners don't flag a package with zero imports.

**Acceptance Criteria:**

**Given** `@tanstack/query-sync-storage-persister` is removed from `web/package.json`
**When** `grep -r query-sync-storage-persister web/src` is run
**Then** zero results are returned (confirming no imports exist)

**And** `pnpm install` succeeds and `pnpm build` completes without errors

**And** `pnpm test` passes with no new failures

---

### Story 2.3: Lazy-Load Emoji Picker

As a user opening a context menu in the editor,
I want the emoji picker to load only when I open it,
So that its 72 KB gzip cost is not paid on initial page load for users who never use it.

**Acceptance Criteria:**

**Given** `emoji-picker-react` is wrapped in `React.lazy()` with a `<Suspense fallback={null}>` boundary at its usage site
**When** `pnpm build` is run
**Then** the emoji picker is emitted as a separate chunk, not included in `index-*.js`

**And** when a user opens the context menu that contains the emoji picker
**Then** the picker loads and functions correctly with no visual regression

**And** `pnpm build && pnpm preview` loads the app with no console errors

---

### Story 2.4: Add manualChunks for Stable Vendors

As a returning user loading the app after a new deploy,
I want stable vendor libraries served from browser cache,
So that only changed application code is re-downloaded, not unchanged libraries like React and Yjs.

**Acceptance Criteria:**

**Given** `manualChunks` is configured in `web/vite.config.ts` splitting out `vendor-react`, `vendor-yjs`, `vendor-prosemirror`, and `vendor-tiptap`
**When** `pnpm build` is run
**Then** the build produces separate named chunk files for each vendor group (confirmed in Vite console output)

**And** the main `index-*.js` chunk gzip size is reduced compared to baseline (stable libs extracted)

**And** `pnpm build && pnpm preview` loads the app correctly with no missing-chunk errors or console errors

---

### Story 2.5: Cat 2 After-Evidence & Improvement Documentation

As a Gauntlet submitter,
I want the Cat 2 bundle improvements documented with before/after visualizer output,
So that graders can verify the ≥20% initial-load gzip reduction with reproducible evidence.

**Acceptance Criteria:**

**Given** Stories 2.1–2.4 are fully implemented
**When** `pnpm build` is run with `rollup-plugin-visualizer` active
**Then** gzip size of `index-*.js` is ≤471 KB (≥20% reduction from the 589 KB baseline in `gauntlet_docs/baselines.md`)

**And** `gauntlet_docs/improvements/cat2-bundle-size.md` contains: before gzip size, after gzip size, per-fix savings breakdown, visualizer screenshots or output, and reasoning for each of the 4 fixes

**And** the document explains: what was changed, why the original was suboptimal, why the approach is better, and tradeoffs (e.g. Suspense boundary behaviour, chunk count increase vs. cache benefit)

---

## Epic 3: Faster API & Scalable Data Fetching

Issue boards load 7–8× faster; document navigation stays fast as the workspace grows; list endpoints are pagination-ready.

### Story 3.1: Strip Content Column from Issues List

As a user viewing the issues board,
I want the issues list to load with only the fields the UI actually displays,
So that the 152 KB payload drops to ~15–20 KB and the board renders significantly faster under load.

**Acceptance Criteria:**

**Given** all frontend components that consume the issues list have been audited for `.content` usage (grep confirms none read content from list responses)
**When** the issues list SQL query in `api/src/routes/issues.ts` is updated to select only `id, title, status, priority, assignee_id, created_at, updated_at, properties` (excluding `content` and `yjs_state`)
**Then** `GET /api/issues` response payload does not contain `content` or `yjs_state` fields

**And** all issues board UI components (title, status, priority, assignee) render correctly

**And** `pnpm test` passes with no new failures

---

### Story 3.2: Add Document Type Filter Parameter

As a user navigating the sidebar,
I want the documents endpoint to accept a `?type=` filter,
So that the sidebar can fetch only the document types it needs instead of downloading all 501 documents on every page load.

**Acceptance Criteria:**

**Given** `GET /api/documents` accepts an optional `?type=` query parameter
**When** `GET /api/documents?type=wiki` is called
**Then** only documents with `document_type = 'wiki'` are returned

**And** when `GET /api/documents` is called without a `?type=` parameter
**Then** all documents are returned (existing behaviour unchanged)

**And** the filter is applied in the SQL `WHERE` clause using a parameterized query (`$2::text IS NULL OR document_type = $2`) — no string interpolation

**And** `pnpm test` passes with no new failures

---

### Story 3.3: Add Pagination to Documents Endpoint

As a user in a large or growing workspace,
I want the documents endpoint to support pagination,
So that page load time stays bounded as the workspace grows beyond 501 documents.

**Acceptance Criteria:**

**Given** `GET /api/documents` accepts optional `limit` and `offset` query parameters
**When** `GET /api/documents?limit=50&offset=0` is called
**Then** at most 50 documents are returned, ordered by `updated_at DESC`

**And** when no `limit` is provided
**Then** the endpoint defaults to `LIMIT 100`

**And** the SQL uses parameterized `LIMIT $2 OFFSET $3` with no string interpolation

**And** `pnpm test` passes with no new failures

---

### Story 3.4: Update Frontend Sidebar to Use Paginated Endpoint

As a user loading any page,
I want the sidebar to use the paginated documents endpoint,
So that the frontend stops downloading all 501 documents on every navigation event.

**Acceptance Criteria:**

**Given** the frontend sidebar fetch is updated to include a `limit` parameter (`?limit=100` or `?limit=500` as conservative fallback if needed)
**When** the app loads any page
**Then** the network request to `/api/documents` includes the `limit` parameter

**And** the sidebar renders all expected document types in navigation correctly

**And** no existing sidebar functionality is broken

**And** `pnpm test` passes with no new failures

---

### Story 3.5: Cat 3 After-Evidence & Improvement Documentation

As a Gauntlet submitter,
I want the Cat 3 API improvements documented with before/after autocannon benchmarks run under identical conditions,
So that graders can verify ≥20% P95 reduction on both target endpoints.

**Acceptance Criteria:**

**Given** Stories 3.1–3.4 are fully implemented
**When** `autocannon -c 50 -d 30 -R 100` is run against `/api/documents` and `/api/issues` with the same dataset confirmed (501 docs / 163 issues)
**Then** P95 on `/api/issues` is ≤173 ms (≥20% reduction from 216 ms baseline)

**And** P95 on `/api/documents` is ≤351 ms (≥20% reduction from 439 ms baseline) OR payload size reduction is documented as primary evidence

**And** `gauntlet_docs/improvements/cat3-api-response-time.md` contains: full autocannon output (before from baselines.md, after), payload size before/after for both endpoints, root cause explanation per bottleneck, and reasoning for each of the 4 fixes

---

## Epic 4: Reliable Database Performance

Search queries stay fast regardless of document count; redundant session writes are eliminated; runaway queries cannot exhaust the connection pool.

### Story 4.1: Add pg_trgm GIN Index for ILIKE Search

As a user searching for documents by title,
I want the search query to use an index instead of a full table scan,
So that search stays fast as the workspace grows and a guaranteed O(N) regression is structurally prevented.

**Acceptance Criteria:**

**Given** a new migration file `api/src/db/migrations/NNN_add_trgm_search_index.sql` is created following the `NNN_description.sql` naming convention
**When** `pnpm db:migrate` runs the migration
**Then** the `pg_trgm` extension exists and `idx_documents_title_trgm` GIN index exists on `documents.title` using `gin_trgm_ops`

**And** `EXPLAIN ANALYZE` on `SELECT * FROM documents WHERE title ILIKE '%term%'` shows `Bitmap Index Scan` instead of `Seq Scan`

**And** search results are unchanged — same documents returned for the same query

**And** the migration runs cleanly with no errors and is tracked in `schema_migrations`

---

### Story 4.2: Conditional Session UPDATE

As an active user making rapid sequential API calls,
I want the server to skip redundant session write operations,
So that the main page load drops from 17 DB queries to ≤13 without affecting session timeout behaviour.

**Acceptance Criteria:**

**Given** auth middleware in `api/src/middleware/auth.ts` checks `session.last_activity` before issuing an UPDATE
**When** a request arrives and `session.last_activity` is within the last 30 seconds
**Then** the `UPDATE sessions SET last_activity = NOW()` query is skipped for that request

**And** when `session.last_activity` is older than 30 seconds
**Then** the UPDATE runs normally

**And** the 15-minute inactivity timeout still triggers correctly (a session with no activity for >15 min is still invalidated)

**And** the 12-hour absolute session limit still triggers correctly

**And** `pnpm test` passes with no new failures

---

### Story 4.3: Add statement_timeout to Connection Pool

As a system operator running the application in production,
I want runaway database queries to be automatically terminated,
So that a slow or stuck query cannot hold a connection indefinitely and starve the pool under concurrent load.

**Acceptance Criteria:**

**Given** `statement_timeout: 10_000` (10 seconds) is added to the `Pool` configuration in `api/src/db/client.ts`
**When** the API server starts
**Then** all queries executing through this pool are subject to the 10-second timeout

**And** a query exceeding 10 seconds returns a PostgreSQL timeout error that is caught by the existing route-level try/catch (returns 500 JSON, not a hang)

**And** all normal application queries complete well within the timeout

**And** `pnpm test` passes with no new failures

---

### Story 4.4: Cat 4 After-Evidence & Improvement Documentation

As a Gauntlet submitter,
I want the Cat 4 DB improvements documented with EXPLAIN ANALYZE output and query log counts,
So that graders can verify the structural improvements and ≥20% query count reduction on the main page flow.

**Acceptance Criteria:**

**Given** Stories 4.1–4.3 are fully implemented
**When** query logging is enabled and the "Load main page" flow is executed (3 HTTP requests)
**Then** total DB query count is ≤13 (down from 17 in `gauntlet_docs/baselines.md`)

**And** `EXPLAIN ANALYZE` on the ILIKE search query shows `Bitmap Index Scan` (vs `Seq Scan` in baselines.md)

**And** `gauntlet_docs/improvements/cat4-db-query-efficiency.md` contains: before/after query counts for main page flow, before/after EXPLAIN ANALYZE output for the search query, explanation of why each fix improves efficiency, and the migration filename and contents

---

## Epic 5: Type-Safe, Maintainable Codebase

Developers get compiler-enforced safety on request properties and DB rows; ≥25% violation reduction achieved with correct meaningful types — no superficial substitutions.

### Story 5.1: Express Request Augmentation

As a developer working on API route handlers,
I want `req.workspaceId`, `req.userId`, and `req.workspaceMembership` to be typed on the Express `Request` interface,
So that the ~150–200 non-null assertions scattered across route files are eliminated by the type system rather than suppressed.

**Acceptance Criteria:**

**Given** `api/src/types/express.d.ts` is created with a module augmentation declaring `workspaceId: string`, `userId: string`, and `workspaceMembership: WorkspaceMembership` on `Express.Request`
**When** `pnpm type-check` is run
**Then** zero new compiler errors are introduced

**And** non-null assertions (`!`) on `req.workspaceId`, `req.userId`, and `req.workspaceMembership` in route files are removed

**And** the violation-counting script shows a reduction of ≥150 non-null assertions in `api/src/`

**And** `pnpm test` passes with no new failures

---

### Story 5.2: Typed Database Row Interfaces

As a developer reading route handler code,
I want database query results typed at the query boundary,
So that `as any` casts scattered through `projects.ts` and `weeks.ts` are replaced by a single typed cast at the DB call site.

**Acceptance Criteria:**

**Given** `ProjectRow` and `WeekRow` (or equivalent) interfaces are defined matching the SQL query shape in `api/src/routes/projects.ts` and `api/src/routes/weeks.ts`
**When** `pnpm type-check` is run
**Then** zero new compiler errors are introduced

**And** `as any` casts in those two files are replaced with a single typed `result.rows as ProjectRow[]` cast at the DB boundary — not scattered through handlers

**And** the violation-counting script shows a reduction of ≥25 `as any` violations in `api/src/`

**And** `pnpm test` passes with no new failures

---

### Story 5.3: Type yjsConverter with unknown + Narrowing Guards

As a developer maintaining the Yjs collaboration layer,
I want structural `any` in `yjsConverter.ts` replaced with `unknown` plus runtime type guards and actual Yjs library types,
So that the converter expresses its actual intent rather than silencing the type system with broad casts.

**Acceptance Criteria:**

**Given** `api/src/utils/yjsConverter.ts` is updated to use `Y.Map`, `Y.Array`, `Y.XmlFragment` where Yjs types are known, and `unknown` with narrowing guards where the shape is genuinely unknown
**When** `pnpm type-check` is run
**Then** zero new compiler errors are introduced

**And** no `any` → `unknown` substitution exists without an accompanying type guard or narrowing check

**And** the violation-counting script shows a reduction of ≥8 violations in `yjsConverter.ts`

**And** `pnpm test` passes with no new failures (collaboration functionality unchanged)

---

### Story 5.4: Align web tsconfig with Root Strict Flags

As a developer working on the frontend,
I want the web package's TypeScript config to enforce the same strictness as the root config,
So that type-checking rigor is consistent between frontend and backend and latent violations are surfaced.

**Acceptance Criteria:**

**Given** `web/tsconfig.json` is updated to extend the root config or copy the missing strict flags (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, etc.)
**When** `pnpm type-check` is run across all packages
**Then** zero new compiler errors remain unresolved (any newly surfaced errors are fixed as part of this story)

**And** `pnpm test` passes with no new failures

---

### Story 5.5: Cat 1 After-Evidence & Improvement Documentation

As a Gauntlet submitter,
I want the Cat 1 type safety improvements documented with before/after violation counts using the same counting methodology as the audit,
So that graders can verify the ≥25% reduction and confirm no superficial substitutions were made.

**Acceptance Criteria:**

**Given** Stories 5.1–5.4 are fully implemented
**When** the violation-counting script is re-run
**Then** total violations are ≤659 (down from 878 in `gauntlet_docs/baselines.md`), a ≥25% reduction

**And** `gauntlet_docs/improvements/cat1-type-safety.md` contains: before count per package/violation-type (from baselines.md), after count per package/violation-type, explanation of each fix's approach and why it uses correct meaningful types

**And** the document explicitly confirms no `any` → `unknown` substitution was made without a narrowing guard

**And** `pnpm test` passes green with no regressions

---

## Epic 6: Accessible to All Users

Keyboard-only and screen reader users (common in government environments) can fully navigate the application; WCAG 2.1 AA compliance met on 3 priority pages.

### Story 6.1: Fix Color Contrast Violations

As a user with low vision or working in a high-ambient-light environment,
I want text and badge elements to meet the WCAG 2.1 AA 4.5:1 contrast minimum,
So that issue count badges and inline action buttons are readable without assistive technology.

**Acceptance Criteria:**

**Given** the `--muted` and/or `--border` CSS variable values are adjusted in `web/src/index.css` or `tailwind.config.ts` to meet 4.5:1 contrast ratio (verified with a contrast checker tool before committing)
**When** `@axe-core/playwright` is run on `/projects`
**Then** zero `color-contrast` violations are reported (down from 12 affected nodes at baseline)

**And** when `@axe-core/playwright` is run on `/documents/:id`
**Then** zero `color-contrast` violations are reported (down from 3 affected nodes at baseline)

**And** the updated color values remain within the existing Tailwind palette and are visually reviewed on all pages using `bg-muted` or `text-muted` to confirm no visual regression

**And** `pnpm test` passes with no new failures

---

### Story 6.2: Add Skip-Navigation Link

As a keyboard-only user loading any page,
I want to be able to skip the 4-panel navigation and jump directly to main content,
So that I don't have to Tab through the entire navigation structure on every page load (WCAG 2.1 criterion 2.4.1).

**Acceptance Criteria:**

**Given** a visually-hidden skip link is added as the first focusable element in `web/src/App.tsx` and `<main>` has `id="main-content"` and `tabIndex={-1}`
**When** a keyboard user presses Tab once from page load
**Then** the skip link becomes visible and receives focus

**And** when the user presses Enter on the focused skip link
**Then** focus moves to `#main-content` and the main content area is reachable without tabbing through the navigation

**And** the skip link is invisible to mouse users (uses `sr-only` / `focus:not-sr-only` Tailwind pattern)

**And** `pnpm test` passes with no new failures

---

### Story 6.3: Replace ConversionDialog with Radix Dialog

As a keyboard or screen reader user triggering a document conversion,
I want the conversion dialog to properly trap focus, respond to Escape, and announce itself to assistive technology,
So that I can interact with it without losing navigation context or having focus escape to the background.

**Acceptance Criteria:**

**Given** `web/src/components/ConversionDialog.tsx` is refactored to use `@radix-ui/react-dialog` (already a project dependency)
**When** the dialog is opened
**Then** focus is automatically moved inside the dialog and trapped there (cannot Tab to background elements)

**And** pressing Escape closes the dialog and returns focus to the triggering element

**And** the dialog has a visible `<Dialog.Title>` that screen readers announce on open

**And** `aria-modal="true"` and scroll lock are applied automatically by Radix

**And** all existing dialog functionality (conversion actions, close button) works correctly with no visual regression

**And** `pnpm test` passes with no new failures

---

### Story 6.4: Cat 7 After-Evidence & Improvement Documentation

As a Gauntlet submitter,
I want the Cat 7 accessibility improvements documented with before/after axe-core scan output for all 3 priority pages,
So that graders can verify zero Critical/Serious violations remain and WCAG 2.1 AA compliance is met.

**Acceptance Criteria:**

**Given** Stories 6.1–6.3 are fully implemented
**When** `@axe-core/playwright` is run on `/issues`, `/projects`, and `/documents/:id`
**Then** zero Critical or Serious violations are reported on all 3 pages (down from 2 Serious violations at baseline)

**And** the skip link is manually verified: Tab once → skip link appears and is focused → Enter → focus moves to `#main-content`

**And** `gauntlet_docs/improvements/cat7-accessibility.md` contains: before axe-core output (from baselines.md), after axe-core output for all 3 pages, contrast ratio before/after values for the CSS variable change, explanation of each fix, and Lighthouse accessibility scores for the 3 pages

---

## Epic 7: Reliable Test Suite

Attachment flakiness resolved; 3 new meaningful tests covering critical paths; the suite is a trustworthy regression net across all 7 improvement areas.

### Story 7.0: Fix Pre-existing Test Failures Introduced by Infrastructure Fixes

As a developer maintaining a trustworthy test suite,
I want two test failures caused by our own infrastructure fixes resolved before Cat 5 work begins,
So that the baseline failure count is accurate and Cat 5 improvements are measured against a clean starting state.

**Background:** Discovered during baseline capture on 2026-03-12. Two failures are not pre-existing product bugs — they are breakage we introduced:

1. **`auth.test.ts` rate-limiter contamination (6 unit test failures):** The Express rate-limiter middleware shares state across tests in `auth.test.ts`. Tests that run after a rate-limit-triggering test inherit a polluted limiter and receive 429 instead of the expected 200/401. Fix: reset or isolate the rate-limiter between tests (e.g. via `beforeEach` or test-scoped middleware instance).

2. **`session-timeout.spec` `returnTo` security test (1 E2E failure):** The test at `e2e/session-timeout.spec.ts` asserts `expect(url).toContain("localhost")` but the IPv4 fix in `isolated-env.ts` changed server binding to `127.0.0.1`. The assertion is now wrong — not the behavior. Fix: update assertion to `expect(url).toMatch(/localhost|127\.0\.0\.1/)`.

**Acceptance Criteria:**

**Given** the rate-limiter contamination root cause is confirmed (verified by running `auth.test.ts` in isolation vs. as part of full suite)
**When** rate-limiter state is isolated between tests
**Then** all 6 previously failing auth tests pass in the full unit test run

**And** `Test Files: 0 failed | 28 passed (28)` in vitest output

**Given** the `returnTo` test failure is caused by `127.0.0.1` vs `localhost` assertion mismatch
**When** the assertion is updated to accept either
**Then** `session-timeout.spec` `returnTo` test passes in E2E run

**And** the fix is a one-line assertion change — no behavior is altered

---

### Story 7.1: Fix File-Attachments Spec Flakiness

As a developer running the E2E suite,
I want the file-attachments spec to pass consistently,
So that 13 false failures are eliminated and the suite accurately reflects the actual state of the attachment feature.

**Acceptance Criteria:**

**Given** the root cause of flakiness in `e2e/file-attachments.spec.ts` is identified (stale `AbortSignal` captured in `useMemo` in `Editor.tsx` — signal already aborted when slash command fires, causing `triggerFileUpload` to exit before appending input to DOM)
**When** fixed by (1) changing static `abortSignal` to `getAbortSignal` getter in `Editor.tsx`, (2) calling getter at execution time in `SlashCommands.tsx`, (3) removing early abort guard + adding `document.body.appendChild` + `setTimeout(50)` in `FileAttachment.tsx`, (4) switching tests from `waitForEvent('filechooser')` to `waitFor({ state: 'attached' }) + setInputFiles()`
**Then** the file-attachments spec passes — confirmed: `13 passed (3.6m)`, 0 retries ✅

**And** a comment block in each fixed test documents: what the test covers, why it was flaky, and what the fix ensures

**And** `test-results/summary.json` shows ≥13 fewer failures than the baseline in `gauntlet_docs/baselines.md`

---

### Story 7.2: New Test — Document Creation with Invalid Input

As a developer guarding against silent data corruption,
I want an E2E test that verifies the app does not create junk documents from empty or malformed input,
So that regressions in input validation are caught before reaching production.

**Acceptance Criteria:**

**Given** a new test is added to `e2e/documents.spec.ts` or `e2e/error-handling.spec.ts`
**When** the test attempts document creation through the UI with an empty or invalid payload
**Then** either the UI prevents submission (validation) or the API returns an appropriate error — the test asserts whichever is the correct post-Epic-1 behaviour

**And** the test includes the comment: `// Risk mitigated: POST /api/documents with empty body previously returned 200 and created junk documents. This test ensures the UI does not expose a path to create empty documents inadvertently.`

**And** the test fails if document creation validation is removed (verified by temporarily breaking the behavior)

**And** `pnpm test` passes with the new test green

---

### Story 7.3: New Test — Session Expiry Redirect

As a developer guarding against silent data loss on session timeout,
I want an E2E test that verifies expired sessions redirect to login cleanly,
So that users are never silently stuck in a broken state where they believe data was saved but the session was invalid.

**Acceptance Criteria:**

**Given** a new test is added to `e2e/auth.spec.ts`
**When** the test simulates an expired session (clears the session cookie mid-session) and attempts a protected action
**Then** the app redirects to the login page

**And** the test includes the comment: `// Risk mitigated: if session middleware silently fails, users could lose unsaved work or see stale data from another session. This test confirms the redirect behaviour on session expiry.`

**And** the test fails if the session expiry redirect is removed

**And** `pnpm test` passes with the new test green

---

### Story 7.4: New Test — Mention Search Returns Correct Results

As a developer guarding against search regressions,
I want an E2E test that verifies mention search finds documents by partial title match,
So that a schema change or index removal cannot silently break search without the suite catching it.

**Acceptance Criteria:**

**Given** a new test is added to `e2e/search.spec.ts`
**When** the test searches for a known partial title string using the mention search
**Then** the expected document appears in results

**And** the test includes the comment: `// Risk mitigated: ILIKE search had no index at baseline; regressions here could silently return wrong results after a schema change. This test pins the search contract.`

**And** the test fails if the search endpoint is broken or returns empty results for a valid query

**And** `pnpm test` passes with the new test green

---

### Story 7.5: Cat 5 After-Evidence & Improvement Documentation

As a Gauntlet submitter,
I want the Cat 5 test improvements documented with before/after summary output and root cause analysis,
So that graders can verify the pass rate improvement and the quality of the 3 new meaningful tests.

**Acceptance Criteria:**

**Given** Stories 7.1–7.4 are fully implemented
**When** the full E2E suite is run via `/e2e-test-runner`
**Then** `test-results/summary.json` shows ≥99% pass rate (≥13 fewer failures than baseline plus 3 new tests passing)

**And** `gauntlet_docs/improvements/cat5-test-coverage.md` contains: before summary.json (from baselines.md), after summary.json, root cause analysis of the attachment flakiness, description of each new test and the risk it mitigates, and confirmation each new test fails on a broken implementation

---

## Epic 8: Submission Package

All required Gauntlet deliverables produced and organized; submission qualifies for Austin admission gate by Sunday 2026-03-15 11:59 PM CT.

### Story 8.1: Write Discovery Write-Up

As a Gauntlet submitter,
I want 3 codebase discoveries documented with file references, explanations, and future application notes,
So that graders can assess depth of codebase comprehension beyond the 7 improvement categories.

**Acceptance Criteria:**

**Given** 3 genuinely new discoveries are identified from the codebase (TypeScript features, architectural patterns, libraries, design decisions, or engineering practices new to the author)
**When** the write-up is saved to `gauntlet_docs/discovery-writeup.md`
**Then** each discovery includes: name, file path + line range where it was found, what it does and why it matters, and how the author would apply it in a future project

**And** discoveries are distinct from the 7 fix categories (e.g. Yjs CRDT architecture, unified document model tradeoffs, Terraform deployment setup)

---

### Story 8.2: Update README Setup Guide

As a new developer or reviewer evaluating the fork,
I want a complete setup guide in the repository README,
So that anyone can clone, configure, and run the application locally without guessing at missing steps.

**Acceptance Criteria:**

**Given** the README is updated (or `README.md` created if missing)
**When** a developer follows the guide on a fresh machine
**Then** they can successfully: clone the repo, install prerequisites (Node, pnpm, PostgreSQL), configure `.env.local`, run `pnpm dev`, and run `pnpm test`

**And** the guide documents any steps that were NOT in the original README (discovered during orientation)

**And** the deployed application URL is included

---

### Story 8.3: Verify Codebase Orientation Checklist

As a Gauntlet submitter,
I want the Codebase Orientation Checklist confirmed complete and included in submission materials,
So that the orientation notes (required submission deliverable per the PDF) are not omitted.

**Acceptance Criteria:**

**Given** `gauntlet_docs/ShipShape_codebase_orientation_checklist.md` exists
**When** all 8 sections of the checklist (Repository Overview, Data Model, Request Flow, Real-time Collaboration, TypeScript Patterns, Testing Infrastructure, Build and Deploy, Architecture Assessment) are reviewed
**Then** each section has answers filled in (not blank placeholders)

**And** the file is committed to the repo and accessible to graders

---

### Story 8.4: Deploy Improved Fork to AWS

As a Gauntlet submitter,
I want the improved fork deployed and publicly accessible,
So that graders can verify the live application works end-to-end with all 7 improvements applied.

**Acceptance Criteria:**

**Given** all 7 code epics (Epics 1–7) are merged to `master` on the fork
**When** `./scripts/deploy.sh prod` and `./scripts/deploy-frontend.sh prod` are run
**Then** the application is accessible at the public URL and the health check endpoint returns 200

**And** the deployed application URL is documented in the README and in `gauntlet_docs/submission.md`

**And** all 7 improvement branches are pushed to the fork's GitHub repo with their original branch names preserved for reviewer inspection

---

### Story 8.5: Record Demo Video

As a Gauntlet submitter,
I want a 3–5 minute demo video walking through audit findings and all 7 improvements,
So that graders can see the before/after evidence presented with reasoning in a single artifact.

**Acceptance Criteria:**

**Given** all 7 code epics are complete and improvement docs exist
**When** the video is recorded (screen recording with narration)
**Then** it covers: audit methodology overview, each of the 7 categories with before/after measurements shown on screen, reasoning for each fix approach

**And** the video is 3–5 minutes (not shorter, not significantly longer)

**And** the video link or file is included in the submission

---

### Story 8.6: Complete AI Cost Analysis

As a Gauntlet submitter,
I want the AI cost analysis completed with all 4 reflection questions answered,
So that the required deliverable is present and demonstrates honest reflection on AI tool use.

**Acceptance Criteria:**

**Given** AI tool usage has been tracked throughout the project
**When** the analysis is written to `gauntlet_docs/ai-cost-analysis.md`
**Then** it includes: LLM API costs, total tokens (input/output breakdown), number of API calls, coding agent costs (Claude Code, Cursor, Copilot, etc.)

**And** all 4 reflection questions are answered: (1) which parts were AI most/least helpful for, (2) did AI help understand the codebase or shortcut understanding, (3) where did you override AI suggestions and why, (4) what percentage of final code changes were AI-generated vs. hand-written

---

### Story 8.7: Publish Social Post

As a Gauntlet submitter,
I want a social post published on X or LinkedIn about auditing a government codebase,
So that the required community deliverable is complete and tags @GauntletAI as specified.

**Acceptance Criteria:**

**Given** the project is complete and key findings are known
**When** the post is published on X or LinkedIn
**Then** it covers: what was learned auditing a government codebase, key findings from the audit, tags @GauntletAI

**And** the post URL is saved to `gauntlet_docs/submission.md`
