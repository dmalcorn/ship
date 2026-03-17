# Story 4.1: FLEETGRAPH.md — Agent Responsibility, Graph Diagram, and Trigger Model

Status: complete

## Story

As a **submitter**,
I want FLEETGRAPH.md to document what the agent monitors, what it can do autonomously, what requires human approval, and how the graph is structured,
so that evaluators can assess the agent's design quality and architectural reasoning.

## Acceptance Criteria

1. **Given** FLEETGRAPH.md is created at the repository root
   **When** the Agent Responsibility section is complete
   **Then** it defines: what the agent monitors proactively, what it reasons about on-demand, what it does autonomously (read-only + notify), what requires confirmation (all write actions), who it notifies and when, how it knows project membership, and how on-demand mode uses document context

2. **Given** the Graph Diagram section
   **When** an evaluator reads it
   **Then** it contains a Mermaid diagram showing all nodes, edges, and conditional branches for both proactive and on-demand graphs
   **And** the three conditional paths after `analyze_health` are clearly labeled (clean → log_clean_run, findings → propose_actions, errors → graceful_degrade)

3. **Given** the Trigger Model section
   **When** an evaluator reads it
   **Then** it documents the polling decision (3-minute cron), the tradeoffs considered (polling vs. webhook vs. hybrid), the cost implications, and why this meets the < 5 minute detection latency requirement

**FRs:** FR36, FR37

## Tasks / Subtasks

- [x] Task 1: Create `FLEETGRAPH.md` at repository root (AC: #1)
  - [x] 1.1: Add document header with project name, one-line description, and deployment URL
  - [x] 1.2: Write Agent Responsibility section covering all 7 sub-topics from AC #1

- [x] Task 2: Write Graph Diagram section (AC: #2)
  - [x] 2.1: Create Mermaid diagram for proactive graph showing: `resolve_context` → parallel fetch fan-out (4 nodes) → `analyze_health` → 3-way conditional (clean/findings/errors)
  - [x] 2.2: Create Mermaid diagram for on-demand graph showing: `resolve_context` → parallel fetch fan-out (3 nodes) → `analyze_context` → 2-way conditional (clean/findings)
  - [x] 2.3: Add prose explaining the three conditional paths and what determines routing

- [x] Task 3: Write Trigger Model section (AC: #3)
  - [x] 3.1: Document the polling decision (3-minute cron via `node-cron`)
  - [x] 3.2: Create tradeoff comparison table (polling vs. webhook vs. hybrid vs. WebSocket)
  - [x] 3.3: Show latency math: 3 min poll gap + ~5 sec execution = ~3:05 worst case, well under 5 min
  - [x] 3.4: Document cost implications of 3-minute polling (~480 runs/day, ~$17/day at $0.036/run)

## Dev Notes

### This Is a Documentation Story — No Code Changes

The output is a single file: `FLEETGRAPH.md` at the repository root (`/workspace/FLEETGRAPH.md`). No TypeScript, no tests, no build changes. The dev agent writes markdown.

### Content Sources — Use These, Don't Invent

All content for this story exists in planning artifacts. The dev agent MUST source from these documents, not hallucinate:

| Section | Primary Source | File Path |
|---------|---------------|-----------|
| Agent Responsibility | PRESEARCH §1 (Agent Responsibility Scoping) | `gauntlet_docs/PRESEARCH.md` — Phase 1, questions 1-6 |
| Graph Diagram | Architecture §3 (Graph Architecture) | `_bmad-output/planning-artifacts/architecture.md` — Section 3, includes Mermaid diagrams |
| Trigger Model | PRESEARCH §3 (Trigger Model Decision) | `gauntlet_docs/PRESEARCH.md` — Phase 1, question 3 |

### Mermaid Diagrams Already Exist

The architecture document (`_bmad-output/planning-artifacts/architecture.md` §3) contains complete Mermaid diagrams for both proactive and on-demand graphs. The dev agent should adapt these — do NOT create diagrams from scratch.

**Proactive graph** key structure:
```
START → resolve_context → [fetch_issues | fetch_sprint | fetch_team | fetch_standups] (parallel)
      → analyze_health → clean? → log_clean_run → END
                       → findings? → propose_actions → confirmation_gate → END
                       → errors? → graceful_degrade → END
```

**On-demand graph** key structure:
```
START → resolve_context → [fetch_issues | fetch_sprint | fetch_team] (parallel)
      → analyze_context → clean? → log_clean_run → END
                        → findings? → propose_actions → confirmation_gate → END
```

### Agent Responsibility Content Outline

From PRESEARCH §1, the Agent Responsibility section must cover:

1. **What it monitors proactively**: Unassigned issues, missing sprint assignments, duplicate issues, empty active sprints, missing ticket numbers, unowned security issues, unscheduled high-priority work
2. **What it reasons about on-demand**: Sprint health (velocity, completion, blockers), issue context (dependencies, assignee workload, timeline risk)
3. **What it does autonomously**: Read-only — query Ship API, analyze data, generate findings, deliver notifications. NEVER modifies Ship data.
4. **What requires confirmation**: All write actions — state changes, assignments, priority updates, creating documents, bulk operations
5. **Who it notifies**: Issue assignee, project owner, sprint owner. Findings delivered to agent findings panel.
6. **How it knows project membership**: Queries workspace members, person documents, issue assignments, team grid, document associations
7. **How on-demand uses context**: Receives `documentId` + `documentType` from frontend, fetches document + associations + history, scopes reasoning to that context

### Trigger Model Content Outline

From PRESEARCH §3:

| Approach | Pros | Cons |
|----------|------|------|
| Uniform polling | Simple | Wasteful, doesn't scale |
| Webhook-based | Near-instant | Requires building webhook dispatch into Ship API |
| **Adaptive polling (chosen)** | 60-70% fewer calls, meets latency target | More complex scheduling |
| Hybrid (poll + WebSocket) | Lowest latency | WS management complexity |

**Why 3-minute cron**: Ship has no webhook system. 3-minute interval guarantees worst-case 3:05 detection (3 min gap + 5 sec execution), well under the 5-minute requirement. Cost: ~480 runs/day × $0.036 = ~$17/day.

### File Output Path

```
/workspace/FLEETGRAPH.md
```

Create the file fresh. Do NOT look for an existing FLEETGRAPH.md to edit.

### Architecture Constraints — DO NOT VIOLATE

- **Read-only agent is permanent** — not an MVP shortcut, it's an architectural decision driven by government platform context (Architecture §12)
- **FleetGraph never writes to Ship** — all proposed actions require human confirmation
- **Ship API is sole data source** — no direct database access
- **LangSmith is the only observability tool** — no custom metrics

### Previous Story Intelligence

From **Story 3.1** (LangSmith Tracing):
- The 3 distinct trace paths are already implemented and visible in LangSmith
- MemorySaver `interrupt()` pattern is settled — returns result with `__interrupt__` key
- Thread isolation uses `proactive-${Date.now()}` pattern for cron runs

### Project Structure Notes

- FLEETGRAPH.md goes at repo root: `/workspace/FLEETGRAPH.md`
- NOT inside `fleetgraph/` directory
- NOT inside `_bmad-output/` or `docs/`
- This is a graded deliverable — evaluators look for it at the repo root

### References

- [Source: gauntlet_docs/PRESEARCH.md — Phase 1 (Agent Responsibility, Use Cases, Trigger Model)]
- [Source: _bmad-output/planning-artifacts/architecture.md — Section 3 (Graph Architecture)]
- [Source: _bmad-output/planning-artifacts/architecture.md — Section 3 (Mermaid Diagrams)]
- [Source: _bmad-output/planning-artifacts/epics.md — Story 4.1 acceptance criteria]
- [Source: _bmad-output/planning-artifacts/prd.md — FR36, FR37]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

N/A — documentation story, no code changes

### Completion Notes List

- Created `/workspace/FLEETGRAPH.md` with Agent Responsibility (7 sub-topics), Graph Diagram (2 Mermaid diagrams + routing prose), and Trigger Model (tradeoff table + latency math + cost)
- All content sourced from `gauntlet_docs/PRESEARCH.md` and `_bmad-output/planning-artifacts/architecture.md`
- Mermaid diagrams adapted from architecture document §3

### File List

- `/workspace/FLEETGRAPH.md` (created)
