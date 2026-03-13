# File-Attachment Fix: Documentation Update Checklist

## Background

The 13 `file-attachments.spec` E2E test failures were misdiagnosed as an infrastructure gap (S3 not configured in testcontainers). The actual root cause was a one-line frontend bug: `triggerFileUpload()` in `web/src/components/editor/FileAttachment.tsx` created an `<input type="file">` element dynamically and clicked it **without ever attaching it to the DOM**. Playwright's `waitForEvent('filechooser')` only fires for file inputs that are part of the live DOM — a detached element clicking itself is invisible to Playwright's event listener, causing all 13 tests to time out.

**The fix** (already applied to `fix/test-coverage` branch):
```typescript
// Must be in the DOM before click() so Playwright (and some browsers) can detect the file chooser
document.body.appendChild(input);
input.click();
```
The input is removed in the `onchange` handler after the file is selected.

No S3, no LocalStack, no devcontainer changes were needed. The app's existing local dev path (`/api/files/:id/local-upload`) already handles file storage without AWS when `NODE_ENV !== 'production'`.

---

## Checklist

### Step 1 — Run the tests (get new evidence)
- [ ] Run E2E test suite and capture new `test-results/summary.json`
- [ ] Confirm all 13 `file-attachments.spec` tests now pass
- [ ] Record the new total pass/fail numbers for use in Steps 2–6

---

### Step 2 — Update the improvement doc (primary artifact)
**File:** `gauntlet_docs/improvements/cat5-test-coverage.md`

- [ ] Remove the "pre-existing infra gap — S3 not available in testcontainers" language
- [ ] Update root cause to: detached DOM input not detectable by Playwright
- [ ] Update the after-evidence table to show `0` file-attachment failures (was 13)
- [ ] Update the overall pass rate numbers to reflect 13 additional passing tests

---

### Step 3 — Update the baselines doc
**File:** `gauntlet_docs/baselines.md`

- [ ] Update the file-attachments row from `Pre-existing (upload timing/filechooser)` to reflect the true root cause
- [ ] Update the before/after comparison rows to show 13 → 0 file-attachment failures

---

### Step 4 — Update the story file
**File:** `_bmad-output/implementation-artifacts/7-1-fix-file-attachments-spec-flakiness.md`

- [ ] Mark story as done
- [ ] Document the actual fix: `document.body.appendChild(input)` before `input.click()`
- [ ] Correct the root cause analysis — not S3, not testcontainers; detached DOM element
- [ ] Update acceptance criteria outcomes to reflect all 13 tests now passing

---

### Step 5 — Update the Cat 5 after-evidence doc
**File:** `_bmad-output/implementation-artifacts/7-5-cat-5-after-evidence-and-improvement-documentation.md`

- [ ] Update pass rate to reflect 13 additional passing tests
- [ ] Update the summary/measurement section with new `test-results/summary.json` numbers
- [ ] Confirm the category 5 target is now fully met

---

### Step 6 — Other planning docs (minor updates)
- [ ] **`_bmad-output/planning-artifacts/epics.md`** — confirm NFR5 (≥99% pass rate) is now met given the 13 additional passes
- [ ] **`_bmad-output/planning-artifacts/analyst-discovery-report.md`** — update the "strategy for file-attachment cluster" section to reflect the resolved root cause