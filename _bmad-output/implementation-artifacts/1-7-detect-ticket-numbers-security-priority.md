# Story 1.7: Detect Missing Ticket Numbers, Unowned Security Issues, and Unscheduled High-Priority Work

Status: done

## Story

As a **software engineer**,
I want the agent to detect issues missing ticket number conventions, security-tagged issues with no owner, and high-priority work not in any sprint,
so that I maintain project hygiene standards and don't leave critical work untracked.

## Acceptance Criteria

1. **Given** the project has issues whose titles don't follow the expected ticket number pattern
   **When** the proactive graph runs
   **Then** the agent produces a finding with severity `info`, listing the issue titles as evidence, and a recommendation to add ticket numbers

2. **Given** the project has issues tagged with security-related labels and no `assignee_id`
   **When** the proactive graph runs
   **Then** the agent produces a finding with severity `critical`, listing the security issues as evidence, and a recommendation to assign an owner immediately

3. **Given** the project has high-priority issues (`priority` = urgent or high) not assigned to any sprint
   **When** the proactive graph runs
   **Then** the agent produces a finding with severity `warning`, listing the issues as evidence, and a recommendation to schedule them in the current or next sprint

## Tasks / Subtasks

- [x] Update `analyze_health` prompt to detect missing ticket numbers (AC: #1)
  - [x] Add detection instruction: identify issues whose titles lack a ticket number prefix (e.g., `PROJ-123:` or `#123`)
  - [x] Specify severity: `info`
  - [x] Specify evidence: list issue titles without ticket numbers
  - [x] Specify recommendation: "Add ticket number prefix for traceability"
  - [x] Smart handling: only flag if SOME issues have numbers and others don't (inconsistency)
- [x] Update `analyze_health` prompt to detect unowned security issues (AC: #2)
  - [x] Add detection instruction: identify issues with security-related tags/labels AND null assignee_id
  - [x] Specify severity: `critical` — security work without an owner is a serious gap
  - [x] Specify evidence: list security issue IDs, titles, and tags
  - [x] Specify recommendation: "Assign an owner immediately — unowned security work creates unacceptable risk"
- [x] Update `analyze_health` prompt to detect unscheduled high-priority work (AC: #3)
  - [x] Add detection instruction: identify issues with priority `urgent` or `high` that are not in any sprint
  - [x] Specify severity: `warning`
  - [x] Specify evidence: list issue IDs, titles, and priority
  - [x] Specify recommendation: "Schedule in the current or next sprint"
- [x] Verify all three detection categories produce correct findings

## Dev Notes

### Architecture Compliance

- **Same pattern as Stories 1.5 and 1.6**: Detection via Claude reasoning prompt, not code rules.
- **Shared file**: Changes go in `src/nodes/reasoning.ts` in the `analyze_health` prompt.
- **This completes all 7 detection categories** for the proactive reasoning node.

### Complete Detection Category Summary

| # | Category | Severity | Story |
|---|----------|----------|-------|
| 1 | Unassigned issues | warning | 1.5 |
| 2 | Missing sprint assignment | info/warning | 1.5 |
| 3 | Duplicate issues | warning | 1.6 |
| 4 | Empty active sprints | critical | 1.6 |
| 5 | Missing ticket numbers | info | 1.7 |
| 6 | Unowned security issues | critical | 1.7 |
| 7 | Unscheduled high-priority work | warning | 1.7 |

### Security Detection Keywords

Claude scans for title keywords: security, vulnerability, CVE, auth, authentication, authorization, XSS, injection, CSRF

### Ticket Number Convention Handling

Prompt instructs Claude to only flag inconsistency — if NO issues have ticket numbers, the project may not use that convention and it should not be flagged.

### References

- [Source: prd.md#FR6] — Detect missing ticket number conventions
- [Source: prd.md#FR7] — Detect unowned security-tagged issues
- [Source: prd.md#FR8] — Detect unscheduled high-priority work
- [Source: epics.md#story-1.7] — Story definition with acceptance criteria

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (Amelia, Dev Agent) — fix pass aligning rogue implementation with story specs

### Completion Notes List

- All three detection categories were completely absent from original implementation
- Fix pass: added detection categories #5 (MISSING TICKET NUMBERS), #6 (UNOWNED SECURITY ISSUES), #7 (UNSCHEDULED HIGH-PRIORITY WORK) to `analyze_health` prompt
- Ticket number detection includes smart handling: only flags inconsistency, not absence of convention
- Security detection uses keyword matching in titles since Ship may not have explicit tagging

### File List

- `fleetgraph/src/nodes/reasoning.ts`
