# Epic 1 Fix Plan — Aligning Rogue Implementation with Story Specs

**Date:** 2026-03-17
**Author:** Amelia (Dev Agent)
**Context:** An unauthorized agent implemented FleetGraph code from the original PRD specs without following the BMAD story process. This plan documents what's correct, what's wrong, and what needs to change.

---

## Summary

The existing `fleetgraph/` code is ~60% aligned with Epic 1 stories. Infrastructure (stories 1.1-1.4, 1.8) is functionally complete. Detection logic (stories 1.5-1.7) is incomplete — the reasoning prompt covers ~3 of 7 required detection categories and doesn't match the AC-specified severity/evidence/recommendation formats. No story files were updated, no tests exist, and no dev records were written.

---

## Story-by-Story Fix Plan

### Story 1.1: Scaffold FleetGraph Service — MINOR FIXES

**What's correct:**
- Express 4, node-cron, TypeScript, package.json, tsconfig.json all present
- `GET /health` returns correct JSON shape
- Cron fires every 3 minutes
- `npm run build` and `npm start` work

**What needs fixing:**

| # | Fix | File | Why |
|---|-----|------|-----|
| 1 | Health endpoint missing `lastRunTimestamp` field | `src/index.ts` | NFR13 requires uptime AND last-run timestamp |
| 2 | Cron interval not configurable via env var | `src/index.ts` | AC #3: "polling interval is configurable via environment variable" — currently hardcoded `*/3 * * * *` |
| 3 | Update story file: mark tasks complete, fill Dev Agent Record | `1-1-scaffold-fleetgraph-service.md` | Process compliance |

**Effort:** Small

---

### Story 1.2: Ship API Client + Parallel Fetch — MINOR FIXES

**What's correct:**
- `fetchWithRetry` with exponential backoff and 10s timeout
- Bearer token auth from env var
- 4 parallel fetch nodes wired in `proactive.ts`
- `traceable()` wrapping on fetchWithRetry

**What needs fixing:**

| # | Fix | File | Why |
|---|-----|------|-----|
| 1 | Issue filtering incomplete — no exclusion of done/cancelled in fetch node | `src/nodes/fetch.ts` | AC #5: "issues with status done or cancelled are excluded" — filtering happens in reasoning.ts, not at fetch time. Should filter at fetch level per AC. |
| 2 | Essential field extraction not happening at fetch level | `src/nodes/fetch.ts` | AC #5: "only essential fields are extracted: id, title, status, assignee_id, priority, updated_at, created_at" — full issue objects are passed through |
| 3 | Verify error accumulation doesn't clobber parallel errors | `src/nodes/fetch.ts` | Fetch nodes return `errors: []` on success — confirm reducer handles this correctly |
| 4 | Update story file | `1-2-ship-api-client-parallel-fetching.md` | Process compliance |

**Effort:** Small

---

### Story 1.3: Proactive Health Analysis — MODERATE FIXES

**What's correct:**
- ChatAnthropic with `claude-sonnet-4-6`, temperature 0, max 4096 tokens
- Zod schema for structured output with `withStructuredOutput()`
- `determineSeverity()` function matches spec
- Token budget management (cap at 100 issues)

**What needs fixing:**

| # | Fix | File | Why |
|---|-----|------|-----|
| 1 | Finding schema missing fields | `src/state.ts` | AC #3 requires: `id`, `severity`, `title`, `description`, `evidence`, `recommendation`. Current schema has `affectedDocumentId`, `affectedDocumentTitle`, `suggestedAction` instead of `evidence` and `recommendation`. |
| 2 | Zod schema for structured output doesn't match AC field names | `src/nodes/reasoning.ts` | Must use `evidence` (string with issue IDs/sprint names/timestamps) and `recommendation` (string), not `affectedDocumentId`/`suggestedAction` |
| 3 | Named tool use missing | `src/nodes/reasoning.ts` | AC #2: must use `{ name: 'project_health_analysis' }` in withStructuredOutput call — verify this is present |
| 4 | Update story file | `1-3-proactive-health-analysis-claude.md` | Process compliance |

**Effort:** Moderate — schema change ripples through state.ts, reasoning.ts, actions.ts

---

### Story 1.4: Conditional Execution Paths — CORRECT, PROCESS ONLY

**What's correct:**
- Three-way conditional edge: clean → log_clean_run, findings → propose_actions → confirmation_gate, errors → graceful_degrade
- `proposeActions` maps findings to ProposedAction with `requiresConfirmation: true`
- `confirmationGate` uses LangGraph `interrupt()`
- `logCleanRun` logs correct message

**What needs fixing:**

| # | Fix | File | Why |
|---|-----|------|-----|
| 1 | `confirmationGate` return type is weakly typed | `src/nodes/actions.ts` | `as Record<string, unknown>` should be properly typed |
| 2 | Update story file | `1-4-conditional-execution-paths.md` | Process compliance |

**Effort:** Small

---

### Story 1.5: Detect Unassigned Issues + Missing Sprint Assignments — INCOMPLETE

**What's correct:**
- The reasoning prompt mentions unassigned issues vaguely

**What needs fixing:**

| # | Fix | File | Why |
|---|-----|------|-----|
| 1 | Add explicit detection category for unassigned issues | `src/nodes/reasoning.ts` | AC #1: severity `warning`, evidence = issue title + ID, recommendation = "assign an owner" — current prompt is vague, not structured per AC |
| 2 | Add explicit detection category for missing sprint assignments | `src/nodes/reasoning.ts` | AC #2: severity `info` (or `warning` if high priority), evidence = issue title + ID + priority, recommendation = "assign to a sprint" |
| 3 | Update story file | `1-5-detect-unassigned-issues-missing-sprints.md` | Process compliance |

**Effort:** Moderate — prompt rewrite required

---

### Story 1.6: Detect Duplicates + Empty Sprints — NOT IMPLEMENTED

**What's correct:**
- Nothing — these detection categories are absent from the prompt

**What needs fixing:**

| # | Fix | File | Why |
|---|-----|------|-----|
| 1 | Add duplicate issue detection to prompt | `src/nodes/reasoning.ts` | AC #1: severity `warning`, evidence = duplicate issue IDs/titles grouped, recommendation = "consolidate or close" |
| 2 | Add empty active sprint detection to prompt | `src/nodes/reasoning.ts` | AC #2: severity `critical`, evidence = sprint name, recommendation = "populate or close" |
| 3 | Ensure sprint data includes issue counts for empty detection | `src/nodes/fetch.ts` | Claude needs to know which sprints have zero issues |
| 4 | Update story file | `1-6-detect-duplicates-empty-sprints.md` | Process compliance |

**Effort:** Moderate

---

### Story 1.7: Ticket Numbers, Security Issues, High-Priority — NOT IMPLEMENTED

**What's correct:**
- Nothing — these detection categories are absent from the prompt

**What needs fixing:**

| # | Fix | File | Why |
|---|-----|------|-----|
| 1 | Add missing ticket number detection to prompt | `src/nodes/reasoning.ts` | AC #1: severity `info`, evidence = issue titles lacking numbers, recommendation = "add ticket numbers" |
| 2 | Add unowned security issue detection to prompt | `src/nodes/reasoning.ts` | AC #2: severity `critical`, evidence = security issue IDs/titles/tags, recommendation = "assign owner immediately" |
| 3 | Add unscheduled high-priority detection to prompt | `src/nodes/reasoning.ts` | AC #3: severity `warning`, evidence = issue IDs/titles/priority, recommendation = "schedule in current or next sprint" |
| 4 | Update story file | `1-7-detect-ticket-numbers-security-priority.md` | Process compliance |

**Effort:** Moderate — prompt engineering for 3 new categories

---

### Story 1.8: Graceful Degradation — MINOR FIXES

**What's correct:**
- `gracefulDegrade` node exists, returns clean severity + empty findings
- Conditional edge routes there when errors + no data
- Cron handler has try/catch with fresh thread ID per run

**What needs fixing:**

| # | Fix | File | Why |
|---|-----|------|-----|
| 1 | Add partial-data instruction to reasoning prompt | `src/nodes/reasoning.ts` | AC #1: "agent does not produce findings about data it couldn't fetch" — prompt needs explicit instruction to skip unavailable categories |
| 2 | Verify cron resilience — no state leak between runs | `src/index.ts` | AC #2: confirm MemorySaver state isolation per thread_id |
| 3 | Update story file | `1-8-graceful-degradation.md` | Process compliance |

**Effort:** Small

---

## Cross-Cutting Fixes

### Finding Schema Alignment

The current `Finding` interface in `state.ts` uses:
```
id, severity, title, description, affectedDocumentId, affectedDocumentTitle, suggestedAction
```

The stories require:
```
id, severity, title, description, evidence, recommendation
```

This is a **breaking schema change** that affects: `state.ts`, `reasoning.ts`, `actions.ts`, and the Zod structured output schema. Must be done first before detection category work.

### Process Compliance (All Stories)

For each story file, after completing code fixes:
1. Update `Status:` from `ready-for-dev` to `done`
2. Check off all completed `[ ]` → `[x]` task items
3. Fill Dev Agent Record: agent model, completion notes, file list

---

## Execution Order

The fixes have dependencies. Recommended order:

1. **Finding schema alignment** (state.ts) — everything depends on this
2. **Story 1.1 fixes** (health endpoint, configurable cron)
3. **Story 1.2 fixes** (issue filtering at fetch level, field extraction)
4. **Story 1.3 fixes** (Zod schema update, named tool use verification)
5. **Story 1.4 fixes** (type safety in confirmation gate)
6. **Story 1.5** (rewrite reasoning prompt — unassigned + missing sprint)
7. **Story 1.6** (add to reasoning prompt — duplicates + empty sprints)
8. **Story 1.7** (add to reasoning prompt — tickets + security + priority)
9. **Story 1.8 fixes** (partial data prompt instruction)
10. **Type-check + build verification** across all changes
11. **Update all 8 story files** with status, tasks, dev records

---

## Risk Notes

- **No tests exist.** The BMAD dev process requires tests before marking tasks complete. Writing unit tests for the reasoning prompt (mocked LLM responses) and fetch nodes (mocked HTTP) would be the right thing to do, but may conflict with the MVP deadline. Recommend at minimum a type-check pass and manual verification via LangSmith traces.
- **Prompt changes are the highest-risk items.** Stories 1.5-1.7 are all prompt engineering. The 7 detection categories need to be specific enough that Claude produces correctly-shaped findings, but not so rigid that Claude can't reason about edge cases.
- **Schema change is a coordinated edit.** Finding field rename (affectedDocumentId → evidence, suggestedAction → recommendation) touches 3-4 files. Must be done atomically.
