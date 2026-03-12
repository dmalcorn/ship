# Story 5.2: Typed Database Row Interfaces

Status: ready-for-dev

> **YOLO-safe:** This story can be executed under YOLO permissions. All changes are local file edits — no destructive operations, no deploys, no interactive prompts. `pnpm type-check` and `pnpm test` are the only verification commands needed.

## Story

As a developer reading route handler code,
I want database query results typed at the query boundary,
So that `: any` annotations scattered through `projects.ts` and `weeks.ts` are replaced by explicit typed interfaces that reflect the actual data shape.

## Acceptance Criteria

1. **Given** `ProjectRow`, `SprintRow`, and `WeekRow` (or equivalent) interfaces are defined matching the SQL query shapes in `api/src/routes/projects.ts` and `api/src/routes/weeks.ts`
   **When** `pnpm type-check` is run
   **Then** zero new compiler errors are introduced

2. **Given** the typed interfaces exist
   **When** `extractProjectFromRow(row: any)` and `extractSprintFromRow(row: any)` in `projects.ts` are updated to use `row: ProjectRow` and `row: SprintRow`
   **Then** the `: any` parameter annotations on those helper functions are eliminated

3. **Given** the typed interfaces exist
   **When** `extractSprintFromRow(row: any)` in `weeks.ts` is updated similarly
   **Then** the `: any` parameter annotation on that helper is eliminated

4. **Given** the changes are applied
   **When** the violation-counting script is run (see Story 5.1 AC #4 for the full script)
   **Then** `api.any1` (`: any` count) is reduced by ≥15 compared to the Story 5.1 post-state

5. **Given** the changes are applied
   **When** `pnpm test` is run
   **Then** all tests pass with no new failures (baseline: 6 pre-existing failures in `auth.test.ts` only)

## Tasks / Subtasks

- [ ] Task 1: Audit current `: any` annotations in `projects.ts` (AC: #1, #2)
  - [ ] Read `api/src/routes/projects.ts` lines 1–50 to see `extractProjectFromRow(row: any)` function signature
  - [ ] Read lines ~100–140 to see `generatePrefilledRetroContent(projectData: any, sprints: any[], issues: any[])`
  - [ ] Read lines ~1100–1110 to see `extractSprintFromRow(row: any)`
  - [ ] Run: `grep -n ": any" api/src/routes/projects.ts` to list all `: any` annotations and their lines

- [ ] Task 2: Audit current `: any` annotations in `weeks.ts` (AC: #1, #3)
  - [ ] Read `api/src/routes/weeks.ts` lines 180–210 to see `extractSprintFromRow(row: any)` function
  - [ ] Run: `grep -n ": any" api/src/routes/weeks.ts` to list all `: any` annotations and their lines

- [ ] Task 3: Define `ProjectRow` interface in `projects.ts` (AC: #1, #2)
  - [ ] Identify the SQL query that feeds `extractProjectFromRow` — look at the SELECT columns in the queries that call it (around lines 410, 484, 567, 589, 847)
  - [ ] Define the interface above `extractProjectFromRow`:
    ```typescript
    interface ProjectRow {
      id: string;
      title: string;
      document_type: string;
      created_at: string;
      updated_at: string;
      properties: Record<string, unknown> | null;
      program_id: string | null;
      inferred_status: string | null;
      // Add any other columns actually SELECTed by the query
    }
    ```
  - [ ] Update `extractProjectFromRow(row: any)` → `extractProjectFromRow(row: ProjectRow)`
  - [ ] Run `pnpm type-check` — if errors appear, adjust the interface to match what the code actually accesses on `row`

- [ ] Task 4: Define `SprintRow` interface in `projects.ts` (AC: #1, #2)
  - [ ] Read `extractSprintFromRow` around line 1102 to see what properties it accesses from `row`
  - [ ] Define `SprintRow` interface above the function matching the accessed fields
  - [ ] Update the function signature from `row: any` to `row: SprintRow`
  - [ ] Run `pnpm type-check` to verify no new errors

- [ ] Task 5: Define typed row interfaces in `weeks.ts` (AC: #1, #3)
  - [ ] Read `extractSprintFromRow` in `weeks.ts` (~line 186) to see what properties it accesses from `row`
  - [ ] Note: `weeks.ts` and `projects.ts` both have `extractSprintFromRow` — they may have different shapes (check both)
  - [ ] Define the interface in `weeks.ts` (e.g. `WeekSprintRow`) and update the function signature
  - [ ] Also type any other heavily-used `row: any` patterns (e.g. the result loop at ~line 457)
  - [ ] Run `pnpm type-check` to verify

- [ ] Task 6: Address other high-impact `: any` annotations in both files (AC: #4)
  - [ ] In `projects.ts`, check `generatePrefilledRetroContent(projectData: any, sprints: any[], issues: any[])` — define minimal inline types or interfaces for these parameters based on what properties the function accesses
  - [ ] Check `const values: any[]` patterns (around lines 631, 1038, 1053 in projects.ts; ~line 609 in weeks.ts) — these hold SQL parameter arrays of mixed types; use `(string | number | boolean | null)[]` or `unknown[]` instead of `any[]`
  - [ ] For filter callbacks like `(i: any) => i.state === 'done'` (lines ~959–985 in projects.ts, ~712 in weeks.ts), define a minimal `IssueRow` interface or inline type
  - [ ] Do not over-engineer — focus on meaningful types, not `unknown` substitutions without narrowing

- [ ] Task 7: Run violation count to verify reduction (AC: #4)
  - [ ] Run the node violation-counting script from Story 5.1 AC #4
  - [ ] Record `api.any1` value — must be reduced by ≥15 from post-Story-5.1 state
  - [ ] Save output for Story 5.5

- [ ] Task 8: Run unit tests (AC: #5)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm only the 6 pre-existing `auth.test.ts` failures remain
  - [ ] ⚠️ `pnpm test` truncates the DB. Run `pnpm db:seed` afterward if needed

## Dev Notes

### Context

`pg` (the PostgreSQL client) types `result.rows` as `any[]`. Every helper function that receives a row (`extractProjectFromRow`, `extractSprintFromRow`) currently declares its parameter as `any`, which cascades `: any` throughout the code inside those functions.

The fix is **not** to cast `result.rows as ProjectRow[]` everywhere — that would be `as any` equivalent. The goal is to define interfaces matching the actual SQL column shapes and use them as parameter types on the helper functions. The type system then checks that the code inside those helpers only accesses properties that exist on the interface.

### Interface Design Guidance

- Keep interfaces **faithful to the SQL query output** — not the final JS object shape after transformation. The function transforms the row, so the interface should reflect what comes FROM the DB, not what goes to the client.
- If a column may be NULL in the DB, type it as `T | null`.
- For `properties` JSONB columns, use `Record<string, unknown> | null` — not `any`.
- Don't add properties not actually selected by the query (TypeScript structural typing means extra properties on the real object are fine anyway).

### `values: any[]` SQL Parameters

SQL parameter arrays like `const values: any[] = [workspaceId, ...]` are a common pattern. Using `unknown[]` here would require casts on every push. Use `(string | number | boolean | null)[]` which is both accurate and strict — SQL params are always one of these four types.

### File Locations

- **Primary files:** `api/src/routes/projects.ts`, `api/src/routes/weeks.ts`
- **No new files needed** — interfaces go in the same file as the functions that use them

### Baseline Numbers (for Story 5.5 comparison)

From `gauntlet_docs/baselines.md`:
- `api.any1` (`: any`): 81 total in api package
- Target: reduce by ≥15 across the two files

### Commit Message

```
fix(types): add typed row interfaces to projects.ts and weeks.ts
```

### References

- [Source: gauntlet_docs/ShipShape-fix-plan.md] — Fix 1-B, root cause and approach
- [Source: gauntlet_docs/baselines.md#Cat-1] — Before violation counts
- [Source: api/src/routes/projects.ts:18] — `extractProjectFromRow(row: any)` — primary target
- [Source: api/src/routes/projects.ts:1102] — `extractSprintFromRow(row: any)` — secondary target
- [Source: api/src/routes/weeks.ts:186] — `extractSprintFromRow(row: any)` in weeks context

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `api/src/routes/projects.ts` (modified — add ProjectRow, SprintRow interfaces; type helper function params)
- `api/src/routes/weeks.ts` (modified — add WeekSprintRow interface; type helper function params)