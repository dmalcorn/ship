# Web Design Requirements — Accessibility

**Source:** U.S. Web Design System (USWDS) accessibility guidelines, WCAG 2.1 AA, and Section 508 of the Rehabilitation Act (29 U.S.C. § 794d)

**Context:** Requirements below are scoped to the accessibility issues identified in the ShipShape audit (`audit-deliverable.md`, Category 7). The Treasury Design & Development Standards (TDDS) GitHub repo (`US-Department-of-the-Treasury/tdds`) does not contain embedded accessibility documentation; it references USWDS design assets and links to an internal InVision DSM for UX guidance. All requirements below derive from WCAG 2.1 AA (the standard TDDS and USWDS comply with) and Section 508, which applies to all U.S. federal government software.

---

## Issue 1: Color Contrast Failures

**Audit finding:** Two element types fail WCAG 2.1 AA 4.5:1 minimum contrast ratio, affecting 15 nodes across 2 pages:
- Issue-count badges: `bg-muted/30` background with `text-muted` foreground (projects page, 12 nodes)
- Inline action buttons: `bg-border` background with `text-muted` foreground (issue detail, 3 nodes)

### Applicable Requirements

| Standard | Criterion | Requirement |
|---|---|---|
| WCAG 2.1 AA | **1.4.3 Contrast (Minimum)** | Text and images of text must have a contrast ratio of at least **4.5:1** against the background. |
| WCAG 2.1 AA | **1.4.3 Contrast (Minimum)** | Large text (18pt / 14pt bold) may use a reduced ratio of **3:1**. Badge and button text is not large text. |
| WCAG 2.1 AA | **1.4.11 Non-text Contrast** | UI components (buttons, form controls, focus indicators) must have a contrast ratio of at least **3:1** against adjacent colors. |
| Section 508 | **§1194.21(j)** | Color shall not be used as the only visual means of conveying information, indicating an action, prompting a response, or distinguishing a visual element. |
| USWDS | Color token system | Use USWDS semantic color tokens (e.g., `ink`, `base-dark`) for text on interactive components. Never use opacity modifiers (`/30`) on background tokens that underlie text — opacity compositing invalidates static contrast checks. |

### Fix Guidance
- Replace `bg-muted/30` + `text-muted` badge pattern with a USWDS-compliant token pair that meets 4.5:1. Adjust `--muted` or `--border` CSS variable values in the Tailwind theme to bring all derived usages into compliance simultaneously.
- Verify contrast with a tool such as the [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) after any theme token change.

---

## Issue 2: Missing Skip-Navigation Link

**Audit finding:** `tabIndex={-1}` on `<main>` in `App.tsx:541` sets up a skip-link target, but no `<a href="#main-content">Skip to main content</a>` (or equivalent) link exists anywhere in the component tree.

### Applicable Requirements

| Standard | Criterion | Requirement |
|---|---|---|
| WCAG 2.1 AA | **2.4.1 Bypass Blocks** | A mechanism must be available to bypass blocks of content that are repeated on multiple Web pages. |
| Section 508 | **§1194.22(o)** | A method shall be provided that permits users to skip repetitive navigation links. |
| USWDS | Skip navigation pattern | Provide a visually hidden `<a>` as the first focusable element in the page. It becomes visible on keyboard focus and links to the `id` of the main content container. See [USWDS Skip navigation guidance](https://designsystem.digital.gov/components/skipnav/). |

### Fix Guidance
- Add a `<a href="#main-content" class="sr-only focus:not-sr-only ...">Skip to main content</a>` as the first focusable element inside `<body>`.
- Ensure `<main id="main-content" tabIndex={-1}>` is present (the `tabIndex={-1}` already exists — the skip link just needs to be added).
- The link should be visually hidden until focused (CSS `sr-only` / `clip`), then visible on `:focus`.

---

## Issue 3: Unlabeled Icon-Only Buttons

**Audit finding:** Of 267 `<button>` elements in `web/src`, approximately 200 lack an explicit `aria-label`. A subset are icon-only (close/dismiss in modals, TipTap toolbar formatting actions, panel toggle buttons) with no visible text and no `aria-label`.

### Applicable Requirements

| Standard | Criterion | Requirement |
|---|---|---|
| WCAG 2.1 AA | **4.1.2 Name, Role, Value** | All UI components must have a name that can be determined programmatically. Icon-only buttons have no accessible name without `aria-label` or `aria-labelledby`. |
| WCAG 2.1 AA | **2.4.6 Headings and Labels** | Labels should describe the topic or purpose of the control. |
| Section 508 | **§1194.21(d)** | Sufficient information about a user interface element including identity, operation, and state shall be available to assistive technology. |
| USWDS | Button component | Every button must have a visible label or an `aria-label` / `aria-labelledby` that provides an equivalent text description for screen readers. SVG icons inside buttons must have `aria-hidden="true"` to prevent icon path text from being read aloud. |

### Fix Guidance
- For icon-only buttons, add `aria-label="[action description]"` (e.g., `aria-label="Close dialog"`, `aria-label="Bold"`, `aria-label="Toggle sidebar"`).
- Add `aria-hidden="true"` to the SVG child so the icon is not double-announced.
- Prioritize: modal dismiss buttons, TipTap editor toolbar, panel toggle controls.

---

## Issue 4: Custom Modal Dialogs Bypassing Radix Focus Management

**Audit finding:** Three dialogs — `ConversionDialog.tsx`, `BacklogPickerModal.tsx`, `MergeProgramDialog.tsx` — use `role="dialog"` with hand-rolled logic rather than Radix `<Dialog.Root>`, risking gaps in focus trapping, escape-key handling, scroll lock, and `aria-modal`.

### Applicable Requirements

| Standard | Criterion | Requirement |
|---|---|---|
| WCAG 2.1 AA | **2.1.1 Keyboard** | All functionality must be operable through a keyboard interface. Modal dialogs must trap focus within the dialog while open. |
| WCAG 2.1 AA | **2.1.2 No Keyboard Trap** | If keyboard focus is moved into a component, focus must be movable away using standard keys (Escape to close dialogs). |
| WCAG 2.1 AA | **4.1.2 Name, Role, Value** | Dialogs must expose `role="dialog"`, `aria-modal="true"`, and an accessible name via `aria-labelledby` pointing to the dialog's heading. |
| Section 508 | **§1194.21(a)** | Application elements shall be keyboard operable when the application is designed to use a keyboard. |
| USWDS | Modal component | Use the USWDS Modal component pattern or a tested accessible dialog library (e.g., Radix UI `<Dialog>`). Hand-rolled dialogs must implement: focus trap on open, focus return to trigger on close, Escape key dismissal, `aria-modal="true"`, `aria-labelledby`, scroll lock on body. |

### Fix Guidance
- Migrate `ConversionDialog.tsx`, `BacklogPickerModal.tsx`, and `MergeProgramDialog.tsx` to use Radix `<Dialog.Root>` / `<Dialog.Content>` (already a project dependency).
- If migration is deferred, audit each hand-rolled dialog against the checklist above and add any missing behaviors.

---

## Issue 5: Hand-Rolled Focus Trap in CommandPalette

**Audit finding:** `CommandPalette.tsx` implements a focus trap via hardcoded `querySelector` string, duplicating Radix's built-in capability and risking breakage if component children change.

### Applicable Requirements

Same as Issue 4: **WCAG 2.1 AA 2.1.1**, **2.1.2**, **4.1.2**; **Section 508 §1194.21(a)**.

### Fix Guidance
- The project already depends on `cmdk` (a Radix-based accessible command-palette primitive). Delegate focus management to `cmdk`'s built-in behavior rather than maintaining a custom `querySelector` trap.

---

## Summary: WCAG 2.1 AA Criteria Implicated

| WCAG Criterion | Issue |
|---|---|
| 1.4.3 Contrast (Minimum) | Color contrast failures on badges and buttons |
| 1.4.11 Non-text Contrast | Button border/background contrast |
| 2.1.1 Keyboard | Focus trap in custom dialogs and CommandPalette |
| 2.1.2 No Keyboard Trap | Escape-key handling in hand-rolled modals |
| 2.4.1 Bypass Blocks | Missing skip-navigation link |
| 4.1.2 Name, Role, Value | Icon-only buttons without aria-label; custom dialog ARIA attributes |

## Section 508 Provisions Implicated

| Provision | Issue |
|---|---|
| §1194.21(a) — Keyboard operation | Custom modal focus traps |
| §1194.21(d) — Assistive technology information | Unlabeled icon-only buttons |
| §1194.21(j) — Color not sole conveyor | Color contrast |
| §1194.22(o) — Skip repetitive navigation | Missing skip link |

---

## Reference Standards

- [WCAG 2.1 specification](https://www.w3.org/TR/WCAG21/)
- [Section 508 standards (access-board.gov)](https://www.access-board.gov/ict/)
- [USWDS Accessibility guidance](https://designsystem.digital.gov/documentation/accessibility/)
- [USWDS Skip navigation component](https://designsystem.digital.gov/components/skipnav/)
- [USWDS Modal component](https://designsystem.digital.gov/components/modal/)
- [Treasury Design & Development Standards (TDDS)](https://github.com/US-Department-of-the-Treasury/tdds) — design assets; references USWDS for accessibility compliance
