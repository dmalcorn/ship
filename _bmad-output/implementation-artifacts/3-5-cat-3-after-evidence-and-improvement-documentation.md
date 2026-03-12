# Story 3.5: Cat 3 After-Evidence & Improvement Documentation

Status: ready-for-dev

## Story

As a Gauntlet submitter,
I want the Cat 3 API improvements documented with before/after autocannon benchmarks run under identical conditions,
So that graders can verify ≥20% P95 reduction on both target endpoints and award full credit.

## Acceptance Criteria

1. **Given** Stories 3.1–3.4 are fully implemented and committed on the `fix/api-response-time` branch
   **When** `autocannon -c 50 -d 30 -R 100` is run against `/api/issues` with the same dataset (501+ docs / 163+ issues)
   **Then** P95 on `/api/issues` is ≤173 ms (≥20% reduction from 216 ms audit baseline)

2. **Given** Stories 3.1–3.4 are fully implemented
   **When** `autocannon -c 50 -d 30 -R 100` is run against `/api/documents`
   **Then** P95 on `/api/documents` is ≤351 ms (≥20% reduction from 439 ms audit baseline) OR payload size reduction is documented as the primary evidence if latency target isn't met

3. **Given** both benchmarks are captured
   **When** `gauntlet_docs/improvements/cat3-api-response-time.md` is written
   **Then** it contains for each of the 4 fixes:
   - What was changed (code location + change description)
   - Why the original was suboptimal (root cause)
   - Why the approach is better (reasoning)
   - Tradeoffs made

4. **Given** the improvement doc is complete
   **When** the payload size evidence section is reviewed
   **Then** it shows before/after byte counts for both endpoints (from `curl | wc -c`)

5. **Given** the changes are applied
   **When** `pnpm test` is run
   **Then** all tests pass with no new failures

## Tasks / Subtasks

- [ ] Task 1: Verify DB dataset before benchmarking (AC: #1, #2)
  - [ ] Query the DB to confirm row counts: `psql $DATABASE_URL -c "SELECT document_type, COUNT(*) FROM documents GROUP BY document_type ORDER BY count DESC;"`
  - [ ] Confirm ≥501 total documents and ≥163 issues
  - [ ] If counts are low, reseed: `pnpm db:seed` then re-run supplement seed: `psql $DATABASE_URL < gauntlet_docs/supplement-seed.sql`
  - [ ] Record the exact counts used

- [ ] Task 2: Build and start the API for benchmarking (AC: #1, #2)
  - [ ] `cd api && pnpm build`
  - [ ] Start in production mode: `DATABASE_URL=... E2E_TEST=1 node dist/index.js &`
  - [ ] Authenticate and save cookie jar (same method as baselines.md)
  - [ ] Verify server is responding: `curl -s http://127.0.0.1:3000/health`

- [ ] Task 3: Capture after-payload sizes (AC: #4)
  - [ ] Documents endpoint payload (after pagination):
    ```bash
    curl -s -b /tmp/cookies.jar "http://127.0.0.1:3000/api/documents?limit=100" | wc -c
    # (Also measure the ?type=wiki slice)
    curl -s -b /tmp/cookies.jar "http://127.0.0.1:3000/api/documents?type=wiki&limit=100" | wc -c
    ```
  - [ ] Issues endpoint payload (after content column removal):
    ```bash
    curl -s -b /tmp/cookies.jar "http://127.0.0.1:3000/api/issues" | wc -c
    ```
  - [ ] Record both — compare against baselines: docs 284,928 bytes, issues 335,325 bytes

- [ ] Task 4: Run autocannon on `/api/issues` after fix (AC: #1)
  - [ ] Authenticate and get session cookie for autocannon header:
    ```bash
    SESSION_COOKIE=$(cat /tmp/cookies.jar | grep session | awk '{print $NF}')
    ```
  - [ ] Run autocannon:
    ```bash
    npx autocannon -c 50 -d 30 -R 100 \
      -H "Cookie: $SESSION_COOKIE" \
      -H "X-CSRF-Token: $CSRF_TOKEN" \
      http://127.0.0.1:3000/api/issues
    ```
  - [ ] Record P50, P90, P97.5, P99, Max
  - [ ] Compare P95/P97.5 against baseline: 282 ms P97.5 (our run) / 216 ms P95 (audit)
  - [ ] Target: ≤173 ms P95

- [ ] Task 5: Run autocannon on `/api/documents` after fix (AC: #2)
  - [ ] Run autocannon against paginated endpoint:
    ```bash
    npx autocannon -c 50 -d 30 -R 100 \
      -H "Cookie: $SESSION_COOKIE" \
      -H "X-CSRF-Token: $CSRF_TOKEN" \
      "http://127.0.0.1:3000/api/documents?limit=100"
    ```
  - [ ] Record P50, P90, P97.5, P99, Max
  - [ ] Compare against baseline: 374 ms P97.5 (our run) / 439 ms P95 (audit)
  - [ ] Target: ≤351 ms P95; if latency target not met, document payload reduction as primary evidence

- [ ] Task 6: Write improvement documentation (AC: #3, #4)
  - [ ] Create `gauntlet_docs/improvements/cat3-api-response-time.md`
  - [ ] Use this structure:

    ```markdown
    # Cat 3: API Response Time Improvements

    ## Before Evidence (from gauntlet_docs/baselines.md)
    [copy relevant baseline numbers]

    ## Fix 1: Strip content column from issues list (Story 3.1)
    **File changed:** api/src/routes/issues.ts
    **What changed:** Removed `d.content` from the SELECT in the issues list query
    **Root cause:** content field (full TipTap JSON) was selected on every list request; never rendered by the board UI
    **Why better:** Payload drops from ~327 KB to ~15-20 KB per request
    **Tradeoff:** None — individual issue GET endpoints still return content for the editor

    ## Fix 2: SQL-level type filter on documents endpoint (Story 3.2)
    [...]

    ## Fix 3: Pagination on documents endpoint (Story 3.3)
    [...]

    ## Fix 4: Frontend passes limit param (Story 3.4)
    [...]

    ## After Evidence
    ### Payload sizes (after)
    | Endpoint | Before | After | Reduction |
    |---|---|---|---|
    | GET /api/issues | 335,325 bytes | X bytes | Y% |
    | GET /api/documents | 284,928 bytes | X bytes | Y% |

    ### autocannon results (after)
    [full output tables]

    ### Reproduction commands
    [exact commands to reproduce]
    ```

- [ ] Task 7: Run unit tests (AC: #5)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm only the 6 pre-existing `auth.test.ts` failures remain

## Dev Notes

### Context

This story captures the before/after proof required for Cat 3. The evidence standard (from CLAUDE.md):
- `autocannon -c 50 -d 30 -R 100` P95 numbers before and after
- Same dataset (501+ docs, 163+ issues — confirm via DB query before running)
- Both endpoints must show ≥20% improvement, or payload size reduction serves as primary evidence

**Authentication for autocannon:** The endpoint requires session auth. Use the same cookie jar approach as baselines.md. The CSRF token is required for mutating requests; for GET requests (autocannon benchmarks) you only need the session cookie.

**CSRF-exempt for GETs:** `autocannon` against `GET /api/issues` and `GET /api/documents` does NOT need CSRF token — CSRF only applies to state-mutating requests (POST/PATCH/DELETE). Just pass the session cookie.

**Benchmark consistency:** Run on the same hardware, same DB state as baselines. Do not run pnpm test (vitest) between seeding and benchmarking — it truncates the DB.

### Autocannon Auth Setup

```bash
# Step 1: Get auth cookie (run once)
curl -s -c /tmp/bench-cookies.jar -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<admin-email>","password":"<admin-password>"}'

# Step 2: Extract session cookie value
SESSION_COOKIE=$(grep -oP 'shipshape_session\t\K\S+' /tmp/bench-cookies.jar)
# or simply paste the full Cookie header from curl -v output

# Step 3: Run autocannon
npx autocannon -c 50 -d 30 -R 100 \
  -H "Cookie: shipshape_session=${SESSION_COOKIE}" \
  http://127.0.0.1:3000/api/issues
```

### Output File Location

- **Primary output:** `gauntlet_docs/improvements/cat3-api-response-time.md`
- **Dir may need creating:** `mkdir -p gauntlet_docs/improvements/`

### Commit Message

```
fix(cat3): add after-evidence and improvement documentation for API response time
```

### References

- [Source: gauntlet_docs/baselines.md#Cat-3] — Before numbers (payload + autocannon)
- [Source: gauntlet_docs/ShipShape-fix-plan.md] — FR8–FR11 root causes and measurement criteria
- [Source: gauntlet_docs/audit-deliverable.md] — Official audit baseline (216 ms P95 issues, 439 ms P95 docs)

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `gauntlet_docs/improvements/cat3-api-response-time.md` (created — improvement doc with before/after evidence)
