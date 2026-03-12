# Story 7.1: Fix File-Attachments Spec Flakiness

Status: ready-for-dev

> **YOLO mode:** This story is authorized for full YOLO permissions. All changes are local file edits with no destructive operations, no deploys, and no interactive prompts. Proceed autonomously through all tasks without pausing for confirmation.

## Story

As a developer running the E2E suite,
I want the file-attachments spec to pass consistently,
So that 13 false failures are eliminated and the suite accurately reflects the actual state of the attachment feature.

## Acceptance Criteria

1. **Given** the root cause of flakiness in `e2e/file-attachments.spec.ts` is identified (race condition between upload POST completion and UI state update)
   **When** fixed by replacing fixed `waitForTimeout` calls with explicit `waitFor` assertions (e.g. `await expect(page.locator('[data-file-attachment] a[href]')).toBeVisible()`)
   **Then** the file-attachments spec passes on 3 consecutive runs without failure

2. **Given** each fixed test
   **When** a comment block is added
   **Then** it documents: what the test covers, why it was flaky (fixed timeout too short/long depending on CI vs. local), and what the replacement assertion ensures

3. **Given** the fix is applied
   **When** `test-results/summary.json` is checked
   **Then** it shows ≥13 fewer failures than the baseline captured in `gauntlet_docs/baselines.md`

4. **Given** the changes are applied
   **When** `pnpm test` is run (unit tests)
   **Then** all unit tests pass with no new failures

## Tasks / Subtasks

- [ ] Task 1: Audit all `page.waitForTimeout()` calls in `e2e/file-attachments.spec.ts` (AC: #1)
  - [ ] Run: `grep -n "waitForTimeout" /workspace/e2e/file-attachments.spec.ts`
  - [ ] List every occurrence. Expected findings include (line numbers approximate):
    - `await page.waitForTimeout(300)` — waiting for editor focus (in `beforeEach` and helpers)
    - `await page.waitForTimeout(500)` — waiting for slash command popup
    - `await page.waitForTimeout(1000)` — waiting for upload validation
    - `await page.waitForTimeout(2000)` — waiting for upload completion (multiple occurrences)
    - `await page.waitForTimeout(2000)` — waiting for Yjs sync after reload

- [ ] Task 2: Replace each `waitForTimeout` with an explicit `waitFor` assertion (AC: #1, #2)

  **Pattern A — Waiting for slash command popup (500ms timeouts):**
  ```ts
  // BEFORE (flaky)
  await page.keyboard.type('/file');
  await page.waitForTimeout(500);
  const fileOption = page.getByRole('button', { name: /^File Upload a file attachment/i });

  // AFTER (deterministic)
  await page.keyboard.type('/file');
  // Wait for slash command popup to appear
  const fileOption = page.getByRole('button', { name: /^File Upload a file attachment/i });
  await expect(fileOption).toBeVisible({ timeout: 5000 });
  ```

  **Pattern B — Waiting for upload to complete before checking download link (2000ms timeouts):**
  ```ts
  // BEFORE (flaky)
  await fileChooser.setFiles(tmpPath);
  await page.waitForTimeout(2000);
  const downloadLink = fileAttachment.locator('a[href]');
  await expect(downloadLink).toBeVisible({ timeout: 3000 });

  // AFTER (deterministic)
  await fileChooser.setFiles(tmpPath);
  // Wait for upload to fully complete — link only appears after S3 upload + DB write
  const downloadLink = fileAttachment.locator('a[href]');
  await expect(downloadLink).toBeVisible({ timeout: 10000 });
  ```

  **Pattern C — Waiting for Yjs sync after reload (2000ms timeouts in persist test):**
  ```ts
  // BEFORE (flaky)
  await expect(editor.locator('[data-file-attachment]')).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(2000); // "wait for Yjs sync"
  const fileName = await editor.locator('[data-file-attachment]').textContent();
  await page.waitForTimeout(2000); // "wait for Yjs sync" again before reload

  // AFTER (deterministic)
  const fileAttachment = editor.locator('[data-file-attachment]');
  // Wait until download link is present — confirms both upload + Yjs persistence are done
  await expect(fileAttachment.locator('a[href]')).toBeVisible({ timeout: 10000 });
  const fileName = await fileAttachment.textContent();
  // No need for additional timeout — link presence proves persistence
  ```

  **Pattern D — Editor click focus (300ms timeouts in helper functions):**
  ```ts
  // BEFORE (flaky)
  await editor.click();
  await page.waitForTimeout(300);

  // AFTER (deterministic)
  await editor.click();
  // Editor becomes interactive immediately after click; type directly
  // If slash command doesn't appear, the 5000ms waitFor on fileOption will catch it
  ```

- [ ] Task 3: Add comment blocks to each fixed test (AC: #2)
  - [ ] At the top of each test that had `waitForTimeout` calls, add:
    ```ts
    // What this tests: [brief description]
    // Why it was flaky: Fixed waitForTimeout(Xms) was insufficient when CI is under load or
    //   upload latency spikes. The race condition: setFiles() triggers async upload; a fixed
    //   delay cannot guarantee the POST /api/files response + React state update are complete.
    // Fix: replaced all fixed delays with explicit waitFor on [specific element] which only
    //   resolves when the UI confirms upload completion.
    ```

- [ ] Task 4: Run the spec 3 times consecutively to verify stability (AC: #1)
  - [ ] Use the `/e2e-test-runner` skill to run only the file-attachments spec:
    ```
    Run e2e/file-attachments.spec.ts specifically — repeat 3 times
    ```
  - [ ] All 3 runs must pass. If any run fails, investigate and fix before proceeding.

- [ ] Task 5: Run the full unit test suite to confirm no regressions (AC: #4)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm 0 failures (baseline is 0 after Story 7.0 is complete)

- [ ] Task 6: Save before/after failure counts for Story 7.5 (AC: #3)
  - [ ] Before count: 13 failures from `gauntlet_docs/baselines.md#Cat-5`
  - [ ] After count: 0 failures from `e2e/file-attachments.spec.ts`
  - [ ] Note the counts for Story 7.5 documentation

## Dev Notes

### Context

The `e2e/file-attachments.spec.ts` spec has **13 consistent failures** at baseline (captured 2026-03-12). All failures trace back to the same root cause: `page.waitForTimeout(N)` is used throughout the file to wait for:
1. The slash command popup to appear after typing `/file`
2. File uploads to complete (the `a[href]` download link to render)
3. Yjs sync to propagate before page reload

Fixed timeouts (300ms, 500ms, 1000ms, 2000ms) are unreliable because upload latency varies significantly between local dev (fast, in-memory) and CI (slower, real S3 or mock). Replacing them with `expect(...).toBeVisible({ timeout: N })` assertions makes the tests wait for the actual UI state change.

### Key File

`e2e/file-attachments.spec.ts` — 551 lines, 12 tests, all using `page.waitForTimeout()` extensively.

### Helper Function in Same File

The `createNewDocument()` helper at the top of the file also has some `waitForTimeout` calls (indirectly via helpers). These should be reviewed but are less likely to cause failures since they use `waitForFunction` and `expect(...).toBeVisible` for the critical paths.

### Upload State Confirmation Pattern

The most reliable indicator that an upload is complete is the presence of `a[href]` inside `[data-file-attachment]`. The download link is only rendered after:
1. `POST /api/files` returns 200 with a signed URL
2. React state updates `attachment.url`
3. The file attachment TipTap node re-renders

Use `await expect(editor.locator('[data-file-attachment] a[href]')).toBeVisible({ timeout: 10000 })` as the canonical "upload complete" gate.

### Tests That May Need Special Handling

- **"should validate file type"** — only checks that validation *happens*, not that an attachment appears. The existing logic is already tolerant. Check if this test has a `waitForTimeout` that can cause it to exit before an error dialog is processed.
- **"should reject files exceeding 1GB size limit"** — explicitly notes it "can't actually create a 1GB+ file" and falls back to a small file. This test has an `alertReceived` flag that depends on dialog timing. The `waitForTimeout(1000)` here is for dialog handling, which should be replaced with `page.waitForEvent('dialog')` if needed.
- **"should block dangerous executable files (.exe)"** — listens for `page.on('dialog', ...)`. The `await page.waitForTimeout(1000)` after `setFiles` should be replaced by waiting for the negative assertion with a reasonable timeout: `await expect(fileAttachment).not.toBeVisible({ timeout: 3000 })`.

### Commit Message

```
fix(tests): replace waitForTimeout with explicit waitFor assertions in file-attachments spec
```

### References

- [Source: gauntlet_docs/baselines.md#Cat-5] — 13 failures baseline
- [Source: e2e/file-attachments.spec.ts] — The spec to fix (551 lines, 12 tests)
- [Source: _bmad-output/planning-artifacts/epics.md#Story-7.1] — Story background

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `e2e/file-attachments.spec.ts` (modified — replace all `waitForTimeout` with explicit `waitFor` assertions)
