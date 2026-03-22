# Test Status

Last updated: 2026-03-22

---

## Overview

| Category | Tests | Files | Passed | Failed | How to Run |
|----------|------:|------:|-------:|-------:|------------|
| API unit tests | 492 | 31 | 492 | 0 | `pnpm test` |
| Web unit tests | 230 | 25 | 230 | 0 | `cd web && npx vitest run` |
| FleetGraph tests | 79 | 6 | 79 | 0 | `cd fleetgraph && npx vitest run` |
| E2E tests (all) | 870 | 72 | 864 | 6 | `pnpm test:e2e` |
| **Total** | **1,671** | **134** | **1,665** | **6** | — |

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
| `pnpm test:e2e:ui-tests` | ui | 275 | 16 | 10.8m (2 workers) — 3 flaky (passed on retry) |
| `pnpm test:e2e:data` | data | 153 | 17 | 8.9m (2 workers) — 2 failed (Yjs persistence lag) |
| `pnpm test:e2e:security` | security | 110 | 5 | 5.0m (2 workers) |
| `pnpm test:e2e:content` | content | 107 | 11 | 8.2m (2 workers) |
| `pnpm test:e2e:integration` | integration | 107 | 12 | 13.4m (2 workers) — 4 failed (FleetGraph no-service), 1 flaky (Yjs lag) |
| `pnpm test:e2e:a11y` | a11y | 76 | 4 | 4.5m (2 workers) |
| `pnpm test:e2e:api` | api | 31 | 4 | 4.0m (2 workers) |
| `pnpm test:e2e:perf` | perf | 14 | 1 | 4.7m (2 workers) |

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

## E2E Test Results — By-Category Run

**Date:** 2026-03-22
**Workers:** 2
**Total runtime:** ~59.5 minutes (sum of all categories)
**Total tests run:** 870
**Pass rate:** 99.3% (864 / 870)
**Environment:** Devcontainer

### Summary

| Outcome | Count |
|---------|------:|
| Passed | 864 |
| Failed (after retries) | 6 |
| Flaky (passed on retry) | 7 |

### Category Results

| Category | Passed | Failed | Flaky | Runtime |
|----------|-------:|-------:|------:|--------:|
| api | 31 | 0 | 0 | 4.0m |
| perf | 14 | 0 | 0 | 4.7m |
| a11y | 76 | 0 | 0 | 4.5m |
| integration | 102 | 4 | 1 | 13.4m |
| content | 107 | 0 | 0 | 8.2m |
| security | 110 | 0 | 0 | 5.0m |
| data | 151 | 2 | 0 | 8.9m |
| ui | 275 | 0 | 3 | 10.8m |
| **Total** | **866** | **6** | **4** | **59.5m** |

### Remaining Failed Tests (6)

#### `fleetgraph-use-cases.spec.ts` — 4 failures (integration)

| Test | Error |
|------|-------|
| UC1: Unassigned issues — proactive detection | FleetGraph service not running in test env |
| UC2: Empty active sprint — proactive detection | FleetGraph service not running in test env |
| UC3: Duplicate issues — proactive detection | FleetGraph service not running in test env |
| UC5: Unowned security issues — critical severity | FleetGraph service not running in test env |

**Root cause:** These tests require a running FleetGraph service (`FLEETGRAPH_SERVICE_URL`), which is not available in the E2E test environment.

#### `data-integrity.spec.ts` — 2 failures (data)

| Test | Error |
|------|-------|
| multiple images persist in correct order | 2 images visible pre-reload, 0 after reload |
| multiple mentions persist correctly | 2 mentions visible pre-reload, 0 after reload |

**Root cause:** Yjs persistence lag (see Unfixable Issues below).

---

### Flaky Tests (7)

These tests failed on first attempt but passed on retry.

| Category | Spec | Test |
|----------|------|------|
| integration | `my-week-stale-data.spec.ts` | plan edits visible after navigating back (Yjs lag) |
| ui | `issues-bulk-operations.spec.ts` | can archive an issue via context menu |
| ui | `status-overview-heatmap.spec.ts` | displays split cells for plan/retro status |
| ui | `weekly-accountability.spec.ts` | Allocation grid shows person with assigned issues |

### Previous Run (2026-03-17)

The previous full run had 6 failures and 6 flaky tests. Key improvements since then:
- `admin-workspace-members.spec.ts` back button — no longer failing
- `backlinks.spec.ts` removing mention — no longer failing
- `performance.spec.ts` memory test — no longer failing
- `my-week-stale-data.spec.ts` — downgraded from hard failure to flaky (passes on retry)

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
