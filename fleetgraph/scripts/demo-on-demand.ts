#!/usr/bin/env npx tsx
/**
 * Demo: On-Demand Context-Aware Flow
 *
 * Triggers the on-demand graph via POST /api/fleetgraph/chat with
 * a user message asking about project health, then resumes the
 * human-in-the-loop gate via POST /api/fleetgraph/resume.
 *
 * Flow:
 *   START → resolve_context → [fetch_issues | fetch_sprint | fetch_team]
 *         → analyze_context → propose_actions → confirmation_gate (INTERRUPT)
 *         → resume with "confirm" → END
 *
 * Usage:
 *   cd fleetgraph
 *   npx tsx scripts/demo-on-demand.ts
 *
 * Requires FleetGraph server running (npm run dev) and Ship API running (pnpm dev from root).
 */

const FLEETGRAPH_URL = process.env.FLEETGRAPH_URL || "http://localhost:3001";

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  DEMO: On-Demand Context-Aware Flow");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Step 1: Send a context-aware chat message
  const userMessage =
    "What issues are at risk in the current sprint? " +
    "Are there any unassigned high-priority items or stale work?";

  console.log("▶ Step 1: Sending on-demand analysis request...\n");
  console.log(`  POST ${FLEETGRAPH_URL}/api/fleetgraph/chat`);
  console.log(`  Body:`);
  console.log(`    message: "${userMessage}"`);
  console.log(`    documentType: null (workspace-wide analysis)`);
  console.log(`    documentId: null\n`);

  const chatRes = await fetch(`${FLEETGRAPH_URL}/api/fleetgraph/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: userMessage,
      documentId: null,
      documentType: null,
      workspaceId: "",
    }),
  });

  if (!chatRes.ok) {
    console.error(`  ✗ Failed: ${chatRes.status} ${chatRes.statusText}`);
    const body = await chatRes.text();
    console.error(`  Response: ${body}`);
    process.exit(1);
  }

  const chatData = await chatRes.json();

  console.log(`  Status: ${chatData.status || "complete"}`);
  console.log(`  Thread ID: ${chatData.threadId}\n`);

  // Step 2: Display findings
  if (chatData.findings && chatData.findings.length > 0) {
    console.log("▶ Step 2: Findings from analyze_context node:\n");
    for (const finding of chatData.findings) {
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
    console.log("  The on-demand graph found no issues for your query.");
    console.log("  Flow: ... → analyze_context → log_clean_run → END\n");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  Demo complete (clean path)");
    console.log("═══════════════════════════════════════════════════════════");
    return;
  }

  // Step 3: Display proposed actions
  if (chatData.proposedActions && chatData.proposedActions.length > 0) {
    console.log("▶ Step 3: Proposed actions from propose_actions node:\n");
    for (const action of chatData.proposedActions) {
      console.log(`  → ${action.description}`);
      console.log(`    Finding: ${action.findingId}`);
      console.log(`    Requires confirmation: ${action.requiresConfirmation}\n`);
    }
  }

  // Step 4: Human-in-the-loop gate
  if (chatData.status === "pending_confirmation") {
    console.log("▶ Step 4: Graph paused at confirmation_gate (HITL interrupt)\n");
    console.log("  The graph is now waiting for human decision.");
    console.log("  Resuming with decision: 'confirm'\n");

    console.log(`  POST ${FLEETGRAPH_URL}/api/fleetgraph/resume`);
    console.log(`  Body: { threadId: "${chatData.threadId}", decision: "confirm" }\n`);

    const resumeRes = await fetch(`${FLEETGRAPH_URL}/api/fleetgraph/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: chatData.threadId,
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

  // Step 5: Follow-up question (same thread for conversation continuity)
  console.log("▶ Step 5: Follow-up question on same thread...\n");

  const followUpMessage = "Which team members have the most work assigned right now?";
  console.log(`  POST ${FLEETGRAPH_URL}/api/fleetgraph/chat`);
  console.log(`  Body:`);
  console.log(`    message: "${followUpMessage}"`);
  console.log(`    threadId: "${chatData.threadId}" (continuing conversation)\n`);

  const followUpRes = await fetch(`${FLEETGRAPH_URL}/api/fleetgraph/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: followUpMessage,
      threadId: chatData.threadId,
      workspaceId: "",
    }),
  });

  if (followUpRes.ok) {
    const followUpData = await followUpRes.json();
    console.log(`  Status: ${followUpData.status || "complete"}`);

    if (followUpData.findings && followUpData.findings.length > 0) {
      console.log(`  Findings:\n`);
      for (const finding of followUpData.findings) {
        const icon =
          finding.severity === "critical" ? "🔴" :
          finding.severity === "warning" ? "🟡" : "🔵";
        console.log(`  ${icon} [${finding.severity.toUpperCase()}] ${finding.title}`);
        console.log(`     ${finding.description}\n`);
      }
    } else {
      console.log(`  No additional findings from follow-up.\n`);
    }
  } else {
    console.log(`  Follow-up returned ${followUpRes.status} (thread may have been consumed by resume)\n`);
  }

  // Summary
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Demo complete — On-Demand flow executed:");
  console.log("");
  console.log("  START → resolve_context");
  console.log("        → [fetch_issues | fetch_sprint | fetch_team]");
  console.log("        → analyze_context");
  if (chatData.findings?.length > 0) {
    console.log("        → propose_actions → confirmation_gate (interrupted)");
    console.log("        → resume(confirm) → END");
  } else {
    console.log("        → log_clean_run → END");
  }
  console.log("        → follow-up question (same thread)");
  console.log("");
  console.log("  Key differences from proactive flow:");
  console.log("  • User-initiated with a natural language question");
  console.log("  • Context-scoped (can target specific documents)");
  console.log("  • Uses analyze_context (not analyze_health)");
  console.log("  • No standup fetch (3 parallel fetches vs 4)");
  console.log("  • Supports multi-turn conversation on same thread");
  console.log("");
  console.log("  Check LangSmith for the full trace.");
  console.log("═══════════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
