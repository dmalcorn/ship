# Story 1.1: Scaffold FleetGraph Service with Proactive Graph Skeleton

Status: done

## Story

As an **operator**,
I want a standalone FleetGraph Node.js service with a health endpoint and cron-based polling scheduler,
so that the agent infrastructure is deployed and running on Railway before any detection logic is added.

## Acceptance Criteria

1. **Given** the `fleetgraph/` package is initialized with TypeScript, Express 4, and node-cron
   **When** the service starts
   **Then** `GET /health` returns HTTP 200 with `{ status: "ok", service: "fleetgraph", uptime: <seconds> }`

2. **Given** the service is running
   **When** 3 minutes elapse
   **Then** a cron job fires, logging `[cron] Proactive health check triggered`

3. **Given** the environment variable for polling interval is set
   **When** the service starts
   **Then** the cron schedule uses the configured interval

4. **Given** the fleetgraph/ package
   **When** `npm run build` is executed
   **Then** TypeScript compiles to `dist/` without errors
   **And** `npm start` runs `node dist/index.js` successfully

## Tasks / Subtasks

- [x] Initialize `fleetgraph/` package (AC: #1, #4)
  - [x] Create `package.json` with name, scripts (dev, build, start, type-check, clean)
  - [x] Create `tsconfig.json` extending root config (target ES2022, module NodeNext, outDir dist)
  - [x] Install dependencies: express, node-cron, zod, @langchain/anthropic, @langchain/core, @langchain/langgraph, @langchain/langgraph-checkpoint, langsmith
  - [x] Install devDependencies: typescript, tsx, @types/express, @types/node, @types/node-cron
- [x] Create Express server in `src/index.ts` (AC: #1, #2, #3)
  - [x] Express 4 app with JSON body parser and CORS
  - [x] `GET /health` returning status, service name, tracing flag, uptime, lastRunTimestamp
  - [x] node-cron schedule at `*/3 * * * *` (configurable via `FLEETGRAPH_CRON_INTERVAL` env var)
  - [x] Server listens on `PORT` env var (default 3001)
- [x] Create `FleetGraphState` annotation in `src/state.ts` (AC: #4)
  - [x] Define typed state fields: messages, triggerType, documentId, documentType, workspaceId, userId, issues, sprintData, teamGrid, standupStatus, findings, severity, proposedActions, errors
  - [x] Use accumulating reducer for `errors` array, replace for all others
  - [x] Export Finding and ProposedAction types
- [x] Verify build and start cycle (AC: #4)

## Dev Notes

### Architecture Compliance

- **Standalone package**: `fleetgraph/` is NOT a pnpm workspace member. It has its own `package.json`, `node_modules/`, and independent build. Do not add it to root `pnpm-workspace.yaml`.
- **Express 4**: Must use Express 4 (not 5) to match Ship's "boring technology" stack.
- **node-cron**: Use `node-cron@3.x` for declarative cron scheduling. Do NOT use `setInterval`.
- **Combined worker + API**: Single process handles both cron polling and HTTP endpoints. Do not create separate services.

### Key Technical Requirements

- **Module system**: ESM (`"type": "module"` in package.json, `module: "NodeNext"` in tsconfig)
- **State annotation**: Use LangGraph's `Annotation.Root()` pattern for `FleetGraphState`
- **Error reducer**: `errors` field MUST use `(prev, next) => [...prev, ...next]` accumulating reducer — this is critical for partial failure handling in later stories
- **Health endpoint**: Must return JSON (not HTML) for Railway's health check probe

### Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `PORT` | No | 3001 | Express listen port |
| `ANTHROPIC_API_KEY` | Yes | — | Claude API access |
| `LANGSMITH_TRACING` | Yes | — | Must be `"true"` |
| `LANGSMITH_API_KEY` | Yes | — | LangSmith auth |
| `FLEETGRAPH_API_TOKEN` | Yes | — | Ship API Bearer token |
| `SHIP_API_URL` | Yes | — | Ship API base URL |
| `FLEETGRAPH_CRON_INTERVAL` | No | `*/3 * * * *` | Cron schedule expression |
| `LANGCHAIN_CALLBACKS_BACKGROUND` | No | — | Recommended `"true"` |

### File Structure

```
fleetgraph/
├── src/
│   ├── index.ts       # Express server + cron scheduler + endpoints
│   └── state.ts       # FleetGraphState annotation + types
├── package.json
└── tsconfig.json
```

### References

- [Source: architecture.md#2-system-architecture] — High-level architecture diagram
- [Source: architecture.md#11-deployment-architecture] — Railway configuration
- [Source: architecture.md#5-state-management] — FleetGraphState schema
- [Source: epics.md#story-1.1] — Story definition with acceptance criteria

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (Amelia, Dev Agent) — fix pass aligning rogue implementation with story specs

### Completion Notes List

- Original implementation by unauthorized agent did not follow BMAD process
- Fix pass added: `lastRunTimestamp` to health endpoint (NFR13), configurable cron interval via `FLEETGRAPH_CRON_INTERVAL` env var (AC #3)
- Finding interface updated: `affectedDocumentId`/`affectedDocumentTitle`/`suggestedAction` → `evidence`/`recommendation` per story 1.3 ACs

### File List

- `fleetgraph/package.json`
- `fleetgraph/tsconfig.json`
- `fleetgraph/vitest.config.ts`
- `fleetgraph/src/index.ts`
- `fleetgraph/src/state.ts`
