# Story 4.1: Add pg_trgm GIN Index for ILIKE Search

Status: ready-for-dev

## Story

As a user searching for documents by title,
I want the search query to use an index instead of a full table scan,
So that search stays fast as the workspace grows and a guaranteed O(N) regression is structurally prevented.

## Acceptance Criteria

1. **Given** a new migration file `api/src/db/migrations/038_add_trgm_search_index.sql` is created following the `NNN_description.sql` naming convention
   **When** `pnpm db:migrate` runs the migration
   **Then** the `pg_trgm` extension exists and `idx_documents_title_trgm` GIN index exists on `documents.title` using `gin_trgm_ops`

2. **Given** the migration has been applied
   **When** `EXPLAIN ANALYZE` is run on `SELECT id, title FROM documents WHERE title ILIKE '%feature%'`
   **Then** the plan shows `Bitmap Index Scan` using `idx_documents_title_trgm` — not `Seq Scan` as in the baseline

3. **Given** the migration has been applied
   **When** `GET /api/search/mentions?q=feature` is called
   **Then** search results are unchanged — same documents returned for the same query

4. **Given** the migration has run
   **When** `SELECT * FROM schema_migrations WHERE migration_name LIKE '%038%'` is queried
   **Then** the row exists, confirming the migration was tracked in `schema_migrations`

5. **Given** the changes are applied
   **When** `pnpm test` is run
   **Then** all tests pass with no new failures (baseline: 6 pre-existing failures in `auth.test.ts` only)

## Tasks / Subtasks

- [ ] Task 1: Confirm next migration number (AC: #1)
  - [ ] Run: `ls api/src/db/migrations/ | sort | tail -3` — confirm last file is `037_week_dashboard_model.sql`
  - [ ] Confirm next available number is `038`

- [ ] Task 2: Check migration runner for transaction wrapping (AC: #1)
  - [ ] Open `api/src/db/migrate.ts` and check whether each migration file is wrapped in `BEGIN`/`COMMIT`
  - [ ] If yes → use `CREATE INDEX IF NOT EXISTS` (without `CONCURRENTLY`) — see Dev Notes
  - [ ] If no → `CONCURRENTLY` is safe and preferred (avoids table lock)

- [ ] Task 3: Create migration file (AC: #1)
  - [ ] Create `api/src/db/migrations/038_add_trgm_search_index.sql`
  - [ ] If migration runner uses transactions (likely):
    ```sql
    -- Enable pg_trgm extension for GIN-accelerated ILIKE search
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

    -- GIN index converts ILIKE '%term%' from O(N) seq scan to O(1) index scan
    CREATE INDEX IF NOT EXISTS idx_documents_title_trgm
      ON documents USING GIN (title gin_trgm_ops);
    ```
  - [ ] If migration runner does NOT use transactions:
    ```sql
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_title_trgm
      ON documents USING GIN (title gin_trgm_ops);
    ```

- [ ] Task 4: Run the migration (AC: #1, #4)
  - [ ] `pnpm db:migrate`
  - [ ] Confirm output shows `038_add_trgm_search_index` applied with no errors
  - [ ] Verify extension: `psql $DATABASE_URL -c "\dx pg_trgm"`
  - [ ] Verify index: `psql $DATABASE_URL -c "\di idx_documents_title_trgm"`

- [ ] Task 5: Capture EXPLAIN ANALYZE output (AC: #2)
  - [ ] Run:
    ```bash
    psql $DATABASE_URL -c "
    EXPLAIN ANALYZE
    SELECT id, title, document_type
    FROM documents
    WHERE title ILIKE '%feature%'
    LIMIT 20;"
    ```
  - [ ] Confirm plan shows `Bitmap Index Scan on idx_documents_title_trgm` (not `Seq Scan`)
  - [ ] Save full output — this becomes the "after" evidence for Story 4.4

- [ ] Task 6: Verify search results unchanged (AC: #3)
  - [ ] Start API and make authenticated request to `GET /api/search/mentions?q=feature`
  - [ ] Confirm same documents and count are returned as before the migration

- [ ] Task 7: Run unit tests (AC: #5)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm only the 6 pre-existing `auth.test.ts` failures remain
  - [ ] ⚠️ Running `pnpm test` truncates the DB via `setup.ts`. Run `pnpm db:seed` afterward to restore data for any further testing in this session

## Dev Notes

### Context

The `GET /api/search/mentions` endpoint in `api/src/routes/search.ts` uses `ILIKE '%term%'` to search document titles at two query sites (lines ~41 and ~55). As of the baseline (`gauntlet_docs/baselines.md`), this performs a full sequential scan confirmed by `EXPLAIN ANALYZE`:

```
Seq Scan on documents  (cost=0.00..46.72 rows=5 width=73) (actual time=0.021..0.377 rows=11 loops=1)
  Filter: (title ~~* '%feature%'::text ...)
  Rows Removed by Filter: 536
Execution Time: 0.425 ms
```

At 547 rows the wall time is fast, but this is O(N). The `pg_trgm` GIN index converts it to an index scan. This fix contributes to the Cat 4 evidence as the structural improvement (query plan change); the query count reduction (17→≤13) is delivered by Story 4.2.

### CONCURRENTLY Restriction

PostgreSQL does not allow `CREATE INDEX CONCURRENTLY` inside a transaction block — it will error with:
```
ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block
```
Check `api/src/db/migrate.ts` before deciding which form to use.

### File Locations

- **Primary file (create):** `api/src/db/migrations/038_add_trgm_search_index.sql`
- **ILIKE query sites:** `api/src/routes/search.ts:41` and `api/src/routes/search.ts:55`
- **Migration runner:** `api/src/db/migrate.ts`

### Baseline Numbers (for Story 4.4 comparison)

From `gauntlet_docs/baselines.md`:
- Query plan: `Seq Scan on documents`, execution time 0.425 ms, 536 rows removed by filter
- Target: `Bitmap Index Scan on idx_documents_title_trgm`

### Commit Message

```
fix(db): add pg_trgm GIN index for ILIKE title search
```

### References

- [Source: gauntlet_docs/ShipShape-fix-plan.md] — Fix 4-A, root cause and migration SQL
- [Source: gauntlet_docs/baselines.md#Cat-4] — Before EXPLAIN ANALYZE output
- [Source: api/src/routes/search.ts:41,55] — ILIKE query sites being indexed
- [Source: api/src/db/migrations/037_week_dashboard_model.sql] — Prior migration (naming reference)

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `api/src/db/migrations/038_add_trgm_search_index.sql` (created)
