# Proactive Graph — Node Reference

The proactive health-check graph runs on a 3-minute cron cycle. It fetches project data from the Ship API, enriches missing associations, checks if anything changed since the last run, and (if so) invokes a single LLM call to detect quality issues across all domains.

## Graph Topology

```
START
  │
  ▼
resolve_context
  │
  ├──► fetch_issues ──────┐
  ├──► fetch_sprint ──────┤
  ├──► fetch_team ────────┤  (parallel)
  └──► fetch_standups ────┘
                          │
                          ▼
                  enrich_associations
                          │
                          ▼
                  change_detection
                     │         │
            unchanged│         │changed
                     ▼         ▼
             data_unchanged  analyze_health
                     │         │
                     ▼      ┌──┴──────────┐
                    END     │             │
                         findings?     errors only?
                            │             │
                            ▼             ▼
                     propose_actions  graceful_degrade
                            │             │
                            ▼             ▼
                    confirmation_gate    END
                            │
                            ▼
                           END
```

## Node Descriptions

### resolve_context

**Source:** `nodes/context.ts`
**API calls:** 0 (proactive mode)
**State written:** `triggerType`, `workspaceId`, `documentId`, `documentType`

Sets up the run context. In proactive mode this is a passthrough — it echoes the trigger type and workspace. In on-demand mode (used by the chat graph, not this graph) it fetches document metadata and associations.

---

### fetch_issues

**Source:** `nodes/fetch.ts`
**API calls:** 1 — `GET /api/issues`
**State written:** `issues`, `errors`

Fetches all issues from the Ship API. Filters out done/cancelled issues, deduplicates by ID, caps at 50 (configurable via `FLEETGRAPH_ISSUE_CAP`), and extracts essential fields: `id`, `title`, `status`, `assignee_id`, `priority`, `updated_at`, `created_at`, `belongs_to`.

The `belongs_to` array carries each issue's program/project/sprint associations, which the enrichment node uses downstream.

---

### fetch_sprint

**Source:** `nodes/fetch.ts`
**API calls:** 2 — `GET /api/weeks` + `GET /api/weeks/:id/issues`
**State written:** `sprintData`, `allSprints`, `errors`

Two sequential calls:

1. **`GET /api/weeks`** — returns all current sprints across all programs with metadata (name, issue_count, program_prefix). Stored as `allSprints` for empty-sprint detection.
2. **`GET /api/weeks/:id/issues`** — fetches the full issue list for the first/active sprint only. Attached as `sprintData.sprintIssues` for sprint membership checks and stale-in-progress detection.

Only the active sprint's issues are fetched — the rest use `issue_count` from the metadata.

---

### fetch_team

**Source:** `nodes/fetch.ts`
**API calls:** 1 — `GET /api/team/grid`
**State written:** `teamGrid`, `errors`

Fetches the team grid data. Used by the analyzer to understand team structure.

---

### fetch_standups

**Source:** `nodes/fetch.ts`
**API calls:** 1 — `GET /api/standups/status`
**State written:** `standupStatus`, `errors`

Fetches standup submission status — who has/hasn't submitted, participation rates. Used by the analyzer for standup compliance detection.

---

### enrich_associations

**Source:** `nodes/enrich.ts`
**API calls:** 0–15 (only for orphaned projects not resolvable from batch data)
**State written:** `issues` (enriched in-place)

Fixes missing `program` associations on issues. About 70% of issues (bulk-generated) have a `project` association but no `program`. This node:

1. Builds a project-to-program map from issues that already have both in their `belongs_to` array.
2. For projects not in the map, fetches their associations from the Ship API (`GET /api/documents/:id/associations`).
3. Enriches orphaned issues in-memory by adding the inferred program to their `belongs_to`.

Never writes to the Ship API. At most 15 API calls (one per unique project), but typically 0 since hand-crafted issues provide the mappings.

---

### change_detection

**Source:** `nodes/change-detection.ts`
**API calls:** 0
**State written:** `dataChanged`

SHA-256 hashes the combined fetched state (issues, sprintData, allSprints, teamGrid, standupStatus) and compares to the previous run's hash. If unchanged, sets `dataChanged: false` to skip the LLM call.

The hash is cached at module level (persists across cron cycles, resets on deploy). On a findings run, the hash stays cached so subsequent crons skip. On a clean run, `index.ts` calls `resetDataHash()` so the next cron re-analyzes. The `apply-action` endpoint calls `invalidateDataHash()` after modifying data.

**Routing (conditional edge):**
- `dataChanged: false` → `log_clean_run` (skip LLM, keep existing findings)
- `dataChanged: true` → `analyze_health`

---

### analyze_health

**Source:** `nodes/reasoning.ts`
**API calls:** 0
**LLM calls:** 1 — Claude Sonnet via `ChatAnthropic`
**State written:** `findings`, `severity`

The single LLM call that covers all 10 detection categories:

| # | Category | Severity | Domain |
|---|----------|----------|--------|
| 1 | `unassigned` | warning | Issues |
| 2 | `security` | critical | Issues |
| 3 | `duplicate` | warning | Issues |
| 4 | `unscheduled_high_priority` | warning | Issues |
| 5 | `empty_sprint` | critical | Sprints |
| 6 | `missing_sprint` | info | Sprints |
| 7 | `stale` | warning | Sprints |
| 8 | `overloaded` | info | Team |
| 9 | `blocked` | critical | Team |
| 10 | `other` (standup compliance) | info/warning | Standups |

Before invoking the LLM, deterministic pre-computation builds:
- Sprint membership set (which issue IDs are in sprints)
- Assignee workload summary (issue counts per person)
- Blocked/in-progress issue lists
- Empty sprint list

These summaries are injected into the prompt so the LLM focuses on judgment, not aggregation. Max 8 findings per run.

**Routing (conditional edge):**
- All fetches failed (errors + no data) → `graceful_degrade`
- `severity: "clean"` → `log_clean_run`
- Findings exist → `propose_actions`

---

### propose_actions

**Source:** `nodes/actions.ts`
**API calls:** 0
**State written:** `proposedActions`

Converts each finding into a `ProposedAction` with the finding's recommendation as the action description. All actions are marked `requiresConfirmation: true` — FleetGraph never acts without human approval.

---

### confirmation_gate

**Source:** `nodes/actions.ts`
**API calls:** 0
**State written:** `humanDecision`

Calls LangGraph's `interrupt()` to pause graph execution. The interrupt payload includes all findings and proposed actions. The graph stays suspended in the checkpointer until a human responds via the `/api/fleetgraph/resume` endpoint with `Command({ resume: { decision } })`.

On resume, records the decision as `"confirm"` or `"dismiss"` in state.

In practice, the cron handler in `index.ts` extracts the interrupt payload, converts findings to `StoredFinding[]` for the frontend, and the frontend handles confirm/dismiss/snooze per-finding without resuming the graph for each one.

---

### log_clean_run

**Source:** `nodes/actions.ts`
**API calls:** 0
**State written:** none

Terminal node for healthy runs. Logs "No findings — project is healthy." Reached only when the LLM analyzed the data and found no issues (severity is clean). In LangSmith, seeing this node means a full analysis ran and the project passed.

---

### data_unchanged

**Source:** `nodes/actions.ts`
**API calls:** 0
**State written:** none

Terminal node for unchanged-data runs. Logs "Data unchanged — no new analysis needed." Reached when the change detection gate determined the fetched data is identical to the previous run's data, so no LLM call is needed. Existing findings from the previous analysis are preserved in the findings store.

In LangSmith, this is the most common terminal node — it appears on every cron cycle where the Ship data hasn't changed.

---

### graceful_degrade

**Source:** `nodes/actions.ts`
**API calls:** 0
**State written:** `findings` (empty), `severity` ("clean"), `proposedActions` (empty)

Terminal node for total failure. Reached when all 4 fetch nodes errored and no data is available. Logs the errors and sets state to clean so the cron handler doesn't store garbage findings.

## API Call Budget

| Scenario | API Calls | LLM Calls |
|----------|-----------|-----------|
| Data unchanged (typical) | 5 (4 fetch + ~1 enrich) | 0 |
| Data changed, clean | 5 | 1 |
| Data changed, findings | 5 | 1 |
| All fetches fail | 4 (all fail) | 0 |

Cost per analysis run: ~$0.012 (one Sonnet call). Cron runs every 3 minutes but skips the LLM when data is unchanged.
