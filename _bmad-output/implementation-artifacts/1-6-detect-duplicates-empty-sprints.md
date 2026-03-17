# Story 1.6: Detect Duplicate Issues and Empty Active Sprints

Status: done

## Story

As a **software engineer**,
I want the agent to detect duplicate issues and sprints with no assigned work,
so that I avoid redundant effort and don't have empty sprints sitting in my project.

## Acceptance Criteria

1. **Given** the project has issues with identical or near-identical titles
   **When** the proactive graph runs
   **Then** the agent produces a finding for each duplicate set with severity `warning`, listing the duplicate issue IDs and titles as evidence, and a recommendation to consolidate or close duplicates

2. **Given** the project has an active sprint with zero issues assigned
   **When** the proactive graph runs
   **Then** the agent produces a finding with severity `critical`, the sprint name as evidence, and a recommendation to either populate the sprint or close it

## Tasks / Subtasks

- [x] Update `analyze_health` prompt to detect duplicate issues (AC: #1)
  - [x] Add detection instruction: identify issues with identical or near-identical titles (fuzzy match)
  - [x] Specify severity: `warning`
  - [x] Specify evidence format: list all duplicate issue IDs and titles grouped by similarity
  - [x] Specify recommendation: "Consolidate duplicates to avoid redundant effort"
- [x] Update `analyze_health` prompt to detect empty active sprints (AC: #2)
  - [x] Add detection instruction: identify active sprints with zero issues assigned
  - [x] Specify severity: `critical` — empty sprints are a significant process failure
  - [x] Specify evidence format: sprint name/ID
  - [x] Specify recommendation: "Either assign issues to this sprint or close it — empty sprints indicate process breakdown"
- [x] Verify findings appear in structured output with correct schema

## Dev Notes

### Architecture Compliance

- **Same pattern as Story 1.5**: Detection happens in Claude's reasoning prompt, not code-level rules.
- **Shared file**: Changes go in `src/nodes/reasoning.ts` in the `analyze_health` prompt.

### Duplicate Detection Nuance

Claude uses fuzzy matching for duplicates:
- **Exact match**: "Fix login bug" and "Fix login bug" → definite duplicate
- **Near match**: "Fix login bug" and "fix Login Bug" → likely duplicate (case difference)
- **Similar**: "Fix login page bug" and "Fix login authentication bug" → possible duplicate

### References

- [Source: prd.md#FR4] — Detect duplicate issues
- [Source: prd.md#FR5] — Detect empty active sprints
- [Source: epics.md#story-1.6] — Story definition with acceptance criteria

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (Amelia, Dev Agent) — fix pass aligning rogue implementation with story specs

### Completion Notes List

- These detection categories were completely absent from original implementation
- Fix pass: added detection category #3 (DUPLICATE ISSUES) and #4 (EMPTY ACTIVE SPRINTS) to `analyze_health` prompt with exact severity/evidence/recommendation per ACs
- Empty sprint detection is `critical` severity per AC — this is the highest severity detection category alongside unowned security issues

### File List

- `fleetgraph/src/nodes/reasoning.ts`
