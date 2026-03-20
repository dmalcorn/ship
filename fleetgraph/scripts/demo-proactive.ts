#!/usr/bin/env npx tsx
/**
 * Demo: Proactive Health-Check Flow
 *
 * Triggers the proactive graph via POST /api/fleetgraph/analyze,
 * then resumes the human-in-the-loop gate via POST /api/fleetgraph/resume.
 *
 * Flow:
 *   START → resolve_context → [fetch_issues | fetch_sprint | fetch_team | fetch_standups]
 *         → analyze_health → propose_actions → confirmation_gate (INTERRUPT)
 *         → resume with "confirm" → END
 *
 * Usage:
 *   cd fleetgraph
 *   npx tsx scripts/demo-proactive.ts
 *
 * Requires FleetGraph server running (npm run dev) and Ship API running (pnpm dev from root).
 */

const FLEETGRAPH_URL = process.env.FLEETGRAPH_URL || "http://localhost:3001";

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  DEMO: Proactive Health-Check Flow");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Step 1: Trigger proactive analysis
  console.log("▶ Step 1: Triggering proactive health-check analysis...\n");
  console.log(`  POST ${FLEETGRAPH_URL}/api/fleetgraph/analyze`);
  console.log(`  Body: { workspaceId: "" } (scans all data)\n`);

  const analyzeRes = await fetch(`${FLEETGRAPH_URL}/api/fleetgraph/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId: "" }),
  });

  if (!analyzeRes.ok) {
    console.error(`  ✗ Failed: ${analyzeRes.status} ${analyzeRes.statusText}`);
    const body = await analyzeRes.text();
    console.error(`  Response: ${body}`);
    process.exit(1);
  }

  const analyzeData = await analyzeRes.json();

  console.log(`  Status: ${analyzeData.status}`);
  console.log(`  Thread ID: ${analyzeData.threadId}\n`);

  // Step 2: Display findings
  if (analyzeData.findings && analyzeData.findings.length > 0) {
    console.log("▶ Step 2: Findings from analyze_health node:\n");
    for (const finding of analyzeData.findings) {
      const icon =
        finding.severity === "critical" ? "🔴" :
        finding.severity === "warning" ? "🟡" : "🔵";
      console.log(`  ${icon} [${finding.severity.toUpperCase()}] ${finding.title}`);
      console.log(`     ${finding.description}`);
      if (finding.evidence) {
        console.log(`     Evidence: ${finding.evidence}`);
      }
      console.log(`     Recommendation: ${finding.recommendation}\n`);
    }
  } else {
    console.log("▶ Step 2: No findings — clean run.\n");
    console.log("  The proactive graph detected no issues in the current data.");
    console.log("  Flow: ... → analyze_health → log_clean_run → END\n");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  Demo complete (clean path)");
    console.log("═══════════════════════════════════════════════════════════");
    return;
  }

  // Step 3: Display proposed actions
  if (analyzeData.proposedActions && analyzeData.proposedActions.length > 0) {
    console.log("▶ Step 3: Proposed actions from propose_actions node:\n");
    for (const action of analyzeData.proposedActions) {
      console.log(`  → ${action.description}`);
      console.log(`    Finding: ${action.findingId}`);
      console.log(`    Requires confirmation: ${action.requiresConfirmation}\n`);
    }
  }

  // Step 4: Human-in-the-loop gate
  if (analyzeData.status === "pending_confirmation") {
    console.log("▶ Step 4: Graph paused at confirmation_gate (HITL interrupt)\n");
    console.log("  The graph is now waiting for human decision.");
    console.log("  Resuming with decision: 'confirm'\n");

    console.log(`  POST ${FLEETGRAPH_URL}/api/fleetgraph/resume`);
    console.log(`  Body: { threadId: "${analyzeData.threadId}", decision: "confirm" }\n`);

    const resumeRes = await fetch(`${FLEETGRAPH_URL}/api/fleetgraph/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: analyzeData.threadId,
        decision: "confirm",
      }),
    });

    if (!resumeRes.ok) {
      console.error(`  ✗ Resume failed: ${resumeRes.status} ${resumeRes.statusText}`);
      const body = await resumeRes.text();
      console.error(`  Response: ${body}`);
      process.exit(1);
    }

    const resumeData = await resumeRes.json();

    console.log(`  ✓ Resumed successfully`);
    console.log(`  Status: ${resumeData.status}`);
    console.log(`  Decision: ${resumeData.decision}`);
    console.log(`  Human Decision recorded: ${resumeData.humanDecision}\n`);
  }

  // Summary
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Demo complete — Proactive flow executed:");
  console.log("");
  console.log("  START → resolve_context");
  console.log("        → [fetch_issues | fetch_sprint | fetch_team | fetch_standups]");
  console.log("        → analyze_health");
  if (analyzeData.findings?.length > 0) {
    console.log("        → propose_actions → confirmation_gate (interrupted)");
    console.log("        → resume(confirm) → END");
  } else {
    console.log("        → log_clean_run → END");
  }
  console.log("");
  console.log("  Check LangSmith for the full trace.");
  console.log("═══════════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
