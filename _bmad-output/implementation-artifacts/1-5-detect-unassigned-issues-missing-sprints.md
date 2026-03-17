# Story 1.5: Detect Unassigned Issues and Missing Sprint Assignments

Status: done

## Story

As a **software engineer**,
I want the agent to detect issues with no assignee and issues not assigned to any sprint,
so that I can fix ownership and scheduling gaps before evaluators notice them.

## Acceptance Criteria

1. **Given** the project has issues where `assignee_id` is null or empty
   **When** the proactive graph runs
   **Then** the agent produces a finding for each unassigned issue with severity `warning`, the issue title and ID as evidence, and a recommendation to assign an owner

2. **Given** the project has issues in active states (not done/cancelled) with no sprint association
   **When** the proactive graph runs
   **Then** the agent produces a finding for each unscheduled issue with severity `info` (or `warning` if high priority), the issue title and ID as evidence, and a recommendation to assign to a sprint

## Tasks / Subtasks

- [x] Update `analyze_health` prompt to detect unassigned issues (AC: #1)
  - [x] Add detection instruction: scan for issues where `assignee_id` is null/undefined/empty
  - [x] Specify severity: `warning`
  - [x] Specify evidence format: include issue ID and title
  - [x] Specify recommendation: "Assign an owner to prevent orphaned work"
- [x] Update `analyze_health` prompt to detect missing sprint assignments (AC: #2)
  - [x] Add detection instruction: scan for active issues not associated with any sprint
  - [x] Specify severity: `info` for normal priority, `warning` for high/urgent priority
  - [x] Specify evidence format: include issue ID, title, and priority
  - [x] Specify recommendation: "Schedule in current or next sprint to ensure visibility"
- [x] Verify findings appear in structured output with correct schema

## Dev Notes

### Architecture Compliance

- **Detection happens in the LLM reasoning node**, not in code. The `analyze_health` prompt instructs Claude what to look for. Claude reasons over the data and produces structured findings via the Zod schema.
- **Do NOT implement detection as code-level rules.** The architecture decision is to use Claude's reasoning capability for all detection, constrained by structured output schemas.

### How Detection Works in FleetGraph

The `analyze_health` node sends filtered project data to Claude with a system prompt that includes detection instructions. Claude analyzes the data and returns structured findings. The detection categories (unassigned, no sprint, etc.) are defined in the prompt, not in conditional code.

Stories 1.5, 1.6, and 1.7 are all **prompt engineering changes** to the `analyze_health` reasoning node in `src/nodes/reasoning.ts`.

### References

- [Source: architecture.md#4-node-design-decisions] — Reasoning node design
- [Source: prd.md#FR2] — Detect unassigned issues
- [Source: prd.md#FR3] — Detect issues with no sprint assignment
- [Source: epics.md#story-1.5] — Story definition with acceptance criteria

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (Amelia, Dev Agent) — fix pass aligning rogue implementation with story specs

### Completion Notes List

- Original prompt had vague "unassigned issues in active sprints" instruction without structured severity/evidence/recommendation specs
- Fix pass: complete prompt rewrite with explicit detection category #1 (UNASSIGNED ISSUES) and #2 (MISSING SPRINT ASSIGNMENT) matching AC severity levels, evidence formats, and recommendations exactly
- Detection relies on Claude reasoning over `assignee_id` field and cross-referencing issues with sprint data

### File List

- `fleetgraph/src/nodes/reasoning.ts`
