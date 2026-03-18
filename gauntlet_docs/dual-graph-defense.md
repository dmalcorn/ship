# Architecture Decision: Two Graphs vs. One

**Decision:** FleetGraph uses two compiled `StateGraph` instances — a proactive graph and an on-demand graph — rather than a single graph with conditional branching.

This document defends that decision.

---

## The Two Graphs

**Proactive graph** (`graph/proactive.ts`) — triggered by cron every 3 minutes and by manual `/analyze` endpoint:
```
START → resolve_context → [fetch_issues | fetch_sprint | fetch_team | fetch_standups] (parallel)
      → analyze_health → clean? → log_clean_run → END
                       → findings? → propose_actions → confirmation_gate → END
                       → errors? → graceful_degrade → END
```

**On-demand graph** (`graph/on-demand.ts`) — triggered by HTTP POST from Ship's chat UI:
```
START → resolve_context → [fetch_issues | fetch_sprint | fetch_team] (parallel)
      → analyze_context → clean? → log_clean_run → END
                        → findings? → propose_actions → confirmation_gate → END
```

They share the same state schema (`FleetGraphState`), all fetch nodes, and all action nodes. The reasoning nodes (`analyzeHealth` vs `analyzeContext`) are deliberately separate functions with fundamentally different LLM prompts.

---

## Why Two Graphs Is the Better Architecture

### 1. The topologies are genuinely different, not parameterized variations

The proactive graph fans out to **four** parallel fetch nodes (issues, sprint, team, standups). The on-demand graph fans out to **three** (no standups). This is not a flag on the same shape — it is a different DAG.

In LangGraph.js, `addEdge` calls define static topology at compile time. A single graph would require one of these workarounds:

- **Always wire all four fetches, short-circuit one conditionally.** This executes a no-op node on every on-demand request — wasted cycles, misleading traces, and a node that exists only to do nothing. LangSmith traces (which are graded artifacts) would show a `fetch_standups` node on every on-demand run that produced no data and served no purpose.
- **Conditional fan-out via a router node.** LangGraph's `addConditionalEdges` returns a single next-node string, not a set. You cannot conditionally fan out to different parallel sets without introducing an intermediate dispatch node that itself has conditional edges to each fetch node. This adds a synthetic node that exists purely to work around the framework, increasing graph complexity for no analytical value.

Two graphs avoid both of these by expressing each topology directly. What you see in the graph definition is what executes — no phantom nodes, no conditional no-ops.

### 2. The reasoning tasks are fundamentally different

`analyzeHealth` and `analyzeContext` are not the same function with a flag. They serve different purposes with different prompts, different input expectations, and different output semantics:

| Dimension | `analyzeHealth` (proactive) | `analyzeContext` (on-demand) |
|-----------|----------------------------|------------------------------|
| **Purpose** | Autonomous detection across 7 categories | Answer a specific user question |
| **Input** | All workspace data + standups | User message + document context |
| **Prompt** | Structured detection rubric (900+ tokens) | Conversational with `documentId`, `documentType`, `messages` |
| **Trigger** | Unattended, no human input | Direct user query |
| **Output semantics** | "Here are problems I found" | "Here is the answer to your question" |

Merging these into one function with `if (triggerType === "proactive")` creates a 200+ line function with two entirely separate code paths that share nothing except the Zod output schema and the `determineSeverity` helper. That is not simplification — it is two functions wearing a trench coat.

### 3. Independent compilation enables independent evolution

Each graph compiles with its own `MemorySaver` checkpointer. This means:

- **Proactive runs never interfere with on-demand sessions.** Thread IDs are namespaced naturally — proactive threads are `proactive-{timestamp}`, on-demand threads are user-provided or random UUIDs. With a single graph and single checkpointer, any bug in checkpoint management could cross-contaminate.
- **Each graph can evolve independently.** Adding a new node to the proactive graph (e.g., `fetch_deployments` for deployment health) requires zero changes to the on-demand graph. With a single graph, every topology change must be validated against both code paths.
- **Testing is isolated.** The 61 tests are cleanly partitioned: proactive graph tests exercise proactive topology, on-demand tests exercise on-demand topology. A single graph would require every integration test to parameterize over `triggerType`, doubling test setup complexity for no coverage gain.

### 4. LangSmith traces are cleaner and more legible

LangSmith traces are a graded deliverable. Each trace should tell a clear story about what the agent did and why.

With two graphs:
- A proactive trace shows: `resolve_context → fetch_issues + fetch_sprint + fetch_team + fetch_standups → analyze_health → ...` — every node served a purpose.
- An on-demand trace shows: `resolve_context → fetch_issues + fetch_sprint + fetch_team → analyze_context → ...` — concise, no wasted nodes.

With a single graph, every on-demand trace would include a `fetch_standups` node (either skipped or short-circuited), and conditional routing nodes that add visual noise without analytical value. Reviewers evaluating traces would need to mentally filter framework scaffolding from actual agent behavior.

### 5. The resume endpoint already handles both graphs cleanly

The `/api/fleetgraph/resume` endpoint iterates over both graphs to find a pending interrupt:

```typescript
for (const graph of [proactiveGraph, onDemandGraph]) {
  const state = await graph.getState(config);
  if (state?.next?.length > 0) { targetGraph = graph; break; }
}
```

This is three lines of code. A single graph would eliminate this loop but replace it with the cumulative complexity described above. The trade is not favorable.

### 6. Code reuse is already maximized at the right layer

The graphs share:
- **State schema** — `FleetGraphState` (single definition in `state.ts`)
- **All fetch nodes** — `fetchIssues`, `fetchSprint`, `fetchTeam`, `fetchStandups` (fetch nodes already branch on `triggerType` where needed, e.g., issue cap of 100 vs 50)
- **All action nodes** — `proposeActions`, `confirmationGate`, `logCleanRun`, `gracefulDegrade`
- **Ship API client** — `fetchWithRetry` and all endpoint wrappers

The only non-shared code is the two graph builder functions (~40 lines each) and the two reasoning functions (~80 lines each). Merging these would not reduce total lines of code — it would rearrange them into larger, more complex units.

---

## What the Single-Graph Alternative Would Actually Look Like

To be concrete about what we are choosing *not* to do:

```typescript
// Pseudo-code for a unified graph
const graph = new StateGraph(FleetGraphState)
  .addNode("resolve_context", resolveContext)
  .addNode("route_fetches", routeFetches)        // NEW: synthetic router
  .addNode("fetch_issues", fetchIssues)
  .addNode("fetch_sprint", fetchSprint)
  .addNode("fetch_team", fetchTeam)
  .addNode("fetch_standups", fetchStandups)       // no-ops on on-demand
  .addNode("analyze", unifiedAnalyze)             // NEW: merged, 200+ lines
  .addNode("propose_actions", proposeActions)
  .addNode("confirmation_gate", confirmationGate)
  .addNode("log_clean_run", logCleanRun)
  .addNode("graceful_degrade", gracefulDegrade)
  .addEdge("__start__", "resolve_context")
  .addEdge("resolve_context", "route_fetches")
  .addConditionalEdges("route_fetches", (state) => {
    // Cannot return multiple targets — need workaround
    // Option A: always fan out to all 4, let standups no-op
    // Option B: two separate intermediate nodes
  })
  // ... increasingly complex wiring
```

This adds a node (`route_fetches`) that exists only to satisfy the framework, merges two clean functions into one large conditional function, and introduces no-op execution paths that muddy traces — all to satisfy the aesthetic of "one graph."

---

## Summary

| Concern | Two graphs | One graph |
|---------|-----------|-----------|
| Topology clarity | Each graph is its own DAG | Conditional fan-out requires workarounds |
| Reasoning separation | Two focused functions | One large conditional function |
| Trace legibility | Every node in a trace served a purpose | Phantom/no-op nodes on some paths |
| Testability | Isolated test suites per graph | All tests must parameterize over trigger type |
| Evolution | Add nodes to one graph without touching the other | Every change validated against both paths |
| Code reuse | Maximized at node and state layer | No additional reuse gained |
| Complexity | ~80 lines of graph wiring (2 × 40) | ~60 lines of graph wiring + router node + conditional logic |

The two-graph design is not an accident or oversight. It is a deliberate choice to keep each execution path explicit, traceable, and independently evolvable — consistent with LangGraph's philosophy that graph topology should be legible, not clever.
