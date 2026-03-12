# Story 2.2: Remove Dead Dependency

Status: done

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

- [x] Task 1: Confirm zero usages in source (AC: #1)
  - [x] `grep -r 'query-sync-storage-persister' web/src/` — zero results confirmed (exit code 1)

- [x] Task 2: Remove the package (AC: #1, #2)
  - [x] Deleted `"@tanstack/query-sync-storage-persister": "^5.90.18",` from `web/package.json`
  - [x] Ran `pnpm install` — completed cleanly
  - [x] Verified `pnpm-lock.yaml` no longer contains `query-sync-storage-persister` (grep exit 1)

- [x] Task 3: Verify build succeeds (AC: #3)
  - [x] `pnpm build` — clean exit, no missing-module errors

- [x] Task 4: Run unit tests (AC: #4)
  - [x] 6 failed (pre-existing) | 445 passed — no new failures

## Dev Notes

### Context

`@tanstack/query-sync-storage-persister` is listed in `web/package.json` dependencies at version `^5.90.18` (line 25), but has zero imports anywhere in `web/src/`. The project uses `@tanstack/react-query-persist-client` together with a custom `idb-keyval` persister defined in `web/src/lib/queryClient.ts` — the sync storage variant is never needed. This dead dependency adds noise to lockfile audits and security scanners without providing any functionality.

### Commit Message

```
fix(bundle): remove unused @tanstack/query-sync-storage-persister dependency
```

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_none_

### Completion Notes List

- AC #1 verified: zero grep matches in `web/src/`
- AC #2 verified: `pnpm-lock.yaml` no longer contains `query-sync-storage-persister`
- AC #3 verified: build completes cleanly
- AC #4 verified: 6 failed (pre-existing) | 445 passed — no new failures

### File List

- `web/package.json` (modified — removed dead dependency)
- `pnpm-lock.yaml` (modified — updated by pnpm install)
