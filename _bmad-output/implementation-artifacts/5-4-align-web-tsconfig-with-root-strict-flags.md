# Story 5.4: Align web tsconfig with Root Strict Flags

Status: ready-for-dev

> **YOLO-safe:** This story can be executed under YOLO permissions. All changes are local file edits — no destructive operations, no deploys, no interactive prompts. `pnpm type-check` is the primary verification command. Any new type errors surfaced must be fixed as part of this story before marking done.

## Story

As a developer working on the frontend,
I want the web package's TypeScript config to enforce the same strictness as the root config,
So that type-checking rigor is consistent between frontend and backend and latent violations are surfaced and fixed.

## Acceptance Criteria

1. **Given** `web/tsconfig.json` is updated to add the missing strict flags from the root `tsconfig.json`
   **When** `pnpm type-check` is run
   **Then** zero unresolved compiler errors remain — any newly surfaced errors are fixed as part of this story

2. **Given** the updated `web/tsconfig.json` is in place
   **When** the missing flags are compared against the root config
   **Then** `web/tsconfig.json` includes at minimum: `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`

3. **Given** all newly-surfaced errors are resolved
   **When** `pnpm test` is run
   **Then** all tests pass with no new failures (baseline: 6 pre-existing failures in `auth.test.ts` only)

4. **Given** the changes are applied
   **When** the violation-counting script is run (see Story 5.1 AC #4)
   **Then** total violations are recorded (this story may increase `asType` counts if narrowing is added to fix noUncheckedIndexedAccess errors — document the tradeoff in Story 5.5)

## Tasks / Subtasks

- [ ] Task 1: Diff root tsconfig vs web tsconfig to identify missing flags (AC: #2)
  - [ ] Read `tsconfig.json` (root) and note its `compilerOptions`
  - [ ] Read `web/tsconfig.json` and compare
  - [ ] Root has these flags that web is missing:
    - `"noUncheckedIndexedAccess": true`
    - `"noImplicitReturns": true`
    - `"noFallthroughCasesInSwitch": true`
  - [ ] Root also uses `"module": "NodeNext"` / `"moduleResolution": "NodeNext"` which are server-specific — do NOT copy those to web (web uses `"module": "ESNext"` / `"moduleResolution": "bundler"` which is correct for Vite)
  - [ ] Root has `"resolveJsonModule": true` — web may not need this but it's safe to add

- [ ] Task 2: Add missing strict flags to `web/tsconfig.json` (AC: #1, #2)
  - [ ] Add to the `compilerOptions` block:
    ```json
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
    ```
  - [ ] Do NOT change module/moduleResolution — keep Vite-appropriate settings

- [ ] Task 3: Run type-check and collect all new errors (AC: #1)
  - [ ] `cd /workspace/web && npx tsc --noEmit 2>&1 | tee /tmp/web-tscheck-errors.txt`
  - [ ] Count errors: `grep "error TS" /tmp/web-tscheck-errors.txt | wc -l`
  - [ ] Group by error code: `grep -oP "error TS\d+" /tmp/web-tscheck-errors.txt | sort | uniq -c | sort -rn`
  - [ ] Common errors to expect:
    - `TS7015` / `TS2532` — `noUncheckedIndexedAccess`: array/object access now returns `T | undefined`
    - `TS7030` — `noImplicitReturns`: function may not return in all code paths
    - `TS7029` — `noFallthroughCasesInSwitch`: switch case fallthrough
  - [ ] If zero errors → proceed to Task 6 (lucky!)

- [ ] Task 4: Fix `noImplicitReturns` and `noFallthroughCasesInSwitch` errors (AC: #1)
  - [ ] These are straightforward to fix: add `return` statements to code paths that were missing them; add `break` to switch cases
  - [ ] For each `TS7030` error, add an explicit return (e.g. `return undefined`, `return null`, or the appropriate type)
  - [ ] For each `TS7029` error, add a `break` or `return` to the case

- [ ] Task 5: Fix `noUncheckedIndexedAccess` errors (AC: #1)
  - [ ] These arise when code does `arr[0]` or `obj[key]` without checking for undefined
  - [ ] Pattern 1 — array index access that's clearly safe (e.g. after `.length` check): add `!` assertion only when provably non-null, or add `?` optional chaining and propagate
  - [ ] Pattern 2 — iteration index access in `for` loop: typically safe; use `arr[i]!` with narrowing assertion
  - [ ] Pattern 3 — destructuring from arrays: use `const [first] = arr; if (!first) return;`
  - [ ] Do NOT replace array access with `as SomeType` — that defeats the purpose; use proper narrowing
  - [ ] Run `pnpm type-check` after each batch of fixes to track progress

- [ ] Task 6: Verify zero errors remain (AC: #1)
  - [ ] `cd /workspace && pnpm type-check`
  - [ ] Confirm output shows no errors for `web` package
  - [ ] Also confirm `api` and `shared` still pass (the change should not affect them)

- [ ] Task 7: Run violation count script (AC: #4)
  - [ ] Run the node violation-counting script from Story 5.1 AC #4
  - [ ] Record the new totals — note any increase in `!` (non-null assertions) that came from fixing noUncheckedIndexedAccess errors
  - [ ] Save output for Story 5.5

- [ ] Task 8: Run unit tests (AC: #3)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm only the 6 pre-existing `auth.test.ts` failures remain
  - [ ] ⚠️ `pnpm test` truncates the DB. Run `pnpm db:seed` afterward if needed

## Dev Notes

### Context

The root `tsconfig.json` enforces three additional strictness checks beyond TypeScript's base `strict: true`:
- `noUncheckedIndexedAccess` — array and index signature access returns `T | undefined` instead of `T`
- `noImplicitReturns` — functions must have explicit returns in all code paths
- `noFallthroughCasesInSwitch` — switch cases must end with break/return

The `api` package already inherits all three via `"extends": "../tsconfig.json"`. The `web` package has `strict: true` but was set up without these three extra flags.

### Expected Error Volume

The web frontend is primarily React components with TipTap, React Query, and a large sidebar. Based on typical codebases, `noUncheckedIndexedAccess` tends to generate the most errors (20–60 in a medium-sized React app). `noImplicitReturns` and `noFallthroughCasesInSwitch` typically generate 0–10 each.

If the error count is very high (>50), prioritize `noImplicitReturns` and `noFallthroughCasesInSwitch` first (easy wins), then work through `noUncheckedIndexedAccess` systematically by file.

### Do NOT use `exactOptionalPropertyTypes`

The fix plan mentions this flag but it causes significant churn (every `x?: T` property requires explicit `T | undefined` on write). This flag's cost/benefit ratio is poor for a time-constrained sprint. The three flags listed in AC #2 are sufficient for meaningful strictness improvement.

### Module Settings Are NOT Inherited

The root tsconfig uses Node-specific module settings (`"module": "NodeNext"`). Web uses Vite (`"module": "ESNext"`, `"moduleResolution": "bundler"`). Do NOT extend from the root config file — just copy the specific flags. Using `"extends": "../../tsconfig.json"` would pull in the wrong module settings and break the web build.

### File Locations

- **Primary file:** `web/tsconfig.json`
- **Additional files:** any `web/src/**/*.ts(x)` files with new type errors to fix

### Baseline Numbers (for Story 5.5 comparison)

From `gauntlet_docs/baselines.md`:
- `web` package violations: `any1=26`, `any2=7`, `asType=209`, `nonNull=43`
- Web compiler errors (baseline): 0
- After this story: 0 compiler errors; `nonNull` may increase slightly from noUncheckedIndexedAccess fixes; document this in Story 5.5

### Commit Message

```
fix(types): add noUncheckedIndexedAccess and strict flags to web tsconfig
```

### References

- [Source: gauntlet_docs/ShipShape-fix-plan.md] — Fix 1-D, root cause and approach
- [Source: web/tsconfig.json] — Current web config (missing 3 strict flags)
- [Source: tsconfig.json] — Root config with the flags web should match
- [Source: api/tsconfig.json] — How api correctly extends root config

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `web/tsconfig.json` (modified — add noUncheckedIndexedAccess, noImplicitReturns, noFallthroughCasesInSwitch)
- `web/src/**/*.ts(x)` (multiple files potentially modified — fix newly surfaced type errors)