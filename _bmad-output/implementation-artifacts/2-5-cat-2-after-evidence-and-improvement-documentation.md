# Story 2.5: Cat 2 After-Evidence & Improvement Documentation

Status: ready-for-dev

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
   **Then** it contains all of the following:
   - Before gzip size (from `gauntlet_docs/baselines.md`)
   - After gzip size (measured in this story)
   - Per-fix savings breakdown (one row per story 2.1–2.4)
   - Visualizer output or screenshots showing chunk composition before and after
   - Explanation for each of the 4 fixes: what was changed, why original was suboptimal, why the approach is better, tradeoffs made

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

- [ ] Task 1: Confirm all Epic 2 stories are done
  - [ ] Verify Story 2.1 (DevTools gate) is implemented and working
  - [ ] Verify Story 2.2 (dead dep removed) is implemented and `pnpm install` is clean
  - [ ] Verify Story 2.3 (emoji picker lazy) is implemented — emoji chunk visible in build output
  - [ ] Verify Story 2.4 (manualChunks) is implemented — vendor chunks visible in build output

- [ ] Task 2: Run after build with visualizer (AC: #1, #2)
  - [ ] Temporarily enable `rollup-plugin-visualizer` in `web/vite.config.ts`:
    ```typescript
    import { visualizer } from 'rollup-plugin-visualizer';
    // Add to plugins array:
    visualizer({ filename: '/tmp/bundle-after-stats.html', gzipSize: true, open: false })
    ```
  - [ ] Run `cd /workspace/web && pnpm build 2>&1 | tee /tmp/build-after-output.txt`
  - [ ] Record the gzip size of `index-*.js` from build output
  - [ ] Record gzip sizes of all new vendor chunks (`vendor-react-*.js`, `vendor-yjs-*.js`, `vendor-prosemirror-*.js`, `vendor-tiptap-*.js`)
  - [ ] Note gzip size of the emoji picker chunk
  - [ ] Revert `vite.config.ts` to remove the visualizer plugin (or keep if already part of devDependencies and config — just remove the plugin() call from the array)

- [ ] Task 3: Verify bundle exclusions (AC: #3, #4)
  - [ ] Run `grep -r 'react-query-devtools\|ReactQueryDevtools' web/dist/` — expect zero results
  - [ ] Run `grep -r 'query-sync-storage-persister' web/src/` — expect zero results
  - [ ] Confirm emoji picker chunk is NOT present in initial page load (separate chunk filename)

- [ ] Task 4: Write improvement documentation (AC: #2)
  - [ ] Create `gauntlet_docs/improvements/cat2-bundle-size.md`
  - [ ] Include the following sections:

    ```markdown
    # Cat 2: Bundle Size Improvements

    ## Summary
    **Before:** [baseline gzip KB] KB gzip (index-*.js)
    **After:** [after gzip KB] KB gzip (index-*.js)
    **Reduction:** [X]% ([Y] KB saved)

    ## Before Evidence
    [paste from gauntlet_docs/baselines.md#Cat-2]

    ## After Build Output
    [paste from /tmp/build-after-output.txt]

    ## Per-Fix Breakdown
    | Fix | Story | Estimated Savings | Evidence |
    |---|---|---|---|
    | Gate ReactQueryDevtools | 2.1 | ~105 KB | grep output showing zero devtools in dist/ |
    | Remove dead dep | 2.2 | ~0 KB direct / lockfile clean | grep output |
    | Lazy emoji picker | 2.3 | ~72 KB from index | chunk filename in build output |
    | manualChunks vendors | 2.4 | index chunk reduction | chunk filenames in build output |

    ## Fix Details

    ### Fix 2.1: Gate ReactQueryDevtools
    **What changed:** [...]
    **Why original was suboptimal:** [...]
    **Why this approach is better:** [...]
    **Tradeoffs:** [...]

    ### Fix 2.2: Remove Dead Dependency
    [...]

    ### Fix 2.3: Lazy-Load Emoji Picker
    [...]

    ### Fix 2.4: manualChunks Vendor Splitting
    [...]

    ## Reproduction Commands
    [exact commands grader can run to reproduce]
    ```

- [ ] Task 5: Final test run (AC: #5)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm no new failures from any Epic 2 change

## Dev Notes

### Context

This is the evidence + documentation story for Cat 2. All 4 fixes (Stories 2.1–2.4) must be fully implemented on the `fix/bundle-size` branch before running the after measurement. The visualizer plugin is already listed in `web/package.json` devDependencies (`rollup-plugin-visualizer: ^7.0.1`) — just import and add to the plugins array temporarily for the measurement, then revert.

### Baseline Numbers (from gauntlet_docs/baselines.md)

| Metric | Our Baseline | Audit Baseline |
|---|---|---|
| Index chunk gzip | **699 KB** | 589 KB |
| DevTools in bundle | YES | YES |
| Dead dep present | YES | YES |

> The discrepancy (699 KB vs 589 KB) is noted in baselines.md and likely due to measurement methodology (we counted the single largest chunk; audit may have measured differently). Document both and use the more conservative target (≤559 KB) to demonstrate the improvement clearly.

### Expected After Numbers (estimates)

| Chunk | Estimated gzip |
|---|---|
| `index-*.js` (entry) | ~350–450 KB (DevTools ~105 KB + emoji ~72 KB + vendors extracted) |
| `vendor-react-*.js` | ~45–60 KB |
| `vendor-yjs-*.js` | ~30–40 KB |
| `vendor-prosemirror-*.js` | ~80–100 KB |
| `vendor-tiptap-*.js` | ~40–60 KB |
| `emoji-picker-*.js` | ~70–80 KB |

### Output Directory

Create `gauntlet_docs/improvements/` if it doesn't exist. Other category docs will go here too.

### Commit Message

```
docs(evidence): add Cat 2 bundle size after-evidence and improvement documentation
```

### References

- [Source: gauntlet_docs/ShipShape-fix-plan.md#Cat-2] — Evidence requirements
- [Source: gauntlet_docs/baselines.md#Cat-2] — Before evidence
- [Source: CLAUDE.md#Evidence-Requirements] — Required evidence format per category

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `gauntlet_docs/improvements/cat2-bundle-size.md` (created — improvement documentation with before/after evidence)
- `web/vite.config.ts` (temporarily modified for visualizer measurement, then reverted)
