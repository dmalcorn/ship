# Story 5.5: Cat 1 After-Evidence & Improvement Documentation

Status: ready-for-dev

> **YOLO-safe:** This story can be executed under YOLO permissions. All work is running scripts, reading files, and writing a documentation file — no code changes, no deploys, no interactive prompts.

## Story

As a Gauntlet submitter,
I want the Cat 1 type safety improvements documented with before/after violation counts using the same counting methodology as the audit,
So that graders can verify the ≥25% reduction and confirm no superficial substitutions were made.

## Acceptance Criteria

1. **Given** Stories 5.1–5.4 are fully implemented and committed
   **When** the violation-counting script is re-run
   **Then** total violations are ≤659 (down from 875 in `gauntlet_docs/baselines.md`), a ≥25% reduction

2. **Given** the after-counts are captured
   **When** `gauntlet_docs/improvements/cat1-type-safety.md` is written
   **Then** it contains for each of the 4 fixes (5.1–5.4):
   - What was changed (file location + change description)
   - Root cause (why the original had the violation)
   - Why the approach is better (meaningful type vs superficial substitution)
   - Tradeoffs made

3. **Given** the improvement doc is complete
   **When** the before/after counts section is reviewed
   **Then** it shows a breakdown by package AND violation type (`any`, `as any`, `asType`, `nonNull`) for both before and after states

4. **Given** the document is complete
   **When** the superficial-substitution check section is reviewed
   **Then** it explicitly states: no `any` → `unknown` substitution was made without an accompanying type guard or narrowing check

5. **Given** the changes are applied
   **When** `pnpm test` is run
   **Then** all tests pass with no new failures (baseline: 6 pre-existing failures in `auth.test.ts` only)

## Tasks / Subtasks

- [ ] Task 1: Confirm all prerequisite stories are done (AC: #1)
  - [ ] Verify Story 5.1 is done: `grep -n "req\.workspaceId!\|req\.userId!" api/src/routes/ -r | wc -l` — expect near 0
  - [ ] Verify Story 5.2 is done: `grep -n "row: any\|: any\[\]" api/src/routes/projects.ts api/src/routes/weeks.ts | wc -l` — expect reduced from baseline
  - [ ] Verify Story 5.3 is done: `grep -c ": any\|any\[\]" api/src/utils/yjsConverter.ts` — expect ≤5
  - [ ] Verify Story 5.4 is done: check `web/tsconfig.json` has `noUncheckedIndexedAccess`; `pnpm type-check` passes zero errors

- [ ] Task 2: Run the violation-counting script for after-state (AC: #1, #3)
  - [ ] Run the full script:
    ```bash
    cd /workspace && node -e "
    const fs = require('fs'), path = require('path');
    const dirs = ['web/src', 'api/src', 'shared/src'];
    let any1=0,any2=0,asType=0,nonNull=0,suppress=0;
    const perPkg = {};
    function walk(dir) {
      if (!fs.existsSync(dir)) return;
      for (const f of fs.readdirSync(dir, {withFileTypes:true})) {
        const full = path.join(dir, f.name);
        if (f.isDirectory()) { walk(full); continue; }
        if (!f.name.endsWith('.ts') && !f.name.endsWith('.tsx')) continue;
        const src = fs.readFileSync(full,'utf8');
        const lines = src.split('\n');
        const pkg = dir.split('/')[0];
        if (!perPkg[pkg]) perPkg[pkg]={any1:0,any2:0,asType:0,nonNull:0};
        for (const raw of lines) {
          const line = raw.replace(/\/\/.*/, '').replace(/\/\*.*?\*\//g,'');
          const a1=(line.match(/: any\b/g)||[]).length; any1+=a1; perPkg[pkg].any1+=a1;
          const a2=(line.match(/\bas any\b/g)||[]).length; any2+=a2; perPkg[pkg].any2+=a2;
          const at=(line.match(/\bas [A-Z][a-zA-Z<>\[\]|&.]+/g)||[]).filter(m=>!/as const|as unknown|as any/.test(m)).length; asType+=at; perPkg[pkg].asType+=at;
          const nn=(line.match(/[a-zA-Z0-9_)\]>]!/g)||[]).filter(m=>!m.includes('!=')).length; nonNull+=nn; perPkg[pkg].nonNull+=nn;
          if (/\@ts-(ignore|expect-error)/.test(line)) suppress++;
        }
      }
    }
    dirs.forEach(walk);
    console.log('=== Totals ===');
    console.log(': any =', any1, '  as any =', any2, '  as Type =', asType, '  ! =', nonNull, '  suppress =', suppress);
    console.log('TOTAL violations:', any1+any2+asType+nonNull+suppress);
    console.log('=== Per package ===');
    for (const [k,v] of Object.entries(perPkg)) console.log(k, JSON.stringify(v));
    "
    ```
  - [ ] Record all numbers — total, per-package, per-type
  - [ ] Confirm: TOTAL ≤659 (≥25% below 875 baseline)
  - [ ] If total is >659: identify which story did not achieve its target, fix, re-run

- [ ] Task 3: Run compiler check to confirm zero errors (AC: #1)
  - [ ] `cd /workspace/api && npx tsc --noEmit 2>&1 | tail -5`
  - [ ] `cd /workspace/web && npx tsc --noEmit 2>&1 | tail -5`
  - [ ] Both must show 0 errors

- [ ] Task 4: Run unit tests (AC: #5)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm only the 6 pre-existing `auth.test.ts` failures remain
  - [ ] ⚠️ `pnpm test` truncates DB. Run `pnpm db:seed` afterward if needed

- [ ] Task 5: Write `gauntlet_docs/improvements/cat1-type-safety.md` (AC: #2, #3, #4)
  - [ ] Create or overwrite the file with this structure:

    ```markdown
    # Cat 1: Type Safety Improvements

    ## Before Evidence (from gauntlet_docs/baselines.md)

    | Metric | web | api | shared | Total |
    |--------|-----|-----|--------|-------|
    | `: any` | 26 | 81 | 0 | 107 |
    | `as any` | 7 | 151 | 0 | 158 |
    | `as Type` | 209 | 52 | 0 | 261 |
    | `!` (non-null) | 43 | 306 | 0 | 349 |
    | **Total** | **285** | **590** | **0** | **875** |

    TypeScript compiler errors before: 0 (api), 0 (web)

    ## Fix 1: Express Request Augmentation (Story 5.1)

    **Files changed:** `api/src/types/express.d.ts` (created); `api/src/middleware/auth.ts`,
    `api/src/routes/backlinks.ts`, `api/src/routes/documents.ts` (removed inline augmentations);
    all `api/src/routes/*.ts` files (removed `!` assertions)

    **What changed:** Created a single canonical module augmentation declaring `userId: string`
    and `workspaceId: string` as non-optional on the Express Request interface. Removed 3
    duplicate inline augmentations. Removed non-null assertions on req.workspaceId and req.userId
    across all route files.

    **Root cause:** The fields were declared as optional (`userId?: string`) even though auth
    middleware always sets them. Every access required `!` to suppress the "possibly undefined" error.

    **Why better:** The type now matches the runtime contract — auth middleware guarantees these
    fields exist on any request that reaches a route handler. No narrowing needed because the
    type is correct, not suppressed.

    **Tradeoffs:** None. This is a strictly correct improvement.

    ## Fix 2: Typed Database Row Interfaces (Story 5.2)

    **Files changed:** `api/src/routes/projects.ts`, `api/src/routes/weeks.ts`

    **What changed:** Defined `ProjectRow`, `SprintRow`, and related interfaces matching the
    SQL query output shapes. Updated helper function parameters from `: any` to the specific
    interface types. Updated SQL parameter arrays from `any[]` to typed unions.

    **Root cause:** `pg` returns `result.rows` typed as `any[]`. Without a cast at the query
    boundary, every function receiving a row was forced to annotate its parameter as `any`.

    **Why better:** The interfaces match the actual data shape returned by the SQL queries.
    TypeScript now validates that code inside the helpers only accesses properties that exist
    on the DB row. A single typed interface at the boundary is better than scattered `any`.

    **Tradeoffs:** Interfaces must be kept in sync with SQL query changes. This is a minor
    maintenance cost justified by the type safety gained.

    ## Fix 3: yjsConverter TipTap Interfaces (Story 5.3)

    **File changed:** `api/src/utils/yjsConverter.ts`

    **What changed:** Defined TipTap JSON node interfaces (`TipTapNode`, `TipTapTextNode`,
    `TipTapElementNode`, `TipTapMark`, `TipTapDoc`) and replaced `any` annotations throughout
    the converter functions with these types. Used union type discriminant narrowing
    (`node.type === 'text'`) instead of `any` casts.

    **Root cause:** The TipTap/ProseMirror JSON format was not typed in this file. The shape
    of TipTap JSON is well-defined but was treated as opaque.

    **Why better:** The interfaces are faithful to TipTap's actual node schema. Narrowing guards
    are used where the type differs (text nodes vs element nodes). No `any` → `unknown`
    substitution without a guard.

    **Tradeoffs:** The interfaces are manually maintained rather than imported from TipTap's
    type package. This is acceptable — TipTap's type exports for its JSON format are not
    part of its stable public API.

    ## Fix 4: web tsconfig Strict Flags (Story 5.4)

    **File changed:** `web/tsconfig.json` (plus error fixes in web/src/**)

    **What changed:** Added `noUncheckedIndexedAccess`, `noImplicitReturns`, and
    `noFallthroughCasesInSwitch` to web/tsconfig.json. Fixed all newly-surfaced compiler
    errors.

    **Root cause:** The web package was set up without the extra strictness flags present
    in the root tsconfig. The api package inherits these via extends; web did not.

    **Why better:** Consistent strictness between frontend and backend. `noUncheckedIndexedAccess`
    in particular surfaces real bugs where array access was assumed safe but could be undefined.

    **Tradeoffs:** [Note any `!` assertions added to fix noUncheckedIndexedAccess errors —
    these trade one violation type for explicit acknowledgement of the assumption]

    ## After Evidence

    ### Violation counts (after)

    | Metric | web | api | shared | Total | Delta |
    |--------|-----|-----|--------|-------|-------|
    | `: any` | [X] | [X] | 0 | [X] | [X] |
    | `as any` | [X] | [X] | 0 | [X] | [X] |
    | `as Type` | [X] | [X] | 0 | [X] | [X] |
    | `!` (non-null) | [X] | [X] | 0 | [X] | [X] |
    | **Total** | **[X]** | **[X]** | **0** | **[X]** | **[X]** |

    **Reduction: [X]% (from 875 → [X]). Target was ≥25% (≤659). ✅**

    TypeScript compiler errors after: 0 (api), 0 (web) ✅

    ### Superficial substitution confirmation

    No `any` → `unknown` substitution was made without an accompanying type guard or narrowing check.
    Specifically:
    - Story 5.1: `any` removed by making types non-optional (no cast at all)
    - Story 5.2: `any` replaced with typed interfaces matching actual data shapes
    - Story 5.3: `any` replaced with union types narrowed via discriminant (`node.type === 'text'`)
    - Story 5.4: strictness flags surfaced latent bugs; errors fixed with guards or explicit assertions

    ### Reproduction commands

    ```bash
    # Re-run violation counter
    cd /workspace && node -e "
    const fs = require('fs'), path = require('path');
    const dirs = ['web/src', 'api/src', 'shared/src'];
    let any1=0,any2=0,asType=0,nonNull=0,suppress=0;
    const perPkg = {};
    function walk(dir) {
      if (!fs.existsSync(dir)) return;
      for (const f of fs.readdirSync(dir, {withFileTypes:true})) {
        const full = path.join(dir, f.name);
        if (f.isDirectory()) { walk(full); continue; }
        if (!f.name.endsWith('.ts') && !f.name.endsWith('.tsx')) continue;
        const src = fs.readFileSync(full,'utf8');
        const lines = src.split('\n');
        const pkg = dir.split('/')[0];
        if (!perPkg[pkg]) perPkg[pkg]={any1:0,any2:0,asType:0,nonNull:0};
        for (const raw of lines) {
          const line = raw.replace(/\/\/.*/, '').replace(/\/\*.*?\*\//g,'');
          const a1=(line.match(/: any\b/g)||[]).length; any1+=a1; perPkg[pkg].any1+=a1;
          const a2=(line.match(/\bas any\b/g)||[]).length; any2+=a2; perPkg[pkg].any2+=a2;
          const at=(line.match(/\bas [A-Z][a-zA-Z<>\[\]|&.]+/g)||[]).filter(m=>!/as const|as unknown|as any/.test(m)).length; asType+=at; perPkg[pkg].asType+=at;
          const nn=(line.match(/[a-zA-Z0-9_)\]>]!/g)||[]).filter(m=>!m.includes('!=')).length; nonNull+=nn; perPkg[pkg].nonNull+=nn;
          if (/\@ts-(ignore|expect-error)/.test(line)) suppress++;
        }
      }
    }
    dirs.forEach(walk);
    console.log('=== Totals ===');
    console.log(': any =', any1, '  as any =', any2, '  as Type =', asType, '  ! =', nonNull, '  suppress =', suppress);
    console.log('TOTAL violations:', any1+any2+asType+nonNull+suppress);
    console.log('=== Per package ===');
    for (const [k,v] of Object.entries(perPkg)) console.log(k, JSON.stringify(v));
    "

    # Compiler checks
    cd /workspace/api && npx tsc --noEmit
    cd /workspace/web && npx tsc --noEmit
    ```
    ```

  - [ ] Fill in all `[X]` placeholders with actual after-state numbers from Task 2
  - [ ] Fill in the tradeoffs section for Story 5.4 with the actual count of `!` assertions added
  - [ ] The "Superficial substitution confirmation" section must list the actual approach used in each story

- [ ] Task 6: Verify the document is complete (AC: #2, #3, #4)
  - [ ] Re-read `gauntlet_docs/improvements/cat1-type-safety.md`
  - [ ] Confirm each fix section has: file changed, what changed, root cause, why better, tradeoffs
  - [ ] Confirm before/after table has both per-package and per-type breakdowns
  - [ ] Confirm superficial substitution statement is explicit and story-by-story

## Dev Notes

### Context

This is a documentation + evidence story. No code changes. The work is: run the counting script, fill in the numbers, write the narrative.

The grading standard for Cat 1 is:
1. ≥25% total violation reduction (875 → ≤659)
2. Correct meaningful types — not superficial substitutions (`any` → `unknown` without a guard is disqualified)
3. Zero new compiler errors

### If the Reduction Target is Not Met

If after running Task 2 the total is >659, identify which stories underdelivered. The key levers:

| Story | Expected reduction |
|-------|-------------------|
| 5.1 Express augmentation | ~150–200 nonNull |
| 5.2 DB row interfaces | ~15–25 any1 |
| 5.3 yjsConverter | ~8 any1 |
| 5.4 web tsconfig | may increase nonNull slightly |
| **Net target** | **≥216 reduction** |

If 5.1 delivered <150 non-null reductions, go back and check for remaining `req.workspaceId!` / `req.userId!` assertions in route files not yet updated.

### The `[X]` Placeholders

The template in Task 5 uses `[X]` for all after-counts because they can't be known until Stories 5.1–5.4 are complete. The dev agent running this story fills them in from the actual script output in Task 2.

### File Locations

- **Output:** `gauntlet_docs/improvements/cat1-type-safety.md` (create or overwrite)
- **Reference:** `gauntlet_docs/baselines.md#Cat-1` — before counts
- **Reference:** `gauntlet_docs/rerun-benchmarks.md` — violation-counting script

### Commit Message

```
fix(cat1): add after-evidence and improvement documentation for type safety
```

### References

- [Source: gauntlet_docs/baselines.md#Cat-1] — Before numbers (875 total, api.nonNull=306)
- [Source: gauntlet_docs/ShipShape-fix-plan.md] — Fixes 1-A through 1-D, root causes
- [Source: gauntlet_docs/audit-deliverable.md] — Official audit baseline (878 violations)
- [Source: gauntlet_docs/improvements/cat3-api-response-time.md] — Reference format for improvement docs

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `gauntlet_docs/improvements/cat1-type-safety.md` (created — improvement doc with before/after evidence)
