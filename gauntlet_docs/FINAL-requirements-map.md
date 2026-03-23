# Final Requirements Map

**Source:** `gauntlet_docs/FleetGraph_PRD.md` — Full PRD requirements across all submission deadlines
**Final Status Date:** 2026-03-23 (Final Submission deadline — Sunday, 11:59 PM)
**Overall Status:** All 26 requirements fully satisfied. Project complete and deployed.

This document maps every PRD requirement to how it is satisfied in the current implementation, covering MVP, Early Submission, and Final Submission deliverables.

---

## MVP Requirements (Due Tuesday, 11:59 PM)

> All items required to pass (FleetGraph_PRD.md, lines 117-127)

### 1. Graph running with at least one proactive detection wired end-to-end

**Status:** Satisfied

**How:** The proactive graph in `fleetgraph/src/graph/proactive.ts` is fully wired:

```
START → resolve_context → [fetch_issues | fetch_sprint | fetch_team | fetch_standups] (parallel)
      → analyze_health → conditional routing → END
```

The `analyze_health` reasoning node (in `fleetgraph/src/nodes/reasoning.ts`) detects 7 quality categories against real Ship data:
- Unassigned issues
- Missing sprint assignments
- Duplicate issues
- Empty active sprints
- Missing ticket number conventions
- Unowned security-tagged issues
- Unscheduled high-priority work

The graph runs on a 3-minute cron cycle via `node-cron` in `fleetgraph/src/index.ts`.

---

### 2. LangSmith tracing enabled with at least two shared trace links submitted showing different execution paths

**Status:** Satisfied

**How:**
- LangSmith tracing is auto-enabled via `LANGSMITH_TRACING=true` environment variable
- All Ship API calls are wrapped with `traceable()` from `langsmith/traceable` in `fleetgraph/src/utils/ship-api.ts`
- Two shared trace links demonstrating different execution paths:
  1. **Proactive findings detected:** [LangSmith Trace](https://smith.langchain.com/public/2418d5cb-4c21-4d20-a3db-3d5c5be71761/r) — proactive graph with 4 parallel fetch nodes + `analyze_health`
  2. **On-demand analysis:** [LangSmith Trace](https://smith.langchain.com/public/897a737f-cac3-4c83-a8f6-e05de855c1cf/r) — on-demand graph with 3 parallel fetch nodes + `analyze_context`

---

### 3. FLEETGRAPH.md submitted with Agent Responsibility and Use Cases sections completed — at least 5 use cases defined

**Status:** Satisfied

**How:** `gauntlet_docs/FLEETGRAPH.md` contains:

- **Agent Responsibility** section covering all 7 sub-topics required by the PRD:
  1. What it monitors proactively (7 detection categories)
  2. What it reasons about on-demand (sprint health, issue context, dependencies)
  3. What it does autonomously (read-only + notify)
  4. What requires human confirmation (all write actions)
  5. Who it notifies (assignee, project owner, sprint owner, program accountable, admins)
  6. How it knows project membership (5 API-based sources)
  7. How on-demand uses document context (documentId + documentType scoping)

- **Use Cases** section with 7 use cases (exceeds the 5 minimum):
  - 5 proactive (unassigned issues, empty sprint, duplicates, clean run, unowned security)
  - 2 on-demand (sprint health analysis, issue context analysis)
  - 2 roles represented (Engineer, Operator)

---

### 4. Graph outline complete — node types, edges, and branching conditions documented in FLEETGRAPH.md

**Status:** Satisfied

**How:** The **Graph Diagram** section of FLEETGRAPH.md contains:

- Mermaid diagram for the **proactive graph** showing all nodes, parallel fan-out, and 3-way conditional branching
- Mermaid diagram for the **on-demand graph** showing all nodes, parallel fan-out, and 2-way conditional branching
- **Conditional Path Routing** table explaining what determines each route (all fetches failed, no findings, findings detected)

---

### 5. At least one human-in-the-loop gate implemented

**Status:** Satisfied

**How:** The `confirmationGate` function in `fleetgraph/src/nodes/actions.ts` uses LangGraph's `interrupt()` to pause graph execution:

- When findings are detected, `propose_actions` maps them to proposed actions
- `confirmation_gate` calls `interrupt()` with findings and proposed actions
- Graph state is checkpointed via `MemorySaver`
- User resumes via `POST /api/fleetgraph/resume` with `{ threadId, decision }`
- The resume endpoint uses `Command({ resume: { decision } })` to continue execution
- Three decision types supported: `confirm`, `dismiss`, `snooze`

Both proactive and on-demand graphs route through the confirmation gate when findings are detected.

---

### 6. Running against real Ship data — no mocked responses

**Status:** Satisfied

**How:** All data comes from Ship's live REST API:

- `fleetgraph/src/utils/ship-api.ts` defines `fetchWithRetry` calling real endpoints:
  - `GET /api/issues` — all issues
  - `GET /api/weeks` / `GET /api/weeks/:id` — sprint data
  - `GET /api/weeks/:id/issues` — sprint issues
  - `GET /api/team/grid` — team allocation
  - `GET /api/standups/status` — standup completion
  - `GET /api/documents/:id` — document metadata (on-demand context)
  - `GET /api/documents/:id/associations` — document associations
  - `GET /api/issues/:id/history` — issue history
- Authentication via Bearer token (`FLEETGRAPH_API_TOKEN` environment variable)
- No mock data or fixture data in the production code path
- Each fetch node in `fleetgraph/src/nodes/fetch.ts` calls these live endpoints

---

### 7. Deployed and publicly accessible

**Status:** Satisfied

**How:** FleetGraph is deployed as a separate Railway service:

- **Dockerfile:** `Dockerfile.railway-fleetgraph` (node:20-slim, builds shared types + fleetgraph)
- **Build:** `cd fleetgraph && npm run build` (TypeScript compile to `dist/`)
- **Start:** `cd fleetgraph && node dist/index.js`
- **Health check:** `GET /health` returns `{ status: "ok", service: "fleetgraph", tracing: true, uptime, lastRunTimestamp }`
- **Port:** 3001 (configurable via `PORT` env var)
- Railway monitors the health endpoint for auto-restart
- Auto-deploy on push to `master`

---

### 8. Trigger model decision documented and defended in FLEETGRAPH.md

**Status:** Satisfied

**How:** The **Trigger Model** section of FLEETGRAPH.md contains:

- **Decision:** 3-minute cron polling via `node-cron` (configurable via `FLEETGRAPH_CRON_INTERVAL` env var)
- **Tradeoff analysis table** comparing 4 approaches: uniform polling, webhook-based, adaptive polling (chosen), hybrid (poll + WebSocket)
- **Latency defense:** Worst-case = 3 min poll gap + ~5 sec execution = ~3:05, well under the 5-minute requirement
- **Cost implications:** ~480 runs/day at ~$0.036/run = ~$17/day

---

## Early Submission Requirements (Due Friday, 11:59 PM)

> From FleetGraph_PRD.md, "Deliverables" section — sections due at Early Submission

### 9. Test Cases section completed in FLEETGRAPH.md

**Status:** Satisfied

**How:** The **Test Cases** section of FLEETGRAPH.md contains:

- Test case table with 7 entries mapping each use case to:
  - Ship state that triggers the agent
  - Expected detection output
  - Trace path through the graph
- **Trace Evidence** subsection with 2 shared LangSmith trace links showing distinct execution paths:
  - Proactive findings-detected path
  - On-demand analysis path
- Both traces are from runs against real Ship data

---

### 10. Architecture Decisions section completed in FLEETGRAPH.md

**Status:** Satisfied

**How:** The **Architecture Decisions** section covers 6 key decisions with tradeoffs:

1. **Framework:** LangGraph.js 1.2.2 — chosen for auto-tracing, TypeScript match, StateGraph abstraction
2. **Node Design:** Two separate compiled graphs — proactive (4 fetch + analyzeHealth) vs. on-demand (3 fetch + analyzeContext)
3. **State Management:** MemorySaver (in-memory) — zero-config checkpointing for interrupt/resume
4. **Deployment:** Separate Railway service — failure isolation, independent deploys, resource isolation
5. **Ship API Integration:** Bearer token + fetchWithRetry — long-lived auth, exponential backoff, traceable
6. **LLM:** Claude Sonnet 4.6 with structured output — Zod schema, withStructuredOutput(), named tool binding

---

## Final Submission Requirements (Due Sunday, 11:59 PM)

> From FleetGraph_PRD.md, "Deliverables" section — sections due at Final Submission

### 11. Cost Analysis section completed in FLEETGRAPH.md

**Status:** Satisfied

**How:** The **Cost Analysis** section contains:

- **Development and Testing Costs:**
  - Model: Claude Sonnet 4.6
  - Estimated 50-100 development runs
  - ~4,000 tokens per run (2K input + 2K output)
  - ~$0.036/run, total estimated $1.80 - $3.60

- **Production Cost Model:**
  - Per-run cost breakdown by component (input/output tokens)
  - Projections at 4 scale tiers: MVP, 100 users, 1,000 users, 10,000 users
  - Both unoptimized and optimized (with rule-based pre-filtering) projections
  - Optimization path with 4 phases

---

## Graph Agent Architecture Requirements

> From FleetGraph_PRD.md, "Graph Agent Requirements — Architecture" section

Each required node type is verified below:

| Required Node Type | Status | Implementation |
|-------------------|--------|---------------|
| **Context nodes** | Satisfied | `resolve_context` in `fleetgraph/src/nodes/context.ts` — determines trigger type, fetches document metadata + associations for on-demand mode |
| **Fetch nodes** | Satisfied | 4 parallel fetch nodes in `fleetgraph/src/nodes/fetch.ts`: `fetchIssues`, `fetchSprint`, `fetchTeam`, `fetchStandups` — all run in parallel via LangGraph fan-out |
| **Enrichment nodes** | Satisfied | `enrich.ts` provides additional context enrichment beyond the base fetch nodes |
| **Change detection** | Satisfied | `change-detection.ts` implements a data-change gate to skip redundant analysis (~80% skip rate), reducing unnecessary LLM calls |
| **Reasoning nodes** | Satisfied | `analyzeHealth` (proactive) and `analyzeContext` (on-demand) in `fleetgraph/src/nodes/reasoning.ts` — Claude Sonnet 4.6 with structured output, not summarization |
| **Conditional edges** | Satisfied | 3-way branching after reasoning: `graceful_degrade` (errors), `log_clean_run` (clean), `propose_actions` (findings) — produces visibly different LangSmith traces |
| **Action nodes** | Satisfied | `proposeActions` in `fleetgraph/src/nodes/actions.ts` — maps findings to concrete proposed actions with rationale |
| **Human-in-the-loop gates** | Satisfied | `confirmationGate` uses LangGraph `interrupt()` — pauses execution, surfaces actions for human review. Supports confirm/dismiss/snooze |
| **Error and fallback nodes** | Satisfied | `gracefulDegrade` in `fleetgraph/src/nodes/actions.ts` — handles all-fetches-failed scenario. Individual fetch nodes return empty data + error string without throwing |

---

## Performance Requirements

> From FleetGraph_PRD.md, "Performance Requirements" section

| Metric | Goal | Status | Evidence |
|--------|------|--------|----------|
| Problem detection latency | < 5 minutes | Satisfied | 3-min cron + ~5 sec execution = ~3:05 worst case |
| Cost per graph run | Documented and defended | Satisfied | ~$0.036/run documented in Trigger Model and Cost Analysis sections of FLEETGRAPH.md |
| Estimated runs per day | Documented and defended | Satisfied | ~480 runs/day at 3-min intervals documented in FLEETGRAPH.md |

---

## Constraints

> From FleetGraph_PRD.md, "Constraints" section

| Constraint | Status | Evidence |
|-----------|--------|----------|
| Ship REST API is sole data source — no direct DB access | Satisfied | All data via `fleetgraph/src/utils/ship-api.ts` REST calls. No database connection in FleetGraph package |
| AI integrated via Claude API (Anthropic SDK) | Satisfied | `@langchain/anthropic` ChatAnthropic with `claude-sonnet-4-6` in `fleetgraph/src/nodes/reasoning.ts` |
| LangGraph recommended (or manual LangSmith instrumentation) | Satisfied | LangGraph.js 1.2.2 (`@langchain/langgraph`) — auto-tracing enabled |
| LangSmith tracing required from day one | Satisfied | `LANGSMITH_TRACING=true` env var, `traceable()` wrappers on all API calls, auto-tracing on all graph nodes |
| Chat interface embedded in context — no standalone chatbot | Satisfied | Chat drawer in `web/src/features/fleetgraph/components/ChatDrawer.tsx` scoped to current document via `documentId` + `documentType` |

---

## Deliverables

> From FleetGraph_PRD.md, "Deliverables" section

| File | Required | Status |
|------|----------|--------|
| PRESEARCH.md | Completed pre-search checklist | Satisfied — `gauntlet_docs/PRESEARCH.md` |
| FLEETGRAPH.md | All sections filled in | Satisfied — `gauntlet_docs/FLEETGRAPH.md` |

### FLEETGRAPH.md Section Completion

| Section | Due | Status |
|---------|-----|--------|
| Agent Responsibility | MVP | Complete |
| Graph Diagram | MVP | Complete |
| Use Cases | MVP | Complete (7 use cases, exceeds 5 minimum) |
| Trigger Model | MVP | Complete |
| Test Cases | Early Submission | Complete (7 test cases with trace evidence) |
| Architecture Decisions | Early Submission | Complete (6 decisions with tradeoffs) |
| Cost Analysis | Final Submission | Complete (dev costs + production projections at 4 tiers) |

---

## What the Agent Responsibility Defines (PRD §"What the Agent Is Responsible For")

> The PRD requires answering 7 specific questions. All 7 are answered in FLEETGRAPH.md:

| Question | FLEETGRAPH.md Section |
|----------|----------------------|
| What does this agent monitor proactively? | "What FleetGraph Monitors Proactively" — 7 detection categories |
| What does it reason about when invoked on demand? | "What FleetGraph Reasons About On-Demand" — sprint health, issue context, dependencies |
| What can it do autonomously? | "What FleetGraph Does Autonomously" — read-only + notify |
| What must it always ask a human about before acting? | "What Requires Human Confirmation" — all write actions |
| Who does it notify, and under what conditions? | "Who FleetGraph Notifies" — 5 target types with identification method |
| How does it know who is on a project and what their role is? | "How FleetGraph Knows Project Membership" — 5 API sources |
| How does the on-demand mode use context from the current view? | "How On-Demand Mode Uses Document Context" — 5-step context resolution |

---

## Two Modes Requirement (PRD §"The Two Modes of FleetGraph")

> "FleetGraph operates in two distinct modes. You must implement both."

| Mode | Status | Implementation |
|------|--------|---------------|
| **Proactive** — agent pushes | Satisfied | 3-minute cron in `fleetgraph/src/index.ts`, proactive graph in `fleetgraph/src/graph/proactive.ts`, findings panel in `web/src/features/fleetgraph/components/FindingsPanel.tsx` |
| **On-demand** — user pulls | Satisfied | `POST /api/fleetgraph/chat` endpoint, on-demand graph in `fleetgraph/src/graph/on-demand.ts`, chat drawer in `web/src/features/fleetgraph/components/ChatDrawer.tsx` |

> "Both modes run through the same graph architecture. The difference is the trigger, not the graph."

Satisfied: Both graphs share node functions from `fleetgraph/src/nodes/` (context.ts, fetch.ts, reasoning.ts, actions.ts). They are compiled as separate StateGraphs with different topologies but shared implementation.

---

## Frontend Integration

> PRD §"Chat interface must be embedded in context — no standalone chatbot pages"

| Component | Purpose | File |
|-----------|---------|------|
| FleetGraph icon (radar) | Left rail toggle for findings panel | `web/src/pages/App.tsx` |
| FindingsPanel | Displays proactive findings with dismiss/snooze/view actions | `web/src/features/fleetgraph/components/FindingsPanel.tsx` |
| FindingCard | Individual finding with severity, recommendation, action buttons | `web/src/features/fleetgraph/components/FindingCard.tsx` |
| ChatDrawer | Context-scoped chat interface (document-aware) | `web/src/features/fleetgraph/components/ChatDrawer.tsx` |
| ChatInput | User message input | `web/src/features/fleetgraph/components/ChatInput.tsx` |
| ChatMessageBubble | Chat message display | `web/src/features/fleetgraph/components/ChatMessageBubble.tsx` |
| BadgeCount | Findings count badge on FleetGraph icon | `web/src/features/fleetgraph/components/BadgeCount.tsx` |
| EmptyState | Empty state when no findings | `web/src/features/fleetgraph/components/EmptyState.tsx` |
| FleetGraphFAB | Floating action button for chat access | `web/src/features/fleetgraph/components/FleetGraphFAB.tsx` |
| useFindings | Hook: polls `GET /api/fleetgraph/findings` every 30s | `web/src/features/fleetgraph/hooks/useFindings.ts` |
| useChatSession | Hook: manages chat state, calls `POST /api/fleetgraph/chat` | `web/src/features/fleetgraph/hooks/useChatSession.ts` |
| useResumeAction | Hook: calls `POST /api/fleetgraph/resume` for dismiss/snooze/confirm | `web/src/features/fleetgraph/hooks/useResumeAction.ts` |

---

## Summary

### MVP Requirements (8/8)

| # | Requirement | Status |
|---|------------|--------|
| 1 | Graph running with proactive detection end-to-end | **Satisfied** |
| 2 | LangSmith tracing + 2 shared trace links | **Satisfied** |
| 3 | FLEETGRAPH.md with Agent Responsibility + 5+ Use Cases | **Satisfied** |
| 4 | Graph outline documented | **Satisfied** |
| 5 | Human-in-the-loop gate | **Satisfied** |
| 6 | Running against real Ship data | **Satisfied** |
| 7 | Deployed and publicly accessible | **Satisfied** |
| 8 | Trigger model documented and defended | **Satisfied** |

### Early Submission Requirements (2/2)

| # | Requirement | Status |
|---|------------|--------|
| 9 | Test Cases section complete | **Satisfied** |
| 10 | Architecture Decisions section complete | **Satisfied** |

### Final Submission Requirements (1/1)

| # | Requirement | Status |
|---|------------|--------|
| 11 | Cost Analysis section complete | **Satisfied** |

### Architecture Requirements (7/7)

| Node Type | Status |
|-----------|--------|
| Context nodes | **Satisfied** |
| Fetch nodes (parallel) | **Satisfied** |
| Reasoning nodes | **Satisfied** |
| Conditional edges | **Satisfied** |
| Action nodes | **Satisfied** |
| Human-in-the-loop gates | **Satisfied** |
| Error and fallback nodes | **Satisfied** |

### Constraints (5/5)

| Constraint | Status |
|-----------|--------|
| Ship REST API only | **Satisfied** |
| Claude API (Anthropic SDK) | **Satisfied** |
| LangGraph with LangSmith | **Satisfied** |
| LangSmith tracing from day one | **Satisfied** |
| Embedded chat (no standalone) | **Satisfied** |

### Performance (3/3)

| Metric | Status |
|--------|--------|
| Detection latency < 5 min | **Satisfied** |
| Cost per run documented | **Satisfied** |
| Runs per day documented | **Satisfied** |

**All 26 requirements fully satisfied as of Final Submission (2026-03-23).**

### Checkpoint Status

| Checkpoint | Deadline | Status |
|---|---|---|
| Pre-Search | Complete | All planning artifacts delivered |
| MVP (Tuesday) | Complete | Graph running, tracing, use cases, HITL gate, deployed |
| Early Submission (Friday) | Complete | Test cases, architecture decisions documented |
| Final Submission (Sunday) | Complete | Cost analysis, all polish, full deployment |

### Beyond-MVP Enhancements Delivered

- **Change detection gate** (`change-detection.ts`) — skips redundant analysis when data hasn't changed, ~80% skip rate reducing cost
- **Enrichment node** (`enrich.ts`) — additional context enrichment beyond base fetch nodes
- **Comprehensive test suite** — unit tests for all node modules (`*.test.ts` alongside each source file)
- **Frontend overlay** (`FleetGraphOverlay.tsx`) and apply-action hook (`useApplyAction.ts`) — richer UI interaction
- **Graph helpers** (`utils/graph-helpers.ts`) — shared utility functions for graph operations
