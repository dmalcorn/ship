# Story 2.3: Lazy-Load Emoji Picker

Status: ready-for-dev

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

- [ ] Task 1: Convert `EmojiPicker` import to use `React.lazy()` in `web/src/components/EmojiPicker.tsx` (AC: #1, #2, #3)
  - [ ] Remove the top-level static import: `import EmojiPicker, { Theme, EmojiClickData } from 'emoji-picker-react';`
  - [ ] Add `import React, { lazy, Suspense, useState, useRef, useEffect } from 'react';` (or keep existing hooks import and add `lazy, Suspense`)
  - [ ] Add a lazy import at module level (outside the component):
    ```tsx
    const EmojiPickerLazy = lazy(() => import('emoji-picker-react').then(m => ({ default: m.default })));
    ```
  - [ ] Keep the `EmojiClickData` and `Theme` type imports — use a type-only import:
    ```tsx
    import type { EmojiClickData, Theme as EmojiTheme } from 'emoji-picker-react';
    ```
    (Rename to `EmojiTheme` if `Theme` conflicts with other imports, or keep as `Theme` if no conflict)
  - [ ] Wrap the `<EmojiPicker .../>` usage inside `{isOpen && (...)}` block with `<Suspense fallback={null}>`:
    ```tsx
    <Suspense fallback={null}>
      <EmojiPickerLazy
        onEmojiClick={handleEmojiClick}
        skinTonesDisabled={true}
        theme={Theme.DARK}
        height={350}
        width={300}
        searchPlaceholder="Search emoji..."
        previewConfig={{ showPreview: false }}
      />
    </Suspense>
    ```
  - [ ] Ensure `Theme.DARK` still works — if `Theme` enum is not available from the type-only import at runtime, use the string literal `"dark"` as the `theme` prop value instead

- [ ] Task 2: Verify chunk splitting (AC: #1)
  - [ ] Run `cd /workspace/web && pnpm build`
  - [ ] Look for a chunk named like `emoji-*` or containing `EmojiPicker` in the build output list
  - [ ] Confirm `index-*.js` gzip is smaller than baseline 699 KB

- [ ] Task 3: Manual smoke test (AC: #2, #3)
  - [ ] Start `pnpm preview` and open the app
  - [ ] Navigate to a document with the emoji picker feature
  - [ ] Open browser DevTools → Network tab, filter by JS
  - [ ] Confirm no emoji chunk loaded on initial page load
  - [ ] Click the emoji button → confirm picker appears and chunk loads on demand
  - [ ] Select an emoji → confirm it is applied correctly

- [ ] Task 4: Verify preview build (AC: #4)
  - [ ] `pnpm build && pnpm preview` — confirm no console errors

- [ ] Task 5: Run unit tests (AC: #5)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm no new failures

## Dev Notes

### Context

`emoji-picker-react` (~72 KB gzip) is imported at the top of `web/src/components/EmojiPicker.tsx` (line 2) and therefore included in the main `index-*.js` bundle for every user on every page load, even those who never interact with document icons. Lazy loading splits it into a separate chunk fetched only on first open.

### Current File Structure

`web/src/components/EmojiPicker.tsx`:
- Line 2: `import EmojiPicker, { Theme, EmojiClickData } from 'emoji-picker-react';` ← **this is the target**
- The component is `EmojiPickerPopover` — renders a button that toggles a popover containing the picker
- The picker is already conditionally rendered inside `{isOpen && (...)}` at line 64 — the `<Suspense>` wrapper goes inside this conditional

### Handling the Theme Enum

`Theme` from `emoji-picker-react` is an enum (value `"dark"`, `"light"`, `"auto"`). With a type-only import you cannot use `Theme.DARK` at runtime. Two options:

**Option A (recommended — simpler):** Replace `theme={Theme.DARK}` with `theme={"dark" as const}` or just `theme="dark"` — the prop type accepts the string literal directly.

**Option B:** Use a dynamic import pattern that makes `Theme` available:
```tsx
const EmojiPickerLazy = lazy(() => import('emoji-picker-react'));
```
Then use `theme="dark"` directly in the JSX.

Option A is simpler and avoids any runtime enum dependency.

### Suspense Boundary Placement

The `<Suspense fallback={null}>` should wrap only the picker, not the entire popover structure. Place it immediately around `<EmojiPickerLazy .../>`. The "Remove emoji" button above the picker can remain outside Suspense since it has no lazy dependency.

```tsx
{isOpen && (
  <div className="absolute z-50 mt-2 left-0">
    <div className="rounded-lg border border-border bg-background shadow-lg overflow-hidden">
      {value && (
        <button type="button" onClick={handleClear} ...>
          Remove emoji
        </button>
      )}
      <Suspense fallback={null}>
        <EmojiPickerLazy
          onEmojiClick={handleEmojiClick}
          skinTonesDisabled={true}
          theme="dark"
          height={350}
          width={300}
          searchPlaceholder="Search emoji..."
          previewConfig={{ showPreview: false }}
        />
      </Suspense>
    </div>
  </div>
)}
```

### File Location

- **Primary file:** `web/src/components/EmojiPicker.tsx`
- No other files need changes — `EmojiPickerPopover` is imported by other components normally; the lazy boundary is internal to this component

### Commit Message

```
fix(bundle): lazy-load emoji-picker-react to reduce initial bundle
```

### References

- [Source: gauntlet_docs/ShipShape-fix-plan.md#Fix-2-B] — Root cause + fix approach
- [Source: web/src/components/EmojiPicker.tsx] — Component with static import to convert
- [Source: gauntlet_docs/baselines.md#Cat-2] — Before evidence (699 KB gzip index chunk)

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `web/src/components/EmojiPicker.tsx` (modified — convert static import to React.lazy with Suspense)
