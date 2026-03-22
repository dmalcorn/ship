# Seed Data Analysis

Source: `api/src/db/seed.ts`

## Users & People
- **21 users** (1 dev + 10 base + 10 extended), all with password `admin123`
- **21 person documents** (one per user)
- **Reporting hierarchy**: 3-level (Dev User → 3 managers → ICs)

## Programs (5)

| Prefix | Name | Team |
|--------|------|------|
| SHIP | Ship Core | Dev User, Emma Johnson |
| AUTH | Authentication | Alice Chen, Frank Garcia |
| API | API Platform | Grace Lee, Henry Patel |
| UI | Design System | Carol Williams, David Kim |
| INFRA | Infrastructure | Jack Brown, Iris Nguyen |

## Projects
- **3 per program** = **15 total** (Core Features, Bug Fixes, Performance)

## Sprints
- **7 per program** (current-3 through current+3) = **35 total**
- Sprint +3 for SHIP is intentionally empty (FleetGraph detection target)

## Issues

### Ship Core (SHIP) — 45 hand-crafted issues

| Sprint | Count | States |
|--------|-------|--------|
| Sprint -3 | 4 | All done |
| Sprint -2 | 6 | Mixed done/todo |
| Sprint -1 | 6 | Low completion (done, todo, cancelled) |
| Current sprint | ~15 | Mix of done, in_progress, todo + 3 unassigned + 1 security + 2 duplicates |
| Sprint +1 | 4 + 1 duplicate | todo/backlog |
| Sprint +2 | 2 | todo/backlog |
| Sprint +3 | 0 | Empty (detection target) |
| Backlog (no sprint) | 5 + 1 urgent | backlog + 1 urgent unscheduled regression |

### Other 4 Programs — 17 generic issues each = 68 issues

- Sprint -2: 3 (all done)
- Sprint -1: 2 (all done)
- Current sprint: 6 (mix of done, in_progress, todo)
- Sprint +1: 3 (todo/backlog)
- Backlog: 3 (backlog)

### Bulk Issues — fills to 384 total target

- ~271 bulk-generated issues across all projects
- Rotate through 46 title templates, 4 statuses (todo, in_progress, done, backlog), 4 priorities
- **Important**: Use `properties.status` (not `properties.state`) and have **no program association** — only project associations
- FleetGraph won't see these when filtering by program, but they appear in generic `/api/issues` fetch

## Wiki Documents
- 1 welcome/tutorial + 2 nested children + 4 standalone = **7 wiki docs**

## Standups
- **6 total** (3 per sprint × 2 sprints: current and previous, SHIP Core only)
- Authors: first 3 users (Dev User, Alice Chen, Bob Martinez)
- Staggered by day (today, yesterday, 2 days ago)

## Sprint Reviews
- 1 per past sprint across all programs = **~15 weekly_review docs**

## Weekly Plans & Retros
- ~2 people per sprint × 7 sprints × 5 programs, with deliberate gaps
- Dev User always gets complete data (no gaps)
- Other users: ~14% past plans missing, ~17% past retros missing, ~33% current plans missing
- Roughly **~50-60 plans** and **~40-50 retros**

## Total Documents
- Target: **~547 documents** (matching Cat 3/4 benchmark baseline)

## FleetGraph Detection Targets in Seed

| # | Detection | Category | Severity | Details |
|---|-----------|----------|----------|---------|
| 1 | Unassigned issues | `unassigned` | warning | 3 in current SHIP sprint (Fix pagination edge cases, Update API rate limiting, Fix XSS vulnerability) |
| 2 | Unowned security issue | `security` | critical | "Fix XSS vulnerability in editor input" — unassigned, urgent priority |
| 3 | Unscheduled high-priority | `unscheduled_high_priority` | warning | "Resolve authentication token expiry bug" (urgent) + "Database connection pool exhaustion" (high) |
| 4 | Duplicate issues | `duplicate` | warning | "Implement burndown chart for sprints" vs "Implement burndown chart"; "Add sprint velocity metrics dashboard" vs "Add sprint velocity metrics" |
| 5 | Empty sprint | `empty_sprint` | critical | SHIP sprint +3 has zero issues |
| 6 | Missing sprint | `missing_sprint` | info | Backlog items with no sprint assignment |

## Document Associations

All associations use the `document_associations` junction table (not legacy columns):
- Issues → program, sprint, project
- Sprints → project, program
- Standups → sprint
- Sprint reviews → sprint
- Weekly plans/retros → stored in properties (person_id, project_id, week_number)

## Seed Data Origin

The original repo (initial commit `ed17b87` by Sam Corcos, Dec 30 2025) had a minimal 87-line seed that created only **1 workspace + 1 dev user**. No issues, programs, projects, sprints, or standups.

All current seed data was added incrementally:

| Commit | Date | What was added |
|--------|------|---------------|
| `ed17b87` | 2025-12-30 | 1 workspace + 1 user (original repo) |
| `285c7b3` | later | Programs, projects, sprints, hand-crafted issues with full associations |
| `7713ef0` | later | Weekly plans and retros |
| `13e180b` | later | Realistic plan/retro seed data |
| `c062b8e` | later | reports_to hierarchy, 10 base team members |
| `4e77c74` | 2026-03-13 | **Bulk-generated issues** (no program associations) |
| `0f5f778` | 2026-03-13 | Tuned to 384 issues / 547 docs, added 10 extended users |
| `ae2ee26` | later | FleetGraph detection targets (unassigned, security, etc.) |
| `f8425c9` | later | Duplicate issue titles for FleetGraph detection |

## Missing Association Analysis

### Database Does NOT Enforce Association Completeness

The `document_associations` table (`schema.sql` lines 209-222) only enforces:
- No duplicate associations (`UNIQUE (document_id, related_id, relationship_type)`)
- No self-references (`document_id != related_id`)
- Referential integrity (both IDs must exist in `documents`)

There are **no constraints** requiring:
- An issue to have a program association
- An issue to have a project association
- A sprint to have a program association

### Legacy Column Removal Timeline

The old `NOT NULL` foreign key columns (`sprint_id`, `project_id`, `program_id`) on the `documents` table were removed by migrations and replaced with the flexible junction table:

| Migration | Commit | Date | What was dropped |
|-----------|--------|------|-----------------|
| 027 | `f1a0ba8` | 2026-01-23 | `sprint_id`, `project_id` columns |
| 029 | `b02f2c7` | 2026-01-26 | `program_id` column |
| 029 fix | `231f923` | 2026-01-27 | Self-healing for orphaned program_id values |

The bulk issue seed was added on **2026-03-13** — almost two months after these columns were removed. By that point, there were no `NOT NULL` foreign keys to catch the missing program associations.

### Association Completeness Matrix

| Document Type | program | project | sprint | Notes |
|--------------|---------|---------|--------|-------|
| Issue (hand-crafted SHIP) | ✅ | ✅ | ✅ (if in sprint) | Full associations |
| Issue (hand-crafted other) | ✅ | ✅ | ✅ (if in sprint) | Full associations |
| Issue (bulk-generated) | ❌ | ✅ | ❌ | **Missing program, missing sprint** |
| Project | ✅ | n/a | n/a | Always linked to program |
| Sprint | via project | ✅ | n/a | Linked to project and program |
| Standup | — | — | ✅ | Only sprint association |
| Weekly review | — | — | ✅ | Only sprint association |
| Weekly plan/retro | — | — | — | **No junction table entries** — uses properties JSONB |

### Key Gaps

1. **~271 bulk issues (~70% of all issues)** have no program association. Inferrable via `issue → project → program` transitive lookup since every project has a program association.

2. **~271 bulk issues** use `properties.status` instead of `properties.state`. FleetGraph handles both (`state ?? status`) but the inconsistency exists.

3. **Weekly plans/retros (~100 docs)** store context in `properties` JSONB (`person_id`, `project_id`, `week_number`) rather than in `document_associations`. Not reachable via `getDocumentAssociations()`.

### API Validation Testing (2026-03-22)

Tested issue creation via `POST /api/issues` with varying association levels to determine what the API enforces:

| Test | `belongs_to` payload | Result |
|------|---------------------|--------|
| No associations | `[]` (empty) | **201 Created** — completely orphaned issue accepted |
| Project only | `[{type:"project"}]` | **201 Created** — no program required |
| Project + program | `[{type:"project"},{type:"program"}]` | **201 Created** — correct/complete |
| Bogus UUID | `[{id:"00000000-...",type:"program"}]` | **500 Internal Server Error** — FK constraint crashes, not a clean 400 |

**Conclusions:**
1. The API has **zero validation on association completeness**. Issues can be created with no program, no project, no sprint — silently.
2. The **only protection is FK referential integrity** — referencing a nonexistent document causes a 500 crash instead of a clean 400 validation error.
3. The API **does not auto-infer** program from project. Passing a project without a program creates the same orphan as the bulk seed.
4. This is a **systemic gap, not just a seed problem** — any issue created through the UI or API without explicitly including a program association will be invisible to program-scoped queries.

### Possible Fix Strategies

| Layer | Mechanism | Tradeoff |
|-------|-----------|----------|
| **Seed fix** | Add `program` associations for bulk issues in seed.ts | Fixes immediate problem, doesn't prevent future orphans |
| **API auto-infer** | When issue has project but no program, look up project's program and add it automatically in the POST handler | Prevents future orphans at API level; seed still bypasses API |
| **API validation** | Require program association when creating issues via API | Strictest, but may break UI flows that create issues before assigning to a program |
| **API error handling** | Return 400 (not 500) when `belongs_to` references nonexistent documents | Basic hygiene — FK crash should be caught and returned as validation error |
| **Database trigger** | Enforce required associations per document_type | Couples schema to business rules; hard because issue + association are separate INSERTs |
| **FleetGraph pre-clean** | Detect orphaned issues, infer program from project, surface as finding or fix in-memory | Non-destructive, works with read-only constraint |
