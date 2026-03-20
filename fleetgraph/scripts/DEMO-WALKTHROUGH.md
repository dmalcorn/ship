# FleetGraph Demo Walkthrough

Two scripted walkthroughs for recording video demos of FleetGraph's two LangGraph flows.

**Prerequisites before recording:**
- Ship API running (`pnpm dev` from repo root)
- FleetGraph running (`cd fleetgraph && npm run dev`)
- Database seeded (`pnpm db:seed`)
- LangSmith tracing enabled (for showing traces after)

**Login:** `dev@ship.local` / `admin123`

---

## Demo 1: Proactive Health-Check Flow

> This flow runs automatically every 3 minutes. It scans all project data for quality gaps — no user action needed to trigger it. The UI shows results in the sidebar.

### What you're demonstrating

```
START → resolve_context → [fetch_issues | fetch_sprint | fetch_team | fetch_standups] (parallel)
      → analyze_health → findings detected
      → propose_actions → confirmation_gate (HITL interrupt) → human confirms → END
```

### Steps

**1. Log in and orient the viewer**

- Open Ship in your browser and log in as `dev@ship.local` / `admin123`
- You land on the dashboard. Point out the left icon rail — the icons for navigation.
- Call out the **FleetGraph radar icon** in the icon rail (it has a small red badge showing a number — that's the count of findings from the last proactive scan).

> *"FleetGraph runs a proactive health check every 3 minutes in the background. It's already found some issues — you can see the red badge on the radar icon."*

**2. Open the FleetGraph findings panel**

- Click the **FleetGraph radar icon** in the left icon rail.
- The left sidebar switches to show the **Findings Panel** with a dark background.
- You should see:
  - A header: **"FleetGraph"** with a finding count (e.g., "3 findings")
  - **"Last scan: Xm ago"** timestamp at the top
  - A list of **FindingCards** sorted by severity (critical first, then warning, then info)

> *"Here's the findings panel. FleetGraph's last proactive scan found 3 issues across our projects. They're sorted by severity — critical items first."*

**3. Walk through individual findings**

- Point to each finding card and read it out. Typical findings from seed data:
  - **Unassigned issues** (warning) — issues in the active sprint with no owner
  - **Incomplete previous sprints** (warning) — past sprints with todo items still open
  - **Backlog items without sprint** (info) — high-priority items sitting unscheduled

- Each card shows:
  - A **severity badge** (red/yellow/blue)
  - **Title and description** explaining the problem
  - **Evidence** — specific issue names or sprint references
  - **Action button** (e.g., "Assign owners") and a **Dismiss** button

> *"This warning tells us there are unassigned issues in the current Ship Core sprint. It shows which specific issues are affected and recommends assigning owners."*

**4. Demonstrate the human-in-the-loop gate (Confirm)**

- On one of the finding cards, click the **primary action button** (e.g., "Assign owners").
- The button shows a brief loading state, then changes to **"Done"** with a checkmark.
- This calls `POST /api/fleetgraph/resume` with `decision: "confirm"` behind the scenes.

> *"When I click 'Assign owners', that sends a confirmation through the human-in-the-loop gate. FleetGraph doesn't make changes itself — it's a read-only agent. It surfaces the problem and I decide what to do. The 'confirm' tells the graph I've acknowledged this finding."*

**5. Demonstrate the human-in-the-loop gate (Dismiss)**

- On another finding card, click **"Dismiss"**.
- The card slides out with a fade animation.
- This calls the same resume endpoint with `decision: "dismiss"`.

> *"I can also dismiss findings I don't think are actionable. This one about backlog items — I'll dismiss it because those are intentionally unscheduled."*

**6. Show the empty state (optional)**

- If all findings are dismissed/confirmed, the panel shows:
  - A **green checkmark** icon
  - **"No findings — you're in good shape."**
  - A countdown: **"Next scan in ~3m"**

> *"Once all findings are handled, we get a clean bill of health. The next proactive scan runs in about 3 minutes and will check everything again."*

**7. (Optional) Show LangSmith trace**

- Switch to a browser tab with LangSmith open.
- Find the most recent proactive run trace.
- Show the node execution: `resolve_context` → parallel fan-out to 4 fetch nodes → `analyze_health` → `propose_actions` → `confirmation_gate`.
- Point out the LLM call inside `analyze_health` with the structured output.

> *"Here's the LangSmith trace for that proactive run. You can see it fanned out to four parallel data fetches, then the LLM analyzed everything and produced structured findings."*

---

## Demo 2: On-Demand Context-Aware Flow

> This flow is user-initiated. When viewing an issue or sprint, a chat button appears. The user asks a question, and FleetGraph analyzes that specific document's context.

### What you're demonstrating

```
START → resolve_context (with document) → [fetch_issues | fetch_sprint | fetch_team] (parallel)
      → analyze_context → findings detected
      → propose_actions → confirmation_gate (HITL interrupt) → human confirms → END
```

### Key differences from proactive flow to call out:
- User-initiated with a natural language question (not cron-triggered)
- Scoped to a specific document (issue or sprint)
- Uses `analyze_context` node (not `analyze_health`)
- 3 parallel fetches instead of 4 (no standups)
- Supports multi-turn conversation on the same thread

### Steps

**1. Navigate to an issue**

- From the icon rail, click the **Issues** or **Programs** icon.
- Navigate to the **Ship Core** program.
- Find and click on an issue in the **current sprint** — a good choice is one that's `in_progress` or `todo`, like **"Build issue assignment flow"** or **"Add sprint velocity metrics"**.
- The issue opens in the main editor panel.

> *"I'm looking at this issue — 'Build issue assignment flow'. It's in progress in our current sprint. Notice the blue button that just appeared in the bottom-right corner."*

**2. Point out the FleetGraph FAB**

- Call attention to the **blue floating action button** (radar icon) in the bottom-right corner.
- This only appears on issue and sprint pages.

> *"This chat button only shows up when I'm viewing an issue or sprint. It lets me ask FleetGraph context-aware questions about this specific document."*

**3. Open the chat drawer**

- Click the **FAB button**.
- The **Chat Drawer** slides up from the bottom-right (360px wide, dark theme).
- It shows:
  - A header with the document context: **"Issue: Build issue assignment flow"**
  - A close button (X) in the top-right
  - An empty chat area
  - A text input at the bottom with placeholder: **"Ask about this issue..."**

> *"The chat drawer opens with context about this specific issue. It knows what I'm looking at."*

**4. Ask a context-aware question**

- Type in the chat input:
  > **"What risks do you see with this issue? Is it on track for the sprint?"**
- Press Enter (or click the send button).
- Your message appears as a **right-aligned bubble** (dark gray).
- A loading spinner appears while FleetGraph processes.
- After a few seconds, the **agent response** appears as a left-aligned bubble with formatted markdown.

> *"I'm asking FleetGraph to analyze this specific issue in context. It's going to fetch the sprint data, team assignments, and related issues to give me a contextual answer."*

**5. Read the response**

- The agent response will include:
  - Analysis of the issue's status relative to the sprint timeline
  - Any risks it identified (unassigned, blocked, stale, etc.)
  - Recommendations formatted with bullet points and bold text
- If findings were detected, they may appear as structured cards below the chat.

> *"FleetGraph pulled in the sprint context and team data. It's telling me [read the key points from the response]. This is different from the proactive scan — it's specifically about this issue and answering my question."*

**6. Ask a follow-up question (multi-turn)**

- Type a follow-up:
  > **"Who else on the team could help with this?"**
- Press Enter.
- The response builds on the previous context (same thread).

> *"I can have a back-and-forth conversation. FleetGraph remembers the context from my first question — it knows we're talking about this specific issue and sprint."*

**7. Show it works on a sprint too**

- Close the chat drawer (click X or press Escape).
- Navigate to a **sprint** — go to the current Ship Core sprint (the active week).
- The **FAB appears again** (it works on sprints too).
- Click it — the drawer opens with: **"Sprint: Week N"** in the header.
- The placeholder now says: **"Ask about this sprint..."**
- Type:
  > **"How is this sprint looking? Any items at risk of not completing?"**
- The response will analyze the full sprint — completion rate, in-progress vs. todo items, team workload.

> *"FleetGraph works on sprints too. Now it's analyzing the entire sprint — looking at completion rates, what's still in progress, and whether we're on track."*

**8. (Optional) Show LangSmith trace**

- Switch to LangSmith.
- Find the on-demand trace (look for the most recent one).
- Show the difference from the proactive trace:
  - `resolve_context` fetched the specific document and its associations
  - 3 parallel fetches (no standups)
  - `analyze_context` node (not `analyze_health`) — the prompt includes the user's question
  - The user's message is visible in the trace

> *"Comparing the traces — the on-demand flow is scoped differently. It fetched this specific document's associations, used 3 parallel fetches instead of 4, and the analysis was guided by my question rather than running a generic health check."*

---

## Quick Reference: What to Say at Key Moments

| Moment | Talking Point |
|--------|---------------|
| Red badge on icon | "The proactive graph runs every 3 minutes and surfaces findings automatically" |
| Findings panel | "Findings are sorted by severity — critical issues bubble to the top" |
| Clicking Confirm | "This is the human-in-the-loop gate — FleetGraph is read-only, it never makes changes" |
| FAB appearing | "The chat button only shows on issues and sprints — context-aware by design" |
| Chat response | "It pulled in sprint data, team info, and related issues to answer my specific question" |
| Follow-up question | "Multi-turn conversation — it remembers the context from my first question" |
| LangSmith trace | "Every node and LLM call is traced — you can see the parallel fan-out and structured output" |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| No badge on FleetGraph icon | Wait up to 3 minutes for first proactive run, or run `npx tsx scripts/demo-proactive.ts` to trigger manually |
| FAB doesn't appear | Make sure you're on an issue or sprint page, not the dashboard |
| Chat returns error | Check that FleetGraph server is running (`cd fleetgraph && npm run dev`) |
| No findings in panel | The proactive scan may have found a clean state. Create an issue without an assignee to trigger detection |
| "Last scan" shows stale | FleetGraph may have restarted (MemorySaver is in-memory). Wait for next cron cycle |
