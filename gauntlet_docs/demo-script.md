# FleetGraph Demo Script

**Format:** Screencast video with narration
**Duration target:** 5-7 minutes
**Story:** One end-to-end scenario — from detection to human decision

---

## Opening (30 seconds)

**Show:** Ship dashboard with a project open, findings panel visible in the sidebar.

**Say:**
> "This is FleetGraph, an autonomous project intelligence agent built into Ship. It monitors project data on a 3-minute cron cycle, detects quality gaps, and surfaces them to the team with recommended actions. I'm going to walk through one complete example — from how a problem enters the system, to how the agent detects it, to what the graph does, to what the human decides."

---

## Act 1: Set Up the Problem (1 minute)

**Goal:** Show the test case that triggers detection. The audience needs to see the "before" state so the detection feels real.

**Do:**
1. Open the project's issue list in Ship
2. Point out an issue that has no assignee — or create/edit one to remove the assignee
3. Also show that there's a security-tagged issue (e.g., "XSS vulnerability in form input") with no assignee

**Say:**
> "Here's our test case. I have an active sprint with several issues. Notice this one — [issue title] — has no assignee. And this one — [security issue title] — is a security-related issue, also unassigned. These are the kinds of problems that slip through in real projects. Let's see what happens when FleetGraph's next cron cycle runs."

---

## Act 2: The Agent Detects (1.5 minutes)

**Goal:** Show the proactive graph running and findings appearing. Narrate what the agent is doing at each step.

**Do:**
1. Wait for the next cron cycle (or trigger manually via POST to `/api/fleetgraph/analyze`) — show the findings panel updating
2. As findings appear, walk through them one at a time

**Say:**
> "The proactive graph just ran. Here's what happened behind the scenes — let me walk through the graph path."

**Switch to:** LangSmith trace for this run (have the tab ready).

> "The graph started at `resolve_context`, which identifies the workspace. Then four fetch nodes ran in parallel — `fetch_issues`, `fetch_sprint`, `fetch_team`, and `fetch_standups` — pulling all active project data from Ship's API. You can see each one completed in about 1-2 seconds."

> "Next, the data flows into `analyze_health`. This is where Claude examines all the fetched data using structured output. The LLM is constrained to a fixed set of detection categories — it can't hallucinate new ones. It found two problems: an unassigned issue at warning severity, and an unowned security issue at critical severity."

> "After the reasoning node, the graph routed to `propose_actions`, which maps each finding to a recommended action. Then it hit the `confirmation_gate` — this is the human-in-the-loop point. The graph pauses here and surfaces the findings to the UI."

---

## Act 3: The Findings Panel (1 minute)

**Goal:** Show the UI that the human interacts with. Walk through what information is presented.

**Do:**
1. Back in Ship, show the findings panel with the new findings
2. Point out the severity badges (critical vs. warning)
3. Show the finding card details — title, description, evidence, recommendation
4. Show the affected document link ("View Issue" button)

**Say:**
> "Back in Ship, the findings panel now shows two cards. The critical one is at the top — FleetGraph sorts by severity. Each card shows what was detected, the evidence from the actual data — you can see it's citing real issue IDs and titles — and a recommendation."

> "The 'View Issue' button links directly to the affected document, so I can jump straight to the problem without searching for it."

---

## Act 4: The Human Decides (1.5 minutes)

**Goal:** This is the key moment. Show all three human decision paths.

### Path A — Take Action on the Security Finding

**Do:**
1. Click "View Issue" on the critical security finding to open the issue
2. Assign it to a team member from the properties panel
3. Dismiss the finding

**Say:**
> "For the critical security finding, I'm going to take action. I'll open the issue, assign it to the right person, and then dismiss the finding. FleetGraph detected the problem; I made the judgment call about who should own it. The agent can't know who the right assignee is — that requires team context."

### Path B — Snooze the Warning

**Do:**
1. On the unassigned issue warning, click the Snooze dropdown
2. Select "4 hours"
3. Show the finding disappear with the slide-out animation

**Say:**
> "For this unassigned issue, I know the team lead is going to handle assignments at standup. I'll snooze it for 4 hours. The finding will come back after the snooze period if the issue is still unassigned. Snoozing uses a stable composite key, so even if the cron regenerates findings from fresh data, the snooze is preserved."

---

## Act 5: On-Demand Mode (1 minute)

**Goal:** Show the second graph topology — on-demand, context-scoped chat.

**Do:**
1. Navigate to an active sprint document
2. Click the FleetGraph FAB (radar icon) in the bottom-right
3. In the chat drawer, type: "How is this sprint looking?"
4. Show the response with sprint health analysis

**Say:**
> "FleetGraph also has an on-demand mode. When I open the chat from a sprint document, the agent knows the context — it fetches data scoped to this sprint. This runs a different graph: three parallel fetch nodes instead of four, and `analyze_context` instead of `analyze_health`. The response gives me velocity, completion rate, blockers, and at-risk items specific to this sprint."

**Switch to:** LangSmith trace for this on-demand run.

> "In LangSmith, you can see this trace has a visibly different shape from the proactive run. Three fetch branches, different reasoning node, same action pipeline."

---

## Act 6: Change Detection / Clean Run (30 seconds)

**Goal:** Show the third graph path — and the cost optimization.

**Say:**
> "One more thing worth showing. FleetGraph runs every 3 minutes, but it doesn't call the LLM every time. Before each run, it computes a SHA-256 hash of all fetched data. If nothing changed since the last run, the graph is skipped entirely — no LLM call, no cost. This reduces LLM invocations by 70-80%."

> "And when data has changed but the project is healthy — no quality gaps — the graph takes the `log_clean_run` path instead of `propose_actions`. That's a third distinct execution path visible in LangSmith."

*Optional:* If time allows, show a LangSmith trace of a clean run with the shorter path.

---

## Closing (30 seconds)

**Say:**
> "To recap: FleetGraph autonomously monitors project data, detects quality gaps using structured LLM reasoning, proposes actions, and surfaces them for human decision. The human can act on a finding, snooze it, or dismiss it. The agent handles detection and analysis; the human handles judgment. Every run is traced in LangSmith, and the graph produces visibly different execution paths depending on what it finds."

---

## Pre-Demo Checklist

- [ ] Ship is running with seeded data (issues with missing assignees, security-tagged issue with no assignee)
- [ ] FleetGraph service is running and healthy (`GET /health` returns 200)
- [ ] LangSmith dashboard open in a browser tab with the FleetGraph project selected
- [ ] Have at least 2 LangSmith trace links ready (proactive findings run + on-demand chat run)
- [ ] Clear existing findings if needed (restart FleetGraph or wait for fresh cron cycle)
- [ ] Browser tabs pre-loaded: Ship app, LangSmith traces
- [ ] Test the manual trigger endpoint works: `POST /api/fleetgraph/analyze` with `{ "workspaceId": "..." }`

## Key Traces to Have Ready

| Trace | What It Shows | Graph Path |
|-------|--------------|------------|
| Proactive with findings | Full detection → action → HITL pipeline | resolve_context → parallel fetch (4) → analyze_health → propose_actions → confirmation_gate |
| On-demand sprint chat | Context-scoped analysis, different graph shape | resolve_context → parallel fetch (3) → analyze_context → propose_actions → confirmation_gate |
| Clean run (optional) | Healthy project, no findings | resolve_context → parallel fetch → analyze_health → log_clean_run |
| Data unchanged (optional) | Change detection gate skipping LLM | Pre-graph hash comparison, no graph nodes executed |
