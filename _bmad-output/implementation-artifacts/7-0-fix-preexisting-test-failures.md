# Story 7.0: Fix Pre-existing Test Failures Introduced by Infrastructure Fixes

Status: ready-for-dev

> **YOLO mode:** This story is authorized for full YOLO permissions. All changes are local file edits with no destructive operations, no deploys, and no interactive prompts. Proceed autonomously through all tasks without pausing for confirmation.

## Story

As a developer maintaining a trustworthy test suite,
I want two test failures caused by our own infrastructure fixes resolved before Cat 5 work begins,
So that the baseline failure count is accurate and Cat 5 improvements are measured against a clean starting state.

## Background

Two failures are **not** pre-existing product bugs — they are breakage we introduced:

1. **`auth.test.ts` rate-limiter contamination (6 unit test failures):** The Express rate-limiter middleware shares state across tests in `api/src/routes/auth.test.ts`. Multiple tests that send failed login attempts (wrong password, non-existent email, missing fields, PIV user) accumulate against the in-memory rate-limiter bucket attached to the single `app` instance created at the top of the `describe` block (`const app = createApp()`). Tests that run after the bucket is exhausted receive `429 Too Many Requests` instead of the expected `200`/`401`. Fix: reset or isolate the rate-limiter between tests.

2. **`session-timeout.spec` `returnTo` security test (1 E2E failure):** A test in `e2e/session-timeout.spec.ts` asserts `expect(url).toContain("localhost")` but the IPv4 fix in `isolated-env.ts` changed server binding to `127.0.0.1`. The assertion is wrong — not the behaviour. Fix: update the assertion to accept either host.

## Acceptance Criteria

1. **Given** the rate-limiter contamination root cause is confirmed (verified by running `auth.test.ts` in isolation vs. as part of the full suite)
   **When** rate-limiter state is isolated between tests
   **Then** all 6 previously failing auth tests pass in the full unit test run
   **And** `Test Files: 0 failed | N passed` in vitest output

2. **Given** the `returnTo` test failure is caused by `127.0.0.1` vs `localhost` assertion mismatch
   **When** the assertion is updated to accept either host
   **Then** the `session-timeout.spec` `returnTo` test passes in the E2E run
   **And** no behaviour is altered — this is a one-line assertion change

3. **Given** both fixes are applied
   **When** `pnpm test` is run
   **Then** all unit tests pass with **0 failures** (no pre-existing baseline failures remain from these two sources)

## Tasks / Subtasks

- [ ] Task 1: Reproduce the rate-limiter contamination (AC: #1)
  - [ ] Run the full unit test suite: `cd /workspace && pnpm test`
  - [ ] Note which 6 tests in `auth.test.ts` fail with 429 status
  - [ ] Confirm the failure disappears when running `auth.test.ts` in isolation:
    ```bash
    cd /workspace && pnpm vitest run api/src/routes/auth.test.ts
    ```

- [ ] Task 2: Fix rate-limiter isolation in `api/src/routes/auth.test.ts` (AC: #1)
  - [ ] Option A — Create a fresh `app` instance per test (cleanest isolation):
    ```ts
    // Instead of const app = createApp() at describe level,
    // create it inside beforeEach or inside each test that triggers rate limits
    let app: ReturnType<typeof createApp>;
    beforeEach(() => { app = createApp(); });
    ```
  - [ ] Option B — Reset the rate-limiter store between tests. If `createApp()` exposes the limiter instance or its store, call `.resetKey()` in `beforeEach`.
  - [ ] Option C — Use vitest's fake timers to advance the rate-limiter window:
    ```ts
    import { vi } from 'vitest';
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });
    ```
  - [ ] Choose the option that does NOT require changing `app.ts` or the rate-limiter implementation. Option A (fresh app per test) is preferred as it requires no knowledge of the limiter internals.
  - [ ] Verify: run the full suite — 0 failures.

- [ ] Task 3: Fix the `returnTo` assertion in `session-timeout.spec.ts` (AC: #2)
  - [ ] Search for the failing assertion:
    ```bash
    grep -n "toContain.*localhost" /workspace/e2e/session-timeout.spec.ts
    ```
  - [ ] Update the line from:
    ```ts
    expect(url).toContain("localhost")
    ```
    to:
    ```ts
    expect(url).toMatch(/localhost|127\.0\.0\.1/)
    ```
  - [ ] Do NOT change any other test logic — only the host-matching assertion.

- [ ] Task 4: Run the full unit test suite to confirm clean baseline (AC: #3)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm `Test Files: 0 failed`
  - [ ] Record the clean output for Story 7.5 documentation

- [ ] Task 5: Note the E2E fix for Story 7.5 documentation (AC: #2)
  - [ ] The E2E fix for `session-timeout.spec` will be validated when the full suite is run in Story 7.5 via `/e2e-test-runner`

## Dev Notes

### Context

Both failures were introduced by infrastructure improvements made earlier in the sprint:
- The rate-limiter issue stems from the auth route using a shared in-memory Express rate-limiter. When `createApp()` is called once for the entire describe block, the same limiter instance processes every test request. Multiple tests sending failed login attempts (wrong password, missing fields, non-existent email, PIV user rejection) exhaust the limiter's per-IP bucket before the full test battery is complete.
- The `returnTo` assertion was written when the server bound to `localhost` but was broken when `isolated-env.ts` was updated to bind to `127.0.0.1` for IPv4 reliability.

### Key Files

| File | Lines | Issue |
|------|-------|-------|
| `api/src/routes/auth.test.ts` | ~15 | `const app = createApp()` shared across all tests — rate-limiter not reset |
| `e2e/session-timeout.spec.ts` | Search for `toContain("localhost")` | Assertion hardcodes `localhost` |

### Rate-Limiter Location

The rate-limiter is typically registered in `api/src/app.ts`. To confirm, search for `rateLimit` or `express-rate-limit` in `api/src/`:
```bash
grep -rn "rateLimit\|rate-limit" /workspace/api/src/
```

### Commit Message

```
fix(tests): isolate rate-limiter per test in auth.test.ts; fix returnTo host assertion
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-7.0] — Background and acceptance criteria
- [Source: api/src/routes/auth.test.ts] — Rate-limiter contamination source
- [Source: e2e/session-timeout.spec.ts] — `returnTo` assertion to fix

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `api/src/routes/auth.test.ts` (modified — rate-limiter isolation)
- `e2e/session-timeout.spec.ts` (modified — `returnTo` host assertion)
