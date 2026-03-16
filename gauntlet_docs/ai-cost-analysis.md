# AI Cost Analysis — ShipShape Week 4 Gauntlet

## Tool Usage Summary

| Tool | Purpose | Cost |
|------|---------|------|
| Claude Code (Anthropic — claude-sonnet-4-6) | Primary coding agent — sprint planning, story context generation, implementation across all 7 categories, documentation | $50.00 |
| **Total** | | **$50.00** |

> **Pricing note:** Claude Code was used via a Claude Max subscription ($200/month flat rate). This project spanned approximately one week, so the prorated cost is estimated at **$50** (1 week ÷ 4 weeks × $200/month). Claude Max does not expose per-token billing — usage is covered under the subscription with no per-call charges.

---

## Token Usage (Claude API)

| Metric | Value |
|--------|-------|
| Subscription tier | Claude Max ($200/month) |
| Billing model | Flat-rate subscription — no per-token charges |
| Project duration | ~1 week (2026-03-09 through 2026-03-15) |
| Prorated cost | $50 (1/4 of monthly subscription) |
| Estimated token volume | 2–5M tokens (7 categories, ~30 commits, full planning + implementation workflow) |

**Note:** Claude Max does not expose token-level billing data. Exact input/output token counts are not available through the console for subscription users. The 2–5M token estimate is based on typical Claude Code session sizes for a project of this scope.

---

## Reflection Questions

### 1. Which parts was AI most helpful for? Which parts was it least helpful?

**Most helpful:**

The AI (Claude Code) was most effective at:

- **Boilerplate implementation** — The global Express error middleware (Story 1.2), the UUID validation regex middleware (Story 1.4), and the `manualChunks` Vite configuration (Story 2.4) were generated correctly on the first attempt with minimal iteration. These are pattern-matching tasks where the AI's training data coverage is dense.

- **Sprint planning and story context generation** — The BMAD SM agent produced accurate, detailed story files with task breakdowns, Dev Notes, and references that genuinely saved planning time. The discovery of relevant file paths and architectural patterns within each story context was accurate.

- **Documentation** — Improvement docs in `gauntlet_docs/improvements/`, the orientation checklist appendices, and the discovery write-up benefited from the AI's ability to synthesize observations from multiple files quickly.

- **SQL migrations** — The `pg_trgm` GIN index migration (Story 4.1) and the `statement_timeout` connection pool change (Story 4.3) were generated correctly, including the `CONCURRENTLY` flag for production-safe index creation.

**Least helpful:**

- **Test isolation diagnosis** — The rate-limiter contamination in `auth.test.ts` (Story 7.0) required understanding shared mutable state across test runs in a specific way that the AI initially got wrong (it suggested resetting a limiter store that didn't exist). The actual fix required reasoning through Vitest's module isolation behavior first, then the AI could implement.

- **Understanding implicit constraints** — Several suggestions initially ignored the 15-minute session timeout constraint, the "no ORM" architecture decision, and the `Untitled` default title convention documented in CLAUDE.md. These required correction, and the AI sometimes re-introduced the same mistake in subsequent turns.

---

### 2. Did AI help you understand the codebase, or did it shortcut your understanding?

Both, in distinct ways.

The BMAD method's `create-story` workflow forced genuine understanding: before generating a story, it required reading specific files and extracting key patterns, constraints, and file paths. This made me engage with `api/src/collaboration/index.ts` and `api/src/db/schema.sql` more carefully than I would have in a pure "ask and implement" flow.

However, for the Yjs CRDT collaboration code specifically, I accepted the AI's explanation of the sync protocol without fully tracing through `y-protocols/sync`'s state machine myself. I understand *what* the collaboration server does (Discovery 1 in the write-up) but not *why* the binary encoding protocol is structured the way it is. That's a genuine gap the AI glossed over.

For the accessibility fixes (Cat 7), the AI correctly identified Radix Dialog as the right replacement for the custom dialog but didn't explain *why* the custom dialog was failing axe-core (missing `aria-describedby` and focus trap). I implemented the fix without fully internalizing the screen reader behavior that was broken. This is a shortcut.

---

### 3. Where did you override AI suggestions and why?

Three clear overrides occurred:

**1. `pg_trgm` index without `CONCURRENTLY` (Story 4.1)**
The AI initially generated `CREATE INDEX idx_documents_title_trgm ON documents USING GIN (title gin_trgm_ops);` without `CONCURRENTLY`. Adding `CONCURRENTLY` was necessary to avoid a full table lock during index creation on a live production database. The AI accepted the correction immediately but didn't proactively include it.

**2. Lazy-loading scope for the emoji picker (Story 2.3)**
The AI initially suggested wrapping the entire `App` component root in `<Suspense>`. The correct boundary is the specific usage site of `EmojiPicker` in the context menu component — wrapping the root would have caused every route navigation to hit the suspense boundary. This required understanding how Suspense propagation works, which the AI underestimated.

**3. Test fix approach for `auth.test.ts` (Story 7.0)**
The AI's first suggestion was to use `jest.clearMocks()` to reset the rate limiter between tests. This codebase uses Vitest (not Jest), and more importantly, the rate limiter is in-memory state on the `app` instance, not a mock. The actual fix was to create a fresh `createApp()` instance in `beforeEach`. The AI needed explicit correction on both the framework (Vitest vs. Jest) and the isolation mechanism (instance vs. mock).

---

### 4. What percentage of final code changes were AI-generated vs. hand-written?

**100% AI-generated.** All code changes across every category were written by Claude Code. No code was hand-written or manually edited.

| Category | Breakdown |
|----------|-----------|
| Cat 6 – Error handling | 100% AI |
| Cat 2 – Bundle size | 100% AI |
| Cat 3 – API response time | 100% AI |
| Cat 4 – DB query efficiency | 100% AI |
| Cat 1 – Type safety | 100% AI |
| Cat 7 – Accessibility | 100% AI |
| Cat 5 – Test coverage | 100% AI |
| Documentation (all) | 100% AI |

**Hand-written portions:** None. All implementation, configuration, SQL migrations, tests, and documentation were generated by Claude Code (claude-sonnet-4-6).
