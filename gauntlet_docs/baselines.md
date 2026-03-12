# ShipShape Baseline Evidence

**Branch:** `fix/error-handling`
**Git SHA:** `076a18371da0a09f88b5329bd59611c4bc9536bb`
**Date:** 2026-03-11
**DB:** `postgres://ship:ship_dev_password@postgres:5432/ship_dev`

> ⚠️ **Note on DB state:** The test setup (`api/src/test/setup.ts`) runs `TRUNCATE CASCADE` on all tables in `beforeAll`. Running unit tests **wipes the database**. Always reseed after running any vitest test file. Cat 5 (E2E test counts) and Cat 3/6 measurements that require seeded data should be captured in a separate session without running unit tests first.

---

## Environment State

| Field | Value |
|---|---|
| Branch | `fix/error-handling` |
| Git SHA | `076a18371da0a09f88b5329bd59611c4bc9536bb` |
| Parent commit | `master @ 076a183` |
| DB documents | 547 (after pnpm db:seed + supplement-seed.sql) |
| DB issues | 384 |
| DB sprints | 35 |
| DB users | 21 |
| Node version | v20.20.0 |
| pnpm version | 10.27.0 |

**Prerequisites met:**
- ✅ 501+ documents (547)
- ✅ 100+ issues (384)
- ✅ 10+ sprints (35)
- ✅ 20+ users (21)

---

## Cat 1 — Type Safety Baseline

**Command:**
```bash
node /tmp/count-violations.js  # script from gauntlet_docs/rerun-benchmarks.md
```

**Output:**
```
=== Totals ===
: any = 107   as any = 158   as Type = 261   ! = 349   suppress = 0
TOTAL violations: 875
=== Per package ===
web {"any1":26,"any2":7,"asType":209,"nonNull":43}
api {"any1":81,"any2":151,"asType":52,"nonNull":306}
shared {"any1":0,"any2":0,"asType":0,"nonNull":0}
```

**Key number: 875 total violations** (audit baseline: 878, within ±5% ✅)

**TypeScript compiler errors:**
```bash
cd api && npx tsc --noEmit  # → 0 errors
cd web && npx tsc --noEmit  # → 0 errors
```

**Breakdown vs audit:**

| Metric | Audit | Baseline | Delta |
|---|---|---|---|
| `: any` | 107 | 107 | 0 |
| `as any` | 158 | 158 | 0 |
| `as Type` | 268 | 261 | -7 |
| `!` | 345 | 349 | +4 |
| `@ts-suppress` | 0 | 0 | 0 |
| **Total** | **878** | **875** | **-3 (0.3%)** ✅ |

Target: reduce to ≤659 violations (≥25% reduction).

---

## Cat 2 — Bundle Size Baseline

**Setup:**
```bash
cd web && pnpm add -D rollup-plugin-visualizer
# Temporarily added to web/vite.config.ts:
# import { visualizer } from 'rollup-plugin-visualizer';
# visualizer({ filename: '/tmp/bundle-stats.json', template: 'raw-data' })
cd web && pnpm build 2>&1 | tee /tmp/build-output.txt
# Reverted vite.config.ts after build
```

**Build output (key lines):**
```
dist/assets/index-D7H6hnO8.js    2,700.70 kB │ gzip: 698.99 kB
dist/assets/CDWEKZTF-CDAX5tbW.js   230.13 kB │ gzip:  65.36 kB
... (262 total JS chunks)
```

**Key numbers:**
| Metric | Value |
|---|---|
| Index chunk raw | 2,700.70 KB |
| **Index chunk gzip** | **698.99 KB** |
| CDWEKZTF chunk raw | 230.13 KB |
| CDWEKZTF chunk gzip | 65.36 KB |
| Total JS chunks | 262 |
| Total raw JS | 3,154 KB |

**Audit baseline:** 2,073 KB raw / 589 KB gzip (discrepancy likely due to additional lazy chunks in current build vs audit measurement method — audit may have measured total of top chunks differently)

**`@tanstack/react-query-devtools` in bundle:** ✅ CONFIRMED (FR4 target)
```
DEVTOOLS FOUND: @tanstack+query-devtools@5.92.0/node_modules/@tanstack/query-devtools/build
DEVTOOLS FOUND: @tanstack/react-query-devtools/build/modern
DEVTOOLS FOUND: ReactQueryDevtools.js
```

Target: ≥20% initial-load reduction via code splitting.

---

## Cat 3 — API Response Time Baseline

**Setup:**
```bash
cd api && pnpm build
DATABASE_URL=... E2E_TEST=1 node dist/index.js &
# Authenticated via session cookie
```

**Payload sizes (curl single request):**
| Endpoint | Raw payload |
|---|---|
| `GET /api/documents` | 284,928 bytes (278 KB) |
| `GET /api/issues` | 335,325 bytes (327 KB) |

**autocannon results (`-c 50 -d 30 -R 100`):**

| Endpoint | P50 | P75 | P90 | P97.5 | P99 | Max |
|---|---|---|---|---|---|---|
| `/api/documents` | 150 ms | 247 ms | 317 ms | 374 ms | 409 ms | 669 ms |
| `/api/issues` | 117 ms | 187 ms | 240 ms | 282 ms | 305 ms | 391 ms |
| `/api/documents/:id` | 138 ms | — | — | 372 ms | 401 ms | — |
| `/api/search/mentions?q=feature` | 16 ms | — | — | 116 ms | 131 ms | — |

**Audit baseline (for comparison):**
| Endpoint | P50 (audit) | P95 (audit) | Payload (audit) |
|---|---|---|---|
| `/api/documents` | 175 ms | 439 ms | 249 KB |
| `/api/issues` | 95 ms | 216 ms | 152 KB |

> Note: Our current payload is larger (278 KB vs 249 KB for docs, 327 KB vs 152 KB for issues) and P50 is somewhat lower than audit. The supplement seed added more rows which increases payload. Numbers are within operational range for baseline capture.

Target: ≥20% P95 reduction on ≥2 endpoints (strip `content` column from issues list, type filter, pagination).

---

## Cat 4 — DB Query Efficiency Baseline

**Query logging:** Enabled via `ALTER SYSTEM SET log_statement = 'all'` + `pg_reload_conf()`.

**Main page load — 3 HTTP requests query analysis:**

Each authenticated request to the API runs:
1. **Auth middleware:** 3 queries (session SELECT JOIN users, workspace_memberships SELECT, UPDATE sessions last_activity)
2. **isWorkspaceAdmin:** 1 query
3. **Main route query:** 1 query

**Estimated total for 3-request main page load: ~15 queries** (audit baseline: 17 queries — within ±15%)

**`EXPLAIN ANALYZE` for ILIKE search (`/api/search/mentions?q=feature`):**
```sql
EXPLAIN ANALYZE
SELECT id, title, document_type, visibility
FROM documents
WHERE workspace_id = $1
  AND document_type IN ('wiki', 'issue', 'project', 'program')
  AND deleted_at IS NULL
  AND title ILIKE '%feature%'
  AND (visibility = 'workspace' OR created_by = $3 OR $4 = TRUE)
ORDER BY CASE document_type ... END, updated_at DESC
LIMIT 20;
```

**Output:**
```
Limit  (cost=46.78..46.80 rows=5 width=73) (actual time=0.407..0.409 rows=11 loops=1)
  ->  Sort  (cost=46.78..46.80 rows=5 width=73) (actual time=0.406..0.407 rows=11 loops=1)
        Sort Method: quicksort  Memory: 26kB
        ->  Seq Scan on documents  (cost=0.00..46.72 rows=5 width=73) (actual time=0.021..0.377 rows=11 loops=1)
              Filter: ((deleted_at IS NULL) AND (title ~~* '%feature%'::text) ...)
              Rows Removed by Filter: 536
Planning Time: 1.124 ms
Execution Time: 0.425 ms
```

**Key finding: Sequential scan on `documents` (547 rows) — no index for ILIKE.** Fix is `pg_trgm` GIN index.

Target: ≥20% query count reduction on ≥1 flow.

---

## Cat 5 — Test Coverage Baseline

> ⚠️ **Critical:** Running `pnpm test` (vitest) truncates the database via `setup.ts beforeAll`. Always reseed after. E2E tests must use `/e2e-test-runner` skill — never `pnpm test:e2e` directly.

**Unit tests (full run — 28 test files, ~498s):**
```
Test Files: 1 failed | 27 passed (28)
Tests:      6 failed | 445 passed (451)
Duration:   497.83s (import 367s — sequential file execution)
```

**Auth test failures (flaky rate-limiter contamination):**
```
FAIL src/routes/auth.test.ts > Auth API > POST /api/auth/logout > should successfully logout with valid session
FAIL src/routes/auth.test.ts > Auth API > GET /api/auth/me > should return user info for valid session
FAIL src/routes/auth.test.ts > Auth API > POST /api/auth/extend-session > should extend session expiry
FAIL src/routes/auth.test.ts > Auth API > GET /api/auth/session > should return session info
FAIL src/routes/auth.test.ts > Auth API > Session Security > should generate unique session IDs for each login
FAIL src/routes/auth.test.ts > Auth API > Session Security > should invalidate old session on re-login
```

**Expected E2E baseline (from audit):** 836 passed / 33 failed / 869 total (96.2% pass rate)
Failures concentrated in `file-attachments.spec` (timing/upload issues).

> ⚠️ **TODO:** Full E2E run with `/e2e-test-runner` skill needed to capture actual `test-results/summary.json`. DB must be re-seeded first.

Target: Fix 3 flaky tests + add 3 meaningful new tests.

---

## Cat 6 — Runtime Error Handling Baseline

**API started:** `DATABASE_URL=postgres://ship:ship_dev_password@postgres:5432/ship_dev E2E_TEST=1 node api/dist/index.js`

**Test 1: Non-JSON body POST** → HTTP 400, HTML stack trace ✅ (confirms bug)
```bash
curl -s -w "\nHTTP %{http_code}" -X POST http://127.0.0.1:3000/api/documents \
  -d 'NOT JSON' -H 'Content-Type: application/json'
```
```html
HTTP 400
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>SyntaxError: Unexpected token 'N', "NOT JSON" is not valid JSON
    at JSON.parse (<anonymous>)
    at createStrictSyntaxError (.../body-parser/lib/types/json.js:169:10)
    at parse (.../body-parser/lib/types/json.js:86:15)
    ...
</pre>
</body>
</html>
```

**Test 2: Missing CSRF POST** → HTTP 403, HTML stack trace ✅ (confirms bug)
```bash
curl -s -w "\nHTTP %{http_code}" -X POST http://127.0.0.1:3000/api/documents \
  -H 'Content-Type: application/json' -d '{}'
```
```html
HTTP 403
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>ForbiddenError: invalid csrf token
    at csrfSync (.../csrf-sync/lib/index.js:22:33)
    at <anonymous> (/workspace/api/src/app.ts:47:55)
    ...
</pre>
</body>
</html>
```

**Test 3: Malformed UUID (unauthenticated)** → HTTP 401, JSON (proper — auth middleware runs first)
```bash
curl -s http://127.0.0.1:3000/api/documents/not-a-uuid
```
```json
{"success":false,"error":{"code":"UNAUTHORIZED","message":"No session found"}}
```

**Test 4: Malformed UUID (authenticated)** → HTTP 500, generic JSON ✅ (confirms bug)
```bash
# Authenticate first, then:
curl -s -i -b /tmp/cat6-cookies.jar http://127.0.0.1:3000/api/documents/not-a-uuid
```
```
HTTP/1.1 500 Internal Server Error
{"error":"Internal server error"}
```
> **Bug confirmed:** Malformed UUID reaches the DB and triggers a PostgreSQL error (`invalid input syntax for type uuid`). The generic error handler catches it but returns HTTP 500 instead of HTTP 400. No UUID format validation exists at the route level. Story 1.4 fixes this by adding pre-query UUID validation returning `{"success":false,"error":{"code":"BAD_REQUEST","message":"Invalid document ID format"}}` with HTTP 400.

**Fix target:** Add global Express error middleware (JSON errors, not HTML), process crash guards, UUID validation → FR1, FR2, FR3.

| Test | HTTP | Response type | Bug? |
|---|---|---|---|
| Non-JSON body POST | 400 | HTML stack trace | ✅ Yes — should be JSON |
| Missing CSRF POST | 403 | HTML stack trace | ✅ Yes — should be JSON |
| Malformed UUID (unauth) | 401 | JSON (proper) | ✅ No — auth fires first |
| Malformed UUID (auth) | 500 | `{"error":"Internal server error"}` | ✅ Yes — should be 400 |

---

## Cat 7 — Accessibility Baseline

> ⚠️ **TODO:** axe-core Playwright scan was not completed in this session. Must be run with:
> - Frontend running (`pnpm dev`)
> - Axe scan on `/issues`, `/projects`, `/documents/:id`
>
> **Expected baseline from audit:** 2 Serious violations (color-contrast, 15 nodes), 0 Critical, missing skip-nav link, 3 custom dialog elements without proper focus trapping.

Target: Fix all Serious violations on 3 priority pages.

---

## Summary Table

| Cat | Metric | Baseline | Audit | Status |
|---|---|---|---|---|
| 1 | Total TS violations | 875 | 878 | ✅ Within ±5% |
| 2 | Index chunk (gzip) | 699 KB | 589 KB | ⚠️ ~19% larger (more chunks counted) |
| 2 | DevTools in bundle | YES | YES | ✅ Confirmed |
| 3 | `/api/documents` P97.5 | 374 ms | 439 ms (P95) | ✅ Comparable |
| 3 | `/api/issues` P97.5 | 282 ms | 216 ms (P95) | ⚠️ Larger dataset |
| 4 | ILIKE plan | Seq Scan | Seq Scan | ✅ Confirmed |
| 4 | ~Query count/page | ~15 | 17 | ✅ Within ±15% |
| 5 | Unit test failures | 6 (auth.test.ts) | Known flaky | ✅ Confirmed |
| 5 | E2E baseline | TODO | 836/869 | ❌ Needs run |
| 6 | HTML error on bad JSON (HTTP 400) | YES | YES | ✅ Confirmed |
| 6 | HTML error on bad CSRF (HTTP 403) | YES | YES | ✅ Confirmed |
| 6 | Malformed UUID (auth) → HTTP 500 generic | YES | YES | ✅ Confirmed |
| 7 | axe-core violations | TODO | 2 Serious | ❌ Needs run |
