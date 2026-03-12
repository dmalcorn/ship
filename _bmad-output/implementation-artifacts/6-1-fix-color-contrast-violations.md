# Story 6.1: Fix Color Contrast Violations

Status: ready-for-dev

> **YOLO-safe:** This story can be executed under YOLO permissions. All changes are local file edits (CSS token values and Tailwind class names) with no destructive operations, no deploys, and no interactive prompts. `pnpm test` and visual inspection are the only verification steps needed.

## Story

As a user with low vision or working in a high-ambient-light environment,
I want text and badge elements to meet the WCAG 2.1 AA 4.5:1 contrast minimum,
So that issue count badges and inline action buttons are readable without assistive technology.

## Acceptance Criteria

1. **Given** `bg-muted/30 text-muted` pattern is used for inactive filter tab badges (e.g. `web/src/components/FilterTabs.tsx:45`)
   **When** the contrast of `text-muted` (`#8a8a8a`) against the effective blended background is measured
   **Then** the ratio meets 4.5:1 WCAG AA minimum (current `bg-muted/30` over `#0d0d0d` yields ~`#323232` background → ~4.2:1, which fails)

2. **Given** the fix is applied by either replacing `bg-muted/30` with a solid transparent-safe color or adjusting the text class to `text-foreground`
   **When** `@axe-core/playwright` is run on `/projects`
   **Then** zero `color-contrast` violations are reported (down from 1 Serious, 12 affected nodes at baseline)

3. **Given** `@axe-core/playwright` is run on `/documents/:id` and `/issues`
   **Then** zero `color-contrast` violations are reported on those pages as well

4. **Given** the updated color classes are applied
   **When** all pages using `bg-muted`, `text-muted`, `bg-accent/20`, `bg-border/30`, and related opacity tokens are visually inspected
   **Then** no visual regression is visible (the design remains coherent with the dark-mode palette)

5. **Given** the changes are applied
   **When** `pnpm test` is run
   **Then** all tests pass with no new failures (baseline: 6 pre-existing failures in `auth.test.ts` only)

## Tasks / Subtasks

- [ ] Task 1: Confirm current axe-core baseline (AC: #2)
  - [ ] Run the axe-core scan on `/projects` to confirm 1 Serious `color-contrast` violation with 12 nodes before any changes
  - [ ] Note the exact element CSS classes from the violation output (expected: `bg-muted/30 text-muted` and/or `bg-accent/20 text-accent`)

- [ ] Task 2: Identify all `bg-muted/30 text-muted` instances in the Projects page render path (AC: #1)
  - [ ] Key known instance — `web/src/components/FilterTabs.tsx:45`:
    ```tsx
    // Inactive tab badge:
    : 'bg-muted/30 text-muted'
    ```
  - [ ] Search for any others rendered on the Projects page:
    ```bash
    grep -rn "bg-muted/30" /workspace/web/src/ --include="*.tsx"
    ```
  - [ ] Also check `bg-accent/20 text-accent` in `web/src/components/document-tabs/ProgramProjectsTab.tsx:135`

- [ ] Task 3: Calculate effective contrast for each failing pattern (AC: #1)
  - [ ] `bg-muted/30 text-muted` on dark background:
    - `background: #0d0d0d`, `muted: #8a8a8a`
    - Effective bg = 30% `#8a8a8a` over `#0d0d0d` ≈ `#323232`
    - Contrast of `#8a8a8a` on `#323232` ≈ 4.2:1 — fails 4.5:1
  - [ ] `bg-accent/20 text-accent` on dark background:
    - `accent: #005ea2`, 20% over `#0d0d0d` ≈ `#0a1d2b`
    - `#005ea2` on `#0a1d2b` — both dark, low contrast — verify with contrast checker

- [ ] Task 4: Apply the contrast fix (AC: #2)
  - [ ] **Preferred approach for `bg-muted/30 text-muted`:** Change inactive badge to `bg-border/50 text-foreground` or similar solid-ish alternative. `border: #262626` at 50% over `#0d0d0d` ≈ `#1c1c1c`, and `text-foreground: #f5f5f5` gives ~13:1 contrast — well above 4.5:1.
  - [ ] **Alternative:** Reduce opacity to `bg-muted/10` — blended bg ≈ `#1a1a1a`, and `#8a8a8a` on `#1a1a1a` ≈ 5.5:1 — passes.
  - [ ] **For `bg-accent/20 text-accent`:** Change to `bg-accent text-white` (the accent button pattern already used elsewhere) or `bg-accent/30 text-foreground`.
  - [ ] Use a contrast checker (e.g. webaim.org/resources/contrastchecker) to verify chosen values before committing.
  - [ ] Visually inspect all pages that use `bg-muted`, `text-muted`, `bg-accent/20` to ensure no regression.

- [ ] Task 5: Re-run axe-core scan after fix (AC: #2, #3)
  - [ ] Re-run `@axe-core/playwright` on `/projects` — confirm 0 `color-contrast` violations
  - [ ] Run on `/documents/:id` — confirm 0 violations
  - [ ] Run on `/issues` — confirm 0 violations
  - [ ] Save the "after" violation output for Story 6.4

- [ ] Task 6: Run unit tests (AC: #5)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm only the 6 pre-existing `auth.test.ts` failures remain

## Dev Notes

### Context

The axe-core baseline (captured 2026-03-12) found **1 Serious `color-contrast` violation on `/projects` with 12 affected nodes**. The failing elements use opacity-based background classes like `bg-muted/30` paired with `text-muted`. While the base `muted` token (`#8a8a8a`) has sufficient contrast against pure white or the main dark background `#0d0d0d`, the 30% opacity blend creates an intermediate background (~`#323232`) on which `#8a8a8a` text yields only ~4.2:1 — just below the 4.5:1 WCAG AA threshold.

The fix is CSS-only: replace the opacity-blended pattern with a solid-enough background or change the text color on those elements. No JavaScript or API changes are needed.

### Key Files

| File | Lines | Issue |
|------|-------|-------|
| `web/src/components/FilterTabs.tsx` | ~45 | `bg-muted/30 text-muted` for inactive badge |
| `web/src/components/document-tabs/ProgramProjectsTab.tsx` | ~135 | `bg-accent/20 text-accent` for sprint/project count badge |
| `web/tailwind.config.js` | 11 | `muted: '#8a8a8a'` — already 5.1:1 against white, but not against opacity-blended self |

### Current Tailwind Color Palette (dark mode)

```js
background: '#0d0d0d'   // near-black page background
foreground: '#f5f5f5'   // near-white primary text
muted:      '#8a8a8a'   // medium-grey secondary text (5.1:1 on #0d0d0d, fails on blended bg)
border:     '#262626'   // dark-grey borders
accent:     '#005ea2'   // logo blue
```

### Contrast Math for Common Patterns

| Pattern | Effective Background | Text Color | Ratio | Status |
|---------|---------------------|------------|-------|--------|
| `bg-muted/30 text-muted` | `#323232` | `#8a8a8a` | ~4.2:1 | ❌ FAIL |
| `bg-muted/10 text-muted` | `#1a1a1a` | `#8a8a8a` | ~5.5:1 | ✅ PASS |
| `bg-border/50 text-foreground` | `#1c1c1c` | `#f5f5f5` | ~13:1 | ✅ PASS |
| `bg-accent/20 text-accent` | `#0a1d2b` | `#005ea2` | ~low | ❌ needs check |
| `bg-accent text-white` | `#005ea2` | `#ffffff` | ~5.0:1 | ✅ PASS |

### Scope Warning

Many elements use `text-muted` as secondary/helper text (labels, metadata). The axe failure is specifically where `text-muted` appears **on a non-dark background** (i.e. where opacity creates a lighter-than-base background). Changing all `text-muted` is over-engineering. Fix only the patterns where the effective background is lighter than `#0d0d0d`.

### Commit Message

```
fix(a11y): fix color-contrast violations on badge and filter tab elements
```

### References

- [Source: gauntlet_docs/ShipShape-fix-plan.md#Fix-7-A] — Fix 7-A root cause and approach
- [Source: gauntlet_docs/baselines.md#Cat-7] — Before: 1 Serious violation, 12 nodes on Projects
- [Source: web/src/components/FilterTabs.tsx:45] — Inactive badge: `bg-muted/30 text-muted`
- [Source: web/src/components/document-tabs/ProgramProjectsTab.tsx:135] — `bg-accent/20 text-accent`
- [Source: web/tailwind.config.js] — Color palette definitions

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `web/src/components/FilterTabs.tsx` (modified — update badge background/text classes)
- `web/src/components/document-tabs/ProgramProjectsTab.tsx` (modified if `bg-accent/20` is flagged)
- Potentially other component files where axe scan reports violations
