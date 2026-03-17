---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
inputDocuments:
  - gauntlet_docs/PRESEARCH.md
  - gauntlet_docs/FleetGraph_PRD.md
  - gauntlet_docs/mvp-project-plan.md
  - gauntlet_docs/technical-research-langgraph-claude-sdk.md
workflowType: 'prd'
documentCounts:
  briefs: 0
  research: 1
  brainstorming: 1
  projectDocs: 35
classification:
  projectType: government_internal
  domain: scientific
  complexity: medium-high
  projectContext: brownfield
---

# Product Requirements Document - FleetGraph

**Author:** Diane
**Date:** 2026-03-16

## Executive Summary

FleetGraph is an AI-powered project intelligence agent that autonomously monitors software engineer work within the Ship project management platform, surfacing mistakes, quality gaps, and process violations before evaluators discover them. Built for the Gauntlet AI training program, FleetGraph uses a LangGraph.js reasoning pipeline backed by Claude to continuously analyze issues, sprints, team assignments, and standup data — then produces structured findings ranked by severity with actionable recommendations.

The target users are Gauntlet software engineers and program evaluators. For software engineers, FleetGraph creates a continuous feedback loop that drives behavioral change: when people know an AI agent is watching for unassigned issues, empty sprints, duplicate tickets, and missing ticket numbers, they self-correct. For evaluators, it provides an automated quality lens across all projects without manual inspection.

### What Makes This Special

FleetGraph is not a dashboard, notification system, or rules engine. It is an autonomous reasoning agent that analyzes project data holistically — understanding relationships between issues, sprints, team members, and work patterns that static rules would miss. The first production run validated this approach by identifying 10 real findings across 4 severity levels (critical, warning, info), including unassigned issues, duplicate work, unowned security issues, and an empty active sprint.

The core insight: the problem isn't that software engineers can't do better work — it's that mistakes go unnoticed until evaluation time. FleetGraph closes that gap with always-on, autonomous monitoring that makes quality gaps impossible to ignore. The agent doesn't fix mistakes; it makes them visible.

## Project Classification

| Attribute | Value |
|-----------|-------|
| **Project Type** | Government Internal (AI agent extension to US Treasury's Ship platform) |
| **Domain** | AI/ML — project intelligence and autonomous monitoring |
| **Complexity** | Medium-High — LangGraph orchestration, Claude reasoning, Ship API integration, human-in-the-loop confirmation, LangSmith observability |
| **Project Context** | Brownfield — extends the existing Ship platform with a new `fleetgraph/` package |

## Success Criteria

### User Success

- **Software engineers discover mistakes before evaluators do.** FleetGraph surfaces issues (unassigned work, empty sprints, duplicates, missing ticket numbers) with enough lead time for engineers to fix them before checkpoint deadlines.
- **Findings are actionable, not noisy.** Each finding includes severity, evidence, and a recommended action. Users can confirm or dismiss findings via a human-in-the-loop gate — the agent proposes, the human decides.
- **Context-aware chat feels like a power feature.** On-demand mode scoped to the current issue or sprint provides instant reasoning about what the user is looking at — not a generic chatbot.

### Business Success

- **Behavioral change is observable.** Over the course of the Gauntlet program, the number of critical findings per engineer decreases as teams self-correct in response to FleetGraph's monitoring.
- **Evaluator workload reduced.** Automated quality scanning means evaluators spend less time on mechanical inspection and more time on substantive assessment.

### Technical Success

- **Problem detection latency < 5 minutes** from event appearing in Ship to agent surfacing it (assignment requirement).
- **LangSmith tracing on 100% of graph runs** with distinct execution paths visible for proactive vs. on-demand modes.
- **Cost per graph run documented and defensible** — PRESEARCH estimates ~$0.036/run with Sonnet, validated against actual usage.
- **Deployed and publicly accessible** on Railway with health endpoint.

### Measurable Outcomes

| Metric | Target |
|--------|--------|
| Proactive detection latency | < 5 minutes |
| Minimum use cases defined | 5+ |
| LangSmith trace links (distinct paths) | 2+ |
| Human-in-the-loop gates | 1+ |
| Graph runs against real Ship data | 100% (no mocks) |

## User Journeys

### Journey 1: Marcus — Software Engineer, Success Path

**Who:** Marcus is a software engineer in the Gauntlet program, midway through a sprint. He's juggling multiple issues across two projects in Ship and context-switching between coding and project management.

**Opening Scene:** Marcus starts his morning, opens Ship, and sees a FleetGraph notification badge. He clicks it and finds three findings from the overnight proactive scan: two issues he created yesterday have no assignee, and one high-priority security issue he owns has no sprint assignment.

**Rising Action:** Each finding shows the severity (warning), the specific issue title and link, and a recommended action ("Assign to a team member or self-assign"). Marcus clicks through to the issues and realizes he forgot to assign them in the rush to log his work before end of day. He also spots the security issue — he'd planned to get to it but never pulled it into the current sprint.

**Climax:** Marcus fixes all three in under two minutes. He returns to FleetGraph's findings panel and confirms each one as resolved. He realizes that without the agent, these gaps would have sat there until an evaluator flagged them — possibly days later.

**Resolution:** Over the next few weeks, Marcus develops a habit of checking his work more carefully before closing out for the day. The number of findings FleetGraph surfaces for his projects drops steadily. The agent trained him to be more thorough without anyone having to tell him.

### Journey 2: Marcus — Software Engineer, On-Demand Edge Case

**Opening Scene:** Marcus is staring at a sprint view that feels off. There are 14 issues but velocity seems low. He's not sure if the sprint is healthy or if something is slipping.

**Rising Action:** He opens the context-aware chat scoped to this sprint and asks: "Is this sprint on track?" FleetGraph reasons over the sprint data — issue statuses, assignments, days remaining, completed vs. open work — and responds with a structured analysis: 4 issues are unstarted with 2 days left, 2 issues have no assignee, and the completion rate is tracking below the team's historical average.

**Climax:** The chat surfaces a specific risk Marcus hadn't noticed: two of the unstarted issues are blockers for a downstream task that another engineer is waiting on. FleetGraph recommends either re-scoping or immediately starting those blockers.

**Resolution:** Marcus re-prioritizes his day, starts the blocking issues, and flags the scope risk to his team. The sprint closes with all critical work completed. Without the on-demand query, he would have discovered the blocker dependency too late.

### Journey 3: Dr. Patel — Evaluator

**Who:** Dr. Patel evaluates software engineers across 8 projects in the Gauntlet program. She has limited time per project and needs to quickly assess whether teams are following good engineering practices.

**Opening Scene:** Dr. Patel opens Ship and navigates to the FleetGraph dashboard view. Instead of manually clicking through each project's issues, sprints, and standups, she sees an aggregated findings summary across all projects she evaluates.

**Rising Action:** She sorts by severity and immediately spots two projects with critical findings: one has an empty active sprint (no issues assigned to the current sprint at all), and another has 6 duplicate issues that suggest the team isn't checking for existing tickets before creating new ones. Three other projects show clean — zero critical findings.

**Climax:** Dr. Patel drills into the project with the empty sprint. The FleetGraph trace shows this has been the case for 3 days — the team created a sprint but never populated it. She now has specific, timestamped evidence for her evaluation rather than a subjective impression.

**Resolution:** Dr. Patel completes her evaluation of all 8 projects in half the time it normally takes. She provides specific, evidence-backed feedback to each team. The teams with clean FleetGraph reports get credit for good project hygiene.

### Journey 4: Diane — System Operator / Admin

**Who:** Diane deployed and maintains FleetGraph on Railway. She needs to ensure the agent is running correctly, costs are under control, and findings are accurate.

**Opening Scene:** Diane checks the Railway dashboard and sees FleetGraph's health endpoint is green. She opens LangSmith and reviews the latest traces from the 3-minute cron cycle.

**Rising Action:** She notices one trace took unusually long — 45 seconds instead of the typical 8-10. She drills into the trace and sees the Ship API fetch for issues returned 200+ items for one project, causing the reasoning node to process a much larger context window. She also checks the cost column — the run cost $0.12 instead of the typical $0.036.

**Climax:** Diane realizes that as projects accumulate more issues over the program, the per-run cost will drift upward. She adjusts the fetch node to filter for only open issues (excluding closed) and adds a date window filter. The next run drops back to normal cost and latency.

**Resolution:** Diane documents the cost optimization in her FLEETGRAPH.md cost analysis section and sets up a LangSmith alert for runs exceeding $0.10. She has confidence the system is sustainable for the remainder of the program.

### Journey Requirements Summary

| Journey | Capabilities Revealed |
|---------|----------------------|
| **Marcus — Success Path** | Proactive scanning, findings notification, severity ranking, actionable recommendations, confirm/dismiss UI, human-in-the-loop gate |
| **Marcus — On-Demand** | Context-aware chat scoped to sprint/issue, structured analysis output, risk identification, dependency detection |
| **Dr. Patel — Evaluator** | Aggregated cross-project findings view, severity sorting, drill-down to evidence, timestamped finding history |
| **Diane — Operator** | Health endpoint, LangSmith trace review, cost monitoring, fetch parameter tuning, alerting |

## Domain-Specific Requirements

### AI Agent Accountability & Validation

- **Finding accuracy must be verifiable.** Every finding FleetGraph produces must include the specific Ship data that triggered it (issue IDs, sprint names, timestamps) so engineers and evaluators can independently verify the finding is correct. False positives erode trust rapidly.
- **Reasoning transparency via LangSmith.** Every graph run is traced end-to-end. Evaluators and operators can inspect exactly what data the agent saw, what reasoning Claude performed, and why a finding was classified at a given severity. No black-box conclusions.

### Cost & Computational Constraints

- **Token budget per run must be bounded.** The reasoning node receives filtered, structured data — not raw API dumps. PRESEARCH estimates ~$0.036/run with Sonnet; actual costs must be tracked and reported.
- **Polling frequency balanced against cost.** The 3-minute cron interval means ~480 runs/day. At $0.036/run that's ~$17/day. Operator must be able to adjust interval without code changes.
- **Model selection is a cost lever.** Claude Sonnet for reasoning keeps costs low; Claude Opus reserved for complex multi-project analysis if needed in Vision scope.

### Data Integrity & Ship API Constraints

- **Ship REST API is the sole data source.** No direct database access. Agent must handle API rate limits, pagination, and partial failures gracefully.
- **Real data only — no mocks in production.** All findings must be derived from live Ship data. Test/demo modes must be clearly separated from production monitoring.
- **Stale data awareness.** The agent must reason about data freshness — a finding about an "unassigned issue" that was assigned 30 seconds after the fetch should not persist as a critical finding.

### Reproducibility & Observability

- **Deterministic graph structure with non-deterministic reasoning.** The graph topology (nodes, edges, conditional branches) is fixed and documented. The LLM reasoning within nodes is non-deterministic but bounded by structured output schemas.
- **LangSmith traces as graded artifacts.** Traces are not just debugging tools — they are deliverables that demonstrate the agent's reasoning quality and execution path diversity.

### Government Platform Context

- **Ship is a US Department of Treasury internal project management tool.** FleetGraph extends this government-developed platform; all data remains within the existing Ship deployment boundary.
- **No external data egress beyond LLM API calls.** Project data sent to Claude for reasoning is the only external data flow. LangSmith traces contain execution metadata, not raw project content.

## Innovation & Novel Patterns

### Detected Innovation Areas

- **Autonomous AI agent for project accountability.** FleetGraph is not an assistant that responds to questions — it proactively monitors, reasons, and surfaces findings without being asked. This shifts the interaction model from "user pulls information" to "agent pushes intelligence."
- **Graph-based reasoning over project state.** Using LangGraph's conditional branching and parallel execution to analyze relationships between issues, sprints, assignments, and standups — not just individual data points. The graph produces visibly different execution paths depending on what it finds (clean run vs. problem-detected run).
- **AI agent extending a government-built platform.** Ship is a US Treasury internal tool. Adding an autonomous AI reasoning layer to a government project management system is an unconventional application of agentic AI — most government AI deployments are assistant-style or document processing, not autonomous monitoring agents.

### Market Context & Competitive Landscape

- **No direct competitor in this niche.** Tools like LinearB, Jellyfish, and Pluralsight Flow analyze engineering metrics, but none deploy an autonomous reasoning agent that proactively surfaces project hygiene issues and proposes actions with human-in-the-loop gates.
- **LangGraph is early-stage technology.** LangGraph.js is a relatively new framework; building a production agent with it demonstrates cutting-edge agentic AI patterns (state graphs, conditional routing, parallel tool calls, human-in-the-loop).

### Validation Approach

- **First production run already validated.** The initial run produced 10 real findings across 4 severity levels against live Ship data — proving the reasoning pipeline works end-to-end.
- **LangSmith traces as validation artifacts.** Every run is traced, providing objective evidence of reasoning quality, execution path diversity, and cost.
- **Behavioral change measurable over time.** Track finding counts per engineer across weeks — declining critical findings validates the accountability hypothesis.

### Risk Mitigation

- **False positives:** Mitigated by human-in-the-loop gate and evidence-linked findings (see Domain Requirements: AI Agent Accountability).
- **Cost drift:** Bounded by token input filtering and configurable polling interval (see Domain Requirements: Cost & Computational Constraints).
- **LLM non-determinism:** Constrained by structured output schemas that bound reasoning variance while preserving analytical flexibility.

## AI Agent Platform Requirements

### Project-Type Overview

FleetGraph is an autonomous AI agent deployed as a standalone service (Railway) that integrates with Ship's REST API. It combines patterns from API backend (consuming Ship endpoints), background service (cron-based polling), and AI/ML pipeline (LangGraph orchestration with Claude reasoning). It is not a SaaS product — it is an internal tool extending a government platform.

### Technical Architecture Considerations

**Graph Orchestration (LangGraph.js)**
- State graph with typed `AgentState` managing conversation context, fetched data, findings, and action proposals
- Nodes: `resolve_context` → parallel `fetch_*` nodes → `analyze_health` (Claude reasoning) → conditional edge → `action_propose` or `log_clean_run`
- Conditional edges produce visibly different execution paths for LangSmith trace differentiation
- Human-in-the-loop `confirmation_gate` interrupts before consequential actions

**Ship API Integration**
- REST API consumption: issues, sprints, team members, standups
- Authentication via session cookies (15-minute timeout, 12-hour absolute)
- Parallel fetch nodes for performance — multiple API calls execute concurrently
- Error/fallback node handles API failures, missing data, and unexpected state without crashing

**Claude Reasoning Node**
- Model: Claude Sonnet (cost-optimized) via Anthropic SDK
- Structured output schema for findings (severity, category, evidence, recommendation)
- Named tool use for specific analysis functions (e.g., `analyze_issues` tool)
- Input: filtered, structured project data — not raw API responses

**Observability Stack**
- LangSmith tracing on 100% of runs (`LANGCHAIN_TRACING_V2=true`)
- Trace links as graded deliverables
- Cost tracking per run via token usage

### Deployment & Operations

- **Runtime:** Node.js on Railway
- **Trigger:** Cron-based polling (configurable interval, currently 3 minutes)
- **Health:** `/health` endpoint for uptime monitoring
- **Configuration:** Environment variables for API keys, polling interval, Ship API base URL
- **No database required for MVP** — findings are ephemeral per run; persistence deferred to Growth scope

### Integration Points

| System | Integration Type | Purpose |
|--------|-----------------|---------|
| Ship REST API | HTTP client (consuming) | Fetch issues, sprints, team, standups |
| Claude API | Anthropic SDK | LLM reasoning in analysis node |
| LangSmith | Auto-instrumented via LangGraph | Tracing, observability, cost tracking |
| Railway | Deployment platform | Hosting, health checks, environment config |

### Implementation Considerations

- **Session management:** Ship's 15-minute session timeout means FleetGraph must handle re-authentication or use a long-lived service token if available
- **Data volume scaling:** As projects grow, fetch nodes must filter (open issues only, date windows) to keep reasoning node input bounded
- **Structured output reliability:** Claude's structured output must be validated — malformed findings should be caught and logged, not surfaced to users
- **Graph testability:** Individual nodes should be testable in isolation with fixture data; full graph integration tests run against Ship's seed data

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Problem-solving MVP — prove that an autonomous AI agent can detect real project quality issues against live Ship data and surface them with actionable recommendations. The MVP validates the core hypothesis: "an always-on reasoning agent changes behavior by making mistakes visible."

**Resource Requirements:** Solo developer (Diane), ~30-hour sprint, with LangGraph.js + Claude API + Railway deployment stack already operational.

**Timeline:**
| Checkpoint | Deadline | Focus |
|---|---|---|
| Pre-Search | Completed | Agent responsibility + architecture decisions |
| MVP | Tuesday, 11:59 PM | Running graph, tracing, use cases defined |
| Early Submission | Friday, 11:59 PM | Polish, documentation, deployment |
| Final Submission | Sunday, 11:59 PM | All deliverables submitted |

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**
- Marcus Success Path (proactive findings) — partially supported (findings generated, UI deferred)
- Diane Operator (health monitoring via Railway + LangSmith) — fully supported

**Must-Have Capabilities:**
1. LangGraph.js state graph with full node pipeline: `resolve_context` → parallel `fetch_*` → `analyze_health` → conditional edge → `action_propose` / `log_clean_run`
2. One proactive detection end-to-end (stale/unassigned issue detection — already working)
3. Human-in-the-loop confirmation gate (`confirmation_gate` node)
4. LangSmith tracing on all runs with 2+ shared trace links showing different execution paths
5. Cron-based polling trigger (3-minute interval — already running)
6. Deployed on Railway with `/health` endpoint
7. FLEETGRAPH.md with Agent Responsibility, Graph Diagram, Use Cases (5+), Trigger Model

**Explicitly Out of MVP:**
- Ship UI integration (findings panel, notification badge, confirm/dismiss buttons)
- On-demand context-aware chat
- Evaluator aggregated dashboard view
- Finding persistence / database storage

### Post-MVP Features

**Phase 2 — Early Submission (Friday):**
- On-demand context-aware chat mode (second execution path for LangSmith traces)
- Error/fallback node for API failures
- Test cases documented with trace links for each use case
- Architecture decisions documented
- Second LangSmith trace link captured (on-demand vs. proactive)

**Phase 3 — Final Submission (Sunday):**
- Polish and edge case testing against real data
- Cost analysis (development spend + production projections at 100/1K/10K users)
- Complete FLEETGRAPH.md with all sections filled
- Stable Railway deployment verified

**Phase 4 — Vision (Post-Program):**
- Ship UI integration (findings panel, notifications)
- Evaluator cross-project dashboard
- Additional proactive detections (standup alerts, triage aging, workload imbalance)
- Finding persistence and history
- Webhook-based triggers for real-time detection
- Cache layer for cost optimization

### Risk Mitigation Strategy

**Technical Risks:**
- *LLM reasoning quality:* Mitigated by structured output schemas and the first successful production run (10 real findings). Fallback: tighten prompt constraints or switch to simpler rule-based checks.
- *Ship API session timeout:* 15-minute session expiry could break cron runs. Mitigation: re-authenticate on each cron cycle or obtain a service token.
- *Cost escalation:* Filter fetch nodes to open issues only; monitor per-run cost via LangSmith; adjustable polling interval.

**Market Risks:**
- *Not applicable in traditional sense.* This is an assignment deliverable, not a market product. The "market" is the Gauntlet evaluation rubric — and the MVP checklist is explicit.

**Resource Risks:**
- *Solo developer, fixed timeline.* Mitigation: MVP scope already validated as achievable (core pipeline working, deployed, traced). Documentation tasks (FLEETGRAPH.md) can leverage PRESEARCH content that's 80% written. Buffer hours (26-30) reserved for edge cases.

## Functional Requirements

### Proactive Monitoring

- FR1: The agent can autonomously scan Ship project data on a configurable polling interval without user initiation
- FR2: The agent can detect unassigned issues across all active projects
- FR3: The agent can detect issues with no sprint assignment
- FR4: The agent can detect duplicate issues within a project
- FR5: The agent can detect empty active sprints (sprints with no issues assigned)
- FR6: The agent can detect issues missing ticket number conventions
- FR7: The agent can detect unowned security-tagged issues
- FR8: The agent can detect high-priority work that is not scheduled in any sprint

### Findings & Reporting

- FR9: The agent can classify each finding by severity level (critical, warning, info)
- FR10: The agent can provide specific evidence for each finding (issue IDs, sprint names, timestamps)
- FR11: The agent can generate actionable recommendations for each finding
- FR12: The agent can produce a structured findings report per scan run
- FR13: The agent can distinguish between a clean run (no findings) and a problem-detected run with visibly different execution paths

### Human-in-the-Loop

- FR14: The agent can pause execution before taking any consequential action and surface a confirmation request
- FR15: A user can confirm or dismiss a proposed action from the agent
- FR16: The agent can proceed with a confirmed action or log a dismissed action

### On-Demand Analysis

- FR17: A user can invoke the agent from within a specific issue context in Ship
- FR18: A user can invoke the agent from within a specific sprint context in Ship
- FR19: The agent can reason about the current state of a sprint (velocity, completion rate, unstarted work, days remaining)
- FR20: The agent can identify blocking dependencies between issues within a sprint
- FR21: The agent can respond to natural language questions scoped to the user's current context

### Data Integration

- FR22: The agent can fetch issue data from Ship's REST API
- FR23: The agent can fetch sprint data from Ship's REST API
- FR24: The agent can fetch team member data from Ship's REST API
- FR25: The agent can fetch standup data from Ship's REST API
- FR26: The agent can execute multiple API fetch operations in parallel
- FR27: The agent can handle Ship API failures gracefully without crashing

### Observability & Tracing

- FR28: The agent can produce a LangSmith trace for every graph execution
- FR29: An operator can view shared trace links demonstrating different execution paths
- FR30: An operator can inspect what data the agent received, what reasoning was performed, and what findings were produced for any run
- FR31: An operator can track token usage and cost per graph run

### Deployment & Operations

- FR32: The agent can run as a standalone service on Railway
- FR33: An operator can verify agent health via a `/health` endpoint
- FR34: An operator can configure polling interval, API keys, and Ship API base URL via environment variables
- FR35: The agent can re-authenticate with Ship's API when sessions expire

### Documentation & Deliverables

- FR36: The system can generate a graph diagram showing all nodes, edges, and conditional branches
- FR37: The system can document the trigger model decision with tradeoff analysis
- FR38: The system can document test cases with corresponding LangSmith trace links
- FR39: The system can report development costs (token usage, invocation count, total spend)
- FR40: The system can project production costs at 100, 1,000, and 10,000 user scale

## Non-Functional Requirements

### Performance

- **Problem detection latency:** Agent must surface findings within 5 minutes of the triggering event appearing in Ship (assignment requirement, verified by timed test run).
- **Graph execution time:** A single proactive scan run must complete within 60 seconds, including all API fetches and Claude reasoning.
- **On-demand response time:** Context-aware chat queries must return a response within 15 seconds of user invocation.
- **Parallel fetch efficiency:** Multiple Ship API fetch nodes must execute concurrently, not sequentially — total fetch time should be bounded by the slowest single call, not the sum.

### Cost Efficiency

- **Per-run cost ceiling:** Each proactive scan run must cost ≤ $0.10 in Claude API tokens under normal conditions. Target: ~$0.036/run with Sonnet.
- **Daily cost budget:** At 3-minute polling intervals (~480 runs/day), daily cost must remain under $50. Operator must be alerted if a single run exceeds $0.10.
- **Token input bounding:** Reasoning node input must be filtered and structured — never exceed 8,000 tokens of project data per run to control costs.

### Reliability

- **Graceful degradation:** Ship API failures (timeouts, 5xx errors, rate limits) must be handled by the error/fallback node without crashing the agent or producing false findings.
- **Cron resilience:** If a polling cycle fails, the next cycle must execute normally — no cascading failures or state corruption between runs.
- **Session recovery:** Agent must automatically re-authenticate when Ship sessions expire (15-minute timeout) without operator intervention.

### Observability

- **Trace coverage:** 100% of graph executions must produce a complete LangSmith trace — no silent runs.
- **Trace completeness:** Each trace must include: input data received, reasoning performed, findings produced, execution path taken, token usage, and wall-clock duration.
- **Operator visibility:** Health endpoint must return HTTP 200 with uptime and last-run timestamp. Non-200 response must indicate specific failure mode.

### Integration

- **Ship API compatibility:** Agent must work with Ship's existing REST API without requiring Ship-side modifications.
- **Authentication compatibility:** Agent must support Ship's session-based auth (cookie-based, 15-minute idle timeout, 12-hour absolute timeout).
- **Data format stability:** Agent must handle Ship API response format changes gracefully — log warnings on unexpected fields rather than crashing.

### Security

- **API key protection:** Claude API key, LangSmith API key, and Ship credentials must be stored as environment variables — never committed to source code or logs.
- **Data minimization in traces:** LangSmith traces must contain execution metadata and finding summaries — not full raw project data dumps.
- **No persistent data storage in MVP:** Findings are ephemeral per run. No database means no data breach surface for stored findings.
