# Story 1.5: Cat 6 After-Evidence & Improvement Documentation

Status: done

## Story

As a Gauntlet submitter,
I want the Cat 6 improvements documented with before/after curl evidence for each fix,
So that graders can reproduce and verify all 3 error handling gaps are resolved and award full credit.

## Acceptance Criteria

1. **Given** Stories 1.2, 1.3, and 1.4 are all fully implemented and their changes are on the `fix/error-handling` branch
   **When** the improvement documentation is written to `gauntlet_docs/improvements/cat6-error-handling.md`
   **Then** it contains for each of the 3 fixes:
   - Exact `curl` reproduction command
   - Before: HTTP status code + response body (from `gauntlet_docs/baselines.md`)
   - After: HTTP status code + response body (captured fresh after implementation)
   - What was changed and in which file(s)
   - Why the original code was suboptimal
   - Why the chosen approach is better
   - Any tradeoffs made

2. **Given** the after-evidence is being captured
   **When** the 3 curl commands are run against the updated API
   **Then**:
   - Fix 6-A (bad JSON body): HTTP 400 `{"error":"Invalid request body"}` — not HTML
   - Fix 6-B (crash guards): `process.listenerCount('unhandledRejection') === 1` and `process.listenerCount('uncaughtException') === 1`
   - Fix 6-C (invalid UUID): HTTP 400 `{"error":"Invalid document ID format"}` — not HTTP 500

3. **Given** the full `fix/error-handling` branch
   **When** `pnpm test` is run
   **Then** all tests pass with no regressions from this epic's changes

4. **Given** the improvement document is complete
   **When** it is committed
   **Then** `gauntlet_docs/improvements/cat6-error-handling.md` exists in the repository and `gauntlet_docs/baselines.md` is also committed (if not already)

## Tasks / Subtasks

- [ ] Task 1: Verify prerequisites — all 3 implementation stories are done (AC: #1)
  - [ ] Confirm Story 1-2 changes are committed on `fix/error-handling` branch: `git log --oneline | grep 'fix(errors).*middleware'`
  - [ ] Confirm Story 1-3 changes are committed: `git log --oneline | grep 'fix(errors).*crash'`
  - [ ] Confirm Story 1-4 changes are committed: `git log --oneline | grep 'fix(errors).*UUID'`

- [ ] Task 2: Build and start the updated API for after-evidence capture (AC: #2)
  - [ ] `cd /workspace/api && pnpm build`
  - [ ] `E2E_TEST=1 node dist/index.js &`
  - [ ] `sleep 3 && curl -s http://127.0.0.1:3000/health` — confirm running

- [ ] Task 3: Capture after-evidence for Fix 6-A — Global error middleware (AC: #2)
  - [ ] Get CSRF token: `CSRF_TOKEN=$(curl -s -c /tmp/bb.jar http://127.0.0.1:3000/api/csrf-token | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')`
  - [ ] Test bad JSON body: `curl -sv -X POST http://127.0.0.1:3000/api/documents -d 'NOT JSON' -H 'Content-Type: application/json' 2>&1 | grep -E 'HTTP|^\{|< '`
    - Expected: `HTTP/1.1 400` and `{"error":"Invalid request body"}`
  - [ ] Test missing CSRF: `curl -sv -X POST http://127.0.0.1:3000/api/auth/login -d '{"email":"x"}' -H 'Content-Type: application/json' 2>&1 | grep -E 'HTTP|^\{'`
    - Expected: `HTTP/1.1 403` and `{"error":"CSRF token missing or invalid"}`
  - [ ] Save both outputs verbatim

- [ ] Task 4: Capture after-evidence for Fix 6-B — Crash guards (AC: #2)
  - [ ] Run listener count check:
    ```bash
    node -e "
    const { createApp } = await import('./dist/app.js');
    console.log('unhandledRejection:', process.listenerCount('unhandledRejection'));
    console.log('uncaughtException:', process.listenerCount('uncaughtException'));
    process.exit(0);
    " 2>/dev/null
    ```
    Or simply check the running process via the startup log (crash guards log `Crash guards registered` on startup per Story 1-3 implementation)
  - [ ] Save listener count output

- [ ] Task 5: Capture after-evidence for Fix 6-C — UUID validation (AC: #2)
  - [ ] Authenticate: login with `dev@ship.local` / `admin123` using CSRF token from Task 3
  - [ ] Test invalid UUID (authenticated): `curl -sv -b /tmp/bb.jar -X PATCH http://127.0.0.1:3000/api/documents/not-a-uuid -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF_TOKEN" -d '{}' 2>&1 | grep -E 'HTTP|^\{'`
    - Expected: `HTTP/1.1 400` and `{"error":"Invalid document ID format"}`
  - [ ] Test another malformed ID: `curl -sv -b /tmp/bb.jar http://127.0.0.1:3000/api/documents/12345 2>&1 | grep -E 'HTTP|^\{'`
    - Expected: `HTTP/1.1 400` and `{"error":"Invalid document ID format"}`
  - [ ] Save both outputs verbatim

- [ ] Task 6: Run full unit tests to confirm no regressions (AC: #3)
  - [ ] Kill API server: `kill %1` (or pkill node)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm pass count ≥ baseline (445 passed; 6 pre-existing failures in auth.test.ts are acceptable)

- [ ] Task 7: Write `gauntlet_docs/improvements/cat6-error-handling.md` (AC: #1, #2)
  - [ ] Create `gauntlet_docs/improvements/` directory if it doesn't exist
  - [ ] Write the document following the structure in Dev Notes below
  - [ ] Include verbatim curl output from Tasks 3, 4, 5 as code blocks
  - [ ] Cross-reference each fix to its story number and file changed

- [ ] Task 8: Commit evidence files (AC: #4)
  - [ ] Stage and commit `gauntlet_docs/improvements/cat6-error-handling.md`
  - [ ] If `gauntlet_docs/baselines.md` is not yet committed, commit it now
  - [ ] Commit message: `docs(evidence): add Cat 6 before/after error handling evidence`

## Dev Notes

### Prerequisites

**This story cannot start until stories 1-2, 1-3, and 1-4 are committed.** Check git log before beginning.

### Before Evidence Location

The before evidence was captured in Story 1-1 and recorded in `gauntlet_docs/baselines.md` — Cat 6 section. Key before numbers:
- **Fix 6-A before:** HTML stack trace returned for bad JSON body (confirmed via curl in Story 1-1, Task 8)
- **Fix 6-B before:** No crash guard listeners (`process.listenerCount('unhandledRejection') === 0`)
- **Fix 6-C before:** HTTP 401 for unauthenticated UUID request; HTTP 500 with Postgres error for authenticated UUID request

### Document Structure for `cat6-error-handling.md`

```markdown
# Cat 6: Runtime Error Handling — Before/After Evidence

**Branch:** fix/error-handling
**Date:** [today]
**Baseline commit:** 076a18371da0a09f88b5329bd59611c4bc9536bb

## Summary

Three error handling gaps fixed:
1. Global Express error middleware (Fix 6-A) — eliminates HTML stack trace leakage
2. Process-level crash guards (Fix 6-B) — prevents silent server death from async rejections
3. UUID path parameter validation (Fix 6-C) — returns 400 not 500 for malformed IDs

## Fix 6-A: Global Express Error Middleware

### What Was Changed
- **File:** `api/src/app.ts`
- Added 4-argument `(err, req, res, next)` error handler inside `createApp()`, after all route registrations

### Why the Original Was Suboptimal
[explain: Express default error handler returns HTML with full stack trace]

### Why This Approach Is Better
[explain: JSON errors are machine-parseable; no internal paths exposed; frontend can display meaningful message]

### Tradeoffs
[explain: errors that were previously silently swallowed are now logged — any new log entries post-deploy indicate previously-hidden bugs now surfaced (good)]

### Reproduction Command
\`\`\`bash
curl -sv -X POST http://localhost:3000/api/documents \
  -d 'NOT JSON' -H 'Content-Type: application/json'
\`\`\`

### Before
HTTP 500 — HTML page with full Node.js stack trace (from baselines.md)

### After
\`\`\`
HTTP/1.1 400 Bad Request
{"error":"Invalid request body"}
\`\`\`

---

## Fix 6-B: Process-Level Crash Guards

### What Was Changed
- **File:** `api/src/index.ts`
- Added `process.on('unhandledRejection', ...)` and `process.on('uncaughtException', ...)` handlers before `main()`

### Why the Original Was Suboptimal
[explain: unhandled promise rejections (e.g., Yjs WebSocket) silently killed the process with no log flush]

### Why This Approach Is Better
[explain: unhandledRejection logs and continues; uncaughtException logs and exits cleanly for EB health check restart]

### Tradeoffs
[explain: uncaughtException exits the process — this is intentional and correct per Node.js docs; alternative of continuing after uncaughtException risks memory corruption]

### Verification
\`\`\`bash
# After server startup:
node -e "console.log(process.listenerCount('unhandledRejection'), process.listenerCount('uncaughtException'))"
# Expected: 1 1
\`\`\`

### Before
\`\`\`
unhandledRejection listeners: 0
uncaughtException listeners: 0
\`\`\`

### After
\`\`\`
unhandledRejection listeners: 1
uncaughtException listeners: 1
\`\`\`

---

## Fix 6-C: UUID Path Parameter Validation

### What Was Changed
- **File:** `api/src/routes/documents.ts`
- Added `UUID_RE` regex constant and `requireValidUUID()` helper
- Applied validation to 7 `/:id` route handlers

### Why the Original Was Suboptimal
[explain: malformed UUIDs reached PostgreSQL, which returned an internal error that propagated as HTTP 500]

### Why This Approach Is Better
[explain: client error (malformed input) gets a client error response (400); Postgres never sees the invalid input; no internal error details leak]

### Tradeoffs
[explain: validation is only applied to documents.ts in this story; other route files (issues, projects) still rely on the global error handler for the interim]

### Reproduction Command
\`\`\`bash
# Authenticate first, then:
curl -sv -b /tmp/bb.jar -X PATCH http://localhost:3000/api/documents/not-a-uuid \
  -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{}'
\`\`\`

### Before
\`\`\`
HTTP/1.1 500 Internal Server Error
{"error":"..."} (Postgres internal error text)
\`\`\`

### After
\`\`\`
HTTP/1.1 400 Bad Request
{"error":"Invalid document ID format"}
\`\`\`
```

### Commit Message

```
docs(evidence): add Cat 6 before/after error handling evidence
```

### References

- [Source: gauntlet_docs/ShipShape-fix-plan.md#Category-6] — Evidence requirements
- [Source: gauntlet_docs/baselines.md] — Before measurements (Cat 6 section)
- [Source: CLAUDE.md#Evidence-Requirements] — Per-category proof format
- [Source: Story 1-2] `1-2-global-express-error-middleware.md`
- [Source: Story 1-3] `1-3-process-level-crash-guards.md`
- [Source: Story 1-4] `1-4-uuid-path-parameter-validation.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (Amelia - Dev Agent)

### Debug Log References

- DB was wiped by unit test run; reseeded before evidence capture
- Old API server (pre-changes) was running; killed, rebuilt, restarted

### Completion Notes List

- Built and started updated API (node dist/index.js)
- Captured all 3 after-evidence results confirming fixes
- Written to gauntlet_docs/improvements/cat6-error-handling.md
- All 3 commits verified in git log

### File List

- `gauntlet_docs/improvements/cat6-error-handling.md` (created)
- `gauntlet_docs/baselines.md` (committed if not already)
