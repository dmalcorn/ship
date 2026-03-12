# ShipShape Improvement Initiative

**Goal:** Address all 7 audit categories identified in `gauntlet_docs/ShipShape-fix-plan.md` to meet Phase 2 implementation targets.

Full fix details (root causes, step-by-step fixes, measurement criteria) are in [`gauntlet_docs/ShipShape-fix-plan.md`](gauntlet_docs/ShipShape-fix-plan.md).

---

## 7 Categories at a Glance

| # | Category | Severity | Target |
|---|---|---|---|
| 1 | Type Safety | Low | Reduce 875 violations → ≤659 (≥25%) |
| 2 | Bundle Size | **High** | ≥20% initial-load reduction via code splitting |
| 3 | API Response Time | **High** | ≥20% P95 reduction on ≥2 endpoints |
| 4 | DB Query Efficiency | Medium | ≥20% query count reduction on ≥1 flow |
| 5 | Test Coverage | Medium | Fix 3 flaky tests + add 3 meaningful new tests |
| 6 | Runtime Error Handling | **High** | Fix 3 error handling gaps (≥1 user-facing data loss scenario) |
| 7 | Accessibility | Medium | Fix all Serious violations on 3 priority pages |

---

## Branch Structure

### Infrastructure / Setup
| Branch | Purpose | Status |
|---|---|---|
| `chore/dev-setup` | Devcontainer config, Claude Code CLI, vite host config, gauntlet docs | Done |
| `chore/bmad-method` | Install BMAD Method agent framework | Done |

### Fix Branches (one per category)
| Branch | Category | Status |
|---|---|---|
| `fix/error-handling` | Cat 6: Runtime error handling (global error middleware, crash guards, UUID validation) | ✅ Done — merged to master |
| `fix/bundle-size` | Cat 2: Bundle size (devtools gate, lazy emoji picker, manualChunks, dead dep removal) | 🔄 In progress |
| `fix/api-response-time` | Cat 3: API response time (strip content column, type filter, pagination) | ⏳ Not started — cut from master now |
| `fix/db-query-efficiency` | Cat 4: DB query efficiency (trgm index, session skip-update, statement_timeout) | ⏳ Not started |
| `fix/type-safety` | Cat 1: Type safety (Express augmentation, DB row types, yjsConverter, tsconfig) | ⏳ Not started |
| `fix/test-coverage` | Cat 5: Test coverage (fix rate-limiter contamination in auth.test.ts, fix returnTo assertion, fix E2E flakiness, add 3 critical path tests) | ⏳ Not started — absolute last |
| `fix/accessibility` | Cat 7: Accessibility (color contrast, skip-nav link, Radix dialog) | ⏳ Not started |

### Recommended implementation order

**PRE-SPRINT:** ✅ Complete — all baselines captured in `gauntlet_docs/baselines.md`.

```
Track A (sequential — middleware chain dependency):
  Cat 6 (error-handling) ✅ → MERGE TO MASTER ← DO THIS NEXT → Cat 3 (api-response-time)

Track B (isolated — run parallel with Track A after pre-sprint):
  Cat 4 (db-query-efficiency) → Cat 2 (bundle-size)

After all above merged:
  Cat 1 (type-safety)   ← touches most files, second to last
  Cat 7 (accessibility) ← DOM changes, verify Playwright selectors after
  Cat 5 (test-coverage) ← absolute last, validates all other fixes
```

**⚠️ Next action:** Cut `fix/api-response-time` from `master` (Cat 6 is now merged). Cat 3 and Cat 4/Cat 2 can now all be started in parallel from master.

**Rationale:** Cat 4 and Cat 2 are purely additive/isolated (DB indexes + build config) with zero regression risk, making them the safest fast wins. Cat 1 is last among code changes because it touches the most files. Cat 5 is absolute last so the 3 new meaningful tests can validate behavior introduced by all other fixes.

---

## Evidence Requirements

Each fix branch must include before/after proof:
- **Cat 1**: violation-counting script output
- **Cat 2**: `rollup-plugin-visualizer` gzip sizes
- **Cat 3**: `autocannon -c 50` P95 numbers
- **Cat 4**: `EXPLAIN ANALYZE` + query log counts
- **Cat 5**: `test-results/summary.json` before/after
- **Cat 6**: `curl` output showing JSON error (not HTML stack trace)
- **Cat 7**: `@axe-core/playwright` violation output for 3 pages
