# E2E Testing Guide — Consolidated

This document consolidates all tips, tricks, and lessons learned for running E2E tests in this repository. It is organized into two sections: guidance from the original Ship repo and guidance discovered/created during local development.

Last updated: 2026-03-22

---

## Table of Contents

- [Quick Start Checklist](#quick-start-checklist)
- [Part 1: Original Repo Guidance](#part-1-original-repo-guidance)
  - [Testing Stack](#testing-stack)
  - [Running E2E Tests](#running-e2e-tests)
  - [Database Isolation (Testcontainers)](#database-isolation-testcontainers)
  - [Authentication Fixtures](#authentication-fixtures)
  - [E2E Test Patterns](#e2e-test-patterns)
  - [Fixtures](#fixtures)
  - [Screenshots and Traces](#screenshots-and-traces)
  - [Progress Monitoring](#progress-monitoring)
  - [CI Configuration](#ci-configuration)
  - [Known Issues (Original)](#known-issues-original)
  - [Vite Dev Memory Explosion](#vite-dev-memory-explosion)
- [Part 2: Local Development Discoveries](#part-2-local-development-discoveries)
  - [Environment Prerequisites](#environment-prerequisites)
  - [IPv6/IPv4 Network Binding Fix](#ipv6ipv4-network-binding-fix)
  - [E2E Test Categories](#e2e-test-categories)
  - [Flakiness Guide (AGENTS.md)](#flakiness-guide-agentsmd)
  - [Fixes Applied](#fixes-applied)
  - [Known Remaining Failures](#known-remaining-failures)
  - [Unfixable Issues: Yjs Persistence Lag](#unfixable-issues-yjs-persistence-lag)

---

## Quick Start Checklist

Before running E2E tests, verify these prerequisites:

```bash
# 1. Docker is accessible
docker info 2>&1 | grep "Server Version"
# If not accessible: sudo chmod 666 /var/run/docker.sock

# 2. No stale lock files
sudo rm -f /tmp/testcontainers-node.lock

# 3. Run tests (use 2-4 workers)
PLAYWRIGHT_WORKERS=2 pnpm test:e2e

# Or run a single category
pnpm test:e2e:security
```

---

# Part 1: Original Repo Guidance

Sources: `docs/claude-reference/testing.md`, `docs/claude-reference/gotchas.md`, `docs/solutions/performance-issues/vite-dev-memory-explosion-parallel-tests.md`

## Testing Stack

| Layer | Framework | Config | Files |
|-------|-----------|--------|-------|
| Unit (API) | Vitest | `api/vitest.config.ts` | `api/src/**/*.test.ts` |
| Unit (Web) | Vitest + jsdom | `web/vitest.config.ts` | `web/src/**/*.test.ts` |
| E2E | Playwright | `playwright.config.ts` | `e2e/*.spec.ts` |

Setup files:
- API: `api/src/test/setup.ts` — cleans database before tests
- Web: `web/src/test/setup.ts` — imports `@testing-library/jest-dom`

## Running E2E Tests

**Use the `/e2e-test-runner` skill when running from Claude Code.** Never run `pnpm test:e2e` directly — it outputs 600+ test results and crashes Claude Code.

The skill handles:
- Running tests in background
- Progress polling via `test-results/summary.json`
- `--last-failed` for iterative fixing

```bash
# From the command line (outside Claude Code), these are fine:
pnpm test:e2e              # All tests (chromium project)
pnpm test:e2e:headed       # With visible browser
pnpm test:e2e:ui           # Playwright UI mode (interactive)

# Single file
npx playwright test e2e/auth.spec.ts
```

## Database Isolation (Testcontainers)

Each Playwright worker gets fully isolated infrastructure:

```
Worker N:
  - PostgreSQL container (dynamic port)
  - API server (built dist, dynamic port)
  - Vite preview server (dynamic port)
  - Browser instance
```

Memory per worker: ~500MB (150MB Postgres + 100MB API + 50MB Preview + 200MB Browser)

The system auto-calculates a safe worker count based on available memory (keeps 2GB free) and CPU cores. Override with:

```bash
PLAYWRIGHT_WORKERS=2 pnpm test:e2e
```

## Authentication Fixtures

E2E tests use seed data credentials:

```
Email: dev@ship.local
Password: admin123
```

Login pattern used in most E2E tests:

```typescript
test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.locator('#email').fill('dev@ship.local')
  await page.locator('#password').fill('admin123')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).not.toHaveURL('/login', { timeout: 5000 })
})
```

## E2E Test Patterns

**Import test/expect from the isolated-env fixture:**

```typescript
import { test, expect } from './fixtures/isolated-env'
```

**Wait for API responses instead of using fixed delays:**

```typescript
await page.waitForResponse(resp =>
  resp.url().includes('/api/documents/') && resp.request().method() === 'PATCH'
)
```

**Use auto-retrying assertions:**

```typescript
// BAD
await page.waitForTimeout(500)
await expect(element).toBeVisible()

// GOOD
await expect(element).toBeVisible({ timeout: 10000 })
```

## Fixtures

### isolated-env.ts (Worker-Scoped)

Provides complete isolation per worker. See `e2e/fixtures/isolated-env.ts`:

| Fixture | Scope | Purpose |
|---------|-------|---------|
| `dbContainer` | worker | PostgreSQL via testcontainers |
| `apiServer` | worker | Built API on dynamic port |
| `webServer` | worker | Vite preview on dynamic port |
| `baseURL` | test | Web server URL for navigation |

### dev-server.ts (Lightweight)

For quick local iteration — connects to already-running servers:

```typescript
// Requires: pnpm dev running in another terminal
const API_PORT = process.env.TEST_API_PORT || '3000'
const WEB_PORT = process.env.TEST_WEB_PORT || '5173'
```

## Screenshots and Traces

Configured in `playwright.config.ts`:

```typescript
use: {
  trace: 'on-first-retry',
  screenshot: 'only-on-failure',
}
```

- Screenshots saved on failure to `test-results/`
- Traces saved on first retry for debugging

## Progress Monitoring

E2E tests write progress to `test-results/`:

| File | Purpose |
|------|---------|
| `progress.jsonl` | Per-test status updates |
| `summary.json` | Total/passed/failed counts |
| `errors/*.log` | Detailed error output |

See `e2e/progress-reporter.ts` for implementation.

## CI Configuration

In CI (`process.env.CI`):
- 4 workers (CI runners have good resources)
- 2 retries on failure
- GitHub reporter for annotations
- HTML report (never opens)

## Known Issues (Original)

### Empty Tests Pass Silently

Tests with only TODO comments pass without running assertions.

```typescript
// WRONG — silently passes
test('my test', async ({ page }) => {
  // TODO: implement
});

// RIGHT — shows as 'fixme' in report
test.fixme('my test', async ({ page }) => {
  // TODO: implement
});
```

Pre-commit hook `scripts/check-empty-tests.sh` catches these.

### Seed Data Requirements

When writing E2E tests that require specific data:

1. **Always** update `e2e/fixtures/isolated-env.ts` to create required data
2. **Never** use conditional `test.skip()` for missing data — use assertions with clear messages:

```typescript
// BAD: skips silently
if (rowCount < 4) { test.skip(true, 'Not enough rows'); return; }

// GOOD: fails with actionable message
expect(rowCount, 'Seed data should provide at least 4 issues. Run: pnpm db:seed')
  .toBeGreaterThanOrEqual(4);
```

If a test needs N rows, ensure fixtures create at least N+2 rows.

## Vite Dev Memory Explosion

**Never use `vite dev` in parallel test fixtures** — always use `vite preview`.

| Server Type | Memory/Instance | 4 Workers | 8 Workers |
|-------------|-----------------|-----------|-----------|
| `vite dev` | ~400MB | 1.6GB | 3.2GB+ (runaway) |
| `vite preview` | ~40MB | 160MB | 320MB |

`vite dev` includes HMR, file watchers, dependency pre-bundling, and module graphs that consume ~400MB each. With multiple workers, this cascades into a runaway memory explosion (observed: 90GB swap, system freeze, 16 orphaned PostgreSQL containers).

The fix (already applied): build once in `global-setup.ts`, serve with `vite preview` per worker.

If you see orphaned containers after a crash:
```bash
docker ps -a --filter "ancestor=postgres:15"
docker rm -f $(docker ps -aq --filter "ancestor=postgres:15")
```

---

# Part 2: Local Development Discoveries

Sources: `gauntlet_docs/test-prerequisites.md`, `gauntlet_docs/test-status.md`, `gauntlet_docs/test-improvements/`, `e2e/AGENTS.md`

## Environment Prerequisites

### Docker Socket Permissions

**Symptom:** All tests fail with `Error: Could not find a working container runtime strategy`

**Fix:** `sudo chmod 666 /var/run/docker.sock`

This is automated by:
- `postCreateCommand` in `.devcontainer/post-create.sh` (initial container creation)
- `postStartCommand` in `.devcontainer/devcontainer.json` (every container start)

**Verify:**
```bash
docker info 2>&1 | grep "Server Version"
# Should print: Server Version: 29.x.x
```

### Stale Testcontainers Lock File

**Symptom:** All workers fail with `EACCES: permission denied` on startup.

**Fix:**
```bash
sudo rm -f /tmp/testcontainers-node.lock
```

**Prevention:** Always run E2E tests as the `node` user, never as `root`.

## IPv6/IPv4 Network Binding Fix

**Symptom:** All tests fail with `Error: Server at http://localhost:PORT did not start within 30000ms. Last error: fetch failed`

**Root cause:** Vite preview binds only to IPv6 loopback `[::1]` by default. Node.js `undici` (the engine behind `fetch`) cannot connect to `[::1]` in this Linux container network namespace — the connection is refused at the socket level even though the port is listening. `curl` succeeds (tries both protocols), but `fetch` fails immediately with `ECONNREFUSED`.

**Fix applied in `e2e/fixtures/isolated-env.ts`:**
1. Vite preview spawn includes `--host 127.0.0.1` to bind to IPv4
2. `webUrl` uses `http://127.0.0.1:PORT` instead of `http://localhost:PORT`
3. `apiUrl` uses `http://127.0.0.1:PORT` instead of `http://localhost:PORT`
4. Server startup timeout increased from 30s to 45s (Vite's first request takes ~14s)

**Verify:**
```bash
# After a test worker starts, confirm IPv4 binding:
ss -tlnp | grep LISTEN
# Should show 0.0.0.0:PORT, not [::1]:PORT
```

Full investigation: `gauntlet_docs/test-improvements/e2e-ipv6-fix-discovery.md`

## E2E Test Categories

Tests are organized into 8 Playwright projects for running targeted subsets. This avoids running the full ~1 hour suite when iterating on a specific area.

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

Combine multiple projects:
```bash
npx playwright test --project=api --project=security
```

Run the default `chromium` project for all tests:
```bash
pnpm test:e2e
```

**What's in each category:**

| Project | What it covers |
|---------|---------------|
| **ui** | Front-end interactions, navigation, drag-and-drop, admin views |
| **content** | Editor features — mentions, tables, images, code blocks, backlinks |
| **data** | CRUD, data persistence, document relationships, invites |
| **security** | Auth, session timeout, RBAC, cross-workspace isolation |
| **a11y** | WCAG 2.2 AA, axe-core audits, ARIA, color contrast |
| **perf** | Load times, memory usage, typing latency |
| **api** | REST endpoint validation (AI analysis, search, file upload, feedback) |
| **integration** | End-to-end workflows, race conditions, caching, FleetGraph |

## Flakiness Guide (AGENTS.md)

Source: `e2e/AGENTS.md` — comprehensive guide for avoiding flaky tests.

### Core Principle

Tests run in parallel across multiple workers. Under load, **everything takes longer** — API responses, DOM updates, React re-renders, WebSocket sync, and keyboard event processing. Tests must never assume operations complete within a fixed time.

### Reusable Helpers

Import from `e2e/fixtures/test-helpers.ts`:

```typescript
import { triggerMentionPopup, hoverWithRetry, waitForTableData } from './fixtures/test-helpers'
```

- **`triggerMentionPopup(page, editor)`** — Type `@` and wait for mention popup with retry
- **`hoverWithRetry(target, assertion)`** — Hover + verify with retry
- **`waitForTableData(page, selector?)`** — Wait for table rows to render and network to settle

### Anti-Patterns to Avoid

| Anti-Pattern | Fix |
|---|---|
| `waitForTimeout(N)` as synchronization | Use auto-retrying assertions: `expect(el).toBeVisible({ timeout: 10000 })` |
| `isVisible().catch(() => false)` — silent swallowing | Wait for the element, then interact: `await expect(tab).toBeVisible()` |
| Point-in-time checks on async state | Wait for the positive condition directly |
| Hover without table stabilization | `waitForTableData(page)` then `hoverWithRetry()` |
| Mention popup typed once without retry | Use `triggerMentionPopup(page, editor)` helper |
| Markdown shortcuts without verification | Wait for heading element before typing more |
| Tests that mutate shared state with `fullyParallel` | Use `test.describe.configure({ mode: 'serial' })` |
| Local time `new Date()` in seed data | Use UTC: `Date.UTC()` and `getUTC*()` methods |

### General Guidelines

1. Use `expect().toBeVisible({ timeout: N })` instead of `waitForTimeout(N)`
2. Use `toPass()` for multi-step interactions that may fail on first attempt
3. Wait for table data before interacting with rows
4. Use `test.describe.configure({ mode: 'serial' })` when tests share mutable state
5. Use `test.fixme()` instead of empty test bodies
6. Prefer `getByRole()` over CSS selectors
7. Don't add `test.slow()` as a first resort — fix timing patterns first
8. Seed data should always use UTC date math
9. Check `test-helpers.ts` for existing helpers before writing inline retry logic
10. If a new helper is reusable, add it to `test-helpers.ts` rather than duplicating inline

## Fixes Applied

### Fix 1: File-Attachments — 13 test failures eliminated

**Root cause:** Stale `AbortSignal` captured in `useMemo` in `Editor.tsx`. The signal was already aborted by the time any slash command fired, so `triggerFileUpload` exited immediately without appending the file input to the DOM.

**Fix:** Changed static signal to a getter closure (`getAbortSignal: () => imageUploadAbortRef.current.signal`) and switched tests from `waitForEvent('filechooser')` (unreliable CDP) to `setInputFiles()` on `body > input[type="file"]`.

### Fix 2: auth.test.ts Rate-Limiter — 6 unit test failures eliminated

**Root cause:** `NODE_ENV=development` in devcontainer meant the rate-limiter's `max` was 5 instead of 1000. Five login tests exhausted the bucket, and subsequent tests got 429.

**Fix:** Moved `process.env.NODE_ENV = 'test'` to module top level in `api/src/test/setup.ts`.

### Fix 3: session-timeout returnTo Assertion — 1 test fixed

**Root cause:** Test asserted `expect(url).toContain('localhost')` but URLs now use `127.0.0.1` after the IPv4 fix.

**Fix:** `expect(url).toMatch(/localhost|127\.0\.0\.1/)`

### Fix 4: programs.spec.ts — 7 test failures fixed

**Root cause:** The `beforeEach` hook had a 5s timeout on `expect(page).not.toHaveURL('/login')` and no wait for app load.

**Fix:** Increased timeout to 15s and added `page.waitForLoadState('networkidle')` after login.

### Fix 5: useSessionTimeout act() warnings — 4 warnings eliminated

**Root cause:** Synchronous tests returned before async fetch resolved, causing React state updates outside `act()`.

**Fix:** Made tests async and appended `await act(async () => {})` to drain the microtask queue.

## Known Remaining Failures

From the last full E2E run (2026-03-17, 2 workers, ~1.1 hours):

| Spec | Test | Root Cause |
|------|------|-----------|
| `data-integrity.spec.ts` | multiple images persist in correct order | Yjs persistence lag |
| `data-integrity.spec.ts` | multiple mentions persist correctly | Yjs persistence lag |
| `admin-workspace-members.spec.ts` | back button returns to admin dashboard | Navigation timing |
| `backlinks.spec.ts` | removing mention removes backlink | Link sync debounce exceeds 60s timeout |
| `my-week-stale-data.spec.ts` | plan edits visible after navigating back | Yjs persistence lag (KNOWN FLAKY) |
| `performance.spec.ts` | memory does not grow unbounded | Infrastructure-level timeout |

## Unfixable Issues: Yjs Persistence Lag

Three failures share a root cause that **cannot be fixed in the test layer**.

The TipTap editor uses Yjs CRDTs synced over WebSocket:

```
Editor change → Yjs doc update → WebSocket sync → Collaboration server
  → "Saved" indicator shown (WebSocket ack — NOT DB write)
  → Async: server writes Yjs state to PostgreSQL yjs_state column
  → Async: server converts Yjs to JSON and writes to content column
```

When a test does `page.reload()`, it reads the `content` column. If the async DB write hasn't completed, the page shows stale content.

**Why test-layer fixes don't work:**
- "Saved" indicator fires on WebSocket ack, not DB write completion
- Arbitrary waits are unreliable (DB timing varies by load)
- No "flushed to DB" signal exists

**What would fix it (requires collaboration server changes):**
1. **Flush endpoint:** `POST /api/collaboration/flush/:docId` — forces immediate write, returns when complete
2. **Persistence status via WebSocket:** Server sends `persisted` message after DB write
3. **Synchronous persistence in test mode:** Block WebSocket ack until DB write completes
