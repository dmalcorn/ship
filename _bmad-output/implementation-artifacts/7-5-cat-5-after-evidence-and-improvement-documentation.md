# Story 7.5: Cat 5 After-Evidence & Improvement Documentation

Status: done

> **YOLO mode:** This story is authorized for full YOLO permissions. All changes involve running the test suite and creating a documentation file. No destructive operations, no deploys, no interactive prompts. Proceed autonomously through all tasks without pausing for confirmation.

## Story

As a Gauntlet submitter,
I want the Cat 5 test improvements documented with before/after summary output and root cause analysis,
So that graders can verify the pass rate improvement and the quality of the 3 new meaningful tests.

## Acceptance Criteria

1. **Given** Stories 7.0–7.4 are fully implemented
   **When** the full E2E suite is run via `/e2e-test-runner`
   **Then** `test-results/summary.json` shows ≥99% pass rate (≥13 fewer failures than baseline, plus 3 new tests passing)

2. **Given** the full unit test suite is run
   **Then** `pnpm test` reports **0 failures** (down from 6 in `auth.test.ts` at baseline)

3. **Given** the documentation file is created at `gauntlet_docs/improvements/cat5-test-coverage.md`
   **Then** it contains:
   - Before `test-results/summary.json` (from `gauntlet_docs/baselines.md#Cat-5`)
   - After `test-results/summary.json` showing ≥99% pass rate
   - Root cause analysis of the `file-attachments.spec.ts` flakiness
   - Root cause analysis of the `auth.test.ts` rate-limiter contamination
   - Root cause analysis of the `session-timeout.spec.ts` assertion mismatch
   - Description of each new test (7.2, 7.3, 7.4) and the risk it mitigates
   - Confirmation that each new test fails on a broken implementation

4. **Given** the doc is complete
   **When** graders read `gauntlet_docs/improvements/cat5-test-coverage.md`
   **Then** the improvement is clear and all fixes are explained with root causes

## Tasks / Subtasks

- [ ] Task 1: Confirm Stories 7.0–7.4 are complete (AC: #1)
  - [ ] Verify all tasks in stories 7.0, 7.1, 7.2, 7.3, 7.4 are checked off
  - [ ] **Do NOT proceed until all 5 implementation stories are done**

- [ ] Task 2: Run the full unit test suite (AC: #2)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm `Test Files: 0 failed`
  - [ ] Copy the full vitest output for the documentation

- [ ] Task 3: Run the full E2E suite via `/e2e-test-runner` (AC: #1)
  - [ ] Use `/e2e-test-runner` — do NOT run `pnpm test:e2e` directly
  - [ ] Wait for `test-results/summary.json` to be updated
  - [ ] Record: total tests, passed, failed, pass rate
  - [ ] Confirm pass rate ≥99%
  - [ ] If any new failures appear (unrelated to Cat 5 work), document them but do NOT block on them — they are pre-existing

- [ ] Task 4: Confirm each new test fails on broken implementation (AC: #3)
  - [ ] For Story 7.2 (document creation):
    - Temporarily break the validation (comment out the relevant API check)
    - Run the specific test — confirm failure
    - Restore
  - [ ] For Story 7.3 (session expiry redirect):
    - Temporarily remove the redirect behaviour
    - Run the specific test — confirm failure
    - Restore
  - [ ] For Story 7.4 (mention search):
    - Temporarily break the search endpoint (return empty array)
    - Run the specific test — confirm failure
    - Restore
  - [ ] Document the failure messages for each test in the improvement doc

- [ ] Task 5: Create `gauntlet_docs/improvements/cat5-test-coverage.md` (AC: #3, #4)
  - [ ] Use the template below
  - [ ] Verify the `gauntlet_docs/improvements/` directory exists; create it if not:
    ```bash
    ls /workspace/gauntlet_docs/improvements/
    ```

- [ ] Task 6: Verify the document covers all grader requirements
  - [ ] Cross-check against `gauntlet_docs/ShipShape-fix-plan.md#Category-5` measurement section
  - [ ] Ensure before/after test summary is present
  - [ ] Ensure all 3 fixed flaky tests are described with root causes
  - [ ] Ensure all 3 new tests are described with risk mitigated

## Documentation Template

Create `gauntlet_docs/improvements/cat5-test-coverage.md` with this structure:

```markdown
# Cat 5: Test Coverage Improvements

## Summary

**Target:** Fix 3 flaky tests + add 3 meaningful new tests; achieve ≥99% E2E pass rate
**Result:** [BEFORE pass rate] → [AFTER pass rate]; [BEFORE unit failures] → 0 unit failures

---

## Before Baseline (from gauntlet_docs/baselines.md)

### E2E Test Results (pre-fix)

[Paste before summary.json excerpt showing pass/fail counts and file-attachments failures]

### Unit Test Results (pre-fix)

- `auth.test.ts`: 6 failures (rate-limiter contamination)
- All other unit tests: passing

---

## Fix 1: File-Attachments Spec Flakiness (Story 7.1)

**Root cause:** `page.waitForTimeout(N)` used throughout `e2e/file-attachments.spec.ts` to wait for:
- Slash command popup appearance (500ms)
- Upload completion (2000ms)
- Yjs sync before reload (2000ms)

Fixed timeouts cause race conditions when CI machines are under load or upload latency varies. The 2000ms wait for upload completion is insufficient when the S3 PUT + DB write exceed 2 seconds.

**Fix applied:** Replaced all `waitForTimeout` calls with `expect(...).toBeVisible({ timeout: N })` assertions that wait for the actual UI state change. Key replacement: `await page.waitForTimeout(2000)` after `setFiles()` → `await expect(fileAttachment.locator('a[href]')).toBeVisible({ timeout: 10000 })`.

**Result:** 13 fewer failures; `e2e/file-attachments.spec.ts` passes on 3 consecutive runs.

---

## Fix 2: auth.test.ts Rate-Limiter Contamination (Story 7.0)

**Root cause:** `api/src/routes/auth.test.ts` creates one `app` instance (`const app = createApp()`) shared across all tests. Multiple tests sending failed login attempts exhaust the in-memory rate-limiter bucket. Tests running after the limiter triggers receive `429` instead of the expected `200`/`401`.

**Fix applied:** [Describe the chosen isolation approach — e.g. fresh app per test, reset in beforeEach]

**Result:** 6 unit test failures eliminated; `pnpm test` reports 0 failures.

---

## Fix 3: session-timeout.spec returnTo Assertion (Story 7.0)

**Root cause:** Test asserted `expect(url).toContain("localhost")` but `isolated-env.ts` was updated to bind the test server to `127.0.0.1`. The assertion was wrong, not the behaviour.

**Fix applied:** Changed assertion to `expect(url).toMatch(/localhost|127\.0\.0\.1/)`.

**Result:** 1 E2E test fixed; no behaviour change.

---

## New Test 1: Document Creation with Invalid Input (Story 7.2)

**Risk mitigated:** `POST /api/documents` with empty body previously returned 200 and created junk documents. This test ensures the API either rejects empty payloads or creates documents with safe defaults.

**Test location:** `e2e/documents.spec.ts` — `'does not create documents from empty API payload'`

**Failure confirmation:** [Describe what the test output showed when validation was temporarily broken]

---

## New Test 2: Session Expiry Redirect (Story 7.3)

**Risk mitigated:** If session middleware silently fails, users could lose unsaved work or see stale data. This test confirms the redirect to `/login` on session expiry.

**Test location:** `e2e/auth.spec.ts` — `'redirects to login when session cookie is cleared mid-session'`

**Failure confirmation:** [Describe what the test output showed when redirect was temporarily removed]

---

## New Test 3: Mention Search Returns Correct Results (Story 7.4)

**Risk mitigated:** ILIKE search had no index at baseline; regressions after schema changes could silently return wrong results. This test pins the search contract.

**Test location:** `e2e/mentions.spec.ts` — `'mention search returns documents matching partial title'`

**Failure confirmation:** [Describe what the test output showed when search was temporarily broken]

---

## After Results

### E2E Test Results (post-fix)

[Paste after summary.json excerpt — should show ≥99% pass rate]

### Unit Test Results (post-fix)

[Paste vitest output — 0 failures]

### Pass Rate Improvement

| Metric | Before | After |
|--------|--------|-------|
| E2E pass rate | [X]% | ≥99% |
| E2E file-attachments failures | 13 | 0 |
| Unit test failures (auth.test.ts) | 6 | 0 |
| New meaningful E2E tests | 0 | 3 |
```

## Dev Notes

### Context

This is the documentation/evidence story for Epic 7 (Cat 5 Test Coverage). It must be completed **last** — only after Stories 7.0, 7.1, 7.2, 7.3, and 7.4 are all implemented and verified.

The grading rubric for Cat 5 requires:
- Before/after `test-results/summary.json` showing pass rate improvement
- Root cause analysis of the fixed flaky tests
- 3 new meaningful tests, each with a comment explaining the risk mitigated
- Confirmation each new test fails on a broken implementation

### `/e2e-test-runner` Usage

Per `CLAUDE.md`: always use `/e2e-test-runner` to run E2E tests — never `pnpm test:e2e` directly (causes output explosion with 600+ tests). The runner handles background execution, progress polling via `test-results/summary.json`, and `--last-failed` for iterative fixing.

### Existing Improvement Docs for Reference

See `gauntlet_docs/improvements/cat6-error-handling.md` for the expected format and level of detail. The Cat 5 doc should follow the same pattern.

### Before Baseline Data

From `gauntlet_docs/baselines.md#Cat-5`:
- E2E baseline: 13 failures in `e2e/file-attachments.spec.ts`
- Unit test baseline: 6 failures in `api/src/routes/auth.test.ts`
- Pass rate baseline: [from baselines.md]

### Commit Message

```
docs(cat5): add after-evidence and improvement documentation for test coverage
```

### References

- [Source: gauntlet_docs/baselines.md#Cat-5] — Before E2E and unit test output
- [Source: gauntlet_docs/ShipShape-fix-plan.md#Category-5] — Measurement criteria and grading requirements
- [Source: gauntlet_docs/improvements/cat6-error-handling.md] — Template for improvement doc format
- [Source: _bmad-output/implementation-artifacts/7-0-fix-preexisting-test-failures.md] — Story 7.0
- [Source: _bmad-output/implementation-artifacts/7-1-fix-file-attachments-spec-flakiness.md] — Story 7.1
- [Source: _bmad-output/implementation-artifacts/7-2-new-test-document-creation-with-invalid-input.md] — Story 7.2
- [Source: _bmad-output/implementation-artifacts/7-3-new-test-session-expiry-redirect.md] — Story 7.3
- [Source: _bmad-output/implementation-artifacts/7-4-new-test-mention-search-returns-correct-results.md] — Story 7.4

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `gauntlet_docs/improvements/cat5-test-coverage.md` (created)
