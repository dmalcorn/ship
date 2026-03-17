# Story 1.4: Conditional Execution Paths — Clean Run vs. Findings Detected

Status: done

## Story

As an **operator**,
I want the graph to route to visibly different execution paths depending on whether findings were detected,
so that LangSmith traces show distinct graph shapes for clean runs vs. problem-detected runs.

## Acceptance Criteria

1. **Given** the `analyze_health` node has completed
   **When** severity is `clean` (no findings)
   **Then** the graph routes to `log_clean_run` → END
   **And** `log_clean_run` logs `[log_clean_run] No findings — project is healthy`

2. **Given** the `analyze_health` node has completed
   **When** findings are detected (severity is info, warning, or critical)
   **Then** the graph routes to `propose_actions` → `confirmation_gate` → END
   **And** `propose_actions` maps each finding to a `ProposedAction` with `requiresConfirmation: true`

3. **Given** the `analyze_health` node has completed
   **When** all data fetches failed (errors present, no usable data)
   **Then** the graph routes to `graceful_degrade` → END

4. **Given** two graph runs with different outcomes
   **When** viewed in LangSmith
   **Then** the clean run and findings-detected run show visibly different node execution paths

## Tasks / Subtasks

- [x] Create action nodes in `src/nodes/actions.ts` (AC: #1, #2, #3)
  - [x] `proposeActions`: Map each Finding to ProposedAction with `requiresConfirmation: true`
  - [x] `confirmationGate`: Use LangGraph `interrupt()` to pause execution
  - [x] `logCleanRun`: Log `[log_clean_run] No findings — project is healthy`, return unchanged state
  - [x] `gracefulDegrade`: Log failure with error details, set severity to `clean`, return empty findings and proposedActions
- [x] Implement conditional edge in proactive graph (AC: #1, #2, #3, #4)
  - [x] After `analyze_health`, add `.addConditionalEdges()` with routing function
  - [x] Route based on: errors+no data → graceful_degrade, clean → log_clean_run, findings → propose_actions
  - [x] Wire: propose_actions → confirmation_gate → END
  - [x] Wire: log_clean_run → END
  - [x] Wire: graceful_degrade → END
- [x] Verify distinct LangSmith trace shapes (AC: #4)

## Dev Notes

### Architecture Compliance

- **Three distinct paths**: The conditional edge after `analyze_health` MUST produce three visibly different paths. This is a graded deliverable requirement — evaluators will inspect LangSmith traces.
- **MemorySaver checkpointer**: The `confirmationGate` uses `interrupt()` which requires a checkpointer. Use `MemorySaver` (in-memory) for MVP.

### LangSmith Trace Differentiation

The three paths produce these trace shapes:
1. **Clean**: `resolve_context → [fetches] → analyze_health → log_clean_run → END`
2. **Findings**: `resolve_context → [fetches] → analyze_health → propose_actions → confirmation_gate → END`
3. **Degraded**: `resolve_context → [fetches] → analyze_health → graceful_degrade → END`

### References

- [Source: architecture.md#3-graph-architecture] — Proactive graph topology with Mermaid diagram
- [Source: architecture.md#4-node-design-decisions] — Action node designs
- [Source: architecture.md#5-state-management] — MemorySaver decision
- [Source: epics.md#story-1.4] — Story definition with acceptance criteria

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (Amelia, Dev Agent) — fix pass aligning rogue implementation with story specs

### Completion Notes List

- Conditional edges and graph topology were already correctly implemented
- Fix pass: improved `confirmationGate` type safety (proper typed response instead of `Record<string, unknown>`)
- Fix pass: updated `logCleanRun` log message to match AC exactly: `[log_clean_run] No findings — project is healthy`
- Fix pass: improved `gracefulDegrade` to log actual error array and return `proposedActions: []`
- Fix pass: updated `proposeActions` to use `f.recommendation` (was `f.suggestedAction`) after schema change

### File List

- `fleetgraph/src/nodes/actions.ts`
- `fleetgraph/src/nodes/actions.test.ts`
- `fleetgraph/src/graph/proactive.ts`
- `fleetgraph/src/graph/proactive.test.ts`
- `fleetgraph/src/graph/on-demand.ts`
