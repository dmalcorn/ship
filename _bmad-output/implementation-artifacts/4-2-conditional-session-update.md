# Story 4.2: Conditional Session UPDATE

Status: ready-for-dev

## Story

As an active user making rapid sequential API calls,
I want the server to skip redundant session write operations,
So that the main page load drops from ~15 DB queries to ≤13 without affecting session timeout behaviour.

## Acceptance Criteria

1. **Given** auth middleware in `api/src/middleware/auth.ts` is updated to check `last_activity` age before issuing an UPDATE
   **When** a request arrives and `session.last_activity` is within the last 30 seconds
   **Then** the `UPDATE sessions SET last_activity` query is skipped for that request

2. **Given** the throttle is in place
   **When** a request arrives and `session.last_activity` is older than 30 seconds
   **Then** the UPDATE runs normally, refreshing `last_activity` to `NOW()`

3. **Given** the throttle is in place
   **When** a user is active but then stops for >15 minutes
   **Then** the next request correctly rejects the session (15-minute inactivity timeout is unaffected because the last UPDATE recorded real activity time, not a throttled-out time)

4. **Given** the throttle is in place
   **When** a session is older than 12 hours (absolute limit)
   **Then** the session is still invalidated correctly — the absolute timeout check is unaffected

5. **Given** the change is applied
   **When** query logging is enabled and the 3-request main page load flow is executed
   **Then** total DB query count is ≤13 (down from ~15 in `gauntlet_docs/baselines.md`)

6. **Given** the changes are applied
   **When** `pnpm test` is run
   **Then** all tests pass with no new failures (baseline: 6 pre-existing failures in `auth.test.ts` only)

## Tasks / Subtasks

- [ ] Task 1: Read auth middleware and understand current UPDATE location (AC: #1)
  - [ ] Open `api/src/middleware/auth.ts`
  - [ ] Locate the unconditional UPDATE block starting at line ~204:
    ```typescript
    // Update last activity
    await pool.query(
      'UPDATE sessions SET last_activity = $1 WHERE id = $2',
      [now, sessionId]
    );
    ```
  - [ ] Confirm `lastActivity` (a `Date` object) and `inactivityMs` (milliseconds since last activity) are already computed above this block at lines ~149–151

- [ ] Task 2: Add the 30-second throttle guard (AC: #1, #2)
  - [ ] Wrap the UPDATE in a condition using the already-computed `inactivityMs`:
    ```typescript
    // Skip redundant session write if last_activity was updated within the last 30s.
    // This reduces ~6 session UPDATEs on main page load (3 requests in quick succession)
    // to 1–2, cutting total DB queries from ~15 to ≤13.
    const SESSION_UPDATE_THROTTLE_MS = 30_000;
    if (inactivityMs > SESSION_UPDATE_THROTTLE_MS) {
      await pool.query(
        'UPDATE sessions SET last_activity = $1 WHERE id = $2',
        [now, sessionId]
      );
    }
    ```
  - [ ] Do NOT change any other logic above or below this block (timeouts, cookie refresh, etc.)
  - [ ] `now` and `inactivityMs` are already defined — do not redefine them

- [ ] Task 3: Verify timeout correctness (AC: #3, #4)
  - [ ] Confirm that the 15-minute inactivity check at line ~169 reads `session.last_activity` from the DB value (already loaded in the SELECT at line ~126) — it is not affected by the UPDATE being skipped because the check runs BEFORE the UPDATE in the same request
  - [ ] Confirm that the 12-hour absolute timeout check at line ~155 is based on `session.created_at`, not `last_activity` — unaffected by this change

- [ ] Task 4: Measure query count reduction (AC: #5)
  - [ ] Enable query logging: `psql $DATABASE_URL -c "ALTER SYSTEM SET log_statement = 'all'; SELECT pg_reload_conf();"`
  - [ ] Make 3 rapid sequential authenticated requests (simulate main page load):
    ```bash
    curl -s -b /tmp/cookies.jar http://127.0.0.1:3000/api/documents > /dev/null
    curl -s -b /tmp/cookies.jar http://127.0.0.1:3000/api/issues > /dev/null
    curl -s -b /tmp/cookies.jar "http://127.0.0.1:3000/api/search/mentions?q=a" > /dev/null
    ```
  - [ ] Count total queries in PostgreSQL log: `grep 'LOG:  execute' /path/to/pg.log | wc -l`
  - [ ] Confirm ≤13 queries total (down from ~15 in baselines.md)
  - [ ] Disable logging: `psql $DATABASE_URL -c "ALTER SYSTEM RESET log_statement; SELECT pg_reload_conf();"`
  - [ ] Save before/after query counts for Story 4.4

- [ ] Task 5: Run unit tests (AC: #6)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm only the 6 pre-existing `auth.test.ts` failures remain
  - [ ] ⚠️ Running `pnpm test` truncates the DB via `setup.ts`. Run `pnpm db:seed` afterward

## Dev Notes

### Context

Every authenticated API request currently runs 3 auth-middleware queries unconditionally:
1. `SELECT` session JOIN users (required — cannot skip)
2. `SELECT` workspace_memberships (required — cannot skip)
3. `UPDATE sessions SET last_activity = NOW()` ← this is the redundant one

On a typical main page load (3 HTTP requests fired in quick succession), all 3 requests arrive within milliseconds of each other. Each one issues the UPDATE even though `last_activity` was just set by the previous request. This adds 2–3 redundant writes per page load.

The fix mirrors the cookie refresh throttle already implemented in the same file at line ~212:
```typescript
const COOKIE_REFRESH_THRESHOLD_MS = 60 * 1000;
if (inactivityMs > COOKIE_REFRESH_THRESHOLD_MS) {
  res.cookie(...)
}
```
We apply the same pattern to the DB write, with a shorter threshold (30s) because the inactivity timeout is 15 minutes — the window of correctness for skipping is wide.

### Timeout Safety Analysis

The 30-second throttle does not affect either timeout:

- **15-minute inactivity timeout** checks `inactivityMs` computed from `session.last_activity` read from the DB at the top of the middleware. This check runs BEFORE the UPDATE. If a user is active every few seconds, the DB value will be at most 30 seconds stale, which is far within the 15-minute window. The timeout will still fire correctly.

- **12-hour absolute timeout** is based on `session.created_at`, not `last_activity`. Completely unaffected.

### Exact Change Location

**File: `api/src/middleware/auth.ts`** — around line 204:

Before:
```typescript
// Update last activity
await pool.query(
  'UPDATE sessions SET last_activity = $1 WHERE id = $2',
  [now, sessionId]
);
```

After:
```typescript
// Throttle session UPDATE: skip if last_activity was refreshed within the last 30s.
// Reduces redundant writes on rapid sequential requests (e.g. main page load).
const SESSION_UPDATE_THROTTLE_MS = 30_000;
if (inactivityMs > SESSION_UPDATE_THROTTLE_MS) {
  await pool.query(
    'UPDATE sessions SET last_activity = $1 WHERE id = $2',
    [now, sessionId]
  );
}
```

### File Locations

- **Primary file:** `api/src/middleware/auth.ts`
- **Change location:** UPDATE block around line 204–208
- **Reference — existing throttle pattern:** `api/src/middleware/auth.ts:212-221` (cookie refresh throttle)

### Baseline Numbers (for Story 4.4 comparison)

From `gauntlet_docs/baselines.md`:
- 3-request main page load: ~15 total DB queries (audit baseline: 17)
- Auth middleware breakdown: 3 queries per request = 9 auth queries for 3 requests
- With fix: 3 UPDATEs → 1 UPDATE = 2 fewer queries per page load → total ≤13

### Commit Message

```
fix(auth): throttle session UPDATE to reduce redundant DB writes
```

### References

- [Source: gauntlet_docs/ShipShape-fix-plan.md] — Fix 4-B, root cause and code snippet
- [Source: gauntlet_docs/baselines.md#Cat-4] — Before query counts (15 queries / 3-request flow)
- [Source: api/src/middleware/auth.ts:149-151] — `lastActivity` and `inactivityMs` already computed
- [Source: api/src/middleware/auth.ts:204-208] — Unconditional UPDATE to be throttled
- [Source: api/src/middleware/auth.ts:212-221] — Existing cookie-refresh throttle (same pattern)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None

### Completion Notes List

- Wrapped UPDATE in `SESSION_UPDATE_THROTTLE_MS = 30_000` guard at auth.ts:207
- Used existing `inactivityMs` variable (already computed at line 151) — no new computation needed
- Follows the same pattern as the existing COOKIE_REFRESH_THRESHOLD_MS throttle at line 216
- Timeout correctness verified: 15-min inactivity check runs BEFORE the throttle; 12-hr absolute timeout uses created_at, not last_activity
- Unit tests in `src/__tests__/auth.test.ts` required `vi.clearAllMocks()` → `vi.resetAllMocks()` fix to prevent mock queue bleed from skipped pool.query calls

### File List

- `api/src/middleware/auth.ts` (modified — wrap UPDATE in 30s throttle guard)
- `api/src/__tests__/auth.test.ts` (modified — clearAllMocks → resetAllMocks to prevent mock bleed)
