import { ChatAnthropic } from "@langchain/anthropic";
import { z } from "zod";
import type { FleetGraphStateType, Finding } from "../state.js";

const model = new ChatAnthropic({
  model: "claude-sonnet-4-6",
  temperature: 0,
  maxTokens: 4096,
});

const DetectionCategorySchema = z.enum([
  "unassigned",
  "missing_sprint",
  "stale",
  "duplicate",
  "empty_sprint",
  "security",
  "overloaded",
  "blocked",
  "missing_ticket_number",
  "unscheduled_high_priority",
  "other",
]);

const FindingSchema = z.object({
  id: z.string().describe("Unique finding identifier, e.g. finding-1"),
  severity: z
    .enum(["info", "warning", "critical"])
    .describe("Finding severity level"),
  category: DetectionCategorySchema.describe(
    "Detection category — must be one of: unassigned, missing_sprint, stale, duplicate, empty_sprint, security, overloaded, blocked, missing_ticket_number, unscheduled_high_priority, other"
  ),
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
  affectedDocumentIds: z
    .array(z.string())
    .default([])
    .describe("UUIDs of the affected issue(s) from the data — use the exact 'id' field values"),
  affectedDocumentType: z
    .string()
    .default("issue")
    .describe("The type of the primary affected document: issue, sprint, project, program, wiki, or person"),
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

  // Diagnostic: log data shapes and pre-check what SHOULD be detectable
  const sd = state.sprintData as Record<string, unknown> | null;
  const allSprints = (state.allSprints ?? []) as Record<string, unknown>[];
  const unassigned = issuesSummary.filter((i) => !i.assignee_id);
  const sprintIssueIds = new Set<string>();
  for (const s of allSprints) {
    const si = s.sprintIssues as Array<Record<string, unknown>> | undefined;
    if (si) si.forEach((i) => sprintIssueIds.add(i.id as string));
  }
  const noSprint = issuesSummary.filter((i) => !sprintIssueIds.has(i.id as string));
  const emptySprints = allSprints.filter((s) => (Number(s.issue_count) || 0) === 0);
  console.log(`[analyze_health] data summary: ${issuesSummary.length} issues, sprint=${sd ? `"${sd.name ?? sd.title}"(issues=${sd.issue_count})` : 'null'}, allSprints=${allSprints.length}, team=${!!state.teamGrid}, standup=${!!state.standupStatus}`);
  console.log(`[analyze_health] pre-check: ${unassigned.length} unassigned, ${noSprint.length} missing sprint, ${emptySprints.length} empty sprints`);
  if (unassigned.length > 0) console.log(`[analyze_health] unassigned sample: ${unassigned.slice(0, 3).map(i => `"${i.title}"`).join(', ')}`);
  if (noSprint.length > 0) console.log(`[analyze_health] no-sprint sample: ${noSprint.slice(0, 3).map(i => `"${i.title}" (priority=${i.priority})`).join(', ')}`);

  const prompt = `You are a project health analyst for a project management tool called Ship.
Today's date: ${now}

Analyze the following project data and detect problems across ALL of the categories below.
Generate a finding for EACH detected problem — do not group multiple problems into one finding.
Use unique IDs: "finding-1", "finding-2", etc.

=== DETECTION CATEGORIES ===

IMPORTANT: Each finding MUST include a "category" field from this exact list:
  unassigned, missing_sprint, stale, duplicate, empty_sprint, security,
  overloaded, blocked, missing_ticket_number, unscheduled_high_priority, other

1. UNASSIGNED ISSUES (category: "unassigned"): Find any issues where assignee_id is null, undefined, or empty.
   - Severity: warning
   - Evidence: List each issue by ID and title
   - Recommendation: "Assign an owner to prevent orphaned work"

2. MISSING SPRINT ASSIGNMENT (category: "missing_sprint"): Find active issues (not done/cancelled) that are not associated with any sprint. Cross-reference the issues list with sprint data — issues that appear in the issues list but not in any sprint's issue list are unscheduled.
   - Severity: info (or warning if priority is "urgent" or "high")
   - Evidence: List each issue by ID, title, and priority
   - Recommendation: "Schedule in current or next sprint to ensure visibility"
   - IMPORTANT: Create ONE finding PER unscheduled issue (each with a single affectedDocumentIds entry) so each can be individually actioned

3. DUPLICATE ISSUES (category: "duplicate"): Identify issues with identical or very similar titles (fuzzy match — same title with minor variations like case, punctuation, or prefixes).
   - Severity: warning
   - Evidence: Group duplicate sets, listing all issue IDs and titles in each set
   - Recommendation: "Consolidate duplicates to avoid redundant effort"

4. EMPTY SPRINTS (category: "empty_sprint"): Check if any sprint (current or upcoming) has zero issues assigned to it.
   - Severity: critical
   - Evidence: Sprint name/ID
   - Recommendation: "Either assign issues to this sprint or close it — empty sprints indicate process breakdown"

5. MISSING TICKET NUMBERS (category: "missing_ticket_number"): Check issue titles for ticket number conventions. Issues should have a recognizable prefix pattern (e.g., PROJ-123, #123, or similar). Only flag this if SOME issues follow the convention and others don't (inconsistency). If NO issues have ticket numbers, the project may not use that convention — do not flag.
   - Severity: info
   - Evidence: List issue titles that lack ticket number prefixes
   - Recommendation: "Add ticket number prefix for traceability and cross-referencing"

6. UNOWNED SECURITY ISSUES (category: "security"): Find issues with security-related keywords in their title (security, vulnerability, CVE, auth, authentication, authorization, XSS, injection, CSRF) that have no assignee_id.
   - Severity: critical
   - Evidence: List issue IDs, titles, and the security keyword found
   - Recommendation: "Assign an owner immediately — unowned security work creates unacceptable risk"

7. UNSCHEDULED HIGH-PRIORITY WORK (category: "unscheduled_high_priority"): Find issues with priority "urgent" or "high" that are not assigned to any sprint.
   - Severity: warning
   - Evidence: List issue IDs, titles, and priority levels
   - Recommendation: "Schedule in current or next sprint to prevent high-priority work from slipping"
   - IMPORTANT: Create ONE finding PER unscheduled issue (each with a single affectedDocumentIds entry) so each can be individually actioned

=== PARTIAL DATA HANDLING ===

- If the issues array is empty, do NOT produce any issue-related findings.
- If sprint data is null/missing, do NOT produce sprint-related findings (categories 2, 4, 7).
- Never infer or hallucinate findings about data you did not receive.
- You MUST produce findings for every problem you detect. Do NOT skip issues just because there are many.

=== PROJECT DATA ===

ACTIVE ISSUES (${issuesSummary.length} total — already filtered to non-done/non-cancelled):
${JSON.stringify(issuesSummary.map(i => ({ id: i.id, title: i.title, status: i.status, assignee_id: i.assignee_id || null, priority: i.priority || null })))}

ALL SPRINTS (${allSprints.length} total):
${allSprints.length > 0 ? JSON.stringify(allSprints.map(s => ({ id: s.id, name: s.name, program_prefix: s.program_prefix, issue_count: s.issue_count, completed_count: s.completed_count, started_count: s.started_count }))) : "No sprint list available"}

SPRINT ISSUE MEMBERSHIP (which issues belong to which sprint):
${(() => {
  const membership: Record<string, string[]> = {};
  const sprintIssues = (sd?.sprintIssues ?? []) as Array<Record<string, unknown>>;
  if (sprintIssues.length > 0) {
    membership[(sd?.name ?? sd?.id ?? "primary") as string] = sprintIssues.map(i => i.id as string);
  }
  return Object.keys(membership).length > 0 ? JSON.stringify(membership) : "Only primary sprint membership available — issues NOT in this list may be unscheduled";
})()}

=== INSTRUCTIONS ===

- If everything looks healthy across all categories, return an empty findings array with a brief positive summary.
- Only surface real problems — not cosmetic issues.
- Be specific in evidence: cite actual issue IDs, titles, sprint names from the data.
- One finding per problem detected. Do not combine multiple problems.`;

  try {
    const jsonPrompt = prompt + `\n\nRespond with ONLY a JSON object matching this exact schema (no markdown, no wrapping):
{
  "findings": [{ "id": "finding-1", "severity": "warning"|"info"|"critical", "category": "<detection_category>", "title": "...", "description": "...", "evidence": "...", "recommendation": "...", "affectedDocumentIds": ["uuid-1"], "affectedDocumentType": "issue" }],
  "summary": "Overall health summary"
}`;

    console.log(`[analyze_health] invoking LLM with ${issuesSummary.length} issues, prompt ~${Math.round(jsonPrompt.length / 1000)}k chars`);
    const response = await model.invoke([{ role: "user", content: jsonPrompt }]);

    // Extract text from response (may be string or array of content blocks)
    let text: string;
    if (typeof response.content === "string") {
      text = response.content;
    } else if (Array.isArray(response.content)) {
      text = response.content.map((block: unknown) => {
        const b = block as Record<string, unknown>;
        return b.type === "text" ? (b.text as string) : "";
      }).join("");
    } else {
      text = String(response.content);
    }
    console.log(`[analyze_health] raw LLM response (first 300 chars): ${text.slice(0, 300)}`);

    // Extract JSON — strip markdown code fences if present
    let jsonStr = text.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*\r?\n([\s\S]*?)\r?\n\s*```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1]!;
    } else if (jsonStr.startsWith("```")) {
      // Fallback: just strip first and last lines
      const lines = jsonStr.split("\n");
      lines.shift(); // remove ```json
      if (lines.length > 0 && lines[lines.length - 1]!.trim().startsWith("```")) lines.pop();
      jsonStr = lines.join("\n");
    }
    jsonStr = jsonStr.trim();
    console.log(`[analyze_health] extracted JSON (first 200 chars): ${jsonStr.slice(0, 200)}`);
    const parsed = AnalysisOutputSchema.parse(JSON.parse(jsonStr));

    const findings: Finding[] = parsed.findings;
    const severity = determineSeverity(findings);

    console.log(
      `[analyze_health] ${findings.length} findings, severity=${severity}`
    );
    if (findings.length === 0) {
      console.warn(`[analyze_health] WARNING: LLM returned 0 findings despite pre-check showing detectable issues`);
    }

    return { findings, severity, errors: [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[analyze_health] LLM FAILED (returning clean): ${msg}`);
    return {
      findings: [],
      severity: "clean",
      errors: [`analyze_health: ${msg}`],
    };
  }
}

/**
 * Build context-type-specific analysis instructions for the prompt.
 */
export function buildAnalysisMode(
  documentType: string | null,
  documentId: string | null
): string {
  if (documentType === "sprint") {
    return `=== SPRINT HEALTH ANALYSIS MODE ===

You are analyzing a sprint. Focus on overall sprint health, velocity, blockers, unstarted work, and resource allocation.

1. SPRINT HEALTH ANALYSIS
   - Compute completion rate: count issues with status "done" vs total issues, express as percentage
   - Count unstarted issues: status === "backlog" or "todo"
   - Count in-progress issues: status === "in_progress" or "in-progress"
   - If sprint has start/end dates, compute days remaining and assess if current velocity is sufficient
   - Provide an overall health assessment: on-track, at-risk, or off-track

2. BLOCKER/DEPENDENCY DETECTION
   - Identify high-priority issues (priority === "urgent" or "high") that are unstarted (status "backlog" or "todo")
   - Flag issues with no assignee (assignee_id is null/undefined) that are in the active sprint
   - Detect workload concentration: multiple issues assigned to the same person (assignee workload imbalance)
   - Identify stale in-progress work: issues with status "in_progress" that haven't been updated recently

3. RISK ASSESSMENT
   - Assess completion velocity: ratio of done issues to total, projected against days remaining
   - Evaluate assignment distribution: are issues spread across team or concentrated on few members?
   - Check priority patterns: are high-priority items being addressed first?
   - If work remaining exceeds reasonable velocity for days remaining, flag as risk`;
  }

  if (documentType === "issue") {
    return `=== ISSUE CONTEXT ANALYSIS MODE ===

You are analyzing a specific issue (ID: ${documentId}). Focus on this issue's status, its sprint context, assignee workload, and relationship to sibling issues.

1. ISSUE STATUS ANALYSIS
   - Identify the specific issue by ID "${documentId}" in the data
   - Report its current status, priority, and assignee
   - If the issue is blocked or stale, explain why

2. ASSIGNEE WORKLOAD
   - Count how many other issues share the same assignee (assignee workload analysis)
   - Flag if the assignee has too many in-progress items
   - Note if the issue is unassigned

3. SPRINT MEMBERSHIP
   - Determine if this issue belongs to an active sprint
   - If in a sprint, assess how this issue fits within the sprint's progress
   - Report sibling issues in the same sprint (same assignee or related status)

4. SIBLING ISSUE ANALYSIS
   - Identify issues with similar priority or status patterns
   - Flag potential dependencies or conflicts with other issues
   - Note if related issues are blocked or stale`;
  }

  return `=== GENERAL PROJECT ANALYSIS MODE ===

No specific document context — provide a general project analysis using all available data.

1. Overall project health summary
2. Key issues or risks across all available data
3. Resource allocation patterns
4. Priority distribution analysis`;
}

/**
 * Analyze context for on-demand queries — LLM reasons about a specific
 * document the user is viewing.
 */
export async function analyzeContext(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
  // Guard: skip LLM when all data sources are empty (same as analyzeHealth)
  const hasAnyData =
    state.issues.length > 0 ||
    state.sprintData !== null ||
    state.teamGrid !== null;

  if (!hasAnyData) {
    console.log("[analyze_context] no data available from any source, skipping LLM");
    return {
      findings: [],
      severity: "clean",
      errors: ["analyze_context: no data available for analysis"],
    };
  }

  const lastMessage = state.messages[state.messages.length - 1];
  const userQuery =
    lastMessage && "content" in lastMessage
      ? String(lastMessage.content)
      : "Summarize the current state";

  const issuesSummary = state.issues;
  const now = new Date().toISOString();
  const analysisMode = buildAnalysisMode(state.documentType, state.documentId);

  // Build document context section if available
  const contextSection = state.contextDocument
    ? `=== DOCUMENT CONTEXT ===
Document: ${JSON.stringify(state.contextDocument.document)}
Associations: ${JSON.stringify(state.contextDocument.associations)}
`
    : state.documentId
      ? `=== DOCUMENT CONTEXT ===
Document ID: ${state.documentId}
Document Type: ${state.documentType}
`
      : "";

  const prompt = `You are a project intelligence assistant for Ship, a project management tool.
Today's date: ${now}

=== USER QUESTION ===
${userQuery}

${contextSection}${analysisMode}

=== DETECTION CATEGORIES ===
Each finding MUST include a "category" field from this exact list:
  unassigned, missing_sprint, stale, duplicate, empty_sprint, security,
  overloaded, blocked, missing_ticket_number, unscheduled_high_priority, other

=== SEVERITY MAPPINGS ===
- Unstarted high-priority/urgent issues (category: "unscheduled_high_priority"): warning
- Unassigned issues in active sprint (category: "unassigned"): warning
- Workload concentration >3 issues on one person (category: "overloaded"): info
- Stale in-progress work, no updates in >3 days (category: "stale"): warning
- Sprint off-track, completion rate insufficient for remaining time (category: "empty_sprint" or "other"): critical
- Blocked issues with no resolution path (category: "blocked"): critical

=== PARTIAL DATA HANDLING ===
IMPORTANT: Only analyze data categories that were successfully fetched.
- If the issues array is empty, do NOT produce issue-related findings.
- If sprint data is null/missing, do NOT produce sprint-related findings.
- If team data is null/missing, do NOT produce team-related findings.
- Never infer or hallucinate findings about data you did not receive.

=== PROJECT DATA ===

ACTIVE ISSUES (${issuesSummary.length} total — already filtered to non-done/non-cancelled):
${JSON.stringify(issuesSummary)}

SPRINT DATA:
${state.sprintData ? JSON.stringify(state.sprintData) : "No sprint data available"}

TEAM DATA:
${state.teamGrid ? JSON.stringify(state.teamGrid) : "No team data available"}

STANDUP STATUS:
${state.standupStatus ? JSON.stringify(state.standupStatus) : "No standup data available"}

=== INSTRUCTIONS ===
- The summary field is your PRIMARY response — answer the user's question directly and thoroughly.
- Only populate findings when there are actionable problems detected.
- If everything looks healthy, return an empty findings array with a comprehensive summary answering the user's question.
- Be specific in evidence: cite actual issue IDs, titles, sprint names, completion percentages.
- One finding per problem detected. Do not combine multiple problems.
- Generate unique IDs for findings using format "finding-1", "finding-2", etc.`;

  try {
    const jsonPrompt = prompt + `\n\nRespond with ONLY a JSON object matching this exact schema (no markdown, no wrapping):
{
  "findings": [{ "id": "finding-1", "severity": "warning"|"info"|"critical", "category": "<detection_category>", "title": "...", "description": "...", "evidence": "...", "recommendation": "...", "affectedDocumentIds": ["uuid-1"], "affectedDocumentType": "issue" }],
  "summary": "Overall analysis summary answering the user's question"
}`;

    const response = await model.invoke([{ role: "user", content: jsonPrompt }]);
    let ctxText: string;
    if (typeof response.content === "string") {
      ctxText = response.content;
    } else if (Array.isArray(response.content)) {
      ctxText = response.content.map((block: unknown) => {
        const b = block as Record<string, unknown>;
        return b.type === "text" ? (b.text as string) : "";
      }).join("");
    } else {
      ctxText = String(response.content);
    }
    let ctxJson = ctxText.trim();
    const ctxFence = ctxJson.match(/```(?:json)?\s*\r?\n([\s\S]*?)\r?\n\s*```/);
    if (ctxFence) {
      ctxJson = ctxFence[1]!;
    } else if (ctxJson.startsWith("```")) {
      const lines = ctxJson.split("\n");
      lines.shift();
      if (lines.length > 0 && lines[lines.length - 1]!.trim().startsWith("```")) lines.pop();
      ctxJson = lines.join("\n");
    }
    ctxJson = ctxJson.trim();
    const parsed = AnalysisOutputSchema.parse(JSON.parse(ctxJson));

    const findings: Finding[] = parsed.findings;
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
