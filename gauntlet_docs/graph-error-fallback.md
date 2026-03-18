# Graph Error Handling and Fallback Nodes

FleetGraph handles Ship API failures, missing data, and unexpected state gracefully without crashing. Errors are accumulated — not thrown — so partial failures degrade quality, not availability.

---

## Error Handling by Layer

### 1. Ship API Layer (`utils/ship-api.ts`)

`fetchWithRetry` provides the first line of defense:
- Exponential backoff with 2 retries
- 10-second timeout per request
- Failures are surfaced as catchable errors to the calling fetch node

### 2. Fetch Nodes (`nodes/fetch.ts`)

Every fetch node (`fetchIssues`, `fetchSprint`, `fetchTeam`, `fetchStandups`) wraps its API call in try/catch. On failure, the node returns empty data and appends a descriptive error to state — it never throws:

```typescript
catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  return { issues: [], errors: [`fetch_issues: ${msg}`] };
}
```

Because fetch nodes run in parallel, one failing does not prevent the others from completing. The `errors` state field uses an accumulating reducer (`(prev, next) => [...prev, ...next]`), so errors from multiple parallel fetch nodes are collected, not overwritten.

### 3. Reasoning Nodes (`nodes/reasoning.ts`)

Both `analyzeHealth` (proactive) and `analyzeContext` (on-demand) have two guards:

**No-data guard** — If all data sources are empty, the LLM call is skipped entirely. This avoids wasting tokens on an analysis with no input:

```typescript
if (!hasAnyData) {
  return { findings: [], severity: "clean", errors: ["no data available"] };
}
```

**LLM failure guard** — The structured output call to Claude is wrapped in try/catch. On failure, the node returns clean state with an error message rather than crashing the graph:

```typescript
catch (err) {
  return { findings: [], severity: "clean", errors: [`analyze_health: ${msg}`] };
}
```

### 4. Graceful Degrade Node (`nodes/actions.ts`)

A dedicated terminal node that activates when ALL data sources failed. The conditional edge after analysis checks for total data loss before evaluating severity:

```typescript
// Proactive graph routing (on-demand is similar)
if (
  state.errors.length > 0 &&
  state.issues.length === 0 &&
  state.sprintData === null &&
  state.teamGrid === null &&
  state.standupStatus === null
) {
  return "graceful_degrade";
}
```

The `gracefulDegrade` node logs the collected errors and produces clean output so the graph exits normally:

```typescript
return { findings: [], severity: "clean", proposedActions: [] };
```

---

## Failure Scenarios and Outcomes

| Scenario | Behavior | Outcome |
|----------|----------|---------|
| One fetch node fails (e.g., sprint API down) | Other fetches complete; error accumulated | Analysis runs on partial data |
| All fetch nodes fail | No data available; errors accumulated | Routes to `graceful_degrade` → clean exit |
| LLM call fails | Reasoning node catches error | Returns clean state + error logged |
| No active issues in workspace | Fetch succeeds with empty array | Analysis skips or returns clean — no false findings |
| Ship API returns malformed data | Fetch node catch block handles | Empty data + error accumulated |

---

## Design Principles

- **Accumulate, don't throw.** The `errors` array in state collects failures across parallel nodes without halting execution.
- **Degrade quality, not availability.** Partial data produces partial analysis. Only total data loss triggers the degrade path.
- **Never waste tokens.** If there is nothing to analyze, skip the LLM call entirely.
- **Every path reaches END.** The graph has three terminal paths — `log_clean_run`, `confirmation_gate`, and `graceful_degrade` — ensuring no execution hangs regardless of failure state.
