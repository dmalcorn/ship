import { ChatAnthropic } from "@langchain/anthropic";
import { z } from "zod";
import type { FleetGraphStateType, Finding } from "../state.js";

const model = new ChatAnthropic({
  model: "claude-sonnet-4-6",
  temperature: 0,
  maxTokens: 4096,
});

const FindingSchema = z.object({
  id: z.string().describe("Unique finding identifier, e.g. finding-1"),
  severity: z
    .enum(["info", "warning", "critical"])
    .describe("Finding severity level"),
  title: z.string().describe("Short finding title"),
  description: z.string().describe("Detailed finding description"),
  evidence: z
    .string()
    .describe(
      "Specific evidence: issue IDs, sprint names, timestamps, titles"
    ),
  recommendation: z
    .string()
    .describe("Actionable recommendation to resolve this finding"),
});

const AnalysisOutputSchema = z.object({
  findings: z.array(FindingSchema).describe("Array of detected quality issues"),
  summary: z.string().describe("Overall project health summary"),
});

export function determineSeverity(
  findings: Finding[]
): "clean" | "info" | "warning" | "critical" {
  if (findings.length === 0) return "clean";
  if (findings.some((f) => f.severity === "critical")) return "critical";
  if (findings.some((f) => f.severity === "warning")) return "warning";
  return "info";
}

/**
 * Analyze project health — LLM reasons about issues, sprint, team data.
 * Produces structured findings with severity levels across 7 detection categories.
 */
export async function analyzeHealth(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
  // If ALL data sources are empty, skip LLM — nothing to analyze
  const hasAnyData =
    state.issues.length > 0 ||
    state.sprintData !== null ||
    state.teamGrid !== null ||
    state.standupStatus !== null;

  if (!hasAnyData) {
    console.log("[analyze_health] no data available from any source, skipping LLM");
    return {
      findings: [],
      severity: "clean",
      errors: [
        "analyze_health: no data available for analysis",
      ],
    };
  }

  // Issues are already filtered and field-extracted by fetchIssues node.
  // Just pass them through — no duplicate filtering here.
  const issuesSummary = state.issues;
  const now = new Date().toISOString();

  const prompt = `You are a project health analyst for a project management tool called Ship.
Today's date: ${now}

Analyze the following project data and detect problems across ALL of the categories below.
Generate a finding for EACH detected problem — do not group multiple problems into one finding.
Use unique IDs: "finding-1", "finding-2", etc.

=== DETECTION CATEGORIES ===

1. UNASSIGNED ISSUES: Find any issues where assignee_id is null, undefined, or empty.
   - Severity: warning
   - Evidence: List each issue by ID and title
   - Recommendation: "Assign an owner to prevent orphaned work"

2. MISSING SPRINT ASSIGNMENT: Find active issues (not done/cancelled) that are not associated with any sprint. Cross-reference the issues list with sprint data — issues that appear in the issues list but not in any sprint's issue list are unscheduled.
   - Severity: info (or warning if priority is "urgent" or "high")
   - Evidence: List each issue by ID, title, and priority
   - Recommendation: "Schedule in current or next sprint to ensure visibility"

3. DUPLICATE ISSUES: Identify issues with identical or very similar titles (fuzzy match — same title with minor variations like case, punctuation, or prefixes).
   - Severity: warning
   - Evidence: Group duplicate sets, listing all issue IDs and titles in each set
   - Recommendation: "Consolidate duplicates to avoid redundant effort"

4. EMPTY ACTIVE SPRINTS: Check if any active sprint has zero issues assigned to it.
   - Severity: critical
   - Evidence: Sprint name/ID
   - Recommendation: "Either assign issues to this sprint or close it — empty sprints indicate process breakdown"

5. MISSING TICKET NUMBERS: Check issue titles for ticket number conventions. Issues should have a recognizable prefix pattern (e.g., PROJ-123, #123, or similar). Only flag this if SOME issues follow the convention and others don't (inconsistency). If NO issues have ticket numbers, the project may not use that convention — do not flag.
   - Severity: info
   - Evidence: List issue titles that lack ticket number prefixes
   - Recommendation: "Add ticket number prefix for traceability and cross-referencing"

6. UNOWNED SECURITY ISSUES: Find issues with security-related keywords in their title (security, vulnerability, CVE, auth, authentication, authorization, XSS, injection, CSRF) that have no assignee_id.
   - Severity: critical
   - Evidence: List issue IDs, titles, and the security keyword found
   - Recommendation: "Assign an owner immediately — unowned security work creates unacceptable risk"

7. UNSCHEDULED HIGH-PRIORITY WORK: Find issues with priority "urgent" or "high" that are not assigned to any sprint.
   - Severity: warning
   - Evidence: List issue IDs, titles, and priority levels
   - Recommendation: "Schedule in current or next sprint to prevent high-priority work from slipping"

=== PARTIAL DATA HANDLING ===

IMPORTANT: Only analyze data categories that were successfully fetched.
- If the issues array is empty, do NOT produce any issue-related findings.
- If sprint data is null/missing, do NOT produce sprint-related findings (categories 2, 4, 7).
- If team data is null/missing, do NOT produce team-related findings.
- If standup data is null/missing, do NOT produce standup-related findings.
Never infer or hallucinate findings about data you did not receive.

=== PROJECT DATA ===

ACTIVE ISSUES (${issuesSummary.length} total — already filtered to non-done/non-cancelled):
${JSON.stringify(issuesSummary)}

SPRINT DATA:
${state.sprintData ? JSON.stringify(state.sprintData) : "No active sprint data available"}

TEAM DATA:
${state.teamGrid ? JSON.stringify(state.teamGrid) : "No team data available"}

STANDUP STATUS:
${state.standupStatus ? JSON.stringify(state.standupStatus) : "No standup data available"}

=== INSTRUCTIONS ===

- If everything looks healthy across all categories, return an empty findings array with a brief positive summary.
- Only surface real problems — not cosmetic issues.
- Be specific in evidence: cite actual issue IDs, titles, sprint names from the data.
- One finding per problem detected. Do not combine multiple problems.`;

  try {
    const result = await model
      .withStructuredOutput(AnalysisOutputSchema, {
        name: "project_health_analysis",
      })
      .invoke([{ role: "user", content: prompt }]);

    const findings: Finding[] = result.findings;
    const severity = determineSeverity(findings);

    console.log(
      `[analyze_health] ${findings.length} findings, severity=${severity}`
    );

    return { findings, severity, errors: [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[analyze_health] LLM failed: ${msg}`);
    return {
      findings: [],
      severity: "clean",
      errors: [`analyze_health: ${msg}`],
    };
  }
}

/**
 * Analyze context for on-demand queries — LLM reasons about a specific
 * document the user is viewing.
 */
export async function analyzeContext(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const userQuery =
    lastMessage && "content" in lastMessage
      ? String(lastMessage.content)
      : "Summarize the current state";

  // Issues already filtered/extracted by fetchIssues node
  const issuesSummary = state.issues;

  const prompt = `You are a project intelligence assistant for Ship.
The user is viewing document ${state.documentId} (type: ${state.documentType}).
Today's date: ${new Date().toISOString()}

User question: ${userQuery}

Available data:
- Active issues (${issuesSummary.length} total, already filtered to non-done/non-cancelled):
${JSON.stringify(issuesSummary)}
- Sprint: ${state.sprintData ? JSON.stringify(state.sprintData) : "not available"}
- Team: ${state.teamGrid ? JSON.stringify(state.teamGrid) : "not available"}

Analyze the data and answer the user's question with specific, actionable insights.
If you identify problems, generate findings with evidence (specific issue IDs, titles, sprint names) and recommendations.
Otherwise return an empty findings array with a summary answering the user's question.
Generate unique IDs for findings using format "finding-1", "finding-2", etc.`;

  try {
    const result = await model
      .withStructuredOutput(AnalysisOutputSchema, {
        name: "context_analysis",
      })
      .invoke([{ role: "user", content: prompt }]);

    const findings: Finding[] = result.findings;
    const severity = determineSeverity(findings);

    return { findings, severity, errors: [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      findings: [],
      severity: "clean",
      errors: [`analyze_context: ${msg}`],
    };
  }
}
