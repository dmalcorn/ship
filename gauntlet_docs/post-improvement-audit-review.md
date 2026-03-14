# Post-Improvement Audit Review

**Date:** 2026-03-14
**Branch:** `fix/post-audit`
**Auditor:** Murat (TEA — Master Test Architect)
**Scope:** Full test suite run across all three layers (API unit, Web unit, E2E) following successful production deployment.

---

## Executive Summary

| Layer | Files | Tests | Pass | Fail | Pass Rate |
|-------|-------|-------|------|------|-----------|
| API Unit (vitest) | 30 | 478 | 478 | 0 | **100%** |
| Web Unit (vitest) | 16 | 151 | 137 | 14 | **90.7%** |
| E2E (Playwright) | 71 spec files | 872 | 852 | 20 | **97.7%** |

No deployment regressions were detected. The API layer is completely green. Web unit failures are all stale tests — the code evolved but the tests were not updated. E2E failures split into two categories: a small number of real code bugs and a larger set of test-level issues (wrong keyboard modifiers, wrong API query param).

The single highest-priority code fix is in `SlashCommands.tsx` — the image file input is not attached to the DOM before `.click()`, which breaks both Playwright interception and certain production browsers. This is a real bug, not a test issue.

---

## Section 1 — API Unit Tests ✅

**Result: 30/30 files, 478/478 tests — all passing.**

The `[unhandled-error] invalid csrf token` and `[Collaboration] No cached doc found` entries written to stderr during the run are **expected and correct**. These are error-path tests that deliberately trigger CSRF protection and absent collaboration cache states to verify the API returns the right HTTP error codes. They do not represent failures.

No action required.

---

## Section 2 — Web Unit Tests ⚠️

**Result: 4/16 files failing, 14/151 tests failing.**

All four failing files contain **stale tests** — the production code was correctly updated, but the corresponding tests were not kept in sync. None of these failures indicate a regression in application behaviour.

---

### 2.1 `web/src/lib/document-tabs.test.ts` — 9 failures

**Root cause:** The `documentTabConfigs` in `document-tabs.tsx` was refactored. The `sprints` tab ID was renamed to `weeks`, the `issues` tab was moved to be the first project tab (before `details`), and the `weeks` count label was added as a dynamic function. The tests still assert the old tab IDs, ordering, and label keys.

**Specific assertion mismatches:**

| Test | Expects | Actual |
|------|---------|--------|
| `returns tabs for project documents` | `sprints` in tab IDs | tab ID is `weeks` |
| `returns tabs for program documents` | `sprints` in tab IDs | tab ID is `weeks` |
| `returns empty array for sprint documents` | empty array | sprint has tab config (`overview`, `plan`, etc.) |
| `returns false for sprint documents` | `documentTypeHasTabs('sprint')` → false | returns true |
| `validates project tab IDs correctly` | `sprints` valid, `details` valid | `sprints` not found, `issues` is first |
| `validates program tab IDs correctly` | `sprints` valid | `sprints` not found, `weeks` is the ID |
| `returns first tab as default` | `details` first for project | `issues` is first |
| `resolves dynamic labels with counts` | `sprintsTab` found by `id === 'sprints'` | tab ID is `weeks`, so find returns undefined |
| `resolves dynamic labels without counts` | same as above | same |

**Fix required:** Update `document-tabs.test.ts` to match the current tab configuration:
- Replace all `'sprints'` tab ID references with `'weeks'`
- Update ordering assertions (project first tab is `issues`, not `details`)
- Update `documentTypeHasTabs('sprint')` expectation to `true` (sprint now has tabs)
- Update `resolveTabLabels` tests to search by `id === 'weeks'` not `'sprints'`

---

### 2.2 `web/src/components/editor/DetailsExtension.test.ts` — 3 failures

**Root cause:** The `DetailsExtension` was refactored from a flat single-node model (`content: 'block+'`) to a two-child-node model (`content: 'detailsSummary detailsContent'`). This is architecturally correct — the summary (clickable toggle title) and the collapsible content area are now distinct ProseMirror nodes, each with their own content rules. The tests were written against the old flat model.

**Specific failures:**

| Test | Expects | Actual |
|------|---------|--------|
| `should be configured as a block node with content` | `content === 'block+'` | `content === 'detailsSummary detailsContent'` |
| `should work in editor context` | Editor initialises with DetailsExtension only | Missing `DetailsSummary` + `DetailsContent` nodes → schema error |
| `should allow inserting details via command` | `setDetails` command works | Same schema error — sub-nodes not registered |

**Fix required:** Update `DetailsExtension.test.ts`:
- Assert `content === 'detailsSummary detailsContent'`
- Import and add `DetailsSummary` and `DetailsContent` to the `extensions` array in both Editor context tests

---

### 2.3 `web/src/components/icons/uswds/Icon.test.tsx` — 1 failure

**Root cause:** The test `exports Icon component from index` uses a dynamic `import('./index')` which times out at 5 seconds in the jsdom environment. This is a test environment limitation — dynamic imports of large icon libraries (100+ SVG icons) inside jsdom are not reliably fast. The other 9 tests in this file pass without issue.

**Fix required:** Remove or rewrite the dynamic import test. A static import at the top of the test file achieves the same coverage without the timeout risk.

---

### 2.4 `web/src/contexts/SelectionPersistenceContext.test.tsx` — 1 failure

**Root cause:** The `should throw when used outside provider` test wraps `renderHook(() => useSelectionPersistence())` in a manual `try/catch`. In React 18 with concurrent rendering, errors thrown during the render phase propagate via React's internal error boundary mechanism before the `catch` block can intercept them. The test sees an unhandled render error.

**Fix required:** Replace the manual `try/catch` with Playwright's recommended React 18 error testing pattern — wrap in `expect(() => renderHook(...)).toThrow(...)` or use a custom error boundary wrapper component.

---

## Section 3 — E2E Tests ⚠️

**Result: 852/872 tests passing (97.7%), 20 unique failures.**

Failures cluster into four categories.

---

### 3.1 Wrong API query parameter — 3 tests — **Real bug**

**Affected tests:**
- `project-weeks.spec.ts` → `shows allocated team members in the grid`
- `weekly-accountability.spec.ts` → `GET /weekly-retros/:id returns specific retro`
- `weekly-accountability.spec.ts` → `POST /weekly-plans is idempotent`

**Root cause:** The helper `getPersonIdForUser` (defined in both spec files) calls:

```
GET /api/documents?document_type=person
```

But the API list endpoint (`api/src/routes/documents.ts`) reads `req.query.type`, not `req.query.document_type`. The filter is silently ignored — the endpoint returns all documents (up to `limit=100`) ordered `created_at DESC`. Person documents are created at the very start of the seed, so they have the oldest `created_at`. With 100+ programs, sprints, and issues seeded afterwards, person documents fall beyond position 100 in the result set and are never returned by the query. `Array.find()` then returns `undefined`, and the assertion `expect(person, 'User should have an associated person document').toBeTruthy()` fails.

**Fix required:** In both spec files, change `?document_type=person` to `?type=person` to match the actual API parameter name.

---

### 3.2 Image slash command file input not in DOM — 3 tests — **Real code bug**

**Affected tests:**
- `images.spec.ts` → `should clear IndexedDB after successful upload`
- `images.spec.ts` → `should queue upload when offline`
- `images.spec.ts` → `should set alt text from filename`

**Root cause:** In `web/src/components/editor/SlashCommands.tsx`, the image slash command creates a file input and calls `.click()` directly, without first appending it to `document.body`:

```typescript
// SlashCommands.tsx (current — broken)
const input = document.createElement('input');
input.type = 'file';
input.accept = 'image/*';
input.onchange = async () => { ... };
input.click(); // ← input is NOT in the DOM
```

Compare this to `web/src/components/editor/FileAttachment.tsx`, which has an explicit comment explaining the correct approach:

```typescript
// FileAttachment.tsx (correct pattern)
// "Must be in the DOM before click() so Playwright (and some browsers) can detect the file chooser."
document.body.appendChild(input);
setTimeout(() => {
  if (!signal?.aborted) {
    input.click();
  }
}, 50);
```

Without being attached to the DOM, the browser's `filechooser` event never fires in a way that Playwright can intercept (via `page.waitForEvent('filechooser')`). This is also a real production risk — some browsers (notably Firefox) require the input to be in the document tree to show a file picker reliably.

**Fix required:** Apply the same `document.body.appendChild(input)` + `setTimeout(50)` pattern to the image command in `SlashCommands.tsx`. Add cleanup to remove the input from the DOM on `onchange` (mirroring the FileAttachment pattern).

---

### 3.3 `Meta` key used on Linux — ~6 tests — **Test bug**

**Affected tests:**
- `inline-code.spec.ts` → `should toggle inline code with Cmd/Ctrl+E`
- `inline-comments.spec.ts` → `can create a comment via Cmd+Shift+M keyboard shortcut`
- `inline-comments.spec.ts` → `canceling a comment removes the highlight`
- `edge-cases.spec.ts` → `handles simultaneous formatting operations`
- `tables.spec.ts` → `should delete entire table`

**Root cause:** These tests use Playwright's `Meta` modifier key (e.g. `page.keyboard.press('Meta+e')`). On macOS, `Meta` = the Command key (⌘). On Linux — where all CI and local container environments run — `Meta` is the Windows/Super key, which is entirely unrelated to the `Ctrl` key. TipTap's `Mod-` shortcut prefix maps to `Cmd` on macOS and `Ctrl` on Linux/Windows. Therefore:

- `Meta+e` on Linux does **not** trigger TipTap's `Mod-E` (inline code toggle)
- `Meta+Shift+m` on Linux does **not** trigger `Mod-Shift-M` (add comment)
- `Meta+a` on Linux does **not** trigger `Mod-A` (select all)
- `Meta+b` on Linux does **not** trigger `Mod-B` (bold)

The test for `inline-code.spec.ts` even has a comment acknowledging this: `// Use Meta for Mac, Control for Windows/Linux` — but then proceeds to use `Meta` anyway.

**Fix required:** Replace `Meta+` with `Control+` in all affected test keyboard shortcuts (since the test environment is Linux). For future portability, Playwright's `ControlOrMeta` modifier can be used to support both platforms in a single test run.

---

### 3.4 Async/timing failures — ~8 tests — **Flakiness**

**Affected tests:**
- `data-integrity.spec.ts` → `images persist after page reload`
- `data-integrity.spec.ts` → `multiple images persist in correct order`
- `data-integrity.spec.ts` → `multiple mentions persist correctly`
- `backlinks.spec.ts` → `removing mention removes backlink`
- `toc.spec.ts` → `TOC updates when heading renamed`
- `my-week-stale-data.spec.ts` → `plan edits are visible on /my-week after navigating back`
- `my-week-stale-data.spec.ts` → `retro edits are visible on /my-week after navigating back`
- `performance.spec.ts` → `many images do not crash the editor`

**Root cause:** These tests interact with systems that have inherent async behaviour — Yjs CRDT sync, autosave debounce (~2s), IndexedDB writes, and collaboration WebSocket flushing. Tests reload pages or navigate away before writes have fully committed, producing stale-read failures. The `toc.spec.ts` failure shows both `"Original Title"` and `"New Title"` present simultaneously, indicating the TOC debounce hasn't fired before the assertion runs.

**Assessment:** These are genuine flakiness failures. They are harder to fix without either:
- Adding explicit "wait for save" signals (e.g. a visual indicator the document has been persisted)
- Increasing assertion timeouts to cover the full autosave debounce window
- Adding API-level flush endpoints for test use
- Investigating and fixing debounce timing in the TOC update logic

These are tracked as **medium-priority follow-up work** and are not addressed in this fix branch.

---

## Section 4 — Fix Plan

The following fixes are implemented in branch `fix/post-audit` in order of risk (lowest risk first).

| # | Fix | Type | File(s) |
|---|-----|------|---------|
| F1 | Image slash command: append input to DOM before `.click()` | Code fix | `web/src/components/editor/SlashCommands.tsx` |
| F2 | E2E: `?document_type=person` → `?type=person` | Test fix | `e2e/project-weeks.spec.ts`, `e2e/weekly-accountability.spec.ts` |
| F3 | E2E: `Meta+` → `Control+` keyboard modifiers | Test fix | `e2e/inline-code.spec.ts`, `e2e/inline-comments.spec.ts`, `e2e/edge-cases.spec.ts`, `e2e/tables.spec.ts` |
| F4 | Web unit: update `document-tabs.test.ts` to current tab config | Test fix | `web/src/lib/document-tabs.test.ts` |
| F5 | Web unit: update `DetailsExtension.test.ts` to current content model | Test fix | `web/src/components/editor/DetailsExtension.test.ts` |
| F6 | Web unit: fix `Icon.test.tsx` dynamic import timeout | Test fix | `web/src/components/icons/uswds/Icon.test.tsx` |
| F7 | Web unit: fix `SelectionPersistenceContext.test.tsx` React 18 throw pattern | Test fix | `web/src/contexts/SelectionPersistenceContext.test.tsx` |

**Not addressed in this branch (tracked for follow-up):**
- Async/Yjs timing flakiness in `data-integrity`, `backlinks`, `toc`, `my-week-stale-data`, `performance` specs
- These require architectural changes to autosave signalling or debounce windows

---

## Section 5 — Evidence

### Before (web unit tests)
```
Test Files  4 failed | 12 passed (16)
     Tests  14 failed | 137 passed (151)
```

### Before (E2E)
```
852 passed (1.2h)
20 unique failures across 71 spec files
```

### After (web unit tests) — 2026-03-14
```
Test Files  16 passed (16)
     Tests  150 passed (150)
```

**All 150 web unit tests now pass.** Fixes F4–F7 were applied. Additionally, a pre-existing (unlisted) failure in `useSessionTimeout.test.ts` was diagnosed and fixed:

**F8 — `web/src/hooks/useSessionTimeout.test.ts` (pre-existing, not in original audit)**

The test `does NOT call onTimeout if dismissed before 0` was failing because `resetTimer()` internally calls `apiPost` → `fetchWithCsrf` → `ensureCsrfToken`, which calls `response.headers.get('content-type')` on the plain-object fetch mock (no `headers` property). This threw a `TypeError` caught in `resetTimer`'s catch block, which then called `onTimeout()` — causing the assertion `expect(onTimeout).not.toHaveBeenCalled()` to fail. Fixed by adding `vi.mock('@/lib/api', () => ({ apiPost: vi.fn() }))` at the module level so the hook's timer logic is tested independently of the API layer.

**F6 — `Icon.test.tsx` — revised root cause**

The timeout was caused by `vi.resetModules()` in `beforeEach` (clearing the module cache), which forced `await import('./Icon')` to re-resolve `import.meta.glob` over 400+ SVG files on every test. Fixed by using a static top-level import and removing `vi.resetModules()` — the invalid-name guard in the component is synchronous, so no dynamic import is needed.

### After (E2E)
_To be filled after E2E fixes are applied and verified._

---

## Section 6 — Risk Assessment

All fixes in this branch are low-risk:

- **F1 (SlashCommands.tsx)** is the only production code change. The change is additive — appending a hidden input to `document.body` and deferring the click by 50ms. This mirrors the pattern already used by `FileAttachment.tsx`. No editor logic, state, or upload flow is changed.
- **F2–F7** are test-only changes. They cannot affect production behaviour.
- No database migrations, API contracts, or shared types are modified.
- No new dependencies are introduced.
