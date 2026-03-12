# Story 8.7: Publish Social Post

Status: ready-for-dev

> **YOLO mode:** This story is authorized for full YOLO permissions. Draft the post content and document the URL once published. Proceed autonomously without pausing for confirmation.

## Story

As a Gauntlet submitter,
I want a social post published on X or LinkedIn about auditing a government codebase,
So that the required community deliverable is complete and tags @GauntletAI as specified.

## Acceptance Criteria

1. **Given** the project is complete and key findings are known
   **When** the post is published on X or LinkedIn
   **Then** it covers: what was learned auditing a government codebase, key findings from the audit, tags @GauntletAI

2. **Given** the post is published
   **Then** the post URL is saved to `gauntlet_docs/submission.md`

## Tasks / Subtasks

- [ ] Task 1: Draft the post content (AC: #1)
  - [ ] Use the draft below as a starting point — edit to make it authentic and personal
  - [ ] Confirm it mentions: auditing a government codebase, at least 2–3 key findings, tags @GauntletAI
  - [ ] Keep under the platform character limit (X: 280 chars per post, or use a thread; LinkedIn: 3000 chars)
  - [ ] Make it sound like you — avoid corporate language

- [ ] Task 2: Publish the post (AC: #1)
  - [ ] Post on X (Twitter) or LinkedIn — either platform qualifies
  - [ ] Verify @GauntletAI is tagged and resolves correctly
  - [ ] Take note of the post URL immediately after publishing

- [ ] Task 3: Document the URL (AC: #2)
  - [ ] Add the post URL to `gauntlet_docs/submission.md` under `## Social Post`
  - [ ] Commit: `docs: add social post URL to submission.md`
  - [ ] Update sprint-status.yaml: `8-7-publish-social-post: done`

## Draft Post Content

### X (Twitter) — Thread Version

**Tweet 1:**
> Just audited a government project management tool (ShipShape, built by the U.S. Treasury) for @GauntletAI Week 4. Found meaningful issues across 7 categories — here's what I learned 🧵

**Tweet 2:**
> The codebase was actually well-architected. Unified document model (everything in one table with a type discriminator), Yjs CRDTs for real-time collaboration, boring-but-solid Express + PostgreSQL. The problems were in the gaps, not the foundation.

**Tweet 3:**
> The most impactful fix: unhandled errors were returning HTML stack traces to API clients. A 4-argument Express error handler and process crash guards fixed it — now everything returns structured JSON. Simple change, massive security/UX difference.

**Tweet 4:**
> The most surprising finding: the bundle was shipping ReactQueryDevtools to production. A 2-line guard (`if (import.meta.env.DEV)`) eliminated it. Always audit your dev tools. Always.

**Tweet 5:**
> Other wins: lazy-loading the emoji picker, stripping content columns from list endpoints, adding a pg_trgm GIN index for ILIKE search, fixing 3 flaky tests with proper async waits, and fixing WCAG color contrast violations.

**Tweet 6:**
> AI coding agent (Claude Code + BMAD Method) handled ~70% of implementation. It was fast for boilerplate and slow for reasoning about test isolation bugs. Override when the AI doesn't understand shared state. @GauntletAI

---

### LinkedIn — Single Post Version

> **What I learned auditing a U.S. Treasury government app**
>
> For Week 4 of the @GauntletAI program, I audited ShipShape — a project management tool built by the U.S. Department of the Treasury. Here are the most interesting findings:
>
> **The good:** The codebase is genuinely well-designed. Unified document model (everything in one PostgreSQL table with a `document_type` discriminator), Yjs CRDTs for real-time collaborative editing, a deliberate "boring technology" philosophy that makes it readable.
>
> **The gaps:**
> → Unhandled errors were returning HTML stack traces to API clients (a security/reliability issue fixed with global Express error middleware)
> → ReactQueryDevtools was shipping to production inside the bundle
> → ILIKE search was doing full table scans (fixed with a pg_trgm GIN index)
> → 3 test flakiness issues from `waitForTimeout` instead of proper async assertions
> → WCAG color contrast violations on key pages
>
> **On using AI for this work:** Claude Code + the BMAD agent framework handled ~70% of implementation. It excelled at boilerplate (error middleware, migration SQL, type declarations) and struggled with test isolation bugs that required reasoning about shared state across test runs.
>
> **Takeaway:** Government code quality is often better than its reputation. The real risk is in the operational gaps — error handling, observability, accessibility — not the core architecture.
>
> #GauntletAI #OpenSource #TypeScript #SoftwareEngineering

---

## Dev Notes

### Requirements Summary

From the GFA PDF and epics file:
- Platform: **X or LinkedIn** (either qualifies)
- Must tag: **@GauntletAI**
- Must cover: what was learned, key findings from the audit
- URL must be saved to `gauntlet_docs/submission.md`

### Post Authenticity

The draft above is a template. Before publishing:
- Replace any generic statements with specific numbers you know (e.g., "reduced bundle by 23%")
- Make it sound like you wrote it, not like a bot
- If some findings changed during implementation, update the draft accordingly

### Where to Find Your Real Numbers

- Bundle size reduction: `gauntlet_docs/improvements/cat2-bundle-size.md`
- API response time improvement: `gauntlet_docs/improvements/cat3-api-response-time.md`
- Type violation reduction: `gauntlet_docs/improvements/cat1-type-safety.md`
- Test pass rate: `gauntlet_docs/improvements/cat5-test-coverage.md`

### `submission.md` Update

Story 8.4 creates `gauntlet_docs/submission.md`. Add this section to it:

```markdown
## Social Post

- Platform: [X/LinkedIn]
- URL: [post URL]
- Published: [date]
```

### Commit Message

```
docs: add social post URL to submission.md
```

### References

- [Source: gauntlet_docs/submission.md] — Where to log the post URL (Story 8.4 creates this file)
- [Source: gauntlet_docs/improvements/] — Before/after numbers for the post content
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-8] — Epic 8 requirement FR31

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `gauntlet_docs/submission.md` (updated with social post URL)
