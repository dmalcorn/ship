# Story 5.2: Context-Aware Reasoning with Sprint Health and Dependency Analysis

Status: in-progress

## Story

As a **software engineer**,
I want to ask the agent natural language questions about my current sprint or issue and get structured analysis including velocity, blockers, and risks,
so that I can make informed prioritization decisions without manually cross-referencing project data.

## Acceptance Criteria

1. **Given** the on-demand graph has fetched context-scoped data
   **When** the `analyze_context` reasoning node executes
   **Then** Claude receives the user's message plus the document context and produces structured analysis
   **And** the response uses the same Zod structured output schema as proactive mode (findings array + summary)

2. **Given** the user asks about sprint health (e.g., "Is this sprint on track?")
   **When** the reasoning node analyzes the sprint
   **Then** the response includes: completion rate (done vs. total), unstarted issues count, days remaining, and an overall health assessment

3. **Given** the user asks about dependencies or blockers
   **When** the reasoning node analyzes issues in the sprint
   **Then** the response identifies issues that are blocking other work (based on status, priority, and assignment patterns)
   **And** recommends specific re-prioritization if blocking issues are unstarted

4. **Given** the analysis produces findings
   **When** the conditional edge evaluates the result
   **Then** findings route to `propose_actions` → `confirmation_gate` (same HITL flow as proactive)
   **And** clean results route to `log_clean_run` → END

5. **Given** the analysis produces an informational response with no actionable findings
   **When** the response is returned
   **Then** the summary provides the contextual analysis without proposing actions

## Tasks / Subtasks

- [x] Task 1: Rewrite `analyzeContext` prompt for rich context-aware reasoning (AC: #1, #2, #3)
  - [x] 1.1: Add sprint health analysis instructions — compute completion rate, identify unstarted issues, assess days remaining vs. work remaining
  - [x] 1.2: Add dependency/blocker detection instructions — identify high-priority unstarted issues that other work depends on, flag assignment gaps on blockers
  - [x] 1.3: Add risk assessment instructions — based on completion velocity, assignment distribution, and priority patterns
  - [x] 1.4: Include document context metadata (title, type, properties) in the prompt so Claude knows what the user is viewing
  - [x] 1.5: Include the user's natural language question prominently in the prompt

- [x] Task 2: Enhance prompt to handle issue-scoped vs sprint-scoped context (AC: #1)
  - [x] 2.1: When `documentType === "issue"` — prompt Claude to reason about the specific issue's status, its sprint context, assignee workload, and relationship to sibling issues
  - [x] 2.2: When `documentType === "sprint"` — prompt Claude to reason about overall sprint health, velocity, blockers, unstarted work, and resource allocation
  - [x] 2.3: When no `documentType` — fall back to general project analysis (current behavior)

- [x] Task 3: Verify structured output schema compatibility (AC: #1, #4, #5)
  - [x] 3.1: Verify `analyzeContext` continues to use `AnalysisOutputSchema` (Zod) with `withStructuredOutput()` — same as `analyzeHealth`
  - [x] 3.2: Verify the conditional edge in `on-demand.ts` correctly routes: findings → `propose_actions`, clean → `log_clean_run`, errors → `graceful_degrade`
  - [x] 3.3: Verify informational responses (summary with no actionable findings) correctly return empty findings array + descriptive summary

- [ ] Task 4: End-to-end testing with real Ship data (AC: #2, #3, #4, #5)
  - [ ] 4.1: Test sprint health query: `POST /api/fleetgraph/chat` with a sprint documentId and message "Is this sprint on track?"
  - [ ] 4.2: Test blocker query: message "Are there any blockers in this sprint?"
  - [ ] 4.3: Test issue-scoped query: with an issue documentId and message "What's the status of this issue's sprint?"
  - [ ] 4.4: Verify LangSmith traces show distinct on-demand graph execution paths
  - [ ] 4.5: Capture at least one LangSmith trace link showing on-demand execution (for Story 4.2 deliverable)

## Dev Notes

### CRITICAL: Only `reasoning.ts` Needs Changes

This story is entirely about enhancing the `analyzeContext` function's prompt in `fleetgraph/src/nodes/reasoning.ts`. The graph topology, endpoints, fetch nodes, and state are all correct. Story 5.1 handles context-scoped fetching — this story assumes that's done.

**The only file to modify:** `fleetgraph/src/nodes/reasoning.ts` — the `analyzeContext` function.

### Current `analyzeContext` Implementation (What to Improve)

The current prompt in `analyzeContext` (lines 176-224 of `reasoning.ts`) is basic:
```
You are a project intelligence assistant for Ship.
The user is viewing document ${state.documentId} (type: ${state.documentType}).
...
Analyze the data and answer the user's question with specific, actionable insights.
```

This needs to be enhanced with:
1. **Sprint health analysis framework** (completion rate, velocity, days remaining)
2. **Blocker/dependency detection logic** (high-priority unstarted issues, assignment gaps)
3. **Context-type-specific reasoning** (different analysis for issue vs. sprint context)
4. **Risk assessment** (work remaining vs. time remaining)

### Enhanced Prompt Structure

The new prompt should follow the same pattern as `analyzeHealth` (lines 72-144):
- Clear detection categories with severity mappings
- Specific instructions for each analysis type
- Partial data handling rules
- Evidence requirements (cite issue IDs, sprint names, timestamps)

**Sprint health analysis should compute:**
- Completion rate: `done_issues / total_issues` as percentage
- Unstarted count: issues with status === "backlog" or "todo"
- In-progress count: issues with status === "in_progress" or "in-progress"
- Days remaining: if sprint has start/end dates in properties
- Velocity assessment: is current completion pace sufficient to finish by sprint end?

**Blocker detection should identify:**
- High-priority issues (priority === "urgent" or "high") that are unstarted
- Issues with no assignee that are in an active sprint
- Multiple issues assigned to the same person (workload concentration risk)
- Issues that haven't been updated recently (stale in-progress work)

### Structured Output — Same Schema, Used Differently

The `AnalysisOutputSchema` Zod schema stays the same:
```typescript
{
  findings: Finding[],  // actionable problems detected
  summary: string       // overall analysis/answer to user's question
}
```

For on-demand, the `summary` field is the primary response — it answers the user's question. `findings` are only populated when there are actionable problems. This means the user might get:
- Sprint health query with no issues → `findings: []`, `summary: "Sprint is on track: 8/12 issues done, 3 days remaining..."`
- Sprint health query with blockers → `findings: [{blocker findings}]`, `summary: "Sprint is at risk: 2 high-priority blockers..."`

### Prompt Differentiation by Document Type

```
if documentType === "sprint":
  → Sprint health analysis mode
  → Focus: completion rate, velocity, blockers, unstarted work, resource allocation
  → Data emphasis: sprint issues, team assignments, days remaining

if documentType === "issue":
  → Issue context analysis mode
  → Focus: issue status, assignee workload, sprint membership, sibling issues
  → Data emphasis: the specific issue, its sprint context, related issues

else:
  → General analysis mode (current behavior — answer question with available data)
```

### Key Technical Constraints

- **Model:** Claude Sonnet 4.6 (`claude-sonnet-4-6`) — already configured, do not change
- **Structured output:** Must use `model.withStructuredOutput(AnalysisOutputSchema, { name: "context_analysis" })` — already configured
- **Max output tokens:** 4,096 — already configured
- **Temperature:** 0 — already configured
- **Token budget:** Keep reasoning input under 8,000 tokens (issues already capped at 50 by fetchIssues)

### Conditional Edge — Already Correct

The conditional edge in `on-demand.ts` (lines 42-54) already handles all three paths:
- `errors + no data` → `graceful_degrade`
- `severity === "clean"` → `log_clean_run`
- findings detected → `propose_actions`

No changes needed to the graph topology.

### Error Handling

Follow existing pattern in `analyzeContext`:
```typescript
catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  return { findings: [], severity: "clean", errors: [`analyze_context: ${msg}`] };
}
```

### Relationship to Story 5.1

Story 5.1 enhances the **fetch nodes** to retrieve context-scoped data. This story enhances the **reasoning node** to produce context-aware analysis from that data. They are independent implementations but work together — 5.1 provides scoped data, 5.2 reasons about it.

If Story 5.1 is not yet implemented, `analyzeContext` will still work — it'll just reason about all issues generically (current behavior). The enhanced prompt gracefully handles both scoped and unscoped data.

### Testing Strategy

1. **Sprint health test:** POST to `/api/fleetgraph/chat` with a real sprint `documentId` and message "Is this sprint on track?" — verify response includes completion metrics
2. **Blocker test:** Same sprint, message "Are there any blockers?" — verify response identifies priority/assignment issues
3. **Issue context test:** POST with an issue `documentId` and message "What's the context for this issue?" — verify response includes sprint membership and sibling analysis
4. **Clean run test:** Sprint with all issues done — verify findings array is empty with positive summary
5. **LangSmith trace verification:** Confirm on-demand traces look different from proactive traces (3 fetch nodes vs 4, `analyze_context` vs `analyze_health`)

### Project Structure Notes

- **Only modify:** `fleetgraph/src/nodes/reasoning.ts` — the `analyzeContext` function
- **Do NOT modify:** `graph/on-demand.ts`, `state.ts`, `index.ts`, `nodes/fetch.ts`, `utils/ship-api.ts`
- **Do NOT modify:** `analyzeHealth` function — it stays unchanged for proactive mode

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 5.2]
- [Source: _bmad-output/planning-artifacts/architecture.md — §3 Graph Architecture, §4 Node Design (Reasoning Nodes)]
- [Source: _bmad-output/planning-artifacts/prd.md — FR19, FR20, FR21, NFR3]
- [Source: fleetgraph/src/nodes/reasoning.ts — existing analyzeContext and analyzeHealth patterns]
- [Source: _bmad-output/planning-artifacts/prd.md — Journey 2: Marcus On-Demand Edge Case]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- All 91 unit tests pass (6 test files, 0 regressions)
- 15 analyzeContext tests + 4 buildAnalysisMode direct tests covering sprint, issue, general modes, edge cases, empty-data guard, context fallbacks

### Completion Notes List
- Task 1: Rewrote `analyzeContext` prompt with structured sprint health analysis (completion rate, unstarted/in-progress counts, days remaining, velocity), blocker/dependency detection (high-priority unstarted, unassigned, workload concentration, stale work), risk assessment (velocity vs time remaining, assignment distribution, priority patterns), document context metadata, and prominent user question placement.
- Task 2: Extracted `buildAnalysisMode()` helper that returns document-type-specific prompt sections: sprint mode (health + blockers + risk), issue mode (status + assignee workload + sprint membership + siblings), general mode (fallback overview).
- Task 3: Verified `AnalysisOutputSchema` Zod schema unchanged, `withStructuredOutput()` call preserved with `context_analysis` name, conditional edge routing in `on-demand.ts` confirmed correct (errors→graceful_degrade, clean→log_clean_run, findings→propose_actions), informational responses return empty findings + descriptive summary → severity "clean".
- Task 4: Requires live Ship deployment — manual E2E testing with real data (sprint health query, blocker query, issue-scoped query, LangSmith trace capture).
- Code Review Fixes: Added empty-data guard to `analyzeContext` (parity with `analyzeHealth`), exported `buildAnalysisMode` for direct testing, added standup data to on-demand prompt, added negative mode assertions, added contextDocument fallback path tests, added `buildAnalysisMode` direct unit tests.

### File List
- `fleetgraph/src/nodes/reasoning.ts` — rewrote `analyzeContext` prompt, added `buildAnalysisMode()` helper, added empty-data guard, added standup data to prompt
- `fleetgraph/src/nodes/reasoning.test.ts` — 19 tests for context-aware reasoning (15 analyzeContext + 4 buildAnalysisMode)
