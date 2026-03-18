# Story 6.3: Ship Backend Proxy for FleetGraph API

Status: done

## Story

As a **developer**,
I want Ship's Express backend to proxy requests to FleetGraph with session authentication and token translation,
so that FleetGraph never handles Ship user sessions and the browser makes same-origin requests.

## Acceptance Criteria

1. **Given** a logged-in Ship user makes a request to `/api/fleetgraph/*`
   **When** Ship's Express backend receives the request
   **Then** it validates the user's session (existing `authMiddleware`)
   **And** forwards the request to FleetGraph's service URL with `FLEETGRAPH_API_TOKEN` as Bearer auth
   **And** enriches the request with `workspaceId` from the user's session

2. **Given** a user with an expired or invalid session
   **When** they attempt to call `/api/fleetgraph/*`
   **Then** Ship returns 401 and the request is NOT forwarded to FleetGraph

3. **Given** FleetGraph's service is unreachable (timeout, connection refused, DNS failure)
   **When** Ship attempts to proxy a request
   **Then** Ship returns 502 with `{ error: "FleetGraph service unavailable" }`
   **And** the failure is logged on Ship's side with the endpoint and error details

4. **Given** FleetGraph returns an error response (4xx or 5xx)
   **When** Ship proxies the response back
   **Then** Ship forwards FleetGraph's status code and response body unchanged to the client

5. **Given** the proxy is configured
   **When** the frontend calls `/api/fleetgraph/chat`, `/api/fleetgraph/resume`, or `/api/fleetgraph/findings`
   **Then** each is forwarded to the corresponding FleetGraph endpoint with the same method and body

## Tasks / Subtasks

- [x] Task 1: Create FleetGraph proxy route file (AC: #1, #2, #5)
  - [x] 1.1: Create `api/src/routes/fleetgraph.ts` with Express `Router()`
  - [x] 1.2: Add `FLEETGRAPH_SERVICE_URL` environment variable (e.g., `http://fleetgraph-service.railway.internal:3001`) — read from `process.env`
  - [x] 1.3: Add `FLEETGRAPH_API_TOKEN` environment variable — used as Bearer token when forwarding requests
  - [x] 1.4: Create generic proxy handler function: `proxyToFleetGraph(req, res)`

- [x] Task 2: Implement proxy handler (AC: #1, #3, #4)
  - [x] 2.1: Extract request body, method, and sub-path from incoming request
  - [x] 2.2: Build target URL: `${FLEETGRAPH_SERVICE_URL}${req.originalUrl}` (preserves `/api/fleetgraph/chat` path structure)
  - [x] 2.3: Forward with headers: `Authorization: Bearer ${FLEETGRAPH_API_TOKEN}`, `Content-Type: application/json`
  - [x] 2.4: Enrich request body with `workspaceId` from `req.workspaceId` session context (Ship's auth middleware populates this)
  - [x] 2.5: Set 30-second timeout on outbound request (`AbortSignal.timeout(30000)`) — FleetGraph on-demand can take up to 15s
  - [x] 2.6: On success: forward FleetGraph's status code and JSON body to the client
  - [x] 2.7: On FleetGraph error (4xx/5xx): forward status code and body unchanged
  - [x] 2.8: On network error (ECONNREFUSED, timeout, DNS): return 502 + `{ error: "FleetGraph service unavailable" }` + `console.error` log

- [x] Task 3: Define proxy routes (AC: #5)
  - [x] 3.1: `POST /chat` → proxy to FleetGraph `POST /api/fleetgraph/chat`
  - [x] 3.2: `POST /resume` → proxy to FleetGraph `POST /api/fleetgraph/resume`
  - [x] 3.3: `GET /findings` → proxy to FleetGraph `GET /api/fleetgraph/findings` (new endpoint FleetGraph will need)
  - [x] 3.4: `POST /analyze` → proxy to FleetGraph `POST /api/fleetgraph/analyze` (manual trigger)
  - [x] 3.5: All routes use `authMiddleware` — unauthenticated requests never reach FleetGraph

- [x] Task 4: Register route in Ship's Express app (AC: #1, #2)
  - [x] 4.1: Import `fleetgraphRoutes` in `api/src/app.ts`
  - [x] 4.2: Mount: `app.use('/api/fleetgraph', conditionalCsrf, fleetgraphRoutes)` — follows existing route registration pattern (line ~188-199 in app.ts)
  - [x] 4.3: Ensure `authMiddleware` is applied (on individual routes in the router)

- [x] Task 5: Add environment variable configuration (AC: #1, #3)
  - [x] 5.1: Add `FLEETGRAPH_SERVICE_URL` to Ship API's `.env.example` with documentation comment
  - [x] 5.2: Add `FLEETGRAPH_API_TOKEN` to Ship API's `.env.example`
  - [ ] 5.3: Add both to Ship's Elastic Beanstalk / deployment config (deferred — requires deploy access)
  - [x] 5.4: If either env var is missing, log a warning at startup but don't crash — proxy routes return 503 "FleetGraph not configured"

## Dev Notes

### Ship's Existing Route Pattern

Routes in Ship follow this pattern (`api/src/app.ts` lines 188-199):

```typescript
import fleetgraphRoutes from './routes/fleetgraph.js';
// ...
app.use('/api/fleetgraph', conditionalCsrf, fleetgraphRoutes);
```

Individual route files use Express Router:

```typescript
// api/src/routes/fleetgraph.ts
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/chat', authMiddleware, async (req, res) => {
  await proxyToFleetGraph(req, res);
});

export default router;
```

### Proxy Implementation (Use Node.js fetch)

Ship's API runs on Node.js 18+ which has native `fetch`. Use it directly — no need for `http-proxy-middleware` or `axios`:

```typescript
async function proxyToFleetGraph(req: Request, res: Response) {
  const serviceUrl = process.env.FLEETGRAPH_SERVICE_URL;
  const token = process.env.FLEETGRAPH_API_TOKEN;

  if (!serviceUrl || !token) {
    return res.status(503).json({ error: 'FleetGraph not configured' });
  }

  const targetUrl = `${serviceUrl}${req.originalUrl}`;
  const body = req.method !== 'GET' ? JSON.stringify({
    ...req.body,
    workspaceId: req.body.workspaceId || req.user?.workspaceId
  }) : undefined;

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
      signal: AbortSignal.timeout(30000),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error(`[fleetgraph-proxy] ${req.method} ${targetUrl} failed:`, err);
    res.status(502).json({ error: 'FleetGraph service unavailable' });
  }
}
```

### Session Context Enrichment

Ship's `authMiddleware` populates `req.user` with session data. The proxy enriches FleetGraph requests with:
- `workspaceId` — from the user's active workspace in their session
- The frontend may also send `workspaceId` in the body — prefer the session value as authoritative

Ship's auth uses session cookies with 15-minute idle timeout. FleetGraph never sees these cookies — the proxy translates session auth → Bearer token auth.

### Security Considerations

- **Session validation first:** `authMiddleware` rejects unauthenticated requests before any proxy logic runs
- **Token never sent to browser:** `FLEETGRAPH_API_TOKEN` is only used server-side in the proxy. The browser never sees it.
- **CORS non-issue:** Browser → Ship API is same-origin. Ship API → FleetGraph is server-to-server.
- **No request body forwarding for GET:** Only forward body for POST requests
- **Input validation:** Trust Ship's existing middleware for request validation. FleetGraph validates its own inputs.

### FleetGraph Endpoints Being Proxied

| Ship Route | FleetGraph Target | Method | Purpose |
|------------|-------------------|--------|---------|
| `/api/fleetgraph/chat` | `/api/fleetgraph/chat` | POST | On-demand analysis |
| `/api/fleetgraph/resume` | `/api/fleetgraph/resume` | POST | HITL confirm/dismiss |
| `/api/fleetgraph/findings` | `/api/fleetgraph/findings` | GET | Latest findings (for panel) |
| `/api/fleetgraph/analyze` | `/api/fleetgraph/analyze` | POST | Manual proactive trigger |

Note: FleetGraph will need a new `GET /api/fleetgraph/findings` endpoint to serve cached findings from the latest proactive run. That's a FleetGraph-side change, not part of this story.

### What NOT To Do

- Do NOT install `http-proxy-middleware` or `axios` — use native `fetch`
- Do NOT forward session cookies to FleetGraph — translate to Bearer token
- Do NOT add FleetGraph routes to Ship's OpenAPI spec yet — this is a proxy, not a Ship-native API
- Do NOT add retry logic in the proxy — FleetGraph handles its own retries internally
- Do NOT stream responses — MVP uses request/response, not SSE
- Do NOT modify Ship's existing auth middleware — just use it via `authMiddleware`

### Project Structure Notes

- Single new file: `api/src/routes/fleetgraph.ts` — minimal footprint
- Follows Ship's existing route registration pattern exactly
- No new dependencies — uses Node.js native `fetch`
- No database changes — pure HTTP proxy

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Section 8: Ship Backend Proxy decision + data flow diagram]
- [Source: _bmad-output/planning-artifacts/architecture.md — Section 7: FleetGraph API endpoints being proxied]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 6, Story 6.3]
- [Source: api/src/app.ts — Route registration pattern (lines 188-199)]
- [Source: api/src/routes/programs.ts — Example route file structure]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Proxy requirement UX5]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
N/A — no issues encountered during implementation.

### Completion Notes List
- Used `req.workspaceId` (not `req.user.workspaceId`) — Ship's `authMiddleware` populates `req.workspaceId` directly.
- Session workspaceId takes precedence over body-supplied workspaceId via spread order (`...req.body` then `workspaceId: req.workspaceId`).
- Task 5.3 (Elastic Beanstalk env config) deferred — requires deploy access, not a code change.
- Startup warning logged to console when env vars are missing (non-blocking).

### Code Review Fixes Applied
- **H1**: Exported `proxyToFleetGraph` and refactored tests to import the real production handler instead of duplicating it. Tests now use env var overrides + cleanup pattern.
- **H2/L2**: Changed `response.json()` to `response.text()` + Content-Type detection. Non-JSON responses (e.g., HTML error pages) are forwarded faithfully per AC4.
- **M1**: GET /findings now appends `workspaceId` as a query parameter so FleetGraph knows which workspace's findings to return.
- **M2**: Trailing slash on `FLEETGRAPH_SERVICE_URL` is stripped before URL construction to prevent double-slash URLs.
- **M3**: `Content-Type: application/json` header is only set when a request body is present (POST), not on GET requests.
- **L1**: `proxyToFleetGraph` is now exported for direct testability.
- 14 tests (up from 12): added non-JSON response forwarding test and trailing-slash normalization test.

### File List
- `api/src/routes/fleetgraph.ts` — NEW: proxy route file with `proxyToFleetGraph` handler and 4 routes
- `api/src/routes/fleetgraph.test.ts` — NEW: 12 unit tests for proxy logic
- `api/src/app.ts` — MODIFIED: import + mount `fleetgraphRoutes` at `/api/fleetgraph`
- `api/src/index.ts` — MODIFIED: startup warning when FleetGraph env vars missing
- `api/.env.example` — MODIFIED: added `FLEETGRAPH_SERVICE_URL` and `FLEETGRAPH_API_TOKEN` docs
