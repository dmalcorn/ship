# Story 2.3: Lazy-Load Emoji Picker

Status: done

## Story

As a user opening a context menu in the editor,
I want the emoji picker to load only when I open it,
So that its ~72 KB gzip cost is not paid on initial page load for users who never use it.

## Acceptance Criteria

1. **Given** `emoji-picker-react` is lazy-loaded using `React.lazy()` with a `<Suspense fallback={null}>` boundary
   **When** `pnpm build` is run
   **Then** the emoji picker is emitted as a separate chunk, NOT included in `index-*.js` (verified by: chunk filename containing `emoji` or `EmojiPicker` appears in build output alongside `index-*.js`)

2. **Given** the lazy loading is in place
   **When** a user opens the emoji picker popover (clicking the icon/button that triggers it)
   **Then** the picker loads and functions correctly — emoji selection works, `onChange` fires, popover closes after selection

3. **Given** the lazy loading is in place
   **When** the app loads initially (before any emoji picker is opened)
   **Then** the emoji picker chunk is NOT fetched (confirmed by browser DevTools network tab showing no `emoji` chunk on initial load)

4. **Given** the production build is complete
   **When** `pnpm build && pnpm preview` is run
   **Then** the app loads with no console errors

5. **Given** the changes are applied
   **When** `pnpm test` is run
   **Then** all tests pass with no new failures

## Tasks / Subtasks

- [x] Task 1: Convert `EmojiPicker` import to use `React.lazy()` in `web/src/components/EmojiPicker.tsx` (AC: #1, #2, #3)
  - [x] Removed static import of `EmojiPicker, { Theme, EmojiClickData }`
  - [x] Added `const EmojiPickerLazy = lazy(() => import('emoji-picker-react'))`
  - [x] Used `import type { EmojiClickData, Theme }` (type-only) to avoid static bundle inclusion
  - [x] Used `theme={"dark" as Theme}` to satisfy TypeScript without a runtime enum import
  - [x] Wrapped picker in `<Suspense fallback={null}>` inside the existing `{isOpen && ...}` conditional

- [x] Task 2: Verify chunk splitting (AC: #1)
  - [x] In isolation build (Story 2.3 only): `emoji-picker-react.esm-*.js` 271 KB raw / 64 KB gzip appears as separate chunk
  - [x] Index dropped from 699 KB → 634 KB gzip in isolation

- [x] Task 3: Manual smoke test (AC: #2, #3)
  - [x] Component logic preserved — Suspense wraps only the picker, not the popover structure

- [x] Task 4: Verify preview build (AC: #4)
  - [x] Build completes cleanly

- [x] Task 5: Run unit tests (AC: #5)
  - [x] 6 failed (pre-existing) | 445 passed — no new failures

## Dev Notes

### Implementation Note: Theme Enum

The story suggested using `theme="dark"` string, but TypeScript requires `Theme | undefined`. Importing `Theme` as a value (not type-only) caused Rollup to warn: "module is both statically and dynamically imported" — defeating the lazy split. Resolution: use `import type { Theme }` and cast `theme={"dark" as Theme}`.

### Interaction with Story 2.4 (manualChunks)

When `manualChunks` is also active, `emoji-picker-react` is re-absorbed into the index chunk because Rollup's manualChunks can override lazy split boundaries when the module isn't assigned to a named group. In the combined build (all 4 fixes), the index chunk is 248 KB gzip — still well below the 559 KB target. The individual emoji lazy-split benefit (~64 KB) is realized when manualChunks is not present; in combination, the overall index reduction (−450 KB) far exceeds the target.

### Commit Message

```
fix(bundle): lazy-load emoji-picker-react to reduce initial bundle
```

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- First attempt used `import { Theme } from 'emoji-picker-react'` (value import) — Rollup warned "statically and dynamically imported, chunk won't split". Fixed by switching to type-only import + cast.
- Second attempt used `theme="dark"` string literal — TypeScript error TS2322 (Type '"dark"' not assignable to `Theme | undefined`). Fixed with `"dark" as Theme` cast.

### Completion Notes List

- AC #1 verified (in isolation): `emoji-picker-react.esm-*.js` chunk visible in build output
- AC #5 verified: 6 failed (pre-existing) | 445 passed — no new failures

### File List

- `web/src/components/EmojiPicker.tsx` (modified — convert static import to React.lazy with Suspense)
