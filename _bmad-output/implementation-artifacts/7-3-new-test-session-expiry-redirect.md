# Story 7.3: New Test — Session Expiry Redirect

Status: ready-for-dev

> **YOLO mode:** This story is authorized for full YOLO permissions. All changes are local file edits with no destructive operations, no deploys, and no interactive prompts. Proceed autonomously through all tasks without pausing for confirmation.

## Story

As a developer guarding against silent data loss on session timeout,
I want an E2E test that verifies expired sessions redirect to login cleanly,
So that users are never silently stuck in a broken state where they believe data was saved but the session was invalid.

## Acceptance Criteria

1. **Given** a new test is added to `e2e/auth.spec.ts`
   **When** the test simulates an expired session (clears the session cookie mid-session) and attempts a protected action
   **Then** the app redirects to the login page

2. **Given** the test is added
   **Then** it includes exactly this comment:
   ```
   // Risk mitigated: if session middleware silently fails, users could lose unsaved work or
   // see stale data from another session. This test confirms the redirect behaviour on session
   // expiry.
   ```

3. **Given** the test is written
   **When** the session expiry redirect is removed or the middleware is broken
   **Then** the test fails (verified by temporarily breaking the behaviour)

4. **Given** the test is added
   **When** `pnpm test` (unit tests) is run
   **Then** all unit tests pass with no new failures

5. **Given** the test is added and the E2E suite is run
   **Then** the new test passes green on the first run

## Tasks / Subtasks

- [ ] Task 1: Understand the existing auth spec structure (AC: #1)
  - [ ] Read `e2e/auth.spec.ts` — focus on:
    - The `beforeEach` login pattern (currently clears cookies)
    - Any existing tests for session expiry or redirect
    - The test for "protected route redirects to login when not authenticated" (already present)
  - [ ] Confirm that clearing cookies mid-session triggers a redirect on the next API call

- [ ] Task 2: Understand the session expiry mechanism (AC: #1)
  - [ ] The auth middleware at `api/src/middleware/auth.ts` returns 401 when the session cookie is missing or invalid
  - [ ] The frontend (likely in an Axios interceptor or React Query error handler) should redirect to `/login` on 401 from an authenticated endpoint
  - [ ] Find the frontend 401 handler:
    ```bash
    grep -rn "401\|unauthorized\|login" /workspace/web/src/lib/ /workspace/web/src/hooks/ --include="*.ts" --include="*.tsx" | grep -i "redirect\|navigate"
    ```

- [ ] Task 3: Write the session expiry redirect test (AC: #1, #2)
  - [ ] Add the test to `e2e/auth.spec.ts` as a new test in the existing `test.describe('Authentication')` block:
    ```ts
    test('redirects to login when session cookie is cleared mid-session', async ({ page }) => {
      // Risk mitigated: if session middleware silently fails, users could lose unsaved work or
      // see stale data from another session. This test confirms the redirect behaviour on session
      // expiry.

      // Step 1: Login successfully
      await page.goto('/login');
      await page.locator('#email').fill('dev@ship.local');
      await page.locator('#password').fill('admin123');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page).not.toHaveURL('/login', { timeout: 5000 });

      // Step 2: Verify we're in the app
      await page.goto('/docs');
      await expect(page).not.toHaveURL('/login', { timeout: 5000 });

      // Step 3: Clear the session cookie (simulates expiry)
      await page.context().clearCookies();

      // Step 4: Attempt to navigate to a protected route
      await page.goto('/docs');

      // Step 5: Should redirect to login
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    });
    ```
  - [ ] **Alternative pattern** if `page.goto` doesn't trigger the redirect (some SPAs check auth lazily):
    ```ts
    // After clearing cookies, make an API call that requires auth
    // The 401 response should trigger the frontend redirect
    await page.context().clearCookies();
    // Navigate and wait for either the redirect or an API call that returns 401
    await page.goto('/docs');
    await page.waitForURL(/\/login/, { timeout: 10000 });
    ```
  - [ ] Read `web/src/pages/App.tsx` and the API client to understand whether the redirect happens on navigation or on API call failure, and adjust the test accordingly.

- [ ] Task 4: Verify the test fails when redirect is broken (AC: #3)
  - [ ] Temporarily modify the auth middleware or frontend 401 handler to NOT redirect
  - [ ] Run the test — it must fail
  - [ ] Restore the redirect behaviour
  - [ ] Run the test — it must pass

- [ ] Task 5: Run the E2E test (AC: #5)
  - [ ] Use `/e2e-test-runner` to run `e2e/auth.spec.ts` specifically
  - [ ] New test must be green

- [ ] Task 6: Run unit tests (AC: #4)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm 0 failures

## Dev Notes

### Context

The session expiry redirect is a critical security behaviour. If the frontend silently ignores a 401 response (e.g. due to an unhandled error state or missing interceptor), users could believe their data was saved when it was actually rejected. This test pins the contract: clearing the session cookie → next protected action → redirect to `/login`.

The session cookie name is `session_id` (confirmed from `api/src/routes/auth.test.ts`). The 15-minute inactivity timeout and 12-hour absolute timeout are handled by the auth middleware — but this test doesn't need to simulate actual time passing. Clearing the session cookie is sufficient to trigger an immediate 401.

### Key Files to Read Before Writing

| File | Why |
|------|-----|
| `e2e/auth.spec.ts` | Existing structure and `beforeEach` login pattern |
| `api/src/middleware/auth.ts` | What happens when session cookie is missing/invalid → 401 |
| `web/src/lib/` or `web/src/hooks/` | Frontend 401 interceptor / redirect logic |

### Existing Related Test

`e2e/auth.spec.ts` already has:
```ts
test('protected route redirects to login when not authenticated', ...)
```
This test starts without a session (cookies cleared in `beforeEach`). The **new test** is different: it starts authenticated, then loses the session mid-browse — which exercises the runtime error path rather than the initial load path.

### Session Timeout Spec vs Auth Spec

`e2e/session-timeout.spec.ts` tests the **warning modal UX** (fake timers, countdown, "Extend session" button). That is NOT what this story tests. This story tests the **hard redirect** when the session cookie is physically cleared — a different code path.

### Commit Message

```
test(e2e): add session expiry redirect test (Cat 5)
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-7.3] — Story background
- [Source: gauntlet_docs/ShipShape-fix-plan.md#Category-5] — Cat 5 requirements
- [Source: e2e/auth.spec.ts] — Existing auth tests to extend
- [Source: api/src/middleware/auth.ts] — Session validation and 401 behaviour

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `e2e/auth.spec.ts` (modified — new session expiry redirect test added)
