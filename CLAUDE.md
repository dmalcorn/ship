# FleetGraph — Project Intelligence Agent for Ship

**Goal:** Build and deploy an autonomous AI reasoning agent that monitors Ship project data, surfaces quality gaps, and provides context-scoped analysis — proving that an always-on graph agent changes behavior by making mistakes visible.

**Planning docs:** `_bmad-output/planning-artifacts/` (PRD, UX design spec, architecture decisions)
**Research docs:** `gauntlet_docs/` (PRESEARCH, FleetGraph PRD, technical research, MVP project plan)

---

## Deadlines

| Checkpoint | Deadline | Focus |
|---|---|---|
| Pre-Search | ✅ Complete | Agent responsibility + architecture decisions |
| MVP | Tuesday, 11:59 PM | Running graph, tracing, use cases defined |
| Early Submission | Friday, 11:59 PM | Polish, documentation, deployment |
| Final Submission | Sunday, 11:59 PM | All deliverables submitted |

---

## FleetGraph Package

FleetGraph lives at `fleetgraph/` as a standalone Node.js/TypeScript package (not a pnpm workspace member).

```bash
# Development
cd fleetgraph && npm run dev      # tsx watch mode

# Build
cd fleetgraph && npm run build    # TypeScript compile to dist/

# Start (production)
cd fleetgraph && npm start        # node dist/index.js

# Type check
cd fleetgraph && npm run type-check
```

### Environment Variables (required)

```
ANTHROPIC_API_KEY=sk-ant-...
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_...
FLEETGRAPH_API_TOKEN=ship_...     # Ship API Bearer token
SHIP_API_URL=https://...          # Ship API base URL
PORT=3001                         # Express listen port (optional, default 3001)
LANGCHAIN_CALLBACKS_BACKGROUND=true  # Recommended for non-serverless
```

### Source Structure

```
fleetgraph/
├── src/
│   ├── index.ts              # Express server + cron scheduler + endpoints
│   ├── state.ts              # FleetGraphState annotation (shared state schema)
│   ├── graph/
│   │   ├── proactive.ts      # Proactive health-check graph (cron-triggered)
│   │   └── on-demand.ts      # On-demand chat graph (HTTP-triggered)
│   ├── nodes/
│   │   ├── context.ts        # resolve_context node
│   │   ├── fetch.ts          # fetch_issues, fetch_sprint, fetch_team, fetch_standups
│   │   ├── reasoning.ts      # analyze_health (proactive), analyze_context (on-demand)
│   │   └── actions.ts        # propose_actions, confirmation_gate, log_clean_run, graceful_degrade
│   └── utils/
│       └── ship-api.ts       # fetchWithRetry + Ship API endpoint wrappers
├── package.json
└── tsconfig.json
```

---

## Graph Architecture

Two compiled LangGraph.js StateGraphs share node functions but wire different topologies:

**Proactive graph** (3-minute cron):
```
START → resolve_context → [fetch_issues | fetch_sprint | fetch_team | fetch_standups] (parallel)
      → analyze_health → clean? → log_clean_run → END
                       → findings? → propose_actions → confirmation_gate → END
                       → errors? → graceful_degrade → END
```

**On-demand graph** (HTTP POST `/api/fleetgraph/chat`):
```
START → resolve_context → [fetch_issues | fetch_sprint | fetch_team] (parallel)
      → analyze_context → clean? → log_clean_run → END
                        → findings? → propose_actions → confirmation_gate → END
```

### Key Technical Details

- **LLM:** Claude Sonnet 4.6 via `@langchain/anthropic` ChatAnthropic
- **Structured output:** Zod schema + `withStructuredOutput()` for typed Finding[] arrays
- **Checkpointer:** MemorySaver (in-memory) — supports interrupt/resume for HITL gate
- **Ship API auth:** Bearer token (`FLEETGRAPH_API_TOKEN`), not session cookies
- **Retry:** `fetchWithRetry` with exponential backoff (2 retries, 10s timeout)
- **Tracing:** Auto via LangSmith env vars — every node and LLM call traced

---

## FleetGraph API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Health check (Railway monitors) |
| `POST` | `/api/fleetgraph/chat` | On-demand analysis (body: `{ documentId, documentType, message, threadId, workspaceId }`) |
| `POST` | `/api/fleetgraph/resume` | Human-in-the-loop resume (body: `{ threadId, decision }`) |
| `POST` | `/api/fleetgraph/analyze` | Manual proactive trigger (body: `{ workspaceId }`) |

---

## MVP Checklist

- [x] Graph running with at least one proactive detection end-to-end
- [x] LangSmith tracing enabled
- [ ] Two shared trace links showing different execution paths
- [ ] FLEETGRAPH.md with Agent Responsibility and Use Cases (5+)
- [x] Graph outline documented (nodes, edges, branching)
- [x] At least one human-in-the-loop gate
- [x] Running against real Ship data
- [x] Deployed and publicly accessible (Railway)
- [ ] Trigger model documented and defended

---

## Deployment (Railway)

FleetGraph deploys as a separate Railway service:

- **Build:** `cd fleetgraph && npm run build`
- **Start:** `cd fleetgraph && npm start`
- **Health check:** `GET /health`
- **Port:** 3001

Ship platform (api + web) deploys separately — see `.claude/CLAUDE.md` for Ship deployment commands.

---

## Key Constraints

- **Read-only agent:** FleetGraph never writes to Ship's API or database. All proposed actions require human confirmation.
- **Real data only:** No mocks in production — all findings from live Ship data.
- **Ship API is sole data source:** No direct database access.
- **LangSmith traces are graded artifacts:** Every run must be traced. Different execution paths must be visible.
- **Cost target:** ~$0.036/run with Sonnet. Token input bounded by filtering + capping issues at 100.
