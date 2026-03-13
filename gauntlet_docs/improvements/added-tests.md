# Added Tests: Comments & Invites Authorization Coverage

**Branch:** add-tests
**Date:** 2026-03-13
**Analyst:** Murat (TEA — Master Test Architect)

---

## Summary

A risk-based audit of the existing test suite identified two high-value, low-scope gaps in unit coverage. Sixty-four spec files exist across E2E and unit layers, but 16 API route files had zero unit tests. The audit prioritized routes where:

1. Authorization logic creates a **security boundary** that E2E tests cannot reliably exercise
2. The route complexity is small enough that targeted tests deliver high coverage quickly
3. A structural code defect was plausibly lurking behind the coverage gap

Two test files were added (27 tests total) and one production bug was found and fixed.

---

## Analysis Method

### Test Landscape Mapping

The codebase has:
- **70+ E2E spec files** — wide but shallow; all run in a real browser via testcontainers, covering happy-path UI flows
- **28 unit test files** — targeting individual API routes via supertest against a real PostgreSQL database
- **16 route files with zero unit tests**, including `team.ts` (2,195 lines), `weekly-plans.ts` (1,165 lines), `programs.ts` (892 lines), `comments.ts` (248 lines), and `invites.ts` (280 lines)

### Risk-Based Prioritization

Three criteria ranked each gap:

| Criterion | Weight | Rationale |
|---|---|---|
| Authorization boundary | High | Wrong auth logic = data exposure or data loss |
| E2E coverage quality | Medium | If E2E already covers the key paths well, unit tests add less marginal value |
| File size / complexity | Low | Smaller scope = faster delivery, lower risk of new tests introducing noise |

**Comments** ranked highest: small file (248 lines), meaningful authorization rules that split along two axes (content-edit is author-only; resolve/unresolve is any-member), and the E2E `inline-comments.spec.ts` covers only happy-path UI flows — it never attempts cross-user edits, API-level access without the browser, or non-existent resource IDs.

**Invites** ranked second: token-based security flows (expiry, replay, weak passwords) require exact DB state that is impractical to set up at the E2E level. The two existing E2E invite specs (`existing-user-invite.spec.ts`, `pending-invites-allocation.spec.ts`) use only valid, unexpired tokens from seed data.

**Team.ts** was noted as the largest risk surface (2,195 lines, 13 endpoints, no unit tests) but deprioritized for this pass due to scope — the accountability grid queries are complex enough to warrant a dedicated sprint effort.

---

## Bug Found and Fixed

### Bug: `PATCH /api/comments/:id` returns 403 for non-existent comment IDs

**File:** `api/src/routes/comments.ts`, PATCH handler

**Root cause:** The author-ownership check ran *before* the existence check. When a comment does not exist, `existing.rows[0]` is `undefined`. The optional-chain expression `existing.rows[0]?.author_id` resolves to `undefined`, which is `!== userId` (always true), so the middleware short-circuits with **403 Forbidden** before reaching the 404 check.

**Defective code (before):**
```ts
// Check comment exists in workspace
const existing = await pool.query(
  'SELECT * FROM comments WHERE id = $1 AND workspace_id = $2',
  [commentId, workspaceId]
);

// 403 check runs FIRST — optional chain on missing row always evaluates to !== userId
if (parsed.data.content !== undefined && existing.rows[0]?.author_id !== userId) {
  res.status(403).json({ error: 'Only the comment author can edit content' });
  return;
}
// By the time we reach here, rows[0] was already undefined — 404 never fires for real
if (existing.rows.length === 0) {
  res.status(404).json({ error: 'Comment not found' });
  return;
}
```

**Fixed code (after):**
```ts
const existing = await pool.query(
  'SELECT * FROM comments WHERE id = $1 AND workspace_id = $2',
  [commentId, workspaceId]
);

// Existence check runs FIRST — prevents 403 leaking on missing resources
if (existing.rows.length === 0) {
  res.status(404).json({ error: 'Comment not found' });
  return;
}

// Safe to access rows[0] directly — we know it exists
if (parsed.data.content !== undefined && existing.rows[0].author_id !== userId) {
  res.status(403).json({ error: 'Only the comment author can edit content' });
  return;
}
```

**Impact:** Any caller who PATCH-ed a comment UUID that didn't exist received `403 Forbidden` instead of `404 Not Found`. This is an information-disclosure issue: a 403 implies the resource *exists* but the caller lacks permission, which leaks the resource's existence status to unauthorized probers. The correct behavior is 404 — the resource is not found in this workspace.

**How the bug was discovered:** Writing a test case for the expected contract (`non-existent comment → 404`) caused an assertion failure. The test expected 404; the API returned 403. Without a unit test, this discrepancy would have been invisible.

---

## New Test File 1: `api/src/routes/comments.test.ts`

**16 tests** covering the full CRUD contract for:
- `GET /api/documents/:id/comments`
- `POST /api/documents/:id/comments`
- `PATCH /api/comments/:id`
- `DELETE /api/comments/:id`

### Test Setup

Two users are created in a shared workspace: an **author** (who creates the seeded comment in `beforeEach`) and a **member** (a different authenticated user in the same workspace). This two-actor setup enables authorization boundary tests that would require multiple browser sessions in E2E — expensive and fragile at the E2E level but trivial at the unit level.

### Tests and What They Pin

#### GET /api/documents/:id/comments

| Test | Contract pinned |
|---|---|
| returns the comment list for the document | List endpoint returns correct shape with author info |
| returns 401 when not authenticated | Endpoint is protected |

#### POST /api/documents/:id/comments

| Test | Contract pinned |
|---|---|
| creates a top-level comment and returns 201 | Happy path; correct status and response shape |
| creates a reply when parent_id is provided | Threading: parent_id is stored correctly |
| returns 400 for empty content | Zod validation: `min(1)` enforced |
| returns 404 for a non-existent document | Document existence verified before insert |
| returns 404 when parent_id does not belong to this document | Parent comment must belong to same document — cross-document reply injection blocked |

#### PATCH /api/comments/:id

| Test | Contract pinned |
|---|---|
| author can update their own comment content | Author edit allowed |
| non-author cannot edit comment content — returns 403 | Non-author edit blocked |
| any workspace member can resolve a comment | Resolve is not author-restricted — intentional design |
| any workspace member can un-resolve a comment | Un-resolve is not author-restricted |
| **non-existent comment returns 404, not 403 (bug guard)** | **Guards against regression of the fixed ordering bug** |
| returns 400 when no fields are provided | Empty PATCH body rejected |

#### DELETE /api/comments/:id

| Test | Contract pinned |
|---|---|
| author can delete their own comment | Owner delete allowed; DB confirms row gone |
| non-author cannot delete another user's comment — returns 404 | WHERE clause includes `author_id = $3`, so wrong owner gets 404 (not 403, by design — avoids leaking existence to non-owners) |
| returns 401 when not authenticated | Endpoint is protected |

### Result

```
✓ api/src/routes/comments.test.ts (16 tests) — 309ms
```

---

## New Test File 2: `api/src/routes/invites.test.ts`

**11 tests** covering the security contract for:
- `GET /api/invites/:token` — token validation (public endpoint, no auth required)
- `POST /api/invites/:token/accept` — invite acceptance with user creation

### Why E2E Cannot Cover This Adequately

Invite token states (expired, already-used, unknown) require precise DB state. E2E tests run against seed data with valid, unexpired tokens. Setting up an expired token or a replay scenario in a browser test means either manipulating system time (fragile) or inserting DB records directly (at which point it's effectively a unit test run inside a browser container — all cost, little benefit).

### Tests and What They Pin

#### GET /api/invites/:token

| Test | Contract pinned |
|---|---|
| returns invite details for a valid token | Response shape: email, role, workspaceId, userExists, alreadyMember |
| returns 404 for an unknown token | Bogus UUID → not found, not a silent 200 |
| returns 400 for an expired token | Expired invite rejected with actionable message |
| returns 400 for an already-used token | Used invite not replayable |
| sets userExists=true and alreadyMember=true for existing member | Correct flags for UI branching logic |

#### POST /api/invites/:token/accept

| Test | Contract pinned |
|---|---|
| accepts a valid invite, creates user, returns session cookie | Full happy path: user created, membership created, session cookie set |
| returns 400 for an expired token | Expiry checked on accept (not just on validate) |
| returns 400 for an already-used token | Replay blocked on accept path |
| returns 404 for an unknown token | Bogus token handled correctly |
| rejects a weak password (< 8 characters) — no user created | Password policy enforced before any DB writes |
| returns 400 when existing workspace member tries to accept | Idempotency guard: already-member accept returns 400, not a silent duplicate membership |

### Result

```
✓ api/src/routes/invites.test.ts (11 tests) — 433ms
```

---

## Combined Results

```
Test Files  4 passed (4)
     Tests  54 passed (54)
  Duration  20.92s
```

*(4 files because vitest runs each file from two contexts — the workspace root and the pnpm store symlink — both pass.)*

---

## Files Changed

| File | Type | Description |
|---|---|---|
| `api/src/routes/comments.test.ts` | New | 16 unit tests for comments CRUD and authorization |
| `api/src/routes/invites.test.ts` | New | 11 unit tests for invite token validation and acceptance |
| `api/src/routes/comments.ts` | Bug fix | Corrected 404/403 ordering in PATCH handler |

---

## Remaining High-Value Gaps (Not Addressed in This Pass)

| Route | Lines | Risk | Notes |
|---|---|---|---|
| `team.ts` | 2,195 | High | 13 endpoints, 3 versions of accountability grid, complex SQL aggregations — no unit tests |
| `weekly-plans.ts` | 1,165 | Medium | Allocation grid queries with no unit test coverage |
| `programs.ts` | 892 | Medium | Some E2E coverage via `programs.spec.ts`; no unit tests for merge-preview or merge endpoints |
| `admin.ts` | 1,802 | Medium | Admin-only routes; test coverage would require admin-role session setup |

These are documented here so future work can pick up where this pass left off.
