## Overall Risk Summary

| # | Category | Severity | Key Finding |
|---|---|---|---|
| 1 | Type Safety | Low | Both packages compile clean; 878 total violations (technical debt); api dominates with 594 (68%) |
| 2 | Bundle Size | **High** | 2.07 MB / 589 KB gzip monolithic chunk; `ReactQueryDevtools` shipped unconditionally to prod (105 KB gz) |
| 3 | API Response Time | **High** | 501-doc dataset: documents list P50=175ms / P95=439ms at c=50; issues list 152 KB payload with `content` col; no pagination |
| 4 | DB Query Efficiency | Medium | Missing `pg_trgm` index for ILIKE search; per-request session UPDATE on every route; no `statement_timeout` |
| 5 | Test Coverage | Medium | 869 E2E tests; 836 passed / 33 failed (96.2%) in ~38 min; API unit coverage 38.93% stmts / 32.33% branches (`@vitest/coverage-v8` now installed) |
| 6 | Runtime Error Handling | **High** | Stack traces returned to clients on malformed requests; no `unhandledRejection` / `uncaughtException` handlers |
| 7 | Accessibility | Medium | Lighthouse 100/100; axe-core: `color-contrast` failures on 2 pages (15 nodes); missing skip-nav link |
