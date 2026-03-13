# Story 6.3: Replace ConversionDialog with Radix Dialog

Status: done

> **YOLO-safe:** This story can be executed under YOLO permissions. All changes are local file edits (`web/src/components/dialogs/ConversionDialog.tsx`) with no destructive operations, no deploys, and no interactive prompts. `pnpm test` is the only automated verification needed; manual dialog interaction testing is required.

## Story

As a keyboard or screen reader user triggering a document conversion,
I want the conversion dialog to properly trap focus, respond to Escape, and announce itself to assistive technology,
So that I can interact with it without losing navigation context or having focus escape to the background.

## Acceptance Criteria

1. **Given** `web/src/components/dialogs/ConversionDialog.tsx` is refactored to use `@radix-ui/react-dialog`
   **When** the dialog is opened (e.g. from the Promote to Project / Convert to Issue action)
   **Then** focus is automatically moved inside the dialog and trapped there (cannot Tab to background elements)

2. **Given** the dialog is open
   **When** the user presses Escape
   **Then** the dialog closes and focus returns to the triggering element

3. **Given** the dialog is open
   **When** a screen reader announces the dialog
   **Then** `<Dialog.Title>` is present and announced (e.g. "Promote to Project" or "Convert to Issue")

4. **Given** the Radix dialog renders
   **Then** `aria-modal="true"` and scroll lock are applied automatically by Radix (no manual implementation needed)

5. **Given** the refactoring is complete
   **When** the dialog is triggered from the Issues list and Projects list flows
   **Then** all existing conversion actions (convert button, cancel button, backdrop click, spinner state during conversion) work correctly with no functional or visual regression

6. **Given** the changes are applied
   **When** `pnpm test` is run
   **Then** all tests pass with no new failures (baseline: 6 pre-existing failures in `auth.test.ts` only)

## Tasks / Subtasks

- [ ] Task 1: Read the current `ConversionDialog.tsx` implementation (AC: all)
  - [ ] Read `web/src/components/dialogs/ConversionDialog.tsx` (91 lines)
  - [ ] Note the props interface: `isOpen`, `onClose`, `onConvert`, `sourceType`, `title`, `isConverting`
  - [ ] Note current behavior: manual `useEffect` for Escape key, manual backdrop click handler, `role="dialog"` div, no Radix

- [ ] Task 2: Import Radix Dialog and rewrite the component (AC: #1, #2, #3, #4)
  - [ ] Replace the current implementation with Radix Dialog pattern:
    ```tsx
    import * as Dialog from '@radix-ui/react-dialog';
    import { useEffect } from 'react'; // can be removed if no longer needed

    export function ConversionDialog({ isOpen, onClose, onConvert, sourceType, title, isConverting }: ConversionDialogProps) {
      const targetType = sourceType === 'issue' ? 'project' : 'issue';
      const actionLabel = sourceType === 'issue' ? 'Promote to Project' : 'Convert to Issue';

      return (
        <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open && !isConverting) onClose(); }}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
            <Dialog.Content
              className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 shadow-lg"
              aria-describedby={undefined}
              onEscapeKeyDown={() => { if (!isConverting) onClose(); }}
            >
              <Dialog.Title className="mb-4 text-lg font-semibold text-foreground">
                {actionLabel}
              </Dialog.Title>
              {/* ... rest of content ... */}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      );
    }
    ```
  - [ ] Remove the manual `useEffect` Escape key listener — Radix handles this via `onEscapeKeyDown`
  - [ ] Remove the manual `handleBackdropClick` handler — Radix `Dialog.Overlay` handles this, or use `onInteractOutside` on `Dialog.Content` to guard the `isConverting` state
  - [ ] Remove the top-level `if (!isOpen) return null` — Radix handles mount/unmount via `open` prop

- [ ] Task 3: Preserve `isConverting` guard on close (AC: #5)
  - [ ] When `isConverting` is true, close actions (Escape, backdrop click, Cancel button) should be blocked
  - [ ] Use `onEscapeKeyDown={(e) => { if (isConverting) e.preventDefault(); }}` on `Dialog.Content`
  - [ ] Use `onInteractOutside={(e) => { if (isConverting) e.preventDefault(); }}` on `Dialog.Content`
  - [ ] The Cancel button already has `disabled={isConverting}` — keep that

- [ ] Task 4: Preserve visual design (AC: #5)
  - [ ] The dialog inner card (`bg-background p-6 rounded-lg shadow-lg`) should look identical to before
  - [ ] The amber warning box, bullet list, Cancel/Convert buttons, and spinner must be unchanged
  - [ ] Do NOT change any class names on the inner content, only on the wrapper/overlay

- [ ] Task 5: Verify dialog behavior manually (AC: #1, #2, #4, #5)
  - [ ] Open app via `pnpm dev`
  - [ ] Navigate to Issues or Projects list
  - [ ] Trigger a conversion action to open the dialog
  - [ ] Verify: Tab stays within dialog (focus trapped)
  - [ ] Verify: Escape closes dialog (focus returns to trigger)
  - [ ] Verify: Cancel button works, Convert button works, spinner shows during conversion
  - [ ] Verify: Clicking outside dialog closes it (when not converting)

- [ ] Task 6: Run unit tests (AC: #6)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm only the 6 pre-existing `auth.test.ts` failures remain

## Dev Notes

### Context

`ConversionDialog.tsx` is a hand-rolled `role="dialog"` implementation with manual Escape key handling and backdrop click — but **no focus trapping**. Keyboard users can Tab out of the dialog to background elements, which violates WCAG 2.1 4.1.2 (Name, Role, Value) and creates a confusing UX.

`@radix-ui/react-dialog` is **already a project dependency** (`"^1.1.15"` in `web/package.json`). Radix Dialog provides automatic: focus trapping, Escape to close, scroll lock, `aria-modal`, and correct focus restoration on close. This is a drop-in replacement with minimal API surface.

### Current Implementation Summary

```
web/src/components/dialogs/ConversionDialog.tsx (91 lines)

Props:
  isOpen: boolean
  onClose: () => void
  onConvert: () => void
  sourceType: 'issue' | 'project'
  title: string
  isConverting?: boolean

Issues:
  - Manual useEffect for Escape key (lines 14–23) — can be removed
  - Manual backdrop click handler (lines 31–35) — can be removed
  - `role="dialog"` on outer div (line 38) — replace with Radix
  - No focus trap — Tab escapes dialog to background
```

### `onOpenChange` Guard Pattern

Radix calls `onOpenChange(false)` whenever the dialog wants to close (Escape, overlay click). Since `isConverting` should block close:

```tsx
onOpenChange={(open) => {
  if (!open && !isConverting) onClose();
}}
```

And on `Dialog.Content`:
```tsx
onEscapeKeyDown={(e) => { if (isConverting) e.preventDefault(); }}
onInteractOutside={(e) => { if (isConverting) e.preventDefault(); }}
```

### Other Hand-Rolled Dialogs (Out of Scope)

The fix plan identified 3 hand-rolled dialogs total: `ConversionDialog.tsx`, `BacklogPickerModal.tsx`, `MergeProgramDialog.tsx`. This story covers **only `ConversionDialog.tsx`** as the most user-facing. The other two are out of scope for this sprint.

### Commit Message

```
fix(a11y): replace hand-rolled ConversionDialog with Radix Dialog for focus trapping
```

### References

- [Source: gauntlet_docs/ShipShape-fix-plan.md#Fix-7-C] — Fix 7-C root cause and approach
- [Source: web/src/components/dialogs/ConversionDialog.tsx] — Current 91-line implementation to replace
- [Source: web/package.json] — `@radix-ui/react-dialog: ^1.1.15` already installed
- [Source: web/src/components/ActionItemsModal.tsx] — Example of Radix Dialog already in use in this codebase

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (Amelia — Dev Agent)

### Debug Log References

- Confirmed `@radix-ui/react-dialog` was already a project dependency (`^1.1.15` in `web/package.json`)
- Removed manual `useEffect` Escape handler, `handleBackdropClick`, and `if (!isOpen) return null` guard
- `isConverting` guard preserved via `onEscapeKeyDown`, `onInteractOutside`, and `onOpenChange` callbacks
- `pnpm test` result: 6 failed (pre-existing auth.test.ts) | 445 passed ✅

### Completion Notes List

- Full rewrite of `ConversionDialog.tsx` using `@radix-ui/react-dialog`
- All visual design preserved: amber warning box, bullet list, Cancel/Convert buttons, spinner unchanged
- `aria-describedby={undefined}` set on `Dialog.Content` to suppress Radix warning (no description element)
- Focus trapping, Escape handling, `aria-modal`, scroll lock all now automatic via Radix

### File List

- `web/src/components/dialogs/ConversionDialog.tsx` (modified — replaced hand-rolled dialog with Radix Dialog)
