# Analyst Discovery Report — ShipShape Week 4
**Prepared by:** Mary (Business Analyst Agent)
**Date:** 2026-03-11
**Sources:** GFA_Week_4-ShipShape.pdf, ShipShape-fix-plan.md, audit-deliverable.md

---

## Purpose

This document captures the full requirements analysis performed before entering the BMAD multi-agent planning session. It exists so no buried requirements are lost during implementation.

---

## Phase Status

| Phase | Deliverable | Status |
|---|---|---|
| Phase 1 | Audit Report — baseline measurements for all 7 categories | ✅ Complete (audit-deliverable.md) |
| Phase 2 | Measurable improvements across all 7 categories | 🔄 In progress |

---

## 7 Categories: Targets & Baseline Summary

| # | Category | Severity | Baseline | Target |
|---|---|---|---|---|
| 1 | Type Safety | Low | 878 violations (api: 594, web: 284) | ≤659 (≥25% reduction) |
| 2 | Bundle Size | **High** | 2,073 KB raw / 589 KB gzip, single chunk | ≥20% initial-load reduction via code splitting |
| 3 | API Response Time | **High** | P95: documents 439ms, issues 216ms at c=50 | ≥20% P95 reduction on ≥2 endpoints |
| 4 | DB Query Efficiency | Medium | 17 queries on main page load; 2 session queries per request | ≥20% query count reduction on ≥1 flow |
| 5 | Test Coverage | Medium | 869 tests: 836 pass / 33 fail / 5 flaky; 38.93% statement coverage | Fix 3 flaky tests + add 3 meaningful new tests |
| 6 | Runtime Error Handling | **High** | Stack traces leak HTML; no crash guards; no global error middleware | Fix 3 error handling gaps (≥1 user-facing data loss scenario) |
| 7 | Accessibility | Medium | 2 pages with color-contrast failures (15 nodes); no skip-nav; 3 bad dialogs | Fix all Serious violations on 3 priority pages |

---

## Buried / Hidden Requirements Extracted from PDF

These are requirements stated in prose that are easy to overlook when focusing on the code fixes.

### Non-Code Submission Deliverables

| Deliverable | Description | Risk if Missed |
|---|---|---|
| **Improvement Documentation** | For EACH of 7 categories: before measurement + root cause + fix description + after measurement + proof of reproducibility | Automatic scoring penalty — 40% of grade |
| **Discovery Write-up** | 3 things learned in the codebase (new to you), with file path + line range + what it does + how you'd apply it | Required deliverable; omission = incomplete submission |
| **Demo Video (3–5 min)** | Walk through audit findings AND improvements; show before/after measurements; explain reasoning | Required deliverable |
| **AI Cost Analysis** | LLM API costs, total tokens (input/output), number of API calls, coding agent costs + reflection questions | Required deliverable |
| **Deployed Application** | Improved fork running and publicly accessible | Required for submission |
| **Social Post** | Post on X or LinkedIn: what you learned auditing a government codebase, key findings, tag @GauntletAI | Required deliverable |
| **README Setup Guide** | Complete setup guide in the forked repo README | Required deliverable |
| **Clearly Labeled Branches** | All improvements on clearly labeled branches in the GitHub repo | Already planned — branch-per-category strategy in CLAUDE.md |

### Disqualification Rules (Buried in Category Descriptions)

| Category | Rule | Why It Matters |
|---|---|---|
| Cat 1 (Type Safety) | *"Replacing `any` with `unknown` without proper type narrowing is not an improvement. Each fix must include correct, meaningful types that reflect the actual data."* | Superficial fixes will not count toward the 25% target |
| Cat 2 (Bundle Size) | *"Removing functionality to shrink the bundle does not count."* | Cannot delete features to hit the size target |
| Cat 2 (Bundle Size) | Target is an **OR**: 15% total bundle reduction **OR** 20% initial-load reduction via code splitting | The fix plan targets the 20% initial-load path — confirm this is the chosen approach |
| Cat 3 (API Response Time) | Before/after benchmarks must be run *"under identical conditions (same data volume, same concurrency, same hardware)"* | Measurements taken at different data volumes will be rejected |
| All categories | *"A thorough audit with targeted, well-documented improvements beats a scattered attempt to fix everything superficially. Depth over breadth. Proof over promises."* | Focus and documentation quality matter as much as the fixes |

### Grading Rubric (Weighted)

| Criteria | Weight | What Graders Look For |
|---|---|---|
| Measurable improvement | **40%** | Did you hit the target in all 7 categories? Are before/after measurements reproducible? |
| Technical depth | **25%** | Do fixes demonstrate genuine understanding of root cause, or are they surface-level patches? |
| TypeScript quality | **15%** | Is new code well-typed? Are generics, narrowing, utility types used appropriately? |
| Documentation quality | **10%** | Is reasoning clear, concise, and technically sound? Could another engineer follow your logic? |
| Commit discipline | **10%** | Clean git history, descriptive messages, logical separation of changes |

**Gate:** Incomplete audit = automatic fail regardless of implementation quality.
**Gate:** Project completion is required for Austin admission.

---

## Testing Risk Analysis

This is the highest-complexity cross-cutting concern in the implementation plan.

### Current Test State
- **869 total tests**: 836 pass / 33 fail / 5 flaky
- **33 failures concentrated in**: file-attachment specs (13) and timing-sensitive specs
- **E2E suite runtime**: ~38 minutes (4 parallel workers)
- **API unit test coverage**: 38.93% statements, 32.33% branches

### How Other Fixes Interact with the Test Suite

| Fix Category | Test Interaction Risk |
|---|---|
| Cat 6 — Error Handling | **High.** Adds global Express error middleware. Tests that currently receive HTML stack traces (or raw errors) will now receive structured JSON. Any E2E test asserting on error response shape may flip. |
| Cat 3 — API Response Time | **Medium.** Stripping `content` column from issues list and adding pagination changes payload shape. E2E tests that read issue content from the list endpoint will break. |
| Cat 2 — Bundle Size | **Low-Medium.** Lazy-loading components (emoji picker) could affect E2E tests that interact with those components if timing isn't handled. |
| Cat 4 — DB Query Efficiency | **Low.** Adding indexes and session query optimization shouldn't affect test results, but statement_timeout could cause flaky tests under load. |
| Cat 1 — Type Safety | **Low.** Type-only changes; runtime behavior unchanged. Tests should be unaffected. |
| Cat 7 — Accessibility | **Low.** DOM changes (skip-nav, aria attributes) could affect Playwright selectors that rely on exact DOM structure. |

### Key Questions for Test Architect
1. Which of the 33 failing tests are pre-existing vs. caused by a previous fix attempt?
2. What is the strategy for the file-attachment test cluster (13 failures)?
3. Should the 3 "new meaningful tests" be unit tests, integration tests, or E2E tests?
4. How do we protect the test suite from regressions introduced by Cat 6 error handling changes?
5. Can we establish a test baseline snapshot before any fixes are applied?

---

## Recommended Implementation Order (with Rationale)

From the fix plan, confirmed and annotated:

```
Day 1: Cat 6 (Error Handling)   → Fixes critical safety issue; establishes JSON error contract
Day 1: Cat 2 (Bundle Size)      → High severity, isolated to build config; low regression risk
Day 2: Cat 3 (API Response)     → High severity, but payload changes need test review first
Day 2: Cat 4 (DB Query)         → Medium severity, mostly additive (indexes)
Day 3: Cat 1 (Type Safety)      → Touches most files; do last among code changes
Day 4: Cat 7 (Accessibility)    → DOM changes; verify Playwright selectors after
Day 5: Cat 5 (Test Coverage)    → Fix flaky tests last so they cover behavior from all fixes
```

**Critical dependency:** Cat 5 (tests) must come LAST because the 3 new meaningful tests should validate behavior introduced by the other 6 fixes.

---

## Open Questions for Multi-Agent Planning Session

1. **Scope confirmation**: Is the demo video scripted and who produces it?
2. **AI cost tracking**: Has token usage been tracked from the start? What's the current running cost?
3. **Deployment**: Is the deployed application already running, or does it need to be set up?
4. **Discovery Write-up**: Have 3 new discoveries been identified and documented?
5. **Test baseline**: Should we create a test snapshot (pass/fail report) before any fixes land?
6. **Cat 2 choice**: Confirm 20% initial-load path (code splitting) vs. 15% total bundle path.
7. **Reproducibility fixtures**: How do we guarantee identical benchmark conditions for Cat 3 before/after?

---

## Evidence Requirements Per Category (from fix plan)

| Category | Required Proof |
|---|---|
| Cat 1 | violation-counting script output (before + after) |
| Cat 2 | rollup-plugin-visualizer gzip sizes (before + after) |
| Cat 3 | autocannon -c 50 P95 numbers (before + after, same data volume) |
| Cat 4 | EXPLAIN ANALYZE output + query log counts (before + after) |
| Cat 5 | test-results/summary.json (before + after) |
| Cat 6 | curl output showing JSON error response (not HTML stack trace) |
| Cat 7 | @axe-core/playwright violation output for 3 pages (before + after) |

---

*This document should be referenced throughout the multi-agent planning session and updated as decisions are made.*
