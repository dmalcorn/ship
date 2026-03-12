# Story 5.1: Express Request Augmentation

Status: ready-for-dev

> **YOLO-safe:** This story can be executed under YOLO permissions. All changes are local file edits with no destructive operations, no deploys, and no interactive prompts. `pnpm test` and `pnpm type-check` are the only verification commands needed.

## Story

As a developer working on API route handlers,
I want `req.workspaceId` and `req.userId` to be typed as non-optional on the Express `Request` interface,
So that the 236 non-null assertions (`!`) scattered across route files are eliminated by the type system rather than suppressed.

## Acceptance Criteria

1. **Given** `api/src/types/express.d.ts` is created with a module augmentation declaring `workspaceId: string` and `userId: string` (non-optional) on `Express.Request`
   **When** `pnpm type-check` is run
   **Then** zero new compiler errors are introduced

2. **Given** the central augmentation exists in `api/src/types/express.d.ts`
   **When** the duplicate inline augmentations in `api/src/middleware/auth.ts`, `api/src/routes/backlinks.ts`, and `api/src/routes/documents.ts` are removed
   **Then** `pnpm type-check` still passes with zero errors

3. **Given** `req.workspaceId` and `req.userId` are now typed as non-optional strings
   **When** non-null assertions (`!`) on `req.workspaceId!` and `req.userId!` in route files are removed
   **Then** `pnpm type-check` passes — the type system guarantees presence, so `!` is no longer needed

4. **Given** the changes are applied
   **When** the violation-counting script is run:
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
   **Then** `api` `nonNull` count is reduced by ≥150 compared to the baseline of 306

5. **Given** the changes are applied
   **When** `pnpm test` is run
   **Then** all tests pass with no new failures (baseline: 6 pre-existing failures in `auth.test.ts` only)

## Tasks / Subtasks

- [ ] Task 1: Audit existing augmentations to understand scope (AC: #1, #2)
  - [ ] Read current inline augmentation in `api/src/middleware/auth.ts` (lines 6–16): fields are `sessionId?: string`, `userId?: string`, `workspaceId?: string`, `isSuperAdmin?: boolean`, `isApiToken?: boolean`
  - [ ] Read inline augmentation in `api/src/routes/backlinks.ts` (lines ~154–166): has `user?: { id, email, name, workspaceId }`
  - [ ] Read inline augmentation in `api/src/routes/documents.ts` (lines ~1548–1562): check what it declares
  - [ ] Count non-null assertions to baseline: `grep -rn "req\.workspaceId!\|req\.userId!" api/src/routes/ | wc -l` — expect ~236

- [ ] Task 2: Check that `api/src/types/` path is picked up by TypeScript (AC: #1)
  - [ ] Confirm `api/tsconfig.json` has `"include": ["src/**/*"]` — this automatically includes `src/types/*.d.ts`
  - [ ] Confirm `ls api/src/types/` — currently only `y-protocols.d.ts` exists (no express.d.ts yet)

- [ ] Task 3: Create `api/src/types/express.d.ts` (AC: #1)
  - [ ] Create the file with the canonical augmentation. Keep `workspaceMembership` optional since auth middleware does not currently set it:
    ```typescript
    // api/src/types/express.d.ts
    import { WorkspaceMembership } from '@ship/shared';

    declare global {
      namespace Express {
        interface Request {
          sessionId?: string;
          userId: string;
          workspaceId: string;
          isSuperAdmin?: boolean;
          isApiToken?: boolean;
          workspaceMembership?: WorkspaceMembership;
        }
      }
    }

    export {};
    ```
  - [ ] Note: `userId` and `workspaceId` are non-optional — auth middleware always sets them before routes run

- [ ] Task 4: Remove duplicate augmentation from `api/src/middleware/auth.ts` (AC: #2)
  - [ ] Delete the `declare global { namespace Express { ... } }` block at lines 6–16 (the one declaring optional `userId?`, `workspaceId?`, etc.)
  - [ ] Do NOT change any other code in auth.ts
  - [ ] Run `pnpm type-check` to verify no new errors

- [ ] Task 5: Remove duplicate augmentation from `api/src/routes/backlinks.ts` (AC: #2)
  - [ ] Delete the `// Type augmentation for Express Request` comment block and the `declare global { namespace Express { ... } }` block at lines ~154–166
  - [ ] Confirm `pnpm type-check` still passes

- [ ] Task 6: Remove duplicate augmentation from `api/src/routes/documents.ts` (AC: #2)
  - [ ] Delete the `// Type augmentation for Express Request` comment block and `declare global { namespace Express { ... } }` block at lines ~1548–1562
  - [ ] Run `pnpm type-check` to verify no new errors

- [ ] Task 7: Remove non-null assertions on `req.workspaceId` and `req.userId` from route files (AC: #3)
  - [ ] Run: `grep -rln "req\.workspaceId!\|req\.userId!" api/src/routes/` to list affected files
  - [ ] For each file, replace `req.workspaceId!` with `req.workspaceId` and `req.userId!` with `req.userId`
  - [ ] Suggested approach — sed across all route files:
    ```bash
    find /workspace/api/src/routes -name "*.ts" -exec sed -i 's/req\.workspaceId!/req.workspaceId/g; s/req\.userId!/req.userId/g' {} +
    ```
  - [ ] Run `pnpm type-check` after — if new errors appear, they indicate places where `workspaceId`/`userId` may genuinely be undefined (e.g. routes not protected by auth middleware); fix those by adding proper guards or restoring the `!` only where genuinely needed
  - [ ] Re-run `grep -rn "req\.workspaceId!\|req\.userId!" api/src/routes/ | wc -l` — target: 0 or near-0

- [ ] Task 8: Run violation count script to verify reduction (AC: #4)
  - [ ] Run the node violation-counting script from AC #4
  - [ ] Record `api.nonNull` value — must be ≤156 (down from 306, ≥150 reduction)
  - [ ] Save the full output for Story 5.5

- [ ] Task 9: Run unit tests (AC: #5)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm only the 6 pre-existing `auth.test.ts` failures remain
  - [ ] ⚠️ Running `pnpm test` truncates DB via `setup.ts`. Run `pnpm db:seed` afterward if further DB-dependent testing is needed

## Dev Notes

### Context

The Express `Request` interface in `api/src/middleware/auth.ts` (lines 6–16) currently declares `userId?: string` and `workspaceId?: string` as **optional**. Because the type system sees them as possibly undefined, every route that accesses them must suppress the undefined warning with `!`. There are 236 such suppressions in `api/src/routes/`.

The fix is a type-level change only — the runtime behaviour is unchanged. Auth middleware already sets these fields unconditionally for any request that reaches a protected route. Making the types non-optional tells the type system the same thing the runtime already guarantees.

### The `workspaceMembership` Question

The fix plan (`gauntlet_docs/ShipShape-fix-plan.md`) mentions adding `workspaceMembership: WorkspaceMembership` to the augmentation. However, `api/src/middleware/auth.ts` does NOT currently set `req.workspaceMembership`. Adding it as non-optional would introduce type errors in auth.ts (where it isn't set). **Decision:** declare it as `workspaceMembership?: WorkspaceMembership` (optional) in the new file. This introduces no new violations and avoids phantom type errors. If a future sprint sets it, the type is already declared.

### Duplicate Augmentations

Three files currently contain inline `declare global { namespace Express { ... } }` blocks:
- `api/src/middleware/auth.ts:6–16` — the canonical one (being replaced)
- `api/src/routes/backlinks.ts:~154–166` — declares a `user?: {...}` shape (different shape from auth.ts)
- `api/src/routes/documents.ts:~1548–1562` — check what it declares

When removing these, check carefully if any route code references properties declared only in those inline blocks (e.g. `req.user`). If so, migrate those properties to `express.d.ts` rather than losing them.

### `export {}` Requirement

TypeScript `.d.ts` augmentation files require `export {}` to be treated as a module rather than a script. Without it, the augmentation may not work correctly. The template in Task 3 includes this.

### File Locations

- **Create:** `api/src/types/express.d.ts`
- **Remove augmentation from:** `api/src/middleware/auth.ts` (lines 6–16)
- **Remove augmentation from:** `api/src/routes/backlinks.ts` (lines ~154–166)
- **Remove augmentation from:** `api/src/routes/documents.ts` (lines ~1548–1562)
- **Remove `!` assertions from:** all files under `api/src/routes/`

### Baseline Numbers (for Story 5.5 comparison)

From `gauntlet_docs/baselines.md`:
- Total violations: 875 (audit: 878)
- `api` nonNull: 306
- Target for this story: reduce `api` nonNull by ≥150 (to ≤156)

### Commit Message

```
fix(types): add express.d.ts augmentation and remove non-null assertions on req.userId/workspaceId
```

### References

- [Source: gauntlet_docs/ShipShape-fix-plan.md] — Fix 1-A, root cause and approach
- [Source: gauntlet_docs/baselines.md#Cat-1] — Before violation counts (api.nonNull = 306)
- [Source: api/src/middleware/auth.ts:6–16] — Current inline augmentation to be replaced
- [Source: api/src/types/y-protocols.d.ts] — Example of existing .d.ts file in same directory
- [Source: gauntlet_docs/rerun-benchmarks.md] — Violation-counting script

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `api/src/types/express.d.ts` (created)
- `api/src/middleware/auth.ts` (modified — remove inline `declare global` augmentation)
- `api/src/routes/backlinks.ts` (modified — remove inline `declare global` augmentation)
- `api/src/routes/documents.ts` (modified — remove inline `declare global` augmentation)
- `api/src/routes/*.ts` (multiple files modified — remove `req.workspaceId!` and `req.userId!` assertions)