# Technical Research: LangGraph.js + Claude SDK Integration

*Research Date: 2026-03-16*
*Researcher: Mary (Business Analyst Agent)*
*Requested by: Diane*

---

## Executive Summary

LangGraph.js is a mature, production-ready framework for building stateful graph-based AI workflows in TypeScript/Node.js. It integrates directly with Anthropic's Claude models via the `@langchain/anthropic` package and provides automatic LangSmith tracing with minimal configuration. The framework natively supports all FleetGraph MVP requirements: conditional branching, parallel node execution, human-in-the-loop interrupts, state persistence, and error handling.

**Key finding:** LangGraph.js is the right choice for FleetGraph. The alternative -- manually wiring LangSmith tracing into a custom graph framework -- would consume 8-12 hours of your 30-hour budget for equivalent functionality that LangGraph provides out of the box.

---

## 1. Package Ecosystem and Installation

### Required Packages

```bash
npm install @langchain/langgraph @langchain/anthropic @langchain/core @langchain/langgraph-checkpoint
```

| Package | Latest Version | Purpose |
|---------|---------------|---------|
| `@langchain/langgraph` | 1.2.2 | Core graph framework (StateGraph, nodes, edges, compile) |
| `@langchain/anthropic` | 1.3.23 | ChatAnthropic model wrapper for Claude |
| `@langchain/core` | (peer dep) | Base types, messages, annotations |
| `@langchain/langgraph-checkpoint` | 1.x | Checkpointer interface + MemorySaver for persistence |

### Environment Variables

```bash
# Claude API
ANTHROPIC_API_KEY=your_anthropic_key

# LangSmith Tracing (required from day one)
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=your_langsmith_key

# Optional but recommended for non-serverless
LANGCHAIN_CALLBACKS_BACKGROUND=true
```

**Important:** Setting `LANGCHAIN_CALLBACKS_BACKGROUND=true` reduces latency in long-running Node.js workers (like your Railway polling service). For serverless deployments, set to `false` to ensure traces flush before function exit.

Sources:
- [LangSmith tracing docs](https://docs.langchain.com/langsmith/trace-with-langgraph)
- [@langchain/anthropic on npm](https://www.npmjs.com/package/@langchain/anthropic)
- [@langchain/langgraph on npm](https://www.npmjs.com/package/@langchain/langgraph)

---

## 2. Core Architecture: StateGraph

LangGraph models workflows as directed graphs with three primitives:

- **State** -- a shared data structure passed between nodes
- **Nodes** -- async functions that process state and return updates
- **Edges** -- connections that determine execution flow (static or conditional)

### Defining State with Annotation

```typescript
import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

// Define FleetGraph state schema
const FleetGraphState = Annotation.Root({
  // Inherit message history for chat mode
  ...MessagesAnnotation.spec,

  // Custom state fields
  triggerType: Annotation<"proactive" | "on-demand">(),
  documentId: Annotation<string | null>(),
  documentType: Annotation<string | null>(),
  workspaceId: Annotation<string>(),

  // Fetched data (populated by fetch nodes)
  issues: Annotation<any[]>({ reducer: (_, next) => next, default: () => [] }),
  sprintData: Annotation<any | null>({ reducer: (_, next) => next, default: () => null }),
  teamGrid: Annotation<any | null>({ reducer: (_, next) => next, default: () => null }),

  // Reasoning output
  findings: Annotation<Finding[]>({ reducer: (_, next) => next, default: () => [] }),
  severity: Annotation<"clean" | "info" | "warning" | "critical">({ default: () => "clean" }),

  // Action proposals
  proposedActions: Annotation<ProposedAction[]>({ reducer: (_, next) => next, default: () => [] }),

  // Error tracking
  errors: Annotation<string[]>({ reducer: (prev, next) => [...prev, ...next], default: () => [] }),
});
```

**Key pattern:** The `reducer` function controls how state updates are merged. For arrays that should accumulate (like errors), use a spread reducer. For fields that should be replaced wholesale (like fetched data), use `(_, next) => next`.

Sources:
- [LangGraph.js quickstart](https://docs.langchain.com/oss/javascript/langgraph/quickstart)
- [Graph API overview](https://docs.langchain.com/oss/javascript/langgraph/graph-api)

---

## 3. Building the Graph

### Node Functions

Each node is an async function that receives state and returns a partial state update:

```typescript
import { StateGraph, END } from "@langchain/langgraph";
import { ChatAnthropic } from "@langchain/anthropic";

const model = new ChatAnthropic({
  model: "claude-sonnet-4-6-20250929",
  temperature: 0,
});

// Context node
async function resolveContext(state: typeof FleetGraphState.State) {
  // Determine trigger type, load user/document context
  return {
    triggerType: state.triggerType || "proactive",
    workspaceId: state.workspaceId,
  };
}

// Fetch node (one of several that run in parallel)
async function fetchIssues(state: typeof FleetGraphState.State) {
  const response = await fetch(
    `${SHIP_API_URL}/api/issues`,
    { headers: { Authorization: `Bearer ${FLEETGRAPH_API_TOKEN}` } }
  );
  const issues = await response.json();
  return { issues };
}

// Reasoning node (uses Claude)
async function analyzeHealth(state: typeof FleetGraphState.State) {
  const prompt = buildAnalysisPrompt(state.issues, state.sprintData);
  const result = await model.invoke([
    { role: "system", content: "You are a project health analyst..." },
    { role: "user", content: prompt },
  ]);

  const findings = parseFindings(result.content);
  const severity = determineSeverity(findings);
  return { findings, severity };
}

// Action node
async function proposeActions(state: typeof FleetGraphState.State) {
  const actions = state.findings.map(f => ({
    findingId: f.id,
    description: f.suggestedAction,
    requiresConfirmation: true,
  }));
  return { proposedActions: actions };
}
```

### Wiring the Graph

```typescript
const graph = new StateGraph(FleetGraphState)
  // Add nodes
  .addNode("resolve_context", resolveContext)
  .addNode("fetch_issues", fetchIssues)
  .addNode("fetch_sprint", fetchSprint)
  .addNode("fetch_team", fetchTeam)
  .addNode("analyze_health", analyzeHealth)
  .addNode("propose_actions", proposeActions)
  .addNode("log_clean_run", logCleanRun)
  .addNode("confirmation_gate", confirmationGate)

  // Entry point
  .addEdge("__start__", "resolve_context")

  // Parallel fetch: resolve_context fans out to all fetch nodes
  .addEdge("resolve_context", "fetch_issues")
  .addEdge("resolve_context", "fetch_sprint")
  .addEdge("resolve_context", "fetch_team")

  // All fetches converge into analysis
  .addEdge("fetch_issues", "analyze_health")
  .addEdge("fetch_sprint", "analyze_health")
  .addEdge("fetch_team", "analyze_health")

  // Conditional branching after analysis
  .addConditionalEdges("analyze_health", (state) => {
    if (state.severity === "clean") return "log_clean_run";
    return "propose_actions";
  })

  // Clean run ends
  .addEdge("log_clean_run", END)

  // Proposed actions go to human gate
  .addEdge("propose_actions", "confirmation_gate")
  .addEdge("confirmation_gate", END);
```

**Parallel execution:** When a single node has multiple outgoing edges to different nodes, LangGraph runs them in parallel automatically. The converging node (`analyze_health`) waits for all upstream nodes to complete before executing.

Sources:
- [StateGraph API Reference](https://langchain-ai.github.io/langgraphjs/reference/classes/langgraph.StateGraph.html)
- [LangGraph 101: State, Nodes, Edges](https://medium.com/@barsegyan96armen/langgraph-101-understanding-the-core-concepts-of-state-nodes-and-edges-in-javascript-f91068683d7d)
- [Advanced LangGraph: Conditional Edges](https://dev.to/jamesli/advanced-langgraph-implementing-conditional-edges-and-tool-calling-agents-3pdn)

---

## 4. Human-in-the-Loop with `interrupt()`

LangGraph provides a built-in `interrupt()` function that pauses graph execution and persists state to the checkpointer. This is exactly what FleetGraph needs for the confirmation gate.

### How It Works

1. Graph hits `interrupt(payload)` inside a node
2. Execution pauses, state is checkpointed
3. The payload is returned to the caller (your API/UI)
4. User reviews and responds (confirm/dismiss/snooze)
5. Graph resumes with `Command({ resume: userResponse })`
6. The `interrupt()` call returns the resume value
7. Node continues from where it left off

### Implementation Pattern

```typescript
import { interrupt, Command } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph-checkpoint";

async function confirmationGate(state: typeof FleetGraphState.State) {
  // Surface proposed actions to the user
  const userResponse = interrupt({
    type: "confirmation_required",
    actions: state.proposedActions,
    message: `Found ${state.findings.length} issue(s). Review proposed actions.`,
  });

  // This code runs AFTER the user resumes
  if (userResponse.decision === "confirm") {
    // Execute the proposed actions via Ship API
    await executeActions(state.proposedActions);
    return { status: "actions_executed" };
  } else if (userResponse.decision === "snooze") {
    return { status: "snoozed", snoozeUntil: userResponse.snoozeUntil };
  } else {
    return { status: "dismissed" };
  }
}

// Compile with checkpointer (required for interrupt)
const checkpointer = new MemorySaver();
const app = graph.compile({ checkpointer });

// --- Invoking the graph ---

// Initial run (will pause at interrupt)
const threadId = "thread-123";
const config = { configurable: { thread_id: threadId } };
const result = await app.invoke(initialState, config);
// result contains the interrupt payload

// Resume after user confirms
const resumeResult = await app.invoke(
  new Command({ resume: { decision: "confirm" } }),
  config
);
```

**Critical detail:** The node *restarts from the beginning* when resumed. Any code before the `interrupt()` call runs again. Keep side effects after the interrupt, not before.

**MemorySaver caveat:** `MemorySaver` is in-memory only -- it's fine for development but **data is lost on restart**. For production on Railway, you'll need a persistent checkpointer (PostgreSQL or Redis-backed). For MVP, MemorySaver is acceptable.

Sources:
- [LangGraph.js Interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
- [Blog: Making it easier to build HITL agents](https://blog.langchain.com/making-it-easier-to-build-human-in-the-loop-agents-with-interrupt/)
- [LangGraph.js Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)

---

## 5. ChatAnthropic: Claude Integration

### Model Initialization

```typescript
import { ChatAnthropic } from "@langchain/anthropic";

const model = new ChatAnthropic({
  model: "claude-sonnet-4-6-20250929",  // Latest Sonnet -- fast + cheap
  temperature: 0,                        // Deterministic for analysis
  maxTokens: 2048,                       // Control output budget
});
```

### Model Options for FleetGraph

| Model | Use Case | Cost (input/output per MTok) |
|-------|----------|-----|
| `claude-sonnet-4-6-20250929` | **Recommended for MVP** -- reasoning nodes, analysis | $3 / $15 |
| `claude-haiku-4-5-20251001` | Rule-based fallback, simple formatting tasks | $0.80 / $4 |
| `claude-opus-4-6` | Complex cross-project analysis (on-demand only) | $15 / $75 |

**Recommendation:** Use Sonnet for all reasoning nodes in MVP. It provides strong analytical capability at ~$0.036/run (per your PRESEARCH estimates). Consider Haiku for high-frequency proactive checks where you just need threshold classification, not deep reasoning.

### Structured Output

For parsing findings reliably, use Claude's structured output via tool binding:

```typescript
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const FindingSchema = z.object({
  id: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  title: z.string(),
  description: z.string(),
  affectedDocument: z.string(),
  suggestedAction: z.string(),
});

const FindingsOutputSchema = z.object({
  findings: z.array(FindingSchema),
  summary: z.string(),
});

// Bind as a tool for structured output
const structuredModel = model.withStructuredOutput(FindingsOutputSchema);
const result = await structuredModel.invoke(analysisPrompt);
// result is typed: { findings: Finding[], summary: string }
```

Sources:
- [@langchain/anthropic npm](https://www.npmjs.com/package/@langchain/anthropic)
- [ChatAnthropic API Reference](https://api.js.langchain.com/classes/langchain_anthropic.ChatAnthropic.html)

---

## 6. LangSmith Tracing

### Setup (Automatic with LangGraph)

LangGraph traces automatically when these env vars are set:

```bash
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=your_key
```

**No additional code needed.** Every graph invocation, node execution, LLM call, and conditional edge evaluation is captured automatically. This is a massive advantage over custom frameworks.

### What Gets Traced

- Full graph execution: entry -> each node -> edges -> exit
- LLM calls within nodes: input tokens, output tokens, latency
- Conditional edge decisions: which branch was taken
- Interrupt/resume cycles: pause point, resume payload
- Error states: which node failed, error message

### Tracing Non-LangChain Code

If you have custom functions (e.g., Ship API fetch calls), wrap them with `traceable`:

```typescript
import { traceable } from "langsmith/traceable";

const fetchIssuesTraced = traceable(
  async (apiUrl: string, token: string) => {
    const response = await fetch(`${apiUrl}/api/issues`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.json();
  },
  { name: "fetch_ship_issues", run_type: "retriever" }
);
```

### Sharing Trace Links

From the LangSmith UI, click "Share" on any trace to generate a public link. You need **two traces showing different execution paths** for MVP:

1. **Proactive run with findings** -- graph routes through `analyze_health` -> `propose_actions` -> `confirmation_gate`
2. **Proactive run clean** -- graph routes through `analyze_health` -> `log_clean_run` -> END

Or swap one for an on-demand chat trace for maximum differentiation.

Sources:
- [Trace LangGraph Applications](https://docs.langchain.com/langsmith/trace-with-langgraph)
- [LangSmith Platform](https://www.langchain.com/langsmith)

---

## 7. Deployment on Railway

### Architecture

```
Railway Project
├── ship-api (existing Express server)
├── fleetgraph-worker (new Node.js service)  <-- proactive polling
├── fleetgraph-api (new Express endpoint)    <-- on-demand chat
└── redis (optional, for persistent checkpointing)
```

**Decision point:** The proactive worker and on-demand API can be the same service or separate. For MVP, **combine them into one service** with:
- An Express endpoint for on-demand chat requests
- A background polling loop using `setInterval` or `node-cron`
- A `/health` endpoint for Railway's health checks

### Minimal Railway Setup

```typescript
// src/index.ts -- combined worker + API
import express from "express";
import cron from "node-cron";

const app = express();
app.use(express.json());

// Health check
app.get("/health", (_, res) => res.json({ status: "ok" }));

// On-demand chat endpoint
app.post("/api/fleetgraph/chat", async (req, res) => {
  const { documentId, documentType, message, threadId } = req.body;
  const result = await runOnDemandGraph(documentId, documentType, message, threadId);
  res.json(result);
});

// Resume endpoint (for human-in-the-loop confirm/dismiss)
app.post("/api/fleetgraph/resume", async (req, res) => {
  const { threadId, decision } = req.body;
  const result = await resumeGraph(threadId, decision);
  res.json(result);
});

// Proactive polling (every 3 minutes)
cron.schedule("*/3 * * * *", async () => {
  console.log("Running proactive health check...");
  await runProactiveGraph();
});

app.listen(process.env.PORT || 3001);
```

### Railway Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_...
FLEETGRAPH_API_TOKEN=ship_token_...
SHIP_API_URL=https://your-ship-api.railway.app
PORT=3001
```

### Railway Configuration

- **Procfile:** `web: node dist/index.js`
- **Build command:** `npm run build` (TypeScript compile)
- **Health check path:** `/health`
- **Restart policy:** Automatic (Railway default)

Sources:
- [Deploy Node.js on Railway](https://railway.com/deploy/nodejs)
- [Deploy Simple HTTP Cron on Railway](https://railway.com/deploy/simple-http-cron)

---

## 8. Error Handling Patterns

### API Failure Retry with Fallback

```typescript
import { traceable } from "langsmith/traceable";

const fetchWithRetry = traceable(
  async (url: string, token: string, retries = 2): Promise<any> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000), // 10s timeout
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        if (attempt === retries) throw err;
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  },
  { name: "fetch_with_retry" }
);
```

### Graph-Level Error Nodes

LangGraph doesn't have built-in error nodes, but you can pattern-match with try/catch in nodes and route via conditional edges:

```typescript
async function fetchIssues(state) {
  try {
    const issues = await fetchWithRetry(`${SHIP_API_URL}/api/issues`, token);
    return { issues, errors: [] };
  } catch (err) {
    return { issues: [], errors: [`fetch_issues failed: ${err.message}`] };
  }
}

// Conditional: if errors exist, route to degraded analysis
.addConditionalEdges("fetch_issues", (state) => {
  if (state.errors.length > 0) return "graceful_degrade";
  return "analyze_health";
})
```

---

## 9. Recommended MVP Tech Stack Summary

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Graph Framework** | LangGraph.js (`@langchain/langgraph` 1.2.2) | Auto-tracing, parallel nodes, interrupts, conditional edges |
| **LLM** | Claude Sonnet 4.6 via `@langchain/anthropic` | Best cost/capability ratio for analysis |
| **Observability** | LangSmith (auto via env vars) | Zero-config with LangGraph |
| **Checkpointer** | MemorySaver (MVP) -> PostgreSQL (production) | Interrupt/resume requires persistence |
| **Runtime** | Node.js + TypeScript | Matches existing Ship codebase |
| **Scheduler** | `node-cron` | Simple, lightweight, no external dependency |
| **Deployment** | Railway (single service: API + worker) | Existing infra, easy env var management |
| **State Persistence** | In-memory (MVP) -> Redis (production) | Poll timestamps, dismissed findings, cache |

---

## 10. Critical Path Decisions for Diane

### Decision 1: Python vs. TypeScript LangGraph

**Recommendation: TypeScript.** Ship's entire codebase is TypeScript. Using LangGraph.js means:
- Same language, same tooling, same tsconfig
- Can share types from `shared/` package
- Can potentially embed the graph service into the existing API (one less deploy)

LangGraph.js is slightly behind Python LangGraph in features, but has everything FleetGraph MVP needs.

### Decision 2: Separate Service vs. Embed in Ship API

**Recommendation: Separate service for MVP.** Reasons:
- Proactive polling shouldn't compete with Ship API request handling
- Independent deploy cycle (you can iterate on the agent without redeploying Ship)
- Cleaner LangSmith traces (agent runs are isolated)
- PRESEARCH already designed for this

### Decision 3: MemorySaver vs. PostgreSQL Checkpointer

**Recommendation: MemorySaver for MVP.** It works, it's zero-config, and it satisfies the interrupt/resume requirement for grading. For early/final submission, upgrade to `@langchain/langgraph-checkpoint-postgres` to survive restarts.

### Decision 4: Claude Model Selection

**Recommendation: Sonnet 4.6 for everything in MVP.** One model, one configuration, fewer moving parts. Only optimize with Haiku for high-frequency checks if cost becomes an issue during testing.

---

## Sources

- [LangGraph.js Quickstart](https://docs.langchain.com/oss/javascript/langgraph/quickstart)
- [LangGraph.js Graph API Overview](https://docs.langchain.com/oss/javascript/langgraph/graph-api)
- [LangGraph.js Overview](https://docs.langchain.com/oss/javascript/langgraph/overview)
- [LangGraph.js Interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
- [LangGraph.js Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [Trace LangGraph Applications (LangSmith)](https://docs.langchain.com/langsmith/trace-with-langgraph)
- [ChatAnthropic Integration](https://docs.langchain.com/oss/python/integrations/chat/anthropic)
- [@langchain/anthropic npm](https://www.npmjs.com/package/@langchain/anthropic)
- [@langchain/langgraph npm](https://www.npmjs.com/package/@langchain/langgraph)
- [@langchain/langgraph-checkpoint npm](https://www.npmjs.com/package/@langchain/langgraph-checkpoint)
- [LangSmith Platform](https://www.langchain.com/langsmith)
- [Deploy Node.js on Railway](https://railway.com/deploy/nodejs)
- [Making it easier to build HITL agents (LangChain Blog)](https://blog.langchain.com/making-it-easier-to-build-human-in-the-loop-agents-with-interrupt/)
- [Building AI Workflows with Claude + LangGraph (MarkTechPost)](https://www.marktechpost.com/2025/05/21/a-step-by-step-implementation-tutorial-for-building-modular-ai-workflows-using-anthropics-claude-sonnet-3-7-through-api-and-langgraph/)
- [LangGraph.js GitHub Repository](https://github.com/langchain-ai/langgraphjs)
- [StateGraph API Reference](https://langchain-ai.github.io/langgraphjs/reference/classes/langgraph.StateGraph.html)
