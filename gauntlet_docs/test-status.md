# Test Status

Last updated: 2026-03-21

---

## Overview

| Category | Tests | Files | Passed | Failed | How to Run |
|----------|------:|------:|-------:|-------:|------------|
| API unit tests | 492 | 31 | 492 | 0 | `pnpm test` |
| Web unit tests | 230 | 25 | 230 | 0 | `cd web && npx vitest run` |
| FleetGraph tests | 92 | 6 | 92 | 0 | `cd fleetgraph && npx vitest run` |
| E2E tests (all) | 880 | 72 | — | — | `pnpm test:e2e` |
| **Total** | **1,694** | **134** | — | — | — |

---

## Running Unit Tests

Unit tests are fast (seconds to a few minutes) and can be run freely.

```bash
pnpm test                              # API unit tests (vitest)
cd web && npx vitest run               # Web unit tests (vitest)
cd fleetgraph && npx vitest run        # FleetGraph tests (vitest)
```

All three suites require no special setup beyond a running PostgreSQL instance (API tests only).

---

## Running E2E Tests

E2E tests use Playwright with per-worker isolation (each worker gets its own PostgreSQL container, API server, and Vite preview server). A full run takes **~1 hour** with 2 workers.

### Running the Full Suite

```bash
pnpm test:e2e           # All 880 tests (chromium project)
pnpm test:e2e:headed    # Same, but with visible browser
pnpm test:e2e:ui        # Playwright UI mode (interactive)
pnpm test:e2e:all       # All projects (runs every category project — use for matrix validation)
```

### Running by Category

Tests are organized into 8 Playwright projects so you can run targeted subsets instead of the full suite. Use these when iterating on a specific area or when a full run is too slow.

| Command | Project | Tests | Files | Runtime |
|---------|---------|------:|------:|--------:|
| `pnpm test:e2e:ui-tests` | ui | ~229 | 16 | TBD |
| `pnpm test:e2e:data` | data | ~155 | 17 | TBD |
| `pnpm test:e2e:security` | security | 110 | 5 | TBD |
| `pnpm test:e2e:content` | content | 109 | 11 | TBD |
| `pnpm test:e2e:integration` | integration | ~103 | 12 | TBD |
| `pnpm test:e2e:a11y` | a11y | ~69 | 4 | TBD |
| `pnpm test:e2e:api` | api | ~32 | 4 | TBD |
| `pnpm test:e2e:perf` | perf | 15 | 1 | TBD |

**Runtime column:** Update after running each category to build a time baseline. Runtime depends on worker count and host machine — record the worker count alongside.

You can also combine multiple projects in a single run:

```bash
npx playwright test --project=api --project=security   # Run two categories together
npx playwright test --project=content --project=perf    # Mix and match as needed
```

### What's in Each Category

| Project | What it covers | Heaviest spec files |
|---------|---------------|---------------------|
| **ui** | Front-end interactions, navigation, drag-and-drop, admin views | bulk-selection (85), program-mode-week-ux (66) |
| **content** | Editor features — mentions, tables, images, code blocks, backlinks | mentions (17), tables (14), file-attachments (14) |
| **data** | CRUD, data persistence, document relationships, invites | workspaces (21), private-documents (20), programs (16) |
| **security** | Auth, session timeout, RBAC, cross-workspace isolation | session-timeout (58), security (19), authorization (17) |
| **a11y** | WCAG 2.2 AA, axe-core audits, ARIA, color contrast | accessibility-remediation (57), accessibility (11) |
| **perf** | Load times, memory usage, typing latency | performance (15) |
| **api** | REST endpoint validation (AI analysis, search, file upload, feedback) | request-changes-api (13), ai-analysis-api (11) |
| **integration** | End-to-end workflows, race conditions, caching, FleetGraph | features-real (24), race-conditions (10), fleetgraph-use-cases (8) |

### Tips

- **Start small:** When debugging a failure, run just that category instead of the full suite.
- **Worker count matters:** Set `PLAYWRIGHT_WORKERS=N` to control parallelism. More workers = faster but more RAM (~500MB each).
- **Retries:** 1 retry locally, 2 in CI. Flaky tests often pass on retry.
- **Single file:** You can always run a single spec directly: `npx playwright test e2e/auth.spec.ts`
- **Debug files:** `debug-create.spec.ts` and `spike-isolated.spec.ts` are not in any category project — they only run via the default `chromium` project or by name.

---

## E2E Test Results (Last Full Run)

**Date:** 2026-03-17
**Workers:** 2
**Runtime:** ~1.1 hours (initial run); ~6 min (targeted rerun)
**Pass rate:** 98.6% (860 / 872) — up from 97.8% after fixes
**Environment:** Devcontainer (see `test-prerequisites.md` for setup requirements)

### Summary

| Outcome | Count | Change |
|---------|------:|--------|
| Passed | 860 | +7 |
| Failed (after retries) | 6 | -7 |
| Flaky (passed on retry) | 6 | — |

### Fixes Applied

#### `programs.spec.ts` — 7 tests fixed (all now pass)

**Root cause:** The `beforeEach` hook had a 5s timeout on `expect(page).not.toHaveURL('/login')` and no wait for the app to fully load. When a worker's containers were slow to warm up, the login succeeded but subsequent page navigation consumed the remaining 60s test timeout.

**Fix:** Increased the login URL check timeout from 5s to 15s and added `page.waitForLoadState('networkidle')` after login to ensure the app is fully loaded before each test runs.

**Verification:** All 16 tests in `programs.spec.ts` pass (including the 7 that previously failed consistently).

#### `data-integrity.spec.ts` — 2 tests still fail (see Unfixable section below)

**Partial fix applied:** Switched image upload from unreliable `page.waitForEvent('filechooser')` (CDP event) to `setInputFiles()` on `body > input[type="file"]` — same pattern that fixed `file-attachments.spec.ts`. Added explicit "Saved" indicator wait before reload. Image upload now works correctly in the editor.

**Still failing because:** Content is visible in the editor before reload but missing after reload. Root cause is Yjs persistence lag (see below).

---

### Remaining Failed Tests (6)

#### `data-integrity.spec.ts` — 2 failures

| Test | Error |
|------|-------|
| multiple images persist in correct order | 2 images visible pre-reload, 0 after reload |
| multiple mentions persist correctly | 2 mentions visible pre-reload, 0 after reload |

**Root cause:** Yjs persistence lag (see Unfixable Issues below).

#### `admin-workspace-members.spec.ts` — 1 failure

| Test | Error |
|------|-------|
| back button returns to admin dashboard | `expect(page).toHaveURL(".../admin")` — navigation did not complete within timeout |

**Root cause:** Navigation timing. The back button click triggers a route change that doesn't settle within the assertion timeout.

#### `backlinks.spec.ts` — 1 failure

| Test | Error |
|------|-------|
| removing mention removes backlink | Test timeout of 60000ms exceeded |

**Root cause:** The test deletes a mention, then waits for a `/links` POST response and navigates to verify the backlink is removed. The link sync POST is debounced and the full round-trip exceeds 60s.

#### `my-week-stale-data.spec.ts` — 1 failure

| Test | Error |
|------|-------|
| plan edits are visible on /my-week after navigating back | Test timeout of 60000ms exceeded |

**Root cause:** Yjs persistence lag. The test file itself documents this as `KNOWN FLAKY`.

#### `performance.spec.ts` — 1 failure

| Test | Error |
|------|-------|
| memory does not grow unbounded during editing | `page.goto` timed out in beforeEach |

**Root cause:** Infrastructure-level timeout. The worker's servers were slow during this particular test's execution window.

---

### Flaky Tests (6)

These tests failed on the first attempt but passed on retry.

| Spec | Test |
|------|------|
| `bulk-selection.spec.ts` | can select cards across multiple columns |
| `issue-estimates.spec.ts` | shows estimate field in issue editor properties |
| `programs.spec.ts` | program list shows issue and sprint counts |
| `programs.spec.ts` | can navigate between programs using sidebar |
| `project-weeks.spec.ts` | project link in Properties sidebar navigates back to project |
| `weekly-accountability.spec.ts` | Allocation grid shows person with assigned issues and plan/retro status |

---

## Unfixable Issues: Yjs Persistence Lag

Three of the remaining 6 failures (`data-integrity` x2, `my-week-stale-data` x1) share the same root cause that **cannot be fixed in the test layer**.

### The Problem

The TipTap editor uses Yjs CRDTs synced over WebSocket to the collaboration server. The persistence pipeline is:

```
Editor change → Yjs doc update → WebSocket sync → Collaboration server
  → "Saved" indicator shown to user (WebSocket acknowledged)
  → Async: collaboration server writes Yjs state to PostgreSQL `yjs_state` column
  → Async: collaboration server converts Yjs state to JSON and writes to `content` column
```

When a test does `page.reload()`, the browser fetches the document from the API, which reads the `content` column. If the async DB write hasn't completed, the reloaded page shows stale content — missing images, missing mentions, missing edits.

### Why Test-Layer Fixes Don't Work

- **"Saved" indicator is misleading:** It fires when the WebSocket sync completes, not when the DB write finishes. Waiting for "Saved" is necessary but not sufficient.
- **Arbitrary wait times are unreliable:** We tested 3s, 5s waits — the DB write timing is unpredictable and varies by server load. Any fixed timeout will be either too short (flaky) or too long (slow tests).
- **No "flushed to DB" signal exists:** The collaboration server doesn't expose an endpoint or event that confirms the content column has been updated.

### What Would Fix It

A proper fix requires changes to the collaboration server (`api/src/collaboration/`):

1. **Option A — Expose a flush endpoint:** Add `POST /api/collaboration/flush/:docId` that forces an immediate Yjs-to-DB write and returns when complete. Tests call this before reloading.
2. **Option B — Expose persistence status via WebSocket:** The collaboration server sends a `persisted` message after the DB write. The "Saved" indicator in the UI would only show after this message.
3. **Option C — Synchronous persistence mode for tests:** When `NODE_ENV=test`, make the DB write synchronous (block the WebSocket ack until the write completes).

Until one of these is implemented, these tests will remain flaky. The `my-week-stale-data.spec.ts` file already documents this with a `KNOWN FLAKY` comment.
