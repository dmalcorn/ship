# FleetGraph Deployment Lessons Learned

Captured during the first full production deployment on Railway (March 20, 2026). These issues were discovered and fixed iteratively while debugging a non-functional FleetGraph panel in the deployed Ship application.

---

## Issue 1: Missing `/api/fleetgraph/findings` Endpoint

**Symptom:** FleetGraph panel in the web app showed "Unable to reach FleetGraph. Will retry automatically."

**Root cause:** The frontend polls `GET /api/fleetgraph/findings` every 30 seconds via the Ship API proxy. The FleetGraph service had endpoints for `/chat`, `/resume`, `/analyze`, and `/health`, but never implemented `/findings`. The proxy forwarded the request and got a 404 back, which surfaced as a 502 to the frontend.

**Fix:** Added `GET /api/fleetgraph/findings` to `fleetgraph/src/index.ts` with an in-memory findings store (`StoredFinding[]`). The proactive cron and `/analyze` endpoint populate the store when findings are detected. The `/resume` endpoint removes findings on dismiss.

**Lesson:** When building a backend service consumed by a frontend, verify every endpoint the frontend calls actually exists. The frontend hooks (`useFindings.ts`) were written against a contract that the backend never fulfilled.

---

## Issue 2: `properties.state` vs `properties.status` Field Mismatch

**Symptom:** FleetGraph's proactive scan returned "clean" even when the database had issues that should trigger findings. The `filterActive()` function wasn't filtering out done/cancelled issues, and `extractIssueFields()` was returning `status: undefined` for every issue.

**Root cause:** Ship stores issue status in `properties.state` (e.g., `state: 'done'`, `state: 'in_progress'`). FleetGraph's fetch nodes read `properties.status`, which doesn't exist. Every issue appeared active with an undefined status.

**Fix:** Updated `extractIssueFields()` and `filterActive()` in `fleetgraph/src/nodes/fetch.ts` to read `props?.state ?? props?.status`.

**Lesson:** When integrating with an existing API, verify the actual field names in the database and API responses. Don't assume field names — query the production database or inspect API responses directly. This was documented in `.claude/CLAUDE.md` under Key Patterns after the fix.

---

## Issue 3: Seed Data Too Clean for Detection

**Symptom:** Even after fixing the field mismatch, the proactive scan found nothing because the seed data had no detectable problems.

**Root cause:** Every seeded issue had an assignee (`assignee_id: assignee.id`). Every issue in a sprint was assigned. There were no security-keyword issues without owners, no unassigned work, and no high-priority unscheduled items. The seed data was designed for testing the UI, not for testing FleetGraph detection.

**Fix:** Added 5 "detection target" issues to `api/src/db/seed.ts`:
- 2 unassigned issues in the current sprint (triggers: unassigned warning)
- 1 XSS security issue with no owner (triggers: unowned security critical)
- 2 high-priority issues with no sprint (triggers: unscheduled high-priority warning)

Also added an `unassigned?: boolean` flag to the issue type and updated the seed loop to set `assignee_id: null` when `issue.unassigned` is true.

**Lesson:** Seed data should include "unhappy path" data that exercises detection and alerting features, not just happy-path data for UI rendering.

---

## Issue 4: Railway Environment Variables Missing on API Service

**Symptom:** Frontend received `503` responses with `{"error":"FleetGraph not configured"}` when polling findings.

**Root cause:** The Ship API proxy (`api/src/routes/fleetgraph.ts`) checks for both `FLEETGRAPH_SERVICE_URL` and `FLEETGRAPH_API_TOKEN` at the top of every request. If either is missing, it returns 503 immediately. Neither variable was set on the API service in Railway.

**Fix:** Added both variables to the API service in Railway dashboard:
- `FLEETGRAPH_SERVICE_URL` = `http://fleetgraph.railway.internal:3001`
- `FLEETGRAPH_API_TOKEN` = (the same token value configured on the FleetGraph service)

**Lesson:** The proxy requires TWO environment variables, not one. Both must be set on the **API service** (not the FleetGraph service). After adding variables, verify the service actually redeployed — Railway sometimes requires a manual redeploy trigger.

---

## Issue 5: Internal vs Public Railway URLs

**Symptom:** Could not run `pnpm db:seed` from local machine against Railway Postgres.

**Root cause:** The `DATABASE_URL` from Railway's service variables uses the internal hostname (`postgres.railway.internal`), which is only reachable from within Railway's private network.

**Fix:** Used the **public** Postgres URL from Railway dashboard (Settings → Public Networking), which has a public hostname like `turntable.proxy.rlwy.net:28077`.

**Lesson:** Railway has two URL types:
- **Internal** (`*.railway.internal`) — for service-to-service communication within Railway
- **Public** (`*.proxy.rlwy.net`) — for external access (local dev, CI, seed scripts)

Use internal URLs for `FLEETGRAPH_SERVICE_URL` and `SHIP_API_URL` (service-to-service). Use public URLs when running commands from your local machine.

---

## Issue 6: Proactive Sprint Fetch Using Wrong API Endpoint

**Symptom:** Proactive analysis returned `{}` from the LLM (structured output parse failure). The on-demand flow worked fine.

**Root cause:** The proactive `fetchSprint` called `shipApi.getIssues("document_type=sprint&status=active")` to find active sprints. But the `/api/issues` endpoint hardcodes `WHERE document_type = 'issue'` in its SQL query — the `document_type=sprint` query parameter was completely ignored. This always returned an empty array for sprints.

The on-demand flow worked because it received the sprint context from the document associations (the user was viewing a specific document), bypassing the broken generic sprint lookup.

**Fix:** Changed `fetchSprint` to call `GET /api/weeks` (via new `shipApi.getWeeks()`) which is the proper endpoint for discovering current sprints. It returns `{ weeks: [...sprints], current_sprint_number, days_remaining }`.

**Lesson:** Don't repurpose one endpoint to query a different document type. The issues endpoint is for issues. The weeks endpoint is for sprints. Verify endpoint behavior by checking the actual SQL queries, not just the URL pattern.

---

## Issue 7: LLM `maxTokens` Too Low for Proactive Analysis

**Symptom:** Even after fixing the sprint fetch, the proactive LLM call returned `{}` (empty structured output). The error was: `Failed to parse. Text: "{}". Error: findings required, summary required`.

**Root cause:** The proactive flow sends up to 100 issues + sprint data + team data + standup data to the LLM. With `maxTokens: 4096`, the model didn't have enough output budget to generate the full structured findings array. It started the tool call but produced empty arguments.

The on-demand flow worked because it caps at 50 issues and has a more focused prompt.

**Fix:** Increased `maxTokens` from 4096 to 8192 in `fleetgraph/src/nodes/reasoning.ts`.

**Lesson:** When using `withStructuredOutput()`, the output token budget must accommodate the full structured response. More input data = more findings = more output tokens needed. Monitor for `Text: "{}"` parse failures as a sign of token exhaustion.

---

## Issue 8: `FLEETGRAPH_SERVICE_URL` Needs Protocol and Port

**Symptom:** API proxy returned 502 (FleetGraph service unavailable) even after setting the environment variable.

**Root cause:** The variable was set to `fleetgraph.railway.internal` without the protocol and port. The fetch call needs a full URL.

**Fix:** Changed to `http://fleetgraph.railway.internal:3001`.

**Lesson:** Always include `http://` and the port number in service URLs. Railway's internal DNS resolves the hostname, but the application still needs the protocol and port.

---

## Issue 9: MemorySaver Resets on Deploy

**Known limitation:** FleetGraph uses `MemorySaver` (in-memory checkpointer) for the HITL confirmation gate. Any pending confirmations are lost when the service restarts or redeploys.

**Impact:** After every deploy, the findings store is empty until the first proactive cron run (~3 minutes). Users may see "No findings" briefly after deploys.

**Mitigation:** This is acceptable for the MVP. A future improvement would be to persist findings to a database or Redis.

---

## Summary: Production Debugging Checklist

When FleetGraph isn't working in production, check these in order:

1. **FleetGraph health:** `GET https://<fleetgraph-public-url>/health` — is it running?
2. **API proxy config:** Are `FLEETGRAPH_SERVICE_URL` (with `http://` and port) and `FLEETGRAPH_API_TOKEN` set on the **API service**?
3. **Token valid:** Does the `FLEETGRAPH_API_TOKEN` match a non-revoked entry in `api_tokens` table? Check `token_prefix`.
4. **Network tab:** What HTTP status does `/api/fleetgraph/findings` return? (503 = not configured, 502 = can't reach, 200 = working)
5. **Findings empty after 200:** Check FleetGraph logs — did the proactive cron run? Check LangSmith for the trace. Look for `errors` in the response.
6. **LLM returning `{}`:** Check `maxTokens`, verify fetch nodes are returning data (not empty arrays from wrong endpoints).
7. **Data issues:** Query the production database directly to verify seed data exists and has the expected field names (`properties.state`, not `properties.status`).

---

## Files Changed During This Deployment

| File | Change |
|------|--------|
| `fleetgraph/src/index.ts` | Added `/api/fleetgraph/findings` endpoint, in-memory findings store, `toStoredFindings()` helper |
| `fleetgraph/src/nodes/fetch.ts` | Fixed `state`/`status` field mismatch, replaced broken sprint fetch with `GET /api/weeks` |
| `fleetgraph/src/nodes/reasoning.ts` | Increased `maxTokens` from 4096 to 8192, added diagnostic logging |
| `fleetgraph/src/utils/ship-api.ts` | Added `getWeeks()` endpoint wrapper |
| `fleetgraph/.env.example` | New file — documents all required/optional env vars |
| `api/src/db/seed.ts` | Added 5 FleetGraph detection target issues with `unassigned` flag |
| `CLAUDE.md` | Added Railway deployment reference, env var tables, known gotchas |
| `.claude/CLAUDE.md` | Added Railway deployment section, `properties.state` documentation |
