import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { FleetGraphStateType, Finding } from "../state.js";

const model = new ChatAnthropic({
  model: "claude-sonnet-4-6",
  temperature: 0,
  maxTokens: 8192,
});

// ---------------------------------------------------------------------------
// Shared tool invocation (native Anthropic format — bypasses LangChain bugs)
// ---------------------------------------------------------------------------

async function invokeWithTool(prompt: string, toolName: string, label: string): Promise<Finding[]> {
  const nativeTool = {
    name: toolName,
    description: "Output structured project health findings",
    input_schema: {
      type: "object" as const,
      required: ["findings", "summary"],
      properties: {
        findings: {
          type: "array",
          description: "Array of detected quality issues",
          items: {
            type: "object",
            required: ["id", "severity", "category", "title", "description", "evidence", "recommendation"],
            properties: {
              id: { type: "string", description: "Unique finding identifier, e.g. issue-1" },
              severity: { type: "string", enum: ["info", "warning", "critical"] },
              category: {
                type: "string",
                enum: ["unassigned", "missing_sprint", "stale", "duplicate", "empty_sprint",
                       "security", "overloaded", "blocked", "missing_ticket_number",
                       "unscheduled_high_priority", "other"],
              },
              title: { type: "string" },
              description: { type: "string" },
              evidence: { type: "string" },
              recommendation: { type: "string" },
              affectedDocumentIds: { type: "array", items: { type: "string" }, default: [] },
              affectedDocumentType: { type: "string", default: "issue" },
            },
          },
        },
        summary: { type: "string", description: "Overall domain health summary" },
      },
    },
  };

  const response = await model.invoke([new HumanMessage(prompt)], {
    tools: [nativeTool],
    tool_choice: { type: "tool", name: toolName },
  } as Record<string, unknown>);

  const toolCalls = response.tool_calls;
  console.log(`[${label}] response has ${toolCalls?.length ?? 0} tool calls`);

  if (toolCalls && toolCalls.length > 0) {
    const args = toolCalls[0]!.args as Record<string, unknown>;
    console.log(`[${label}] findings count: ${Array.isArray(args?.findings) ? args.findings.length : 'missing'}`);
    if (args?.summary) console.log(`[${label}] summary: ${String(args.summary).slice(0, 200)}`);
    if (Array.isArray(args?.findings)) return args.findings as Finding[];
  }

  // Fallback: check content blocks for tool_use
  if (Array.isArray(response.content)) {
    for (const block of response.content) {
      const b = block as Record<string, unknown>;
      if (b.type === "tool_use" && b.name === toolName) {
        const input = b.input as Record<string, unknown>;
        if (Array.isArray(input?.findings)) return input.findings as Finding[];
      }
    }
    // Last resort: text fallback
    const textContent = response.content
      .filter((b: unknown) => (b as Record<string, unknown>).type === "text")
      .map((b: unknown) => (b as Record<string, unknown>).text as string)
      .join("");
    if (textContent.length > 0) {
      console.log(`[${label}] trying text fallback (${textContent.length} chars)`);
      return extractFindings(textContent, label).findings;
    }
  }

  console.warn(`[${label}] no findings found in response`);
  return [];
}

// ---------------------------------------------------------------------------
// Schemas (used by extractFindings fallback)
// ---------------------------------------------------------------------------

const DetectionCategorySchema = z.enum([
  "unassigned", "missing_sprint", "stale", "duplicate", "empty_sprint",
  "security", "overloaded", "blocked", "missing_ticket_number",
  "unscheduled_high_priority", "other",
]);

const FindingSchema = z.object({
  id: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  category: DetectionCategorySchema,
  title: z.string(),
  description: z.string(),
  evidence: z.string(),
  recommendation: z.string(),
  affectedDocumentIds: z.array(z.string()).default([]),
  affectedDocumentType: z.string().default("issue"),
});

const AnalysisOutputSchema = z.object({
  findings: z.array(FindingSchema),
  summary: z.string(),
});

export function determineSeverity(
  findings: Finding[]
): "clean" | "info" | "warning" | "critical" {
  if (findings.length === 0) return "clean";
  if (findings.some((f) => f.severity === "critical")) return "critical";
  if (findings.some((f) => f.severity === "warning")) return "warning";
  return "info";
}

function extractFindings(text: string, label: string): { findings: Finding[]; summary: string } {
  let jsonStr = text.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?\s*```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1]!.trim();
  } else if (jsonStr.startsWith("```")) {
    const lines = jsonStr.split("\n");
    lines.shift();
    if (lines.length > 0 && lines[lines.length - 1]!.trim().startsWith("```")) lines.pop();
    jsonStr = lines.join("\n").trim();
  }

  try {
    const obj = JSON.parse(jsonStr);
    if (obj && Array.isArray(obj.findings)) return { findings: AnalysisOutputSchema.parse(obj).findings, summary: obj.summary ?? "" };
    if (Array.isArray(obj)) return { findings: obj.map((f: unknown) => FindingSchema.parse(f)), summary: "" };
    if (obj?.id && obj?.severity) return { findings: [FindingSchema.parse(obj)], summary: "" };
  } catch { /* fall through */ }

  const jsonObjects = jsonStr.match(/\{[\s\S]*\}/g) || [];
  for (const candidate of jsonObjects.sort((a, b) => b.length - a.length)) {
    try {
      const obj = JSON.parse(candidate);
      if (obj && Array.isArray(obj.findings)) return { findings: AnalysisOutputSchema.parse(obj).findings, summary: obj.summary ?? "" };
    } catch { /* try next */ }
  }

  console.error(`[${label}] could not extract any findings from LLM response`);
  return { findings: [], summary: "" };
}

// ---------------------------------------------------------------------------
// Helper: build sprint membership data for prompts
// ---------------------------------------------------------------------------

function buildSprintMembership(state: FleetGraphStateType): { sprintIssueIds: Set<string>; membershipJson: string } {
  const allSprints = (state.allSprints ?? []) as Record<string, unknown>[];
  const sd = state.sprintData as Record<string, unknown> | null;
  const sprintIssueIds = new Set<string>();
  const membership: Record<string, string[]> = {};

  // Primary sprint issues
  const primaryIssues = (sd?.sprintIssues ?? []) as Array<Record<string, unknown>>;
  if (primaryIssues.length > 0) {
    const name = (sd?.name ?? sd?.id ?? "primary") as string;
    membership[name] = primaryIssues.map(i => i.id as string);
    primaryIssues.forEach(i => sprintIssueIds.add(i.id as string));
  }

  // Other sprints
  for (const s of allSprints) {
    const si = s.sprintIssues as Array<Record<string, unknown>> | undefined;
    if (si) si.forEach(i => sprintIssueIds.add(i.id as string));
  }

  const membershipJson = Object.keys(membership).length > 0
    ? JSON.stringify(membership)
    : "Only primary sprint membership available — issues NOT in this list may be unscheduled";

  return { sprintIssueIds, membershipJson };
}

// ===========================================================================
// PROACTIVE: Unified health analysis (single LLM call, all categories)
// ===========================================================================

export async function analyzeHealth(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
  const issues = state.issues;
  const allSprints = (state.allSprints ?? []) as Record<string, unknown>[];
  const sd = state.sprintData as Record<string, unknown> | null;
  const now = new Date().toISOString();

  const hasAnyData =
    issues.length > 0 ||
    sd !== null ||
    allSprints.length > 0 ||
    state.teamGrid !== null ||
    state.standupStatus !== null;

  if (!hasAnyData) {
    console.log("[analyze_health] no data available, skipping LLM");
    return { findings: [], severity: "clean" };
  }

  // --- Deterministic pre-computation ---

  // Sprint membership
  const { sprintIssueIds, membershipJson } = buildSprintMembership(state);
  const noSprint = issues.filter(i => !sprintIssueIds.has(i.id as string));
  const emptySprints = allSprints.filter(s => (Number(s.issue_count) || 0) === 0);
  const unassigned = issues.filter(i => !i.assignee_id);
  const highPriUnsched = issues.filter(i =>
    (i.priority === "urgent" || i.priority === "high") && !sprintIssueIds.has(i.id as string)
  );

  // Workload summary
  const assigneeCounts = new Map<string, { count: number; inProgress: number; titles: string[] }>();
  for (const i of issues) {
    const aid = i.assignee_id as string | null;
    if (!aid) continue;
    const entry = assigneeCounts.get(aid) ?? { count: 0, inProgress: 0, titles: [] };
    entry.count++;
    const status = (i.status ?? "") as string;
    if (status === "in_progress" || status === "in-progress") entry.inProgress++;
    if (entry.titles.length < 5) entry.titles.push(i.title as string);
    assigneeCounts.set(aid, entry);
  }
  const workloadSummary = [...assigneeCounts.entries()].map(([id, data]) => ({
    assignee_id: id,
    total_issues: data.count,
    in_progress: data.inProgress,
    sample_titles: data.titles,
  }));

  // Blocked issues
  const blocked = issues.filter(i => {
    const status = (i.status ?? "") as string;
    return status === "blocked";
  });

  // In-progress sprint issues (for stale detection)
  const sprintInProgress = (() => {
    const sprintIssues = (sd?.sprintIssues ?? []) as Array<Record<string, unknown>>;
    return sprintIssues.filter(i => {
      const status = (i.state ?? i.status ?? "") as string;
      return status === "in_progress" || status === "in-progress";
    });
  })();

  console.log(
    `[analyze_health] ${issues.length} issues, ${unassigned.length} unassigned, ` +
    `${highPriUnsched.length} high-pri unscheduled, ${allSprints.length} sprints, ` +
    `${emptySprints.length} empty, ${blocked.length} blocked, ` +
    `${workloadSummary.length} assignees`
  );

  // --- Build unified prompt ---

  const prompt = `You are a project health analyst for Ship, a project management tool.
Today's date: ${now}

Analyze ALL the data below. Create ONE finding per CATEGORY. MAXIMUM 8 findings total.
Use unique IDs: "finding-1", "finding-2", etc.

=== CATEGORIES (only use these) ===

ISSUE CATEGORIES:
1. UNASSIGNED ISSUES (category: "unassigned"): Issues where assignee_id is null.
   Severity: warning. ONE finding listing ALL unassigned issue IDs. affectedDocumentType: "issue".

2. UNOWNED SECURITY ISSUES (category: "security"): Issues with security keywords (XSS, vulnerability, CVE, auth bypass, injection, CSRF) in the title AND no assignee_id.
   Severity: critical. ONE finding. Only flag if BOTH conditions met. affectedDocumentType: "issue".

3. DUPLICATE ISSUES (category: "duplicate"): Issues with very similar or identical titles.
   Severity: warning. One finding per duplicate group. affectedDocumentType: "issue".

4. UNSCHEDULED HIGH-PRIORITY (category: "unscheduled_high_priority"): Issues with priority "urgent" or "high" NOT in any sprint.
   Severity: warning. ONE finding listing ALL affected issue IDs. affectedDocumentType: "issue".

SPRINT CATEGORIES:
5. EMPTY SPRINTS (category: "empty_sprint"): Sprints with issue_count of 0.
   Severity: critical. One finding per empty sprint. affectedDocumentType: "sprint", affectedDocumentIds: the sprint ID.

6. MISSING SPRINT (category: "missing_sprint"): Active issues not in any sprint.
   Severity: info. ONE finding listing ALL affected issue IDs. affectedDocumentType: "issue".

7. STALE IN-PROGRESS (category: "stale"): Issues with status "in_progress" that appear stuck.
   Severity: warning. ONE finding. affectedDocumentType: "issue".

TEAM CATEGORIES:
8. OVERLOADED TEAM MEMBER (category: "overloaded"): Any assignee with 4+ active issues, especially 2+ in-progress.
   Severity: info. One finding per overloaded person. affectedDocumentType: "issue".

9. BLOCKED ISSUES (category: "blocked"): Issues with status "blocked".
   Severity: critical. ONE finding listing ALL blocked issue IDs. affectedDocumentType: "issue".

STANDUP CATEGORIES:
10. STANDUP COMPLIANCE (category: "other"): Missing standup updates or participation below 70%.
    Severity: info or warning. affectedDocumentType: "person".

=== RULES ===
- ALWAYS include the "findings" array, even if empty.
- Keep evidence and description concise (under 200 chars each).
- Only report problems you can verify from the data. Do not hallucinate.
- One finding per category. List ALL affected IDs in affectedDocumentIds.

=== ISSUES (${issues.length} active, non-done/non-cancelled) ===
${issues.length > 0 ? JSON.stringify(issues.map(i => ({ id: i.id, title: i.title, status: i.status, assignee_id: i.assignee_id || null, priority: i.priority || null }))) : "No issues"}

=== SPRINT DATA (${allSprints.length} sprints) ===
${allSprints.length > 0 ? JSON.stringify(allSprints.map(s => ({ id: s.id, name: s.name, program_prefix: s.program_prefix, issue_count: s.issue_count, completed_count: s.completed_count, started_count: s.started_count }))) : "No sprint data"}

=== SPRINT ISSUE MEMBERSHIP ===
${membershipJson}

=== ISSUES NOT IN ANY SPRINT (${noSprint.length}) ===
${noSprint.length > 0 ? JSON.stringify(noSprint.map(i => ({ id: i.id, title: i.title, status: i.status, priority: i.priority || null }))) : "All issues are in sprints"}

=== IN-PROGRESS SPRINT ISSUES (for stale detection, ${sprintInProgress.length}) ===
${sprintInProgress.length > 0 ? JSON.stringify(sprintInProgress.map(i => ({ id: i.id, title: i.title, status: i.state ?? i.status, updated_at: i.updated_at }))) : "No in-progress issues"}

=== ASSIGNEE WORKLOAD (${workloadSummary.length} assignees) ===
${workloadSummary.length > 0 ? JSON.stringify(workloadSummary) : "No assignee data"}

=== BLOCKED ISSUES (${blocked.length}) ===
${blocked.length > 0 ? JSON.stringify(blocked.map(i => ({ id: i.id, title: i.title, assignee_id: i.assignee_id || null, priority: i.priority || null }))) : "No blocked issues"}

=== STANDUP DATA ===
${state.standupStatus ? JSON.stringify(state.standupStatus) : "No standup data — skip standup categories"}

=== INSTRUCTIONS ===
- If no problems found, return empty findings with a brief healthy summary.
- Be specific: cite actual issue IDs, titles, sprint names, counts.`;

  try {
    console.log(`[analyze_health] invoking LLM, prompt ~${Math.round(prompt.length / 1000)}k chars`);
    const findings = await invokeWithTool(prompt, "health_analysis", "analyze_health");
    const severity = determineSeverity(findings);
    console.log(`[analyze_health] ${findings.length} findings, severity=${severity}`);
    return { findings, severity };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[analyze_health] LLM failed: ${msg}`);
    return { findings: [], severity: "clean", errors: [`analyze_health: ${msg}`] };
  }
}

// ===========================================================================
// ON-DEMAND: Context-specific analysis (unchanged — used by on-demand graph)
// ===========================================================================

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

export async function analyzeContext(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
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
    const findings = await invokeWithTool(prompt, "context_analysis", "analyze_context");
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
