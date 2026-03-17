---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - gauntlet_docs/FleetGraph_PRD.md
  - gauntlet_docs/PRESEARCH.md
  - gauntlet_docs/mvp-project-plan.md
  - gauntlet_docs/technical-research-langgraph-claude-sdk.md
---

# FleetGraph - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for FleetGraph, decomposing the requirements from the PRD, UX Design, and Architecture into implementable stories. Epics are ordered with MVP-critical work first to meet the 24-hour MVP deadline, followed by Early Submission and Final Submission phases.

## Requirements Inventory

### Functional Requirements

FR1: The agent can autonomously scan Ship project data on a configurable polling interval without user initiation
FR2: The agent can detect unassigned issues across all active projects
FR3: The agent can detect issues with no sprint assignment
FR4: The agent can detect duplicate issues within a project
FR5: The agent can detect empty active sprints (sprints with no issues assigned)
FR6: The agent can detect issues missing ticket number conventions
FR7: The agent can detect unowned security-tagged issues
FR8: The agent can detect high-priority work that is not scheduled in any sprint
FR9: The agent can classify each finding by severity level (critical, warning, info)
FR10: The agent can provide specific evidence for each finding (issue IDs, sprint names, timestamps)
FR11: The agent can generate actionable recommendations for each finding
FR12: The agent can produce a structured findings report per scan run
FR13: The agent can distinguish between a clean run (no findings) and a problem-detected run with visibly different execution paths
FR14: The agent can pause execution before taking any consequential action and surface a confirmation request
FR15: A user can confirm or dismiss a proposed action from the agent
FR16: The agent can proceed with a confirmed action or log a dismissed action
FR17: A user can invoke the agent from within a specific issue context in Ship
FR18: A user can invoke the agent from within a specific sprint context in Ship
FR19: The agent can reason about the current state of a sprint (velocity, completion rate, unstarted work, days remaining)
FR20: The agent can identify blocking dependencies between issues within a sprint
FR21: The agent can respond to natural language questions scoped to the user's current context
FR22: The agent can fetch issue data from Ship's REST API
FR23: The agent can fetch sprint data from Ship's REST API
FR24: The agent can fetch team member data from Ship's REST API
FR25: The agent can fetch standup data from Ship's REST API
FR26: The agent can execute multiple API fetch operations in parallel
FR27: The agent can handle Ship API failures gracefully without crashing
FR28: The agent can produce a LangSmith trace for every graph execution
FR29: An operator can view shared trace links demonstrating different execution paths
FR30: An operator can inspect what data the agent received, what reasoning was performed, and what findings were produced for any run
FR31: An operator can track token usage and cost per graph run
FR32: The agent can run as a standalone service on Railway
FR33: An operator can verify agent health via a `/health` endpoint
FR34: An operator can configure polling interval, API keys, and Ship API base URL via environment variables
FR35: The agent can re-authenticate with Ship's API when sessions expire
FR36: The system can generate a graph diagram showing all nodes, edges, and conditional branches
FR37: The system can document the trigger model decision with tradeoff analysis
FR38: The system can document test cases with corresponding LangSmith trace links
FR39: The system can report development costs (token usage, invocation count, total spend)
FR40: The system can project production costs at 100, 1,000, and 10,000 user scale

### NonFunctional Requirements

NFR1: Problem detection latency < 5 minutes from event appearing in Ship to agent surfacing it
NFR2: Single proactive scan run must complete within 60 seconds including all API fetches and Claude reasoning
NFR3: On-demand response time < 15 seconds
NFR4: Parallel fetch efficiency — total fetch time bounded by slowest single call, not sum
NFR5: Per-run cost ceiling ≤ $0.10 in Claude API tokens; target ~$0.036/run with Sonnet
NFR6: Daily cost budget < $50 at 3-minute polling intervals (~480 runs/day)
NFR7: Token input bounding — reasoning node input never exceeds 8,000 tokens of project data
NFR8: Graceful degradation — Ship API failures handled by error/fallback node without crashing or producing false findings
NFR9: Cron resilience — failed polling cycle does not cascade to next cycle; no state corruption between runs
NFR10: Session recovery — automatic re-authentication when Ship sessions expire
NFR11: 100% trace coverage — every graph execution produces a complete LangSmith trace
NFR12: Trace completeness — each trace includes input data, reasoning, findings, execution path, token usage, duration
NFR13: Health endpoint returns HTTP 200 with uptime and last-run timestamp; non-200 indicates specific failure mode
NFR14: Ship API compatibility without requiring Ship-side modifications
NFR15: Authentication via Bearer API token (long-lived, CSRF-exempt)
NFR16: Handle Ship API response format changes gracefully — log warnings, don't crash
NFR17: API keys stored as environment variables — never in source code or logs
NFR18: Data minimization in LangSmith traces — execution metadata and finding summaries only, not raw project data
NFR19: No persistent data storage in MVP — findings are ephemeral per run

### Additional Requirements

**From Architecture:**
- AR1: FleetGraph is a new standalone `fleetgraph/` package (not pnpm workspace member), independent build/deploy
- AR2: Separate Railway service from Ship API for failure isolation and independent deploy
- AR3: Combined worker + API in one Node.js process (Express endpoints + node-cron polling)
- AR4: Two compiled StateGraphs (proactive + on-demand) sharing node functions but different topologies
- AR5: `FleetGraphState` annotation with typed fields; `errors` array uses accumulating reducer
- AR6: MemorySaver checkpointer for MVP; documented upgrade path to PostgreSQL
- AR7: Bearer token auth via Ship's API token system (`FLEETGRAPH_API_TOKEN`)
- AR8: `fetchWithRetry` with exponential backoff (2 retries, 10s timeout), wrapped with `traceable()`
- AR9: Structured output via Zod schema + `withStructuredOutput()` — named tool use for schema conformance
- AR10: Claude Sonnet 4.6 via `@langchain/anthropic` ChatAnthropic
- AR11: Issue filtering: exclude done/cancelled, cap at 100 (proactive) / 50 (on-demand), essential fields only
- AR12: Express 4 + `node-cron` for scheduling
- AR13: No shared TypeScript types between Ship and FleetGraph (consumes REST JSON, not Ship interfaces)

**From UX Design (Post-MVP phases):**
- UX1: Findings panel as new icon rail mode in Ship's 4-panel layout
- UX2: FindingCard components with severity badge, description, confirm/dismiss/snooze buttons
- UX3: Badge count on icon rail for new findings (React Query cache)
- UX4: Chat drawer as floating overlay (bottom-right) for on-demand mode
- UX5: Ship backend proxies requests to FleetGraph (session auth at Ship layer)
- UX6: React Query with 3-minute refetchInterval matching cron cycle

**From Assignment Requirements:**
- ASSIGN1: FLEETGRAPH.md must contain all sections: Agent Responsibility, Graph Diagram, Use Cases (5+), Trigger Model, Test Cases, Architecture Decisions, Cost Analysis
- ASSIGN2: Chat interface must be embedded in context and scoped to current document
- ASSIGN3: LangSmith tracing required from day one
- ASSIGN4: Ship REST API is sole data source — no direct database access
- ASSIGN5: Detection latency verified with timed test run

**From MVP Project Plan:**
- MVP1: Deploy early — get Railway health endpoint working first
- MVP2: Stale Issue Detection as first proactive use case
- MVP3: PRESEARCH content covers ~80% of documentation requirements (Agent Responsibility, Trigger Model, Use Cases)

### FR Coverage Map

| FR | Epic | Description |
|----|------|-------------|
| FR1 | Epic 1 | Autonomous scan on configurable polling interval |
| FR2 | Epic 1 | Detect unassigned issues |
| FR3 | Epic 1 | Detect issues with no sprint assignment |
| FR4 | Epic 1 | Detect duplicate issues |
| FR5 | Epic 1 | Detect empty active sprints |
| FR6 | Epic 1 | Detect missing ticket number conventions |
| FR7 | Epic 1 | Detect unowned security-tagged issues |
| FR8 | Epic 1 | Detect unscheduled high-priority work |
| FR9 | Epic 1 | Classify findings by severity |
| FR10 | Epic 1 | Provide evidence for each finding |
| FR11 | Epic 1 | Generate actionable recommendations |
| FR12 | Epic 1 | Structured findings report per scan |
| FR13 | Epic 1 | Distinct execution paths (clean vs. findings) |
| FR14 | Epic 2 | Pause before consequential actions |
| FR15 | Epic 2 | User confirm or dismiss |
| FR16 | Epic 2 | Proceed on confirm, log on dismiss |
| FR17 | Epic 5 | Invoke from issue context |
| FR18 | Epic 5 | Invoke from sprint context |
| FR19 | Epic 5 | Reason about sprint state |
| FR20 | Epic 5 | Identify blocking dependencies |
| FR21 | Epic 5 | Natural language questions scoped to context |
| FR22 | Epic 1 | Fetch issue data |
| FR23 | Epic 1 | Fetch sprint data |
| FR24 | Epic 1 | Fetch team data |
| FR25 | Epic 1 | Fetch standup data |
| FR26 | Epic 1 | Parallel fetch operations |
| FR27 | Epic 1 | Handle API failures gracefully |
| FR28 | Epic 3 | LangSmith trace for every execution |
| FR29 | Epic 3 | Shared trace links for different paths |
| FR30 | Epic 3 | Inspect data, reasoning, findings per run |
| FR31 | Epic 3 | Track token usage and cost per run |
| FR32 | Epic 3 | Run as standalone Railway service |
| FR33 | Epic 3 | Health endpoint |
| FR34 | Epic 3 | Configure via environment variables |
| FR35 | Epic 3 | Re-authenticate on session expiry |
| FR36 | Epic 4 | Graph diagram |
| FR37 | Epic 4 | Trigger model documentation |
| FR38 | Epic 4 | Test cases with trace links |
| FR39 | Epic 4 | Development cost reporting |
| FR40 | Epic 4 | Production cost projections |

## Epic List

### Epic 1: Proactive Health Monitoring & Findings (MVP)
The agent autonomously monitors Ship project data and surfaces quality gaps with severity-ranked, evidence-backed findings and actionable recommendations. After this epic, a software engineer's project is continuously scanned for problems — unassigned issues, empty sprints, duplicates, missing ticket numbers, unowned security work, unscheduled high-priority items — and the agent produces structured findings with evidence and recommendations per scan run.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR13, FR22, FR23, FR24, FR25, FR26, FR27

### Epic 2: Human-in-the-Loop Confirmation Gate (MVP)
Users review agent-proposed actions and confirm or dismiss them before the agent takes any consequential action. After this epic, every finding that proposes an action pauses at a confirmation gate. The user sees what the agent wants to do, reviews the evidence, and decides to confirm or dismiss. The agent never writes to Ship without human approval.
**FRs covered:** FR14, FR15, FR16

### Epic 3: Deployment, Operations & Observability (MVP)
The agent runs as a reliable standalone service on Railway with full LangSmith tracing, health monitoring, and operator-configurable settings. After this epic, an operator can deploy FleetGraph to Railway, verify health, configure polling intervals and API credentials, and inspect any graph run end-to-end in LangSmith.
**FRs covered:** FR28, FR29, FR30, FR31, FR32, FR33, FR34, FR35

### Epic 4: MVP Documentation & Deliverables (MVP)
FLEETGRAPH.md contains all required sections — Agent Responsibility, Graph Diagram, Use Cases (5+), Trigger Model, Test Cases with trace links, Architecture Decisions, and Cost Analysis — making the agent's design decisions defensible and verifiable.
**FRs covered:** FR36, FR37, FR38, FR39, FR40

### Epic 5: On-Demand Context-Aware Analysis (Early Submission)
Users invoke the agent from within a specific issue or sprint in Ship and receive contextual reasoning — sprint health, blocking dependencies, risk analysis — scoped to exactly what they're looking at.
**FRs covered:** FR17, FR18, FR19, FR20, FR21

### Epic 6: Ship UI Integration (Vision / Post-Program)
FleetGraph findings and chat are embedded natively in Ship's 4-panel layout — a findings panel in the icon rail with badge counts, and a floating chat drawer for on-demand queries — making the agent feel like a built-in Ship feature.
**UX Requirements covered:** UX1, UX2, UX3, UX4, UX5, UX6

---

## Epic 1: Proactive Health Monitoring & Findings (MVP)

The agent autonomously monitors Ship project data and surfaces quality gaps with severity-ranked, evidence-backed findings and actionable recommendations.

### Story 1.1: Scaffold FleetGraph Service with Proactive Graph Skeleton

As an **operator**,
I want a standalone FleetGraph Node.js service with a health endpoint and cron-based polling scheduler,
So that the agent infrastructure is deployed and running on Railway before any detection logic is added.

**Acceptance Criteria:**

**Given** the `fleetgraph/` package is initialized with TypeScript, Express 4, and node-cron
**When** the service starts
**Then** `GET /health` returns HTTP 200 with `{ status: "ok", service: "fleetgraph", uptime: <seconds> }`
**And** a cron job fires every 3 minutes, logging `[cron] Proactive health check triggered`
**And** the polling interval is configurable via environment variable
**And** the service compiles via `npm run build` and runs via `npm start`

**FRs:** FR1, FR32, FR33, FR34
**Architecture:** AR1, AR2, AR3, AR12

### Story 1.2: Ship API Client with Parallel Data Fetching

As an **agent**,
I want to fetch issues, sprint data, team allocation, and standup status from Ship's REST API in parallel with retry and timeout handling,
So that the reasoning node has fresh project data to analyze on every polling cycle.

**Acceptance Criteria:**

**Given** the Ship API is accessible and `FLEETGRAPH_API_TOKEN` is configured
**When** the proactive graph executes
**Then** four fetch nodes (`fetch_issues`, `fetch_sprint`, `fetch_team`, `fetch_standups`) execute in parallel after `resolve_context`
**And** each fetch uses Bearer token authentication
**And** `fetchWithRetry` retries 2 times with exponential backoff (1s, 2s) on failure
**And** each request has a 10-second timeout via `AbortSignal.timeout`
**And** total fetch time is bounded by the slowest single call, not the sum of all calls
**And** issues are filtered to exclude `done`/`cancelled` statuses and capped at 100 items
**And** only essential fields are extracted: `id`, `title`, `status`, `assignee_id`, `priority`, `updated_at`, `created_at`

**FRs:** FR22, FR23, FR24, FR25, FR26
**Architecture:** AR7, AR8, AR11

### Story 1.3: Proactive Health Analysis with Claude Reasoning

As a **software engineer**,
I want the agent to analyze fetched project data using Claude and produce structured findings with severity, evidence, and recommendations,
So that I receive specific, actionable feedback about quality gaps in my project.

**Acceptance Criteria:**

**Given** the fetch nodes have returned project data (issues, sprint, team, standups)
**When** the `analyze_health` reasoning node executes
**Then** Claude Sonnet 4.6 receives a structured prompt with filtered project data
**And** the response is validated via Zod schema + `withStructuredOutput()` (named tool use)
**And** each finding includes: `id`, `severity` (critical/warning/info), `title`, `description`, `evidence` (specific issue IDs, sprint names, timestamps), and `recommendation`
**And** the aggregate `severity` field is set to the highest severity finding (or `clean` if no findings)
**And** reasoning node input never exceeds 8,000 tokens of project data
**And** the full run completes within 60 seconds

**FRs:** FR9, FR10, FR11, FR12
**NFRs:** NFR2, NFR5, NFR7
**Architecture:** AR9, AR10

### Story 1.4: Conditional Execution Paths — Clean Run vs. Findings Detected

As an **operator**,
I want the graph to route to visibly different execution paths depending on whether findings were detected,
So that LangSmith traces show distinct graph shapes for clean runs vs. problem-detected runs.

**Acceptance Criteria:**

**Given** the `analyze_health` node has completed
**When** severity is `clean` (no findings)
**Then** the graph routes to `log_clean_run` → END
**And** `log_clean_run` logs `[log_clean_run] No findings — project is healthy`

**Given** the `analyze_health` node has completed
**When** findings are detected (severity is info, warning, or critical)
**Then** the graph routes to `propose_actions` → `confirmation_gate` → END
**And** `propose_actions` maps each finding to a `ProposedAction` with `requiresConfirmation: true`

**Given** two graph runs with different outcomes
**When** viewed in LangSmith
**Then** the clean run and findings-detected run show visibly different node execution paths

**FRs:** FR13
**Architecture:** AR4

### Story 1.5: Detect Unassigned Issues and Missing Sprint Assignments

As a **software engineer**,
I want the agent to detect issues with no assignee and issues not assigned to any sprint,
So that I can fix ownership and scheduling gaps before evaluators notice them.

**Acceptance Criteria:**

**Given** the project has issues where `assignee_id` is null or empty
**When** the proactive graph runs
**Then** the agent produces a finding for each unassigned issue with severity `warning`, the issue title and ID as evidence, and a recommendation to assign an owner

**Given** the project has issues in active states (not done/cancelled) with no sprint association
**When** the proactive graph runs
**Then** the agent produces a finding for each unscheduled issue with severity `info` (or `warning` if high priority), the issue title and ID as evidence, and a recommendation to assign to a sprint

**FRs:** FR2, FR3

### Story 1.6: Detect Duplicate Issues and Empty Active Sprints

As a **software engineer**,
I want the agent to detect duplicate issues and sprints with no assigned work,
So that I avoid redundant effort and don't have empty sprints sitting in my project.

**Acceptance Criteria:**

**Given** the project has issues with identical or near-identical titles
**When** the proactive graph runs
**Then** the agent produces a finding for each duplicate set with severity `warning`, listing the duplicate issue IDs and titles as evidence, and a recommendation to consolidate or close duplicates

**Given** the project has an active sprint with zero issues assigned
**When** the proactive graph runs
**Then** the agent produces a finding with severity `critical`, the sprint name as evidence, and a recommendation to either populate the sprint or close it

**FRs:** FR4, FR5

### Story 1.7: Detect Missing Ticket Numbers, Unowned Security Issues, and Unscheduled High-Priority Work

As a **software engineer**,
I want the agent to detect issues missing ticket number conventions, security-tagged issues with no owner, and high-priority work not in any sprint,
So that I maintain project hygiene standards and don't leave critical work untracked.

**Acceptance Criteria:**

**Given** the project has issues whose titles don't follow the expected ticket number pattern
**When** the proactive graph runs
**Then** the agent produces a finding with severity `info`, listing the issue titles as evidence, and a recommendation to add ticket numbers

**Given** the project has issues tagged with security-related labels and no `assignee_id`
**When** the proactive graph runs
**Then** the agent produces a finding with severity `critical`, listing the security issues as evidence, and a recommendation to assign an owner immediately

**Given** the project has high-priority issues (`priority` = urgent or high) not assigned to any sprint
**When** the proactive graph runs
**Then** the agent produces a finding with severity `warning`, listing the issues as evidence, and a recommendation to schedule them in the current or next sprint

**FRs:** FR6, FR7, FR8

### Story 1.8: Graceful Degradation on Ship API Failures

As an **operator**,
I want the agent to handle Ship API failures without crashing or producing false findings,
So that a single API timeout doesn't bring down the monitoring system or surface incorrect results.

**Acceptance Criteria:**

**Given** one or more Ship API fetch nodes fail (timeout, 5xx, rate limit)
**When** other fetch nodes succeed
**Then** the reasoning node runs with available data and the `errors` array accumulates the failure details
**And** the agent does not produce findings about data it couldn't fetch

**Given** all Ship API fetch nodes fail
**When** the graph reaches the conditional edge after reasoning
**Then** the graph routes to `graceful_degrade` → END
**And** `graceful_degrade` logs the failure, returns `severity: "clean"`, and produces no findings
**And** the next cron cycle executes normally with no state corruption from the failed run

**FRs:** FR27
**NFRs:** NFR8, NFR9

---

## Epic 2: Human-in-the-Loop Confirmation Gate (MVP)

Users review agent-proposed actions and confirm or dismiss them before the agent takes any consequential action.

### Story 2.1: Confirmation Gate with Interrupt and Resume

As a **software engineer**,
I want the agent to pause execution after proposing actions and wait for my confirmation or dismissal before proceeding,
So that the agent never takes consequential action without my explicit approval.

**Acceptance Criteria:**

**Given** the proactive graph has produced findings and `propose_actions` has mapped them to proposed actions
**When** the graph reaches the `confirmation_gate` node
**Then** execution pauses via LangGraph `interrupt()` with a payload containing all proposed actions and a summary message
**And** the graph state is checkpointed via `MemorySaver`
**And** the interrupt payload is returned to the caller (cron handler or HTTP response)

**Given** a paused graph with pending proposed actions
**When** a user sends `POST /api/fleetgraph/resume` with `{ threadId, decision: "confirm" }`
**Then** the graph resumes from the `confirmation_gate` node
**And** the confirmed actions are logged with the decision
**And** the graph completes to END

**Given** a paused graph with pending proposed actions
**When** a user sends `POST /api/fleetgraph/resume` with `{ threadId, decision: "dismiss" }`
**Then** the graph resumes from the `confirmation_gate` node
**And** the dismissed actions are logged with the decision
**And** the graph completes to END

**Given** no findings were produced (clean run)
**When** the graph routes to `log_clean_run`
**Then** the `confirmation_gate` is never reached — no confirmation is requested for clean runs

**FRs:** FR14, FR15, FR16
**Architecture:** AR6

---

## Epic 3: Deployment, Operations & Observability (MVP)

The agent runs as a reliable standalone service on Railway with full LangSmith tracing, health monitoring, and operator-configurable settings.

### Story 3.1: LangSmith Tracing with Full Graph Observability

As an **operator**,
I want every graph execution to produce a complete LangSmith trace showing data received, reasoning performed, findings produced, and execution path taken,
So that I can inspect and verify the agent's behavior on any run.

**Acceptance Criteria:**

**Given** `LANGSMITH_TRACING=true` and `LANGSMITH_API_KEY` are configured
**When** any graph execution completes (proactive or on-demand)
**Then** a complete LangSmith trace is produced showing every node execution, conditional edge decision, and LLM call
**And** the trace includes token usage (input/output) and wall-clock duration for the reasoning node
**And** Ship API calls appear in the trace via `traceable()` wrapper on `fetchWithRetry`
**And** traces contain execution metadata and finding summaries — not raw project data dumps

**Given** a proactive run that produces findings
**And** a proactive run with a clean result
**When** both traces are viewed in LangSmith
**Then** the two runs show visibly different execution paths (findings path vs. clean path)
**And** both traces can be shared via public LangSmith links

**FRs:** FR28, FR29, FR30, FR31
**NFRs:** NFR11, NFR12, NFR18

### Story 3.2: Railway Deployment with Health Monitoring and Configuration

As an **operator**,
I want FleetGraph deployed on Railway as a standalone service with a health endpoint and all settings configurable via environment variables,
So that the agent is publicly accessible, monitored, and maintainable without code changes.

**Acceptance Criteria:**

**Given** the FleetGraph service is deployed to Railway
**When** Railway performs a health check
**Then** `GET /health` returns HTTP 200 with `{ status: "ok", service: "fleetgraph", tracing: true, uptime: <seconds> }`

**Given** the service is running on Railway
**When** an operator changes `ANTHROPIC_API_KEY`, `LANGSMITH_API_KEY`, `FLEETGRAPH_API_TOKEN`, `SHIP_API_URL`, or `PORT` via Railway environment variables
**Then** the service uses the updated values after restart
**And** no API keys, tokens, or credentials appear in source code or logs

**Given** the Ship API token expires or is revoked
**When** fetch nodes receive 401 responses
**Then** errors are logged with the endpoint and status code
**And** the agent does not crash — it follows the graceful degradation path

**FRs:** FR32, FR33, FR34, FR35
**NFRs:** NFR10, NFR13, NFR17, NFR19

---

## Epic 4: MVP Documentation & Deliverables (MVP)

FLEETGRAPH.md contains all required sections making the agent's design decisions defensible and verifiable with trace evidence.

### Story 4.1: FLEETGRAPH.md — Agent Responsibility, Graph Diagram, and Trigger Model

As a **submitter**,
I want FLEETGRAPH.md to document what the agent monitors, what it can do autonomously, what requires human approval, and how the graph is structured,
So that evaluators can assess the agent's design quality and architectural reasoning.

**Acceptance Criteria:**

**Given** FLEETGRAPH.md is created at the repository root
**When** the Agent Responsibility section is complete
**Then** it defines: what the agent monitors proactively, what it reasons about on-demand, what it does autonomously (read-only + notify), what requires confirmation (all write actions), who it notifies and when, how it knows project membership, and how on-demand mode uses document context

**Given** the Graph Diagram section
**When** an evaluator reads it
**Then** it contains a Mermaid diagram (or LangGraph Studio screenshot) showing all nodes, edges, and conditional branches for both proactive and on-demand graphs
**And** the three conditional paths after `analyze_health` are clearly labeled (clean → log_clean_run, findings → propose_actions, errors → graceful_degrade)

**Given** the Trigger Model section
**When** an evaluator reads it
**Then** it documents the polling decision (3-minute cron), the tradeoffs considered (polling vs. webhook vs. hybrid), the cost implications, and why this meets the < 5 minute detection latency requirement

**FRs:** FR36, FR37

### Story 4.2: FLEETGRAPH.md — Use Cases and Test Cases with Trace Links

As a **submitter**,
I want FLEETGRAPH.md to define 5+ use cases and provide test cases with LangSmith trace links proving the agent works,
So that evaluators can verify the agent does what it claims under the conditions I defined.

**Acceptance Criteria:**

**Given** the Use Cases section
**When** an evaluator reads it
**Then** it contains at least 5 use cases in table format with columns: Role, Trigger, Agent Detects/Produces, Human Decides
**And** use cases cover both proactive and on-demand modes
**And** use cases span at least two user roles (engineer, operator)

**Given** the Test Cases section
**When** an evaluator reads it
**Then** each use case has a corresponding test case with: the Ship state that triggers the agent, what the agent should detect, and a shared LangSmith trace link from a real run against that state
**And** at least 2 trace links demonstrate different execution paths (clean run vs. findings-detected run)
**And** all traces are from runs against real Ship data (no mocked responses)

**FRs:** FR38

### Story 4.3: FLEETGRAPH.md — Architecture Decisions and Cost Analysis

As a **submitter**,
I want FLEETGRAPH.md to document key architecture decisions and provide development cost reporting plus production cost projections,
So that evaluators can assess technical reasoning and cost sustainability.

**Acceptance Criteria:**

**Given** the Architecture Decisions section
**When** an evaluator reads it
**Then** it covers: framework choice (LangGraph.js), node design rationale, state management approach (MemorySaver + upgrade path), deployment model (separate Railway service), and Ship API integration pattern (Bearer token, fetchWithRetry)

**Given** the Cost Analysis — Development and Testing section
**When** an evaluator reads it
**Then** it reports actual Claude API spend: input tokens, output tokens, total invocations during development, and total development spend

**Given** the Cost Analysis — Production Projections section
**When** an evaluator reads it
**Then** it projects monthly costs at 100, 1,000, and 10,000 users
**And** states assumptions: proactive runs per project per day, on-demand invocations per user per day, average tokens per invocation, cost per run

**FRs:** FR39, FR40

---

<!-- ═══════════════════════════════════════════════════ -->
<!-- MVP COMPLETE — Epics 1-4 satisfy all 8 MVP requirements -->
<!-- ═══════════════════════════════════════════════════ -->

---

## Epic 5: On-Demand Context-Aware Analysis (Early Submission)

Users invoke the agent from within a specific issue or sprint and receive contextual reasoning scoped to exactly what they're looking at.

### Story 5.1: On-Demand Graph with Document-Scoped Context Resolution

As a **software engineer**,
I want to invoke FleetGraph from a specific issue or sprint and have the agent know exactly what I'm looking at,
So that the analysis is grounded in my current context, not a generic project scan.

**Acceptance Criteria:**

**Given** a user sends `POST /api/fleetgraph/chat` with `{ documentId, documentType, message, threadId, workspaceId }`
**When** the on-demand graph starts
**Then** `resolve_context` sets `triggerType: "on-demand"` and passes `documentId` and `documentType` to downstream nodes
**And** three fetch nodes execute in parallel: `fetch_issues`, `fetch_sprint`, `fetch_team` (no `fetch_standups` in on-demand mode)
**And** issues are filtered to context-relevant subset and capped at 50
**And** the response is returned within 15 seconds

**Given** `documentType` is `"issue"`
**When** the context is resolved
**Then** the fetch nodes retrieve the specific issue, its parent sprint, sibling issues in the same sprint, and the assignee's other active issues

**Given** `documentType` is `"sprint"`
**When** the context is resolved
**Then** the fetch nodes retrieve all issues in the sprint, team assignments, completion status, and days remaining

**FRs:** FR17, FR18
**Architecture:** AR4

### Story 5.2: Context-Aware Reasoning with Sprint Health and Dependency Analysis

As a **software engineer**,
I want to ask the agent natural language questions about my current sprint or issue and get structured analysis including velocity, blockers, and risks,
So that I can make informed prioritization decisions without manually cross-referencing project data.

**Acceptance Criteria:**

**Given** the on-demand graph has fetched context-scoped data
**When** the `analyze_context` reasoning node executes
**Then** Claude receives the user's message plus the document context and produces structured analysis
**And** the response uses the same Zod structured output schema as proactive mode (findings array + summary)

**Given** the user asks about sprint health (e.g., "Is this sprint on track?")
**When** the reasoning node analyzes the sprint
**Then** the response includes: completion rate (done vs. total), unstarted issues count, days remaining, and an overall health assessment

**Given** the user asks about dependencies or blockers
**When** the reasoning node analyzes issues in the sprint
**Then** the response identifies issues that are blocking other work (based on status, priority, and assignment patterns)
**And** recommends specific re-prioritization if blocking issues are unstarted

**Given** the analysis produces findings
**When** the conditional edge evaluates the result
**Then** findings route to `propose_actions` → `confirmation_gate` (same HITL flow as proactive)
**And** clean results route to `log_clean_run` → END

**Given** the analysis produces an informational response with no actionable findings
**When** the response is returned
**Then** the summary provides the contextual analysis without proposing actions

**FRs:** FR19, FR20, FR21

---

## Epic 6: Ship UI Integration (Vision / Post-Program)

FleetGraph findings and chat are embedded natively in Ship's 4-panel layout, making the agent feel like a built-in Ship feature.

### Story 6.1: Findings Panel in Ship's Icon Rail

As a **software engineer**,
I want to see FleetGraph findings in a dedicated panel in Ship's icon rail sidebar,
So that I can review agent-detected quality gaps without leaving the Ship interface.

**Acceptance Criteria:**

**Given** the Ship web application is loaded
**When** the user views the icon rail
**Then** a FleetGraph icon appears with a badge count showing the number of unreviewed findings

**Given** findings exist from the latest proactive scan
**When** the user clicks the FleetGraph icon
**Then** the contextual sidebar displays FindingCard components sorted by severity (critical first, then warning, then info)
**And** each FindingCard shows: severity badge, finding title, description, affected document link, and confirm/dismiss buttons
**And** the sidebar polls `GET /api/fleetgraph/findings` (proxied through Ship backend) with a 3-minute `refetchInterval` via React Query

**Given** a user clicks "Confirm" on a FindingCard
**When** the action is sent to FleetGraph
**Then** Ship sends `POST /api/fleetgraph/resume` with the `threadId` and `decision: "confirm"` via the Ship backend proxy
**And** the FindingCard is removed from the panel

**Given** a user clicks "Dismiss" on a FindingCard
**When** the action is sent to FleetGraph
**Then** Ship sends `POST /api/fleetgraph/resume` with `decision: "dismiss"`
**And** the FindingCard is removed from the panel

**UX Requirements:** UX1, UX2, UX3, UX5, UX6

### Story 6.2: Chat Drawer for On-Demand Analysis

As a **software engineer**,
I want a floating chat drawer in Ship's UI that lets me ask FleetGraph about the current issue or sprint I'm viewing,
So that I get context-aware AI analysis without switching tools or losing my place.

**Acceptance Criteria:**

**Given** the user is viewing an issue or sprint document in Ship's editor
**When** they click the "Ask FleetGraph" button
**Then** a floating chat drawer opens in the bottom-right corner, overlaying the main content area
**And** the drawer knows the current `documentId` and `documentType` from the editor context

**Given** the chat drawer is open
**When** the user types a question and submits
**Then** Ship sends `POST /api/fleetgraph/chat` (proxied through Ship backend) with `{ documentId, documentType, message, threadId, workspaceId }`
**And** the response is rendered as structured analysis (headings, bullet points, metrics) in the chat drawer
**And** the response appears within 15 seconds

**Given** the user navigates to a different document
**When** the chat drawer is still open
**Then** the context updates to the new document
**And** previous conversation is cleared (stateless per session)

**Given** the user is not viewing an issue or sprint
**When** looking at a wiki or other document type
**Then** the "Ask FleetGraph" button is not visible (agent only supports issue and sprint context)

**UX Requirements:** UX4, UX5
**Assignment:** ASSIGN2

### Story 6.3: Ship Backend Proxy for FleetGraph API

As a **developer**,
I want Ship's Express backend to proxy requests to FleetGraph with session authentication and token translation,
So that FleetGraph never handles Ship user sessions and the browser makes same-origin requests.

**Acceptance Criteria:**

**Given** a logged-in Ship user makes a request to `/api/fleetgraph/*`
**When** Ship's Express backend receives the request
**Then** it validates the user's session (existing session middleware)
**And** forwards the request to FleetGraph's service URL with the `FLEETGRAPH_API_TOKEN` as Bearer auth
**And** enriches the request with `workspaceId` from the user's session

**Given** a user with an expired or invalid session
**When** they attempt to call `/api/fleetgraph/*`
**Then** Ship returns 401 and the request is not forwarded to FleetGraph

**Given** FleetGraph's service is unreachable
**When** Ship attempts to proxy a request
**Then** Ship returns a 502 with a user-friendly error message
**And** the failure is logged on Ship's side

**UX Requirements:** UX5
