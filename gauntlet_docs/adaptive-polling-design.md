# Adaptive Polling: Change Detection Optimization

## Problem

FleetGraph's proactive graph runs every 3 minutes, invoking Claude Sonnet on every tick regardless of whether Ship data has changed. Most runs re-analyze identical data and produce identical findings, wasting ~$0.036/run in LLM costs.

The FLEETGRAPH.md cost analysis already claims 70-80% savings from "rule-based pre-filtering" but the mechanism was never specified or implemented.

## Proposal: Pre-Graph Change Detection Gate

Add a lightweight comparison step **before** the graph executes. If the fetched data is identical to the previous run, skip the graph entirely and leave the existing findings store untouched.

### Current Flow (every 3 minutes)

```
Cron tick
  → Invoke proactive graph
    → resolve_context
    → fetch_issues | fetch_sprint | fetch_team | fetch_standups (parallel)
    → analyze_health (LLM call)
    → propose_actions / log_clean_run / graceful_degrade
```

### Proposed Flow

```
Cron tick
  → Fetch data from Ship API (same 4 calls)
  → Hash fetched data, compare to previous run's hash
  → SAME?
      → Log "skipped — no data changes detected"
      → Update lastRunTimestamp (health check stays green)
      → Return (findings store untouched, no graph invocation)
  → DIFFERENT?
      → Update cached hash
      → Run full proactive graph as today
```

### Why This Is a Pre-Graph Gate, Not a Graph Node

The graph's three existing branches — clean, findings, errors — all assume the LLM has analyzed something:

- **clean**: LLM looked at the data and found no problems. Findings store is cleared.
- **findings**: LLM found issues. Findings store is updated with new results.
- **errors**: Something failed. Graceful degradation.

None of these match "the data hasn't changed since last run." Specifically:

- Routing to `log_clean_run` would be **wrong** if the previous run produced findings. Those findings are still valid (the data that caused them hasn't changed), but `log_clean_run` would clear them.
- Routing to `propose_actions` with stale findings would duplicate notifications.
- The correct behavior is **do nothing** — the previous analysis is still accurate.

This "do nothing" decision belongs before the graph, not inside it. The graph should only run when there's new data to reason about.

### What Gets Compared

The 4 fetch nodes produce normalized data structures:

1. **issues** — array of `{ id, title, status, assignee_id, priority, updated_at, created_at }` (post `extractIssueFields`, `filterActive`, `deduplicateById`, capped at 50)
2. **sprintData** — sprint object with `sprintIssues` array
3. **teamGrid** — team membership/workload object
4. **standupStatus** — standup completion data

The comparison works by JSON-stringifying all 4 datasets and producing a hash (e.g., SHA-256). If the hash matches the previous run's hash, the data is identical.

This works because the fetch nodes already normalize the data — same raw API response always produces the same extracted fields. The `updated_at` field on issues means even metadata-only changes (like a re-prioritization) will change the hash.

### What This Requires

**In `fleetgraph/src/index.ts` (cron handler):**
- Extract the 4 Ship API fetch calls into a standalone function (currently embedded in graph nodes)
- Module-level `previousDataHash: string | null` variable
- Hash comparison logic before graph invocation
- Skip logging when hash matches

**In fetch nodes:**
- Refactor so the raw API calls can be shared between the pre-gate and the graph nodes (avoid fetching twice when the graph does run)

**No changes needed to:**
- Ship API endpoints (no `updated_at` filtering required)
- Graph topology (proactive.ts unchanged)
- State schema (state.ts unchanged)
- LLM prompts or structured output
- Findings store or dismissal logic

### Limitations

- **Still fetches from Ship every 3 minutes.** The 4 API calls still happen on every tick — only the LLM call is skipped. This is acceptable because the API calls are cheap (no token cost, ~200ms total) while the LLM call is expensive (~$0.036, ~3-5s).
- **In-memory hash resets on deploy.** First run after a restart always invokes the graph. Same behavior as existing `lastRunTimestamp` — acceptable for MVP.
- **Doesn't reduce poll frequency.** A truly adaptive system would also poll less often for dormant projects. That's a separate, larger change (Tier 2 in the original analysis) that requires per-project scoping the graph doesn't currently support.

### Cost Impact

At 3-minute intervals = 480 runs/day:

| Scenario | LLM Runs/Day | Daily Cost | Monthly Cost |
|----------|-------------|------------|-------------|
| Current (no skip) | 480 | ~$17.28 | ~$520 |
| With change detection (80% skip) | ~96 | ~$3.46 | ~$104 |
| With change detection (90% skip) | ~48 | ~$1.73 | ~$52 |

The skip rate depends on how frequently Ship data actually changes. For a team of 5-10 people during working hours, 80-90% skip rate is realistic — most 3-minute windows have zero changes.

### Interaction with Snooze Logic

The snooze feature (1 hour, 4 hours, next day) is a **display-layer filter** — snoozed findings stay in the `storedFindings` array but are hidden from the `/api/fleetgraph/findings` response until the snooze expires. This interacts with change detection in three scenarios:

**Scenario 1: Data unchanged during snooze window (common case)**
The change detection gate skips the graph. `storedFindings` is untouched. When the snooze expires, the finding reappears exactly as before. **No issue — this is correct behavior.** The change detection gate actually improves the snooze experience by preventing the graph from regenerating findings with new IDs while the user has snoozed them.

**Scenario 2: Data changes and resolves the problem during snooze**
Example: User snoozes "unassigned issue X" for 4 hours. Someone assigns issue X 30 minutes later. The hash changes, the graph re-runs, and the new analysis no longer includes that finding. The old finding is replaced in `storedFindings`, and the orphaned snooze entry in the `snoozedFindings` map harmlessly points at a nonexistent ID. **No issue — correct behavior.**

**Scenario 3: Data changes but the problem persists during snooze (edge case)**
Example: User snoozes "unassigned issue X" for 4 hours. An unrelated issue changes, the hash changes, the graph re-runs. The LLM re-detects "unassigned issue X" but generates it as a **new finding with a new ID**. The snooze map still references the old ID, so the regenerated finding is *not* snoozed — it appears immediately, defeating the user's snooze.

This is a **pre-existing bug** in the current system (it happens today whenever the graph re-runs during a snooze window). The change detection gate actually **mitigates** it by reducing unnecessary re-runs. However, a complete fix requires two changes:

#### Fix 1: Stable Composite Keys with Detection Categories

The current `buildDismissKey` uses `docType|docId|severity|title` as a composite key. The problem: `title` is LLM-generated and may vary across runs for the same underlying problem (e.g., "Unassigned issue in Sprint 3" vs. "Issue lacks owner in current sprint"). This makes the key unstable — snooze/dismiss lookups fail when the title drifts.

**Solution:** Replace `title` in the composite key with a **detection category** — a constrained enum the LLM selects from rather than invents. The categories map to FleetGraph's existing detection targets:

```typescript
type DetectionCategory =
  | "unassigned"        // Issue has no assignee_id
  | "missing_sprint"    // Issue not associated with any sprint
  | "stale"             // Issue unchanged for extended period
  | "duplicate"         // Issues with matching/similar titles
  | "empty_sprint"      // Sprint has 0 associated issues
  | "security"          // Security-tagged issue with no assignee
  | "overloaded"        // Team member assigned too many issues
  | "blocked"           // Issue blocked with no resolution path
  | "other";            // Catch-all for novel detections
```

This enum gets added to the `FindingSchema` Zod definition in `reasoning.ts` so the LLM must select one via `withStructuredOutput()`. The same input data always maps to the same category — "unassigned issue X" is always `unassigned`, regardless of how the LLM phrases the title.

The new composite key becomes: `docType|docId|severity|category`

Example: `issue|550e8400-e29b-41d4-a716-446655440000|warning|unassigned`

This key is fully deterministic — every component is either data-derived (`docType`, `docId`) or constrained-enum (`severity`, `category`). It survives finding regeneration across runs.

#### Fix 2: Snooze by Composite Key

With stable composite keys, switch the snooze mechanism from finding ID to composite key:

- `snoozedFindings` map changes from `Map<findingId, expiry>` to `Map<compositeKey, expiry>`
- When a user snoozes a finding, compute its composite key and store that
- The findings filter checks each finding's composite key against the snooze map
- When the graph re-runs and produces a new finding for the same problem (new ID, same composite key), the snooze still applies

This also fixes dismiss deduplication — `dismissedKeys` already uses `buildDismissKey`, so it gets the stability improvement for free.

#### Implementation Scope

| Change | File | Effort |
|--------|------|--------|
| Add `category` to `FindingSchema` Zod definition | `nodes/reasoning.ts` | ~5 lines |
| Add `category` to `Finding` type | `state.ts` | ~2 lines |
| Update LLM prompt to explain categories | `nodes/reasoning.ts` | ~5 lines |
| Replace `title` with `category` in `buildDismissKey` | `index.ts` | ~3 lines |
| Switch `snoozedFindings` map to use composite key | `index.ts` | ~10 lines |
| Add `category` to `StoredFinding` interface | `index.ts` | ~1 line |

Total: ~25 lines changed across 3 files. Independent of the change detection gate — can be shipped first as a standalone bug fix.

### Relationship to FLEETGRAPH.md Claims

FLEETGRAPH.md Section "Trigger Model" labels the chosen approach as "Adaptive polling" and claims 60-70% fewer calls vs. uniform polling. This implementation delivers on that claim by making the system adaptive at the reasoning layer: the poll frequency is fixed, but the expensive work (LLM analysis) only happens when the input data has changed.

The FLEETGRAPH.md "Optimization Path" item 1 ("Rule-based pre-filtering: Check `updated_at` timestamps before invoking LLM") describes a variant of this approach. The hash-based comparison is simpler and more robust — it catches all changes, not just `updated_at` timestamp differences.
