# Story 7.2: New Test — Document Creation with Invalid Input

Status: ready-for-dev

> **YOLO mode:** This story is authorized for full YOLO permissions. All changes are local file edits with no destructive operations, no deploys, and no interactive prompts. Proceed autonomously through all tasks without pausing for confirmation.

## Story

As a developer guarding against silent data corruption,
I want an E2E test that verifies the app does not create junk documents from empty or malformed input,
So that regressions in input validation are caught before reaching production.

## Acceptance Criteria

1. **Given** a new test is added to `e2e/documents.spec.ts` (or `e2e/error-handling.spec.ts` if it better fits the existing test organisation)
   **When** the test attempts to navigate to document creation and verifies the creation path
   **Then** either:
   - (A) the UI prevents submission and the API is never called with an empty/invalid payload, OR
   - (B) the API returns an appropriate error for an empty POST body — the test asserts whichever is the actual post-Epic-1 behaviour

2. **Given** the test is added
   **Then** it includes exactly this comment:
   ```
   // Risk mitigated: POST /api/documents with empty body previously returned 200 and created
   // junk documents. This test ensures the UI does not expose a path to create empty documents
   // inadvertently.
   ```

3. **Given** the test is written
   **When** document creation validation is bypassed or removed
   **Then** the test fails (verified by temporarily breaking the behaviour and confirming failure)

4. **Given** the test is added
   **When** `pnpm test` (unit tests) is run
   **Then** all unit tests pass with no new failures

5. **Given** the test is added and the E2E suite is run
   **Then** the new test passes green on the first run

## Tasks / Subtasks

- [ ] Task 1: Understand the current document creation flow (AC: #1)
  - [ ] Read `e2e/documents.spec.ts` to understand the existing test structure and shared `beforeEach` login setup
  - [ ] Check what happens when `POST /api/documents` is called with no body. Run:
    ```bash
    # Start the dev server first, then:
    curl -X POST http://localhost:3000/api/documents \
      -H "Content-Type: application/json" \
      -b "session_id=<valid_session>" \
      -d '{}'
    ```
  - [ ] Note the current API response for empty body (400? 200 with default? depends on Epic 1 fixes)

- [ ] Task 2: Determine the test approach based on actual behavior (AC: #1)
  - [ ] **If the UI prevents empty document submission (validation before API call):** Write a test that attempts to trigger document creation with no title input and asserts no navigation/creation happens.
  - [ ] **If the API returns 400 for empty body (Epic 1 added server-side validation):** Write a test that calls the API directly (via `page.evaluate` or `page.request`) with an empty body and asserts 400.
  - [ ] **Most likely approach:** The UI creates documents immediately on button click with "Untitled" as the default title — so validation at the UI level may not be the right angle. Instead test that the API call for document creation includes required fields and returns a valid document.

- [ ] Task 3: Write the test (AC: #1, #2, #3)
  - [ ] Add the test to `e2e/documents.spec.ts` in a new `test.describe` block or as a standalone test:
    ```ts
    test('does not create documents from empty API payload', async ({ page, request }) => {
      // Risk mitigated: POST /api/documents with empty body previously returned 200 and created
      // junk documents. This test ensures the UI does not expose a path to create empty documents
      // inadvertently.

      // Login first to get a valid session
      await page.goto('/login');
      await page.locator('#email').fill('dev@ship.local');
      await page.locator('#password').fill('admin123');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page).not.toHaveURL('/login', { timeout: 5000 });

      // Attempt direct API call with empty body (bypassing UI validation)
      const response = await page.request.post('/api/documents', {
        data: {},
        headers: { 'Content-Type': 'application/json' },
      });

      // Should NOT create a document — expect 400 or a document with mandatory defaults
      // If API returns 400: assert status
      // If API returns 200 with "Untitled" default: assert the document has a title
      const body = await response.json();

      if (response.status() === 400) {
        // Validation is strict — empty body rejected
        expect(response.status()).toBe(400);
        expect(body.success).toBe(false);
      } else if (response.status() === 200 || response.status() === 201) {
        // API assigns defaults — verify no "junk" state (title must be non-empty)
        expect(body.data?.title ?? body.title).toBeTruthy();
        expect(body.data?.title ?? body.title).not.toBe('');
      } else {
        // Any other status is unexpected
        throw new Error(`Unexpected status ${response.status()} from POST /api/documents with empty body`);
      }
    });
    ```
  - [ ] **Important:** Read the actual API route (`api/src/routes/documents.ts`) to determine what really happens for an empty body before writing the assertion. Do NOT guess.

- [ ] Task 4: Verify the test fails when validation is broken (AC: #3)
  - [ ] Temporarily comment out or break the relevant server-side or client-side validation
  - [ ] Run the test — it must fail
  - [ ] Restore the validation
  - [ ] Run the test again — it must pass

- [ ] Task 5: Run the E2E test to confirm it passes (AC: #5)
  - [ ] Use `/e2e-test-runner` to run `e2e/documents.spec.ts` specifically
  - [ ] The new test must be green

- [ ] Task 6: Run unit tests (AC: #4)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm 0 failures

## Dev Notes

### Context

At baseline, `POST /api/documents` with an empty body was identified as returning 200 and creating a document with no title (a "junk" record). Epic 1 added global error middleware and UUID validation, but the specific empty-body case for document creation may or may not have been addressed. **This test pins the contract** — either strict rejection (400) or safe default behaviour (creates "Untitled") — so a regression in either direction will be caught.

### Key Files to Read Before Writing

| File | Why |
|------|-----|
| `e2e/documents.spec.ts` | Existing test structure and `beforeEach` login pattern |
| `api/src/routes/documents.ts` | Current POST handler — understand validation and defaults |

### Playwright `page.request` vs. `fetch`

Playwright's `page.request` shares the browser context (including session cookies) with the page. This is the preferred way to make direct API calls from within E2E tests without setting up a separate HTTP client. Example:
```ts
const response = await page.request.post('/api/documents', {
  data: { title: '' },
  headers: { 'Content-Type': 'application/json' },
});
```

### CSRF Token Requirement

The API uses CSRF protection. If the POST returns 403, the CSRF token needs to be included. First fetch the token:
```ts
const csrfResponse = await page.request.get('/api/csrf-token');
const { token } = await csrfResponse.json();
// Then include in header: 'x-csrf-token': token
```

### Commit Message

```
test(e2e): add test for document creation with invalid/empty input (Cat 5)
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-7.2] — Story background
- [Source: gauntlet_docs/ShipShape-fix-plan.md#Category-5] — Cat 5 requirements
- [Source: e2e/documents.spec.ts] — Existing document tests to extend
- [Source: api/src/routes/documents.ts] — API route to understand validation

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `e2e/documents.spec.ts` (modified — new test added) OR `e2e/error-handling.spec.ts` (modified — new test added)
