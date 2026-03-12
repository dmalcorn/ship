# Story 2.2: Remove Dead Dependency

Status: ready-for-dev

## Story

As a developer maintaining the project,
I want the unused `@tanstack/query-sync-storage-persister` dependency removed from `web/package.json`,
So that the lockfile is clean and dependency scanners don't flag a package with zero imports.

## Acceptance Criteria

1. **Given** `@tanstack/query-sync-storage-persister` is removed from `web/package.json` dependencies
   **When** `grep -r 'query-sync-storage-persister' web/src` is run
   **Then** zero results are returned (confirming no imports exist in source)

2. **Given** the package is removed
   **When** `pnpm install` is run from the workspace root
   **Then** it succeeds and `pnpm-lock.yaml` no longer references `@tanstack/query-sync-storage-persister`

3. **Given** the dependency is removed
   **When** `pnpm build` is run
   **Then** the build completes without errors

4. **Given** the changes are applied
   **When** `pnpm test` is run
   **Then** all tests pass with no new failures

## Tasks / Subtasks

- [ ] Task 1: Confirm zero usages in source (AC: #1)
  - [ ] Run `grep -r 'query-sync-storage-persister' web/src/` — expect zero results
  - [ ] Run `grep -r 'query-sync-storage-persister' web/` (excluding node_modules) — expect only `package.json` match

- [ ] Task 2: Remove the package (AC: #1, #2)
  - [ ] Delete the line `"@tanstack/query-sync-storage-persister": "^5.90.18",` from `web/package.json` dependencies section (currently line 25)
  - [ ] Run `cd /workspace && pnpm install` to update `pnpm-lock.yaml`
  - [ ] Verify `pnpm-lock.yaml` no longer contains `query-sync-storage-persister`

- [ ] Task 3: Verify build succeeds (AC: #3)
  - [ ] `cd /workspace/web && pnpm build`
  - [ ] Confirm clean exit with no missing-module errors

- [ ] Task 4: Run unit tests (AC: #4)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm no new failures (baseline: 6 pre-existing failures in `auth.test.ts`)

## Dev Notes

### Context

`@tanstack/query-sync-storage-persister` is listed in `web/package.json` dependencies at version `^5.90.18` (line 25), but has zero imports anywhere in `web/src/`. The project uses `@tanstack/react-query-persist-client` together with a custom `idb-keyval` persister defined in `web/src/lib/queryClient.ts` — the sync storage variant is never needed. This dead dependency adds noise to lockfile audits and security scanners without providing any functionality.

### File Location

- **Primary file:** `web/package.json`
- **Line to remove:** Line 25: `"@tanstack/query-sync-storage-persister": "^5.90.18",`

### What Stays (Do NOT Remove)

Keep these related packages — they ARE used:
- `@tanstack/react-query` — core query library (heavily used)
- `@tanstack/react-query-devtools` — devtools (gated in Story 2.1)
- `@tanstack/react-query-persist-client` — used in `web/src/main.tsx` line 5 (`PersistQueryClientProvider`)

### Expected lockfile Impact

`pnpm-lock.yaml` will update to remove the `@tanstack/query-sync-storage-persister` entry. This is safe and expected — commit the updated lockfile alongside the `package.json` change.

### Commit Message

```
fix(bundle): remove unused @tanstack/query-sync-storage-persister dependency
```

### References

- [Source: gauntlet_docs/ShipShape-fix-plan.md#Fix-2-D] — Root cause + fix approach
- [Source: web/package.json#L25] — Dead dependency location
- [Source: web/src/lib/queryClient.ts] — Actual persister implementation (uses idb-keyval)

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `web/package.json` (modified — remove dead dependency)
- `pnpm-lock.yaml` (modified — updated by pnpm install)
