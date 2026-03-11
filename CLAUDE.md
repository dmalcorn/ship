# ShipShape Improvement Initiative

**Goal:** Address all 7 audit categories identified in `gauntlet_docs/ShipShape-fix-plan.md` to meet Phase 2 implementation targets.

Full fix details (root causes, step-by-step fixes, measurement criteria) are in [`gauntlet_docs/ShipShape-fix-plan.md`](gauntlet_docs/ShipShape-fix-plan.md).

---

## 7 Categories at a Glance

| # | Category | Severity | Target |
|---|---|---|---|
| 1 | Type Safety | Low | Reduce 878 violations → ≤659 (≥25%) |
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
| Branch | Category |
|---|---|
| `fix/error-handling` | Cat 6: Runtime error handling (global error middleware, crash guards, UUID validation) |
| `fix/bundle-size` | Cat 2: Bundle size (devtools gate, lazy emoji picker, manualChunks, dead dep removal) |
| `fix/api-response-time` | Cat 3: API response time (strip content column, type filter, pagination) |
| `fix/db-query-efficiency` | Cat 4: DB query efficiency (trgm index, session skip-update, statement_timeout) |
| `fix/type-safety` | Cat 1: Type safety (Express augmentation, DB row types, yjsConverter, tsconfig) |
| `fix/test-coverage` | Cat 5: Test coverage (fix attachment flakiness, add 3 critical path tests) |
| `fix/accessibility` | Cat 7: Accessibility (color contrast, skip-nav link, Radix dialog) |

### Recommended implementation order
Cat 6 → Cat 2 → Cat 3 → Cat 4 → Cat 1 → Cat 7 → Cat 5

High-severity categories first (lowest risk of cascading breakage). Type safety last because it touches the most files. Tests last so they can cover behavior added in other categories.

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
