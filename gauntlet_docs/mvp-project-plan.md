# FleetGraph MVP Project Plan

*30-Hour Sprint Battle Plan*

---

## The 30-Hour MVP Reality Check

Your MVP checklist (from the PRD) boils down to **8 hard requirements**:

1. Graph running with at least one proactive detection wired end-to-end
2. LangSmith tracing with 2 shared trace links showing different paths
3. FLEETGRAPH.md with Agent Responsibility + Use Cases (5+)
4. Graph outline documented (nodes, edges, branching)
5. At least one human-in-the-loop gate
6. Running against real Ship data
7. Deployed and publicly accessible
8. Trigger model documented and defended

The good news: **items 3, 4, and 8 are 80% done** -- your PRESEARCH already contains the substance. It just needs to be moved into the FLEETGRAPH.md template.

---

## Recommended Time Allocation (~30 hours)

### Hours 0-2: Skeleton + Infra (get deployable fast)
- Scaffold the LangGraph service (Node.js or Python -- pick whichever you're faster in)
- Set up LangSmith tracing immediately (`LANGCHAIN_TRACING_V2=true`)
- Get a health endpoint, deploy to Railway as a stub
- **Why first:** A deployable skeleton removes your highest-risk item early. "Deployed and publicly accessible" is pass/fail.

### Hours 2-8: One Proactive Detection End-to-End
- **Pick Stale Issue Detection (Use Case #1)** -- it's your simplest and most self-contained
- Wire up: `resolve_context` -> `fetch_issues` -> `analyze_health` -> conditional edge -> `action_propose` OR `log_clean_run`
- This one flow gives you: conditional branching, a reasoning node, and a clear "different execution paths" trace
- Run it against real Ship data, capture your first LangSmith trace

### Hours 8-12: Human-in-the-Loop Gate
- Add the `confirmation_gate` node after `action_propose`
- Build a minimal Agent Findings panel in Ship's UI (even a simple card with Confirm/Dismiss buttons)
- This satisfies requirement #5 and makes the demo tangible

### Hours 12-18: On-Demand Chat Mode
- Add context-aware chat embedded in an issue or sprint view
- Wire `resolve_context` to detect on-demand trigger, fetch relevant data, route to `analyze_context`
- This gives you your **second distinct execution path** for the LangSmith trace requirement

### Hours 18-22: Polish + Second Trace + Error Handling
- Capture your second LangSmith trace link (on-demand mode vs. proactive mode)
- Add basic error/fallback node for API failures
- Deploy the full working version to Railway

### Hours 22-26: FLEETGRAPH.md Documentation
- Transfer PRESEARCH content into the FLEETGRAPH.md template sections
- Add graph diagram (Mermaid -- you can generate this from your actual node/edge definitions)
- Document trigger model (already written in PRESEARCH, just needs formatting)

### Hours 26-30: Buffer
- Test against real data edge cases
- Fix broken traces
- Verify deployment is stable

---

## Three Critical Strategic Calls

1. **Pick ONE proactive use case for MVP, not all seven.** Stale Issue Detection is your best bet -- it's simple to detect, easy to verify, and clearly demonstrates graph branching (issues found vs. clean run).

2. **Deploy early, deploy often.** Get your Railway service up by hour 2 with just a health check. Redeploy every few hours. Don't save deployment for the end -- that's where deadline projects die.

3. **LangSmith traces are graded artifacts.** Capture traces as you build, not after. Every test run generates a trace. Share links early so you know they work.

---

## Biggest Risk

Cost projections in the PRESEARCH show ~$0.036/run with Sonnet. For a 30-hour build sprint, that's fine for dev costs. But make sure you have your **Claude API key and LangSmith API key provisioned before you write a single line of code.** Missing API credentials have killed more MVP deadlines than bad architecture.

---

## MVP Scope Summary

### In Scope (must ship)
- Stale Issue Detection (proactive, polled)
- On-demand context-aware chat (issue or sprint view)
- Human-in-the-loop confirmation gate for proposed actions
- LangSmith tracing from day one
- Railway deployment
- FLEETGRAPH.md with all MVP-due sections filled in

### Out of Scope (defer to Early/Final Submission)
- Missing standup alerts
- Triage queue aging
- Workload imbalance detection
- Sprint health monitor (proactive)
- Snooze/dismiss persistence
- Rule-based LLM fallback
- Cache layer (Redis/SQLite)
- Cost analysis section of FLEETGRAPH.md
