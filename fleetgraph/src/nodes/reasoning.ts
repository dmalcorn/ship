import { ChatAnthropic } from "@langchain/anthropic";
import { z } from "zod";
import type { FleetGraphStateType, Finding } from "../state.js";

const model = new ChatAnthropic({
  model: "claude-sonnet-4-6",
  temperature: 0,
  maxTokens: 2048,
});

const FindingSchema = z.object({
  id: z.string().describe("Unique identifier for this finding"),
  severity: z.enum(["info", "warning", "critical"]),
  title: z.string().describe("Short title for the finding"),
  description: z.string().describe("Detailed explanation"),
  affectedDocumentId: z.string().describe("ID of the affected document"),
  affectedDocumentTitle: z.string().describe("Title of the affected document"),
  suggestedAction: z.string().describe("What should be done about this"),
});

const AnalysisOutputSchema = z.object({
  findings: z.array(FindingSchema),
  summary: z.string().describe("Overall health summary"),
});

const structuredModel = model.withStructuredOutput(AnalysisOutputSchema);

/**
 * Analyze project health — LLM reasons about issues, sprint, team data.
 * Produces structured findings with severity levels.
 */
export async function analyzeHealth(
  state: FleetGraphStateType
): Promise<Partial<FleetGraphStateType>> {
  // If all fetches failed, skip LLM and report degraded
  if (state.errors.length > 0 && state.issues.length === 0) {
    console.log("[analyze_health] all data sources failed, skipping LLM");
    return {
      findings: [],
      severity: "clean",
      errors: [...state.errors, "analyze_health: no data available for analysis"],
    };
  }

  const issuesSummary = state.issues.map((issue: Record<string, unknown>) => ({
    id: issue.id,
    title: issue.title,
    status: (issue.properties as Record<string, unknown>)?.status,
    assignee_id: (issue.properties as Record<string, unknown>)?.assignee_id,
    priority: (issue.properties as Record<string, unknown>)?.priority,
    updated_at: issue.updated_at,
  }));

  const prompt = `You are a project health analyst for a project management tool called Ship.

Analyze the following project data and identify problems, risks, or items needing attention.

Focus on:
- Stale issues (not updated in >3 days, still in todo/in_progress)
- Overdue items
- Unassigned issues in active sprints
- Workload imbalances
- Triage queue aging (items in triage >24h)

ISSUES (${issuesSummary.length} total):
${JSON.stringify(issuesSummary, null, 2)}

SPRINT DATA:
${state.sprintData ? JSON.stringify(state.sprintData, null, 2) : "No active sprint data available"}

TEAM DATA:
${state.teamGrid ? JSON.stringify(state.teamGrid, null, 2) : "No team data available"}

If everything looks healthy, return an empty findings array. Only surface real problems.
Generate unique IDs for each finding (use format: "finding-{n}").`;

  try {
    const result = await structuredModel.invoke([
      { role: "user", content: prompt },
    ]);

    const findings: Finding[] = result.findings;
    const severity =
      findings.length === 0
        ? "clean"
        : findings.some((f) => f.severity === "critical")
          ? "critical"
          : findings.some((f) => f.severity === "warning")
            ? "warning"
            : "info";

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

  const prompt = `You are a project intelligence assistant for Ship.
The user is viewing document ${state.documentId} (type: ${state.documentType}).

User question: ${userQuery}

Available data:
- Issues: ${state.issues.length} loaded
- Sprint: ${state.sprintData ? "loaded" : "not available"}
- Team: ${state.teamGrid ? "loaded" : "not available"}

Analyze the data and answer the user's question with specific, actionable insights.
If you identify problems, generate findings. Otherwise return empty findings.`;

  try {
    const result = await structuredModel.invoke([
      { role: "user", content: prompt },
    ]);

    const findings: Finding[] = result.findings;
    const severity =
      findings.length === 0
        ? "clean"
        : findings.some((f) => f.severity === "critical")
          ? "critical"
          : "info";

    return { findings, severity, errors: [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { findings: [], severity: "clean", errors: [`analyze_context: ${msg}`] };
  }
}
