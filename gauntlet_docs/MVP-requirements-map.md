# MVP Requirements Map

**Source:** `gauntlet_docs/FleetGraph_PRD.md` — "MVP Requirements (Due Tuesday, 11:59 PM)"

This document maps each MVP requirement to how it is satisfied in the current implementation.

---

## MVP Checklist Requirements

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

**How:** `FLEETGRAPH.md` at the repository root contains:

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
- Prose explaining the three conditional paths and their LangSmith trace implications

---

### 5. At least one human-in-the-loop gate implemented

**Status:** Satisfied

**How:** The `confirmationGate` function in `fleetgraph/src/nodes/actions.ts` uses LangGraph's `interrupt()` to pause graph execution:

- When findings are detected, `propose_actions` maps them to proposed actions
- `confirmation_gate` calls `interrupt()` with findings and proposed actions
- Graph state is checkpointed via `MemorySaver`
- User resumes via `POST /api/fleetgraph/resume` with `{ threadId, decision }`
- The resume endpoint uses `Command({ resume: { decision } })` to continue execution

Both proactive and on-demand graphs route through the confirmation gate when findings are detected.

---

### 6. Running against real Ship data — no mocked responses

**Status:** Satisfied

**How:** All data comes from Ship's live REST API:

- `fleetgraph/src/utils/ship-api.ts` defines `fetchWithRetry` calling real endpoints:
  - `GET /api/issues` — all issues
  - `GET /api/weeks/:id` + `GET /api/weeks/:id/issues` — sprint data
  - `GET /api/team/grid` — team allocation
  - `GET /api/standups/status` — standup completion
- Authentication via Bearer token (`FLEETGRAPH_API_TOKEN` environment variable)
- No mock data or fixture data in the production code path
- Each fetch node in `fleetgraph/src/nodes/fetch.ts` calls these live endpoints

---

### 7. Deployed and publicly accessible

**Status:** Satisfied

**How:** FleetGraph is deployed as a separate Railway service:

- **Build:** `cd fleetgraph && npm run build` (TypeScript compile to `dist/`)
- **Start:** `cd fleetgraph && node dist/index.js`
- **Health check:** `GET /health` returns `{ status: "ok", service: "fleetgraph", tracing: true, uptime, lastRunTimestamp }`
- **Port:** 3001 (configurable via `PORT` env var)
- Railway monitors the health endpoint for auto-restart

---

### 8. Trigger model decision documented and defended in FLEETGRAPH.md

**Status:** Satisfied

**How:** The **Trigger Model** section of FLEETGRAPH.md contains:

- **Decision:** 3-minute cron polling via `node-cron`
- **Tradeoff analysis table** comparing 4 approaches: uniform polling, webhook-based, adaptive polling (chosen), hybrid (poll + WebSocket) — with pros and cons for each
- **Latency defense:** Worst-case = 3 min poll gap + ~5 sec execution = ~3:05, well under the 5-minute requirement
- **Cost implications:** ~480 runs/day at ~$0.036/run = ~$17/day

---

## Performance Requirements

> From FleetGraph_PRD.md, "Performance Requirements" section

| Metric | Goal | Status | Evidence |
|--------|------|--------|----------|
| Problem detection latency | < 5 minutes | Satisfied | 3-min cron + ~5 sec execution = ~3:05 worst case |
| Cost per graph run | Documented and defended | Satisfied | ~$0.036/run documented in Trigger Model and Cost Analysis sections of FLEETGRAPH.md |
| Estimated runs per day | Documented and defended | Satisfied | ~480 runs/day at 3-min intervals documented in FLEETGRAPH.md |

---

## Deliverables

> From FleetGraph_PRD.md, "Deliverables" section

| File | Required | Status |
|------|----------|--------|
| PRESEARCH.md | Completed pre-search checklist | Satisfied — `gauntlet_docs/PRESEARCH.md` |
| FLEETGRAPH.md | All sections filled in | Satisfied |

### FLEETGRAPH.md Section Completion

| Section | Due | Status |
|---------|-----|--------|
| Agent Responsibility | MVP | Complete |
| Graph Diagram | MVP | Complete |
| Use Cases | MVP | Complete (7 use cases, exceeds 5 minimum) |
| Trigger Model | MVP | Complete |
| Test Cases | Early Submission | Complete |
| Architecture Decisions | Early Submission | Complete |
| Cost Analysis | Final Submission | Complete |

---

## Summary

| # | MVP Requirement | Status |
|---|----------------|--------|
| 1 | Graph running with proactive detection end-to-end | **Satisfied** |
| 2 | LangSmith tracing + 2 shared trace links | **Satisfied** |
| 3 | FLEETGRAPH.md with Agent Responsibility + 5+ Use Cases | **Satisfied** |
| 4 | Graph outline documented | **Satisfied** |
| 5 | Human-in-the-loop gate | **Satisfied** |
| 6 | Running against real Ship data | **Satisfied** |
| 7 | Deployed and publicly accessible | **Satisfied** |
| 8 | Trigger model documented and defended | **Satisfied** |

**8 of 8 requirements fully satisfied.**
