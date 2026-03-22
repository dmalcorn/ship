# E2E Test Audit — Violations of testing-e2e-guide.md

**Date:** 2026-03-22
**Scope:** All files in `e2e/*.spec.ts` audited against recommendations in `gauntlet_docs/testing-e2e-guide.md`

---

## Summary

| Violation Category | Occurrences | Files Affected |
|---|---:|---:|
| `waitForTimeout()` as synchronization | 601 | 50 |
| `.isVisible().catch(() => false)` silent swallowing | 40 | 8 |
| `.isVisible()` point-in-time checks (no auto-retry) | 86 | 20 |
| `keyboard.type('@')` without `triggerMentionPopup` helper | 25 | 9 |
| `test.slow()` used as first resort | 4 | 1 |
| `test.fixme()` usage (should exist, found none) | 0 | 0 |
| CSS selectors instead of `getByRole()` | 753 | 71 |
| `new Date()` (local time) in test/fixture code | 10 | 3 |
| `mode: 'serial'` configured (correctly used) | — | 2 |
| `test.skip(true, ...)` conditional skip for missing data | 0 | 0 |

---

## 1. `waitForTimeout()` — 601 occurrences across 50 files (CRITICAL)

**Guide rule:** "Use auto-retrying assertions instead of `waitForTimeout(N)` as synchronization."

This is the most widespread violation. The worst offenders:

| File | Count |
|------|------:|
| `tables.spec.ts` | 52 |
| `features-real.spec.ts` | 36 |
| `backlinks.spec.ts` | 34 |
| `drag-handle.spec.ts` | 33 |
| `toc.spec.ts` | 32 |
| `data-integrity.spec.ts` | 32 |
| `toggle.spec.ts` | 27 |
| `emoji.spec.ts` | 24 |
| `performance.spec.ts` | 22 |
| `accessibility-remediation.spec.ts` | 22 |
| `edge-cases.spec.ts` | 20 |
| `inline-code.spec.ts` | 18 |
| `race-conditions.spec.ts` | 16 |
| `bulk-selection.spec.ts` | 16 |
| `autosave-race-conditions.spec.ts` | 16 |
| `inline-comments.spec.ts` | 15 |
| `file-attachments.spec.ts` | 15 |
| `syntax-highlighting.spec.ts` | 13 |
| `issue-display-id.spec.ts` | 13 |
| `document-isolation.spec.ts` | 13 |
| *(30 more files with 1–10 each)* | |

**Risk:** These are the primary source of flaky tests. Under CI load, fixed delays are unreliable.

---

## 2. `.isVisible().catch(() => false)` — 40 occurrences across 8 files (HIGH)

**Guide rule:** "Wait for the element, then interact — don't silently swallow visibility checks."

| File | Count |
|------|------:|
| `program-mode-week-ux.spec.ts` | 28 |
| `weeks.spec.ts` | 2 |
| `features-real.spec.ts` | 2 |
| `admin-workspace-members.spec.ts` | 2 |
| `accessibility-remediation.spec.ts` | 2 |
| `fleetgraph-use-cases.spec.ts` | 2 |
| `drag-handle.spec.ts` | 1 |
| `check-aria.spec.ts` | 1 |

**Risk:** Tests pass regardless of whether the element is actually visible. Bugs in rendering or navigation can be silently masked.

---

## 3. `.isVisible()` point-in-time checks (without auto-retry) — 86 occurrences across 20 files (MEDIUM)

**Guide rule:** "Wait for the positive condition directly. Point-in-time checks on async state are unreliable."

These use `await el.isVisible()` (a snapshot check) instead of `await expect(el).toBeVisible()` (auto-retrying).

Worst offenders:
- `program-mode-week-ux.spec.ts` — 30
- `context-menus.spec.ts` — 10
- `admin-workspace-members.spec.ts` — 8
- `mentions.spec.ts` — 8
- `accessibility-remediation.spec.ts` — 6

---

## 4. `keyboard.type('@')` without `triggerMentionPopup` helper — 25 occurrences across 9 files (MEDIUM)

**Guide rule:** "Use `triggerMentionPopup(page, editor)` helper — mention popup typed once without retry is an anti-pattern."

| File | Count |
|------|------:|
| `mentions.spec.ts` | 13 |
| `features-real.spec.ts` | 3 |
| `data-integrity.spec.ts` | 3 |
| `error-handling.spec.ts` | 1 |
| `edge-cases.spec.ts` | 1 |
| `security.spec.ts` | 1 |
| `real-integration.spec.ts` | 1 |
| `race-conditions.spec.ts` | 1 |
| `backlinks.spec.ts` | 1 |

Note: `backlinks.spec.ts` uses the helper in 5 places but still has 1 raw `keyboard.type('@')` call.

---

## 5. `test.slow()` as first resort — 4 occurrences in 1 file (LOW)

**Guide rule:** "Don't add `test.slow()` as a first resort — fix timing patterns first."

All 4 occurrences are in `document-workflows.spec.ts` (lines 61, 92, 137, 190), each with the comment `// 3x timeout for dev server`. This suggests the tests are designed for a dev-server fixture where slowness is expected, but the guide recommends fixing timing patterns instead.

---

## 6. No `test.fixme()` usage found (LOW)

**Guide rule:** "Use `test.fixme()` instead of empty test bodies."

No `test.fixme()` calls were found. This could mean either:
- All tests are implemented (good), or
- Empty/stub tests exist without proper marking (bad — but the separate `TODO` search found none)

No empty test bodies or TODO-only tests were found, so this is clean.

---

## 7. CSS selectors vs `getByRole()` — 753 occurrences across 71 files (LOW-MEDIUM)

**Guide rule:** "Prefer `getByRole()` over CSS selectors."

753 uses of `page.locator()` with CSS selectors (`.class`, `#id`, `[attr]`) across virtually all spec files. This is pervasive and likely impractical to fix wholesale, but new tests should prefer role-based selectors.

---

## 8. `new Date()` (local time) in test code — 10 occurrences across 3 files (LOW)

**Guide rule:** "Seed data should always use UTC date math. Use `Date.UTC()` and `getUTC*()` methods."

| File | Line(s) | Context |
|------|---------|---------|
| `session-timeout.spec.ts` | 270, 646, 831, 898, 928, 1004 | `lastActivity: new Date().toISOString()` |
| `accountability-standup.spec.ts` | 28 | `new Date().getUTCDay()` (actually uses UTC — OK) |
| `fleetgraph-use-cases.spec.ts` | 33, 41 | `new Date().toISOString()` in mock data |
| `fixtures/isolated-env.ts` | 337 | `const nowUtc = new Date()` |

**Note:** `new Date().toISOString()` always returns UTC, so the `session-timeout.spec.ts` and `fleetgraph-use-cases.spec.ts` uses are technically safe. The `accountability-standup.spec.ts` usage explicitly calls `getUTCDay()`. The `isolated-env.ts` variable is named `nowUtc`. These are mostly false positives — **no actual local-time violations found**.

---

## 9. Import from `@playwright/test` instead of `./fixtures/isolated-env` (CLEAN)

**Guide rule:** "Import test/expect from the isolated-env fixture."

Only 1 file imports from `@playwright/test` directly: `critical-blockers.spec.ts` — and it only imports the `Page` type (not `test`/`expect`), which is fine.

---

## 10. Hover without table stabilization (NOT AUDITED IN DETAIL)

**Guide rule:** "Use `waitForTableData(page)` then `hoverWithRetry()`."

114 raw `.hover()` calls found across 7 files. Only `bulk-selection.spec.ts` uses the `hoverWithRetry` helper (3 uses). The `drag-handle.spec.ts` (14 raw hovers) and `tooltips.spec.ts` (5 raw hovers) are likely candidates for flakiness.

---

## Recommendations (Priority Order)

1. **`waitForTimeout` elimination** — Largest flakiness risk. Start with `tables.spec.ts` (52), `features-real.spec.ts` (36), and `backlinks.spec.ts` (34). Replace with `expect().toBeVisible()`, `waitForResponse()`, or `toPass()` patterns.

2. **`.isVisible().catch(() => false)` removal** — Focus on `program-mode-week-ux.spec.ts` (28 occurrences). Replace with `expect(el).toBeVisible()` or proper conditional waiting.

3. **`triggerMentionPopup` adoption** — `mentions.spec.ts` (13 raw calls) should be the first file converted since it's the mention-focused test suite.

4. **`hoverWithRetry` + `waitForTableData` adoption** — Convert hover-heavy files like `drag-handle.spec.ts` and `bulk-selection.spec.ts`.

5. **CSS selector → `getByRole()` migration** — Tackle incrementally as tests are touched for other fixes. Not worth a bulk rewrite.
