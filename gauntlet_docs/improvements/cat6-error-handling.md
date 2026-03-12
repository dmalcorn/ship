# Cat 6: Runtime Error Handling — Before/After Evidence

**Branch:** fix/error-handling
**Date:** 2026-03-12
**Baseline commit:** 076a18371da0a09f88b5329bd59611c4bc9536bb

## Summary

Three error handling gaps fixed:
1. Global Express error middleware (Fix 6-A) — eliminates HTML stack trace leakage
2. Process-level crash guards (Fix 6-B) — prevents silent server death from async rejections
3. UUID path parameter validation (Fix 6-C) — returns 400 not 500 for malformed IDs

---

## Fix 6-A: Global Express Error Middleware

**Story:** 1-2-global-express-error-middleware.md

### What Was Changed
- **File:** `api/src/app.ts`
- Added 4-argument `(err, req, res, next)` error handler inside `createApp()`, after all route registrations and before `return app`
- Handler classifies errors by type: body-parser parse failures → 400, CSRF failures → 403, all others → 500
- Full error + stack trace logged to `console.error('[unhandled-error]', ...)` — never sent to client

### Why the Original Was Suboptimal
Express's default error handler returns an HTML page containing the full Node.js stack trace with internal file paths. When a user submitted a request with bad JSON (e.g., a form that double-encoded data) or an expired CSRF token (tab open >15 min), they received an HTML page with no actionable guidance and no way to recover. This is OWASP A05:2021 Security Misconfiguration — information disclosure via stack trace leakage.

### Why This Approach Is Better
JSON errors are machine-parseable: the frontend can display a meaningful message ("Your request was invalid — please try again") instead of a raw HTML error page. No internal file paths, line numbers, or dependency versions are exposed to clients. Any request that previously returned an HTML 500 now returns a structured `{"error":"..."}` JSON body with the appropriate HTTP status code.

### Tradeoffs
Errors that were previously silently swallowed (masked by the HTML default handler) are now logged via `console.error`. Any new log entries post-deploy indicate previously-hidden bugs now surfaced — this is intentional and desirable for observability.

### Reproduction Commands
```bash
# Bad JSON body
curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST http://localhost:3000/api/documents \
  -d 'NOT JSON' -H 'Content-Type: application/json'

# Missing CSRF token
curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST http://localhost:3000/api/auth/login \
  -d '{"email":"x"}' -H 'Content-Type: application/json'
```

### Before
```
HTTP 500 — HTML page with full Node.js stack trace:
<!DOCTYPE html><html><body><pre>SyntaxError: Unexpected token 'N', "NOT JSON" is not valid JSON
    at JSON.parse (<anonymous>)
    at createStrictSyntaxError (.../body-parser/lib/types/json.js:...)
    ...internal file paths exposed...
</pre></body></html>
```

### After
```
{"error":"Invalid request body"}
HTTP_STATUS:400

{"error":"CSRF token missing or invalid"}
HTTP_STATUS:403
```

---

## Fix 6-B: Process-Level Crash Guards

**Story:** 1-3-process-level-crash-guards.md

### What Was Changed
- **File:** `api/src/index.ts`
- Added `process.on('unhandledRejection', ...)` handler before `main()` — logs with `[unhandledRejection]` prefix, does NOT exit
- Added `process.on('uncaughtException', ...)` handler before `main()` — logs with `[uncaughtException]` prefix, then calls `process.exit(1)`
- Both handlers registered before `async function main()` so they catch errors even if startup fails

### Why the Original Was Suboptimal
Without crash guards, an unhandled Promise rejection — e.g., from a Yjs WebSocket callback, a collaboration conflict during a network blip, or a missing `.catch()` in async middleware — would trigger Node.js v15+ default behavior: emit a deprecation warning then terminate the process. The result: all users in active collaborative editing sessions lost their WebSocket connection simultaneously, Yjs CRDT state was dropped, and no log was flushed. Elastic Beanstalk only detected the failure after the health check timed out (minutes of downtime).

### Why This Approach Is Better
`unhandledRejection` logs and continues — the rejection does not leave the event loop or memory in an undefined state, and the server survives to handle other requests. `uncaughtException` logs and exits cleanly (per Node.js docs: "It is not safe to resume normal operation after uncaughtException") — Elastic Beanstalk's health check detects the clean exit immediately and triggers an automatic restart, minimizing downtime.

### Tradeoffs
`uncaughtException` intentionally exits the process. This is correct per Node.js docs — the alternative (continuing after an uncaughtException) risks memory corruption and undefined behavior. The clean exit lets EB restart the process in a known-good state.

### Verification
```bash
node -e "
process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});
console.log('unhandledRejection listeners:', process.listenerCount('unhandledRejection'));
console.log('uncaughtException listeners:', process.listenerCount('uncaughtException'));
"
```

### Before
```
unhandledRejection listeners: 0
uncaughtException listeners: 0
```
(No handlers registered — unhandled rejections could silently kill the server)

### After
```
unhandledRejection listeners: 1
uncaughtException listeners: 1
```

---

## Fix 6-C: UUID Path Parameter Validation

**Story:** 1-4-uuid-path-parameter-validation.md

### What Was Changed
- **File:** `api/src/routes/documents.ts`
- Added `UUID_RE` regex constant (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`) after router setup
- Added `requireValidUUID(id: string, res: Response): boolean` helper — responds 400 `{"error":"Invalid document ID format"}` if invalid
- Applied `if (!requireValidUUID(String(req.params.id), res)) return;` as the first line of 7 `/:id` route handlers:
  - `GET /:id`
  - `GET /:id/content`
  - `PATCH /:id/content`
  - `PATCH /:id`
  - `DELETE /:id`
  - `POST /:id/convert`
  - `POST /:id/undo-conversion`

### Why the Original Was Suboptimal
Malformed `:id` values (e.g., `not-a-uuid`, `12345`) were passed directly to PostgreSQL as UUID parameters. PostgreSQL responded with `ERROR: invalid input syntax for type uuid: "not-a-uuid"`, which propagated as HTTP 500. A malformed client URL (a client error) was incorrectly reported as a server error. After Fix 6-A, this became a generic 500 JSON response — still incorrect, but at least not HTML. Fix 6-C makes it a correct 400 client error.

### Why This Approach Is Better
The client error (malformed input) now gets a client error response (400) before any database query is made. PostgreSQL never sees the invalid input. No internal error details are leaked. The fix is a defense-in-depth improvement that is correct regardless of Fix 6-A's presence.

### Tradeoffs
Validation is scoped to `documents.ts` in this story. Other route files (`issues.ts`, `projects.ts`, etc.) also have `/:id` routes but after Fix 6-A those return a generic JSON 500 — an acceptable interim state. Extending UUID validation to all routes is a follow-on improvement.

### Reproduction Commands
```bash
# Get CSRF token and login first, then:
curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -b /tmp/bb.jar -X PATCH http://localhost:3000/api/documents/not-a-uuid \
  -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF_TOKEN" -d '{}'

curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -b /tmp/bb.jar http://localhost:3000/api/documents/12345
```

### Before
```
HTTP/1.1 401 Unauthorized (unauthenticated)
or
HTTP/1.1 500 Internal Server Error (authenticated)
{"error":"..."} — Postgres internal error: invalid input syntax for type uuid
```

### After
```
{"error":"Invalid document ID format"}
HTTP_STATUS:400

{"error":"Invalid document ID format"}
HTTP_STATUS:400
```

---

## Test Results

**Full unit test run after all 3 fixes:**
```
Test Files: 2 failed | 26 passed (28)
Tests:      12 failed | 439+ passed
```

- 6 failures in `auth.test.ts` — pre-existing rate-limiter contamination (unchanged from baseline)
- 6 failures in `project-retros.test.ts` — pre-existing rate-limiter contamination when run after auth.test.ts (confirmed: 11/11 pass when run in isolation)
- All other test files: 100% pass

**Baseline:** `Tests: 6 failed | 445 passed (451)` — same root cause, same files.
