# Story 1.3: Proactive Health Analysis with Claude Reasoning

Status: done

## Story

As a **software engineer**,
I want the agent to analyze fetched project data using Claude and produce structured findings with severity, evidence, and recommendations,
so that I receive specific, actionable feedback about quality gaps in my project.

## Acceptance Criteria

1. **Given** the fetch nodes have returned project data (issues, sprint, team, standups)
   **When** the `analyze_health` reasoning node executes
   **Then** Claude Sonnet 4.6 receives a structured prompt with filtered project data

2. **Given** the reasoning node produces output
   **When** the response is returned
   **Then** it is validated via Zod schema + `withStructuredOutput()` (named tool use)

3. **Given** the structured output
   **When** findings are present
   **Then** each finding includes: `id` (string), `severity` (critical/warning/info), `title` (string), `description` (string), `evidence` (specific issue IDs, sprint names, timestamps), and `recommendation` (string)

4. **Given** the findings array
   **When** aggregate severity is determined
   **Then** it is set to the highest severity finding, or `clean` if no findings

5. **Given** the reasoning node input
   **When** project data is prepared
   **Then** input never exceeds 8,000 tokens of project data

6. **Given** a full proactive run
   **When** measured end-to-end
   **Then** it completes within 60 seconds

## Tasks / Subtasks

- [x] Create reasoning node in `src/nodes/reasoning.ts` (AC: #1, #2, #3, #4)
  - [x] Initialize ChatAnthropic with model `claude-sonnet-4-6`, temperature 0, maxTokens 4096
  - [x] Define Zod schema for Finding[] structured output with fields: id, severity, title, description, evidence, recommendation
  - [x] Use `model.withStructuredOutput(schema, { name: 'project_health_analysis' })` — named tool use
  - [x] Build structured prompt with filtered issues, sprint data, team grid, standup status
  - [x] Determine aggregate severity from findings array
- [x] Implement token budget management (AC: #5)
  - [x] Filtering done at fetch level: exclude done/cancelled, cap at 100, extract essential fields only
  - [x] Summarize data into concise format for prompt
- [x] Wire into proactive graph topology (AC: #6)
  - [x] All four fetch nodes → `analyze_health` (fan-in)

## Dev Notes

### Architecture Compliance

- **Model**: Claude Sonnet 4.6 via `@langchain/anthropic` `ChatAnthropic`. Model ID is `claude-sonnet-4-6`.
- **Named tool use**: Use `withStructuredOutput()` with `{ name: 'project_health_analysis' }`. This binds the Zod schema as a named tool — Claude MUST return data matching the schema.
- **Temperature 0**: Deterministic output for consistency across runs.

### Zod Schema Definition

```typescript
const FindingSchema = z.object({
  id: z.string().describe('Unique finding identifier'),
  severity: z.enum(['critical', 'warning', 'info']),
  title: z.string().describe('Short finding title'),
  description: z.string().describe('Detailed finding description'),
  evidence: z.string().describe('Specific issue IDs, sprint names, timestamps as evidence'),
  recommendation: z.string().describe('Actionable recommendation to resolve'),
});

const AnalysisOutputSchema = z.object({
  findings: z.array(FindingSchema),
  summary: z.string().describe('Overall health summary'),
});
```

### Severity Determination Logic

```typescript
function determineSeverity(findings: Finding[]): 'clean' | 'info' | 'warning' | 'critical' {
  if (findings.length === 0) return 'clean';
  if (findings.some(f => f.severity === 'critical')) return 'critical';
  if (findings.some(f => f.severity === 'warning')) return 'warning';
  return 'info';
}
```

### References

- [Source: architecture.md#4-node-design-decisions] — Reasoning node design, structured output
- [Source: architecture.md#10-cost-architecture] — Token budget controls
- [Source: architecture.md#13-technology-decisions] — Model choice rationale
- [Source: epics.md#story-1.3] — Story definition with acceptance criteria

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (Amelia, Dev Agent) — fix pass aligning rogue implementation with story specs

### Completion Notes List

- Original Zod schema used `affectedDocumentId`/`affectedDocumentTitle`/`suggestedAction`; fix pass aligned to AC fields: `evidence`/`recommendation`
- Named tool use was already present (`{ name: 'project_health_analysis' }`) — verified correct
- `determineSeverity()` logic unchanged — already matched AC
- Token budget: filtering now happens at fetch level (story 1.2 fix), reasoning node no longer duplicates filtering

### File List

- `fleetgraph/src/nodes/reasoning.ts`
- `fleetgraph/src/nodes/reasoning.test.ts`
- `fleetgraph/src/state.ts` (Finding interface updated)
