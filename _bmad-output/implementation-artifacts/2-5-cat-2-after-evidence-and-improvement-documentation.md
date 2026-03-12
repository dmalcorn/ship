# Story 2.5: Cat 2 After-Evidence & Improvement Documentation

Status: done

## Story

As a Gauntlet submitter,
I want the Cat 2 bundle improvements documented with before/after visualizer output,
So that graders can verify the ≥20% initial-load gzip reduction with reproducible evidence.

## Acceptance Criteria

1. **Given** Stories 2.1–2.4 are fully implemented and merged to `fix/bundle-size` branch
   **When** `pnpm build` is run with `rollup-plugin-visualizer` active
   **Then** gzip size of the primary entry chunk is ≤ baseline × 0.80 (≥20% reduction from the measured baseline in `gauntlet_docs/baselines.md`)

   > Note: Baseline index chunk gzip = **699 KB** (our measurement). Target: ≤559 KB.
   > The audit baseline is 589 KB — if graders use that, target is ≤471 KB.
   > Document BOTH comparisons clearly.

2. **Given** the after build is run
   **When** `gauntlet_docs/improvements/cat2-bundle-size.md` is written
   **Then** it contains all required sections (before/after evidence, per-fix breakdown, fix details, reproduction commands)

3. **Given** all 4 fixes are implemented
   **When** `grep -r 'react-query-devtools' web/dist/` is run on the production build
   **Then** zero matches (confirming devtools excluded)

4. **Given** all 4 fixes are implemented
   **When** `grep -r 'query-sync-storage-persister' web/src/` is run
   **Then** zero matches (confirming dead dep removed)

5. **Given** the documentation is complete
   **When** `pnpm test` is run
   **Then** all tests pass with no new failures from this epic's changes

## Tasks / Subtasks

- [x] Task 1: Confirm all Epic 2 stories are done
  - [x] Story 2.1 (DevTools gate) ✅
  - [x] Story 2.2 (dead dep removed) ✅
  - [x] Story 2.3 (emoji picker lazy) ✅
  - [x] Story 2.4 (manualChunks) ✅

- [x] Task 2: Run after build with visualizer (AC: #1, #2)
  - [x] Temporarily enabled `rollup-plugin-visualizer` in `web/vite.config.ts`
  - [x] Ran `pnpm build` — captured chunk sizes
  - [x] Reverted `vite.config.ts` to remove visualizer

- [x] Task 3: Verify bundle exclusions (AC: #3, #4)
  - [x] `grep -r 'react-query-devtools\|ReactQueryDevtools' web/dist/` — zero results
  - [x] `grep -r 'query-sync-storage-persister' web/src/` — zero results

- [x] Task 4: Write improvement documentation (AC: #2)
  - [x] Created `gauntlet_docs/improvements/cat2-bundle-size.md`

- [x] Task 5: Final test run (AC: #5)
  - [x] 6 failed (pre-existing) | 445 passed — no new failures

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_none_

### Completion Notes List

- AC #1 verified: index chunk 248.66 KB gzip vs 699 KB baseline = **64.4% reduction** (target ≥20%)
- AC #1 vs audit baseline: 248.66 KB vs 589 KB = **57.8% reduction** (target ≥20%)
- AC #3 verified: zero devtools in dist/
- AC #4 verified: zero dead dep in src/
- AC #5 verified: 6 failed (pre-existing) | 445 passed

### File List

- `gauntlet_docs/improvements/cat2-bundle-size.md` (created — improvement documentation with before/after evidence)
