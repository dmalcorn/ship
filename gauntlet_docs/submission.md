# ShipShape Week 4 — Submission Checklist

**Deadline:** Sunday 2026-03-15 11:59 PM CT

---

## Deployed Application

- **Frontend:** https://ship.awsdev.treasury.gov *(update after Story 8.4 deploy)*
- **API health check:** http://ship-api-prod.eba-xsaqsg9h.us-east-1.elasticbeanstalk.com/health *(update after Story 8.4 deploy)*
- **Swagger UI:** http://ship-api-prod.eba-xsaqsg9h.us-east-1.elasticbeanstalk.com/api/docs

---

## Fix Branches (for reviewer inspection)

| Branch | Categories | Status |
|--------|-----------|--------|
| `fix/error-handling` | Cat 6: Runtime error handling | ✅ Merged to master |
| `fix/bundle-size` | Cat 2: Bundle size | Needs merge |
| `fix/api-response-time` | Cat 3: API response time | Needs merge |
| `fix/db-query-efficiency` | Cat 4: DB query efficiency | Needs merge |
| `fix/type-safety` | Cat 1: Type safety | Needs merge |
| `fix/test-coverage` | Cat 5: Test coverage | Needs merge |
| `fix/accessibility` | Cat 7: Accessibility | Needs merge |

---

## Deliverables

| Deliverable | File | Status |
|-------------|------|--------|
| Discovery write-up (3 discoveries) | `gauntlet_docs/discovery-writeup.md` | ✅ Done |
| Improvement doc — Cat 1 type safety | `gauntlet_docs/improvements/cat1-type-safety.md` | ✅ Done |
| Improvement doc — Cat 2 bundle size | `gauntlet_docs/improvements/cat2-bundle-size.md` | *(check exists)* |
| Improvement doc — Cat 3 API response | `gauntlet_docs/improvements/cat3-api-response-time.md` | *(check exists)* |
| Improvement doc — Cat 4 DB efficiency | `gauntlet_docs/improvements/cat4-db-query-efficiency.md` | *(check exists)* |
| Improvement doc — Cat 5 test coverage | `gauntlet_docs/improvements/cat5-test-coverage.md` | ✅ Done |
| Improvement doc — Cat 6 error handling | `gauntlet_docs/improvements/cat6-error-handling.md` | ✅ Done |
| Improvement doc — Cat 7 accessibility | `gauntlet_docs/improvements/cat7-accessibility.md` | ✅ Done |
| Orientation checklist | `gauntlet_docs/ShipShape_codebase_orientation_checklist.md` | ✅ Done (committed) |
| AI cost analysis | `gauntlet_docs/ai-cost-analysis.md` | ✅ Done (fill in token counts) |
| README setup guide | `README.md` | ✅ Done |
| Demo video | [URL — add after Story 8.5] | Pending |
| Social post | [URL — add after Story 8.7] | Pending |

---

## Demo Video

- **Platform:** [YouTube/Loom/other]
- **URL:** [add after recording]
- **Recorded:** [date]

---

## Social Post

- **Platform:** [X/LinkedIn]
- **URL:** [add after publishing]
- **Published:** [date]

---

## Pre-Submission Checks

- [ ] All 4 fix branches pushed to GitHub fork (for reviewer inspection)
- [ ] `fix/bundle-size`, `fix/test-coverage`, `fix/accessibility` merged to `master`
- [ ] Application deployed and health check returns 200
- [ ] All improvement docs exist in `gauntlet_docs/improvements/`
- [ ] AI cost analysis token counts filled in from Anthropic console
- [ ] Demo video recorded and URL added above
- [ ] Social post published and URL added above
