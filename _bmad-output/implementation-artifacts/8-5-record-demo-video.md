# Story 8.5: Record Demo Video

Status: ready-for-dev

## Story

As a Gauntlet submitter,
I want a 3–5 minute demo video walking through audit findings and all 7 improvements,
So that graders can see the before/after evidence presented with reasoning in a single artifact.

## Acceptance Criteria

1. **Given** all 7 code epics are complete and improvement docs exist
   **When** the video is recorded (screen recording with narration)
   **Then** it covers: audit methodology overview, each of the 7 categories with before/after measurements shown on screen, reasoning for each fix approach

2. **Given** the video is recorded
   **Then** it is 3–5 minutes (not shorter, not significantly longer)

3. **Given** the video is uploaded
   **Then** the video link or file path is included in `gauntlet_docs/submission.md`

## Tasks / Subtasks

- [ ] Task 1: Prepare content before recording (AC: #1)
  - [ ] Confirm all 7 improvement docs exist in `gauntlet_docs/improvements/`:
    - `cat1-type-safety.md` ✅
    - `cat2-bundle-size.md` — confirm exists
    - `cat3-api-response-time.md` — confirm exists
    - `cat4-db-query-efficiency.md` — confirm exists
    - `cat5-test-coverage.md` ✅
    - `cat6-error-handling.md` ✅
    - `cat7-accessibility.md` ✅
  - [ ] Confirm deployment is live (Story 8.4 must be done — you need the live URL for the demo)
  - [ ] Have `gauntlet_docs/baselines.md` open for the before measurements
  - [ ] Plan the video structure (see Video Script below)

- [ ] Task 2: Record the video (AC: #1, #2)
  - [ ] Set up screen recording (OBS, QuickTime, Loom, or similar)
  - [ ] Record with narration — graders want to hear your reasoning, not just see numbers
  - [ ] Follow the Video Script below
  - [ ] Target: 3:30–4:30 minutes. Under 3 min = too shallow. Over 5 min = loses grader attention.
  - [ ] If a take goes wrong, re-record the section — do not rush through mistakes

- [ ] Task 3: Upload and document (AC: #3)
  - [ ] Upload to: Loom / YouTube (unlisted) / Google Drive / any accessible URL
  - [ ] Add the video URL to `gauntlet_docs/submission.md` under `## Demo Video`
  - [ ] Commit: `docs: add demo video link to submission.md`
  - [ ] Update sprint-status.yaml: `8-5-record-demo-video: done`

## Video Script

**Suggested structure — adapt to fit 3–5 minutes:**

---

### Opening (20–30 sec)

> "I'm going to walk through my Week 4 Gauntlet audit of ShipShape — a government project management tool built by the U.S. Treasury. I audited 7 categories, found meaningful issues in all of them, and fixed each one. Here's the before, the fix, and the after."

Show: the live deployed app briefly (homepage)

---

### Audit Methodology (20–30 sec)

> "My process: I ran the audit tools first to establish baselines — autocannon for API performance, rollup-plugin-visualizer for bundle size, axe-core for accessibility, and vitest for unit tests. I captured everything in `gauntlet_docs/baselines.md` before touching a line of code."

Show: `gauntlet_docs/baselines.md` file briefly

---

### Category Walk-Through (~2:30 total — ~20 sec each)

For each of the 7 categories, show the improvement doc on screen and say:

**Cat 6 — Runtime Error Handling** (do this first, it was most critical)
> "Before: unhandled errors returned HTML stack traces — a security issue. I added global Express error middleware, process crash guards, and UUID validation. After: all errors return structured JSON."

**Cat 2 — Bundle Size**
> "Before: [X KB] initial load. I gated ReactQueryDevtools behind a DEV flag, lazy-loaded the emoji picker, added manualChunks for stable vendors, and removed a dead dependency. After: [Y KB] — a [Z%] reduction."

**Cat 3 — API Response Time**
> "Before: issues list fetched the full `content` column for every doc — megabytes of editor JSON per request. I stripped the column, added a `document_type` filter parameter, and added pagination. After: P95 dropped [X%]."

**Cat 4 — DB Query Efficiency**
> "Before: ILIKE search did a full table scan. I added a pg_trgm GIN index, made session updates conditional, and added a statement timeout. After: query plan now uses index scan."

**Cat 1 — Type Safety**
> "Before: 875 TypeScript violations across the codebase. I fixed Express request augmentation, added typed DB row interfaces, and fixed tsconfig strict flags. After: [N] violations — a [X%] reduction."

**Cat 7 — Accessibility**
> "Before: axe-core reported serious color contrast violations and missing skip navigation on 3 priority pages. I fixed contrast ratios, added a skip-nav link, and replaced the custom dialog with Radix. After: 0 serious violations."

**Cat 5 — Test Coverage**
> "Before: 3 flaky tests and 6 unit test failures. I fixed the rate-limiter contamination in auth.test.ts, fixed the file-attachments waitForTimeout flakiness, and added 3 new meaningful E2E tests. After: 0 failures, 99%+ pass rate."

---

### Closing (20 sec)

> "All 7 improvements are on separate branches merged to master, deployed live at [URL]. The improvement docs, orientation checklist, and discovery write-up are all in the repo under `gauntlet_docs/`. Thanks."

Show: the live deployed URL one more time.

---

## Dev Notes

### Prerequisites

This story depends on:
- Story 8.4 (Deploy to AWS) — must have a live URL to show
- All improvement docs in `gauntlet_docs/improvements/` — need the before/after numbers

### Improvement Doc Locations

| Category | File |
|----------|------|
| Cat 1 – Type Safety | `gauntlet_docs/improvements/cat1-type-safety.md` |
| Cat 2 – Bundle Size | `gauntlet_docs/improvements/cat2-bundle-size.md` |
| Cat 3 – API Response | `gauntlet_docs/improvements/cat3-api-response-time.md` |
| Cat 4 – DB Efficiency | `gauntlet_docs/improvements/cat4-db-query-efficiency.md` |
| Cat 5 – Test Coverage | `gauntlet_docs/improvements/cat5-test-coverage.md` |
| Cat 6 – Error Handling | `gauntlet_docs/improvements/cat6-error-handling.md` |
| Cat 7 – Accessibility | `gauntlet_docs/improvements/cat7-accessibility.md` |

Note: cat2–cat4 improvement docs may not exist yet if those Epics' after-evidence stories haven't been implemented. Confirm their existence before recording.

### Before Measurements (from `gauntlet_docs/baselines.md`)

Have these numbers ready before recording — fill in the blanks:
- Cat 2: Initial bundle size before / after
- Cat 3: P95 response time before / after
- Cat 4: Query plan before / after
- Cat 1: 875 violations before / [N] violations after

### Recording Tips

- Use 1080p or higher resolution
- Make text large enough to be readable (zoom browser if needed)
- Speak clearly — graders may not re-watch unclear segments
- Practice the walkthrough once before recording

### References

- [Source: gauntlet_docs/baselines.md] — Before measurements
- [Source: gauntlet_docs/improvements/] — After evidence for all 7 categories
- [Source: gauntlet_docs/submission.md] — Where to log the video URL (Story 8.4 creates this file)

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `gauntlet_docs/submission.md` (updated with video URL)
