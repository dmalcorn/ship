# Story 7.4: New Test — Mention Search Returns Correct Results

Status: ready-for-dev

> **YOLO mode:** This story is authorized for full YOLO permissions. All changes are local file edits with no destructive operations, no deploys, and no interactive prompts. Proceed autonomously through all tasks without pausing for confirmation.

## Story

As a developer guarding against search regressions,
I want an E2E test that verifies mention search finds documents by partial title match,
So that a schema change or index removal cannot silently break search without the suite catching it.

## Acceptance Criteria

1. **Given** a new test is added to `e2e/mentions.spec.ts` (preferred) or `e2e/search.spec.ts`
   **When** the test searches for a known partial title string using the mention search (`@` trigger in the editor)
   **Then** the expected document appears in results

2. **Given** the test is added
   **Then** it includes exactly this comment:
   ```
   // Risk mitigated: ILIKE search had no index at baseline; regressions here could silently
   // return wrong results after a schema change. This test pins the search contract.
   ```

3. **Given** the test is written
   **When** the search endpoint is broken or returns empty results for a valid query
   **Then** the test fails (verified by temporarily breaking the behaviour)

4. **Given** the test is added
   **When** `pnpm test` (unit tests) is run
   **Then** all unit tests pass with no new failures

5. **Given** the test is added and the E2E suite is run
   **Then** the new test passes green on the first run

## Tasks / Subtasks

- [ ] Task 1: Understand the current mention search implementation (AC: #1)
  - [ ] Read `e2e/mentions.spec.ts` — understand the existing `@` trigger test structure and what elements it asserts
  - [ ] Find the search endpoint: look in `api/src/routes/` for a route handling mention/search queries (likely `search.ts` or inside `documents.ts`)
  - [ ] Confirm the partial title match is done via ILIKE in SQL (Epic 4 added a `pg_trgm` GIN index on `documents.title` — this test validates that the index didn't break the underlying search)

- [ ] Task 2: Identify a known seed document title to use for the partial match (AC: #1)
  - [ ] Run `pnpm db:seed` or check `api/src/db/seeds/` for document titles that are in the seeded data
  - [ ] Choose a title where a partial match (e.g. first 5 characters) is unique enough to return 1–3 results
  - [ ] Alternatively, create a document with a known title in the test itself and search for it

- [ ] Task 3: Write the mention search test (AC: #1, #2)
  - [ ] Add the test to `e2e/mentions.spec.ts` — the file already has `beforeEach` login and a `createNewDocument` helper:
    ```ts
    test('mention search returns documents matching partial title', async ({ page }) => {
      // Risk mitigated: ILIKE search had no index at baseline; regressions here could silently
      // return wrong results after a schema change. This test pins the search contract.

      // Create a document with a unique, known title to search for
      await page.goto('/docs');
      const newButton = page.getByRole('button', { name: 'New Document', exact: true });
      await expect(newButton).toBeVisible({ timeout: 5000 });
      await newButton.click();
      await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 10000 });

      const titleInput = page.getByPlaceholder('Untitled');
      await expect(titleInput).toBeVisible({ timeout: 5000 });
      const uniqueTitle = `MentionSearchTarget-${Date.now()}`;
      await titleInput.fill(uniqueTitle);

      // Wait for the title to be saved (PATCH request)
      await page.waitForResponse(
        resp => resp.url().includes('/api/documents/') && resp.request().method() === 'PATCH',
        { timeout: 5000 }
      );

      // Navigate to a different document to type @ in its editor
      await page.goto('/docs');
      await page.getByRole('button', { name: 'New Document', exact: true }).click();
      await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 10000 });
      await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 5000 });

      // Type @ followed by partial title to trigger mention search
      const editor = page.locator('.ProseMirror');
      await editor.click();
      const partialTitle = uniqueTitle.substring(0, 13); // "MentionSearch" — unique prefix
      await page.keyboard.type(`@${partialTitle}`);

      // Mention popup should appear with the target document
      // The popup uses a tippy/listbox pattern
      const mentionPopup = page.locator('[data-tippy-root], [role="listbox"]').first();
      await expect(mentionPopup).toBeVisible({ timeout: 5000 });

      // The created document should appear in the results
      await expect(mentionPopup).toContainText(uniqueTitle, { timeout: 5000 });
    });
    ```
  - [ ] **Note:** If creating a new document for the test is unreliable (e.g. title save race), use a known seed document title instead. Check seeded titles in `api/src/db/seeds/`.

- [ ] Task 4: Verify the test fails when search is broken (AC: #3)
  - [ ] Temporarily comment out the mention search API handler or return an empty array
  - [ ] Run the test — it must fail
  - [ ] Restore the handler
  - [ ] Run the test — it must pass

- [ ] Task 5: Run the E2E test (AC: #5)
  - [ ] Use `/e2e-test-runner` to run `e2e/mentions.spec.ts` specifically
  - [ ] New test must be green

- [ ] Task 6: Run unit tests (AC: #4)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm 0 failures

## Dev Notes

### Context

At baseline, the ILIKE search on `documents.title` had **no index**, making it a sequential scan on 501 documents. Epic 4 (Story 4.1) added a `pg_trgm` GIN index on `documents.title` to accelerate this. This test validates the **contract** (correct results returned) not performance. If the index is dropped or the query is rewritten without ILIKE, this test will catch the regression.

The mention search is triggered in the TipTap editor by typing `@`. The editor extension calls an API endpoint (likely `GET /api/documents?search=<partial>` or a dedicated `GET /api/search?q=<term>&type=document`) and renders results in a Tippy popover.

### Key Files to Read Before Writing

| File | Why |
|------|-----|
| `e2e/mentions.spec.ts` | Existing `@` trigger tests and popup assertion patterns |
| `api/src/routes/search.ts` or `documents.ts` | Search endpoint — confirm the ILIKE query |
| `e2e/fixtures/isolated-env.ts` | Seed data — find a reliable known document title |

### Tippy / Listbox Pattern

The existing `mentions.spec.ts` already tests `@` popup appearance:
```ts
// Check for any tippy elements
const tippyElements = await page.locator('[data-tippy-root]').count();
// Check for any popup-like elements
const popups = await page.locator('.tippy-box, .tippy-content, [role="listbox"]').count();
```
The new test should use the same selector pattern but assert specific content:
```ts
await expect(page.locator('[data-tippy-root], [role="listbox"]').first()).toContainText(partialTitle);
```

### Using Seed Data Instead of Creating Documents

If the test is simpler with seed data, check for a consistently-seeded document title:
```bash
grep -rn "title\|name" /workspace/api/src/db/seeds/ | head -20
```
Choose a title where the first 6+ characters are unique within the seed set, and use that as the search term.

### Commit Message

```
test(e2e): add mention search partial-title result test (Cat 5)
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-7.4] — Story background
- [Source: gauntlet_docs/ShipShape-fix-plan.md#Category-5] — Cat 5 requirements
- [Source: e2e/mentions.spec.ts] — Existing mention tests to extend
- [Source: _bmad-output/implementation-artifacts/4-1-add-pg-trgm-gin-index-for-ilike-search.md] — Epic 4 index that this test validates

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `e2e/mentions.spec.ts` (modified — new partial title mention search test added)
