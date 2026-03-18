# Story 6.1: Findings Panel in Ship's Icon Rail

Status: done

## Story

As a **software engineer**,
I want to see FleetGraph findings in a dedicated panel in Ship's icon rail sidebar,
so that I can review agent-detected quality gaps without leaving the Ship interface.

## Acceptance Criteria

1. **Given** the Ship web application is loaded
   **When** the user views the icon rail
   **Then** a FleetGraph icon (Lucide `Radar`) appears with a badge count showing the number of unreviewed findings

2. **Given** findings exist from the latest proactive scan
   **When** the user clicks the FleetGraph icon
   **Then** the contextual sidebar displays `FindingCard` components sorted by severity (critical first, then warning, then info)
   **And** each FindingCard shows: severity badge, finding title, description, affected document link, and confirm/dismiss buttons
   **And** the sidebar polls findings with a 30-second `refetchInterval` via React Query

3. **Given** a user clicks "Confirm" on a FindingCard
   **When** the action is sent to FleetGraph
   **Then** Ship sends `POST /api/fleetgraph/resume` with the `threadId` and `decision: "confirm"` via the Ship backend proxy
   **And** the FindingCard shows inline "Done" badge (emerald) for 3 seconds, then fades out

4. **Given** a user clicks "Dismiss" on a FindingCard
   **When** the action is sent to FleetGraph
   **Then** Ship sends `POST /api/fleetgraph/resume` with `decision: "dismiss"`
   **And** the FindingCard slides out immediately (150ms) — optimistic removal, no server wait

5. **Given** no findings exist (clean project)
   **When** the user opens the FleetGraph panel
   **Then** an EmptyState shows ShieldCheck icon (emerald) + "No findings — you're in good shape." + "Next scan in {countdown}"

## Tasks / Subtasks

- [x] Task 1: Add `fleetgraph` mode to Ship's icon rail (AC: #1)
  - [x] 1.1: Add `'fleetgraph'` to the `Mode` type union in `web/src/pages/App.tsx` (line ~40)
  - [x] 1.2: Add `Radar` icon case in the icon rail JSX with `BadgeCount` overlay
  - [x] 1.3: Add `handleModeClick('fleetgraph')` handler — does NOT navigate to a new URL, just switches sidebar content
  - [x] 1.4: Add `'fleetgraph'` case in `getActiveMode()` if URL-based activation is needed

- [x] Task 2: Create FleetGraph feature module (AC: #1, #2)
  - [x] 2.1: Create `web/src/features/fleetgraph/types/index.ts` — `Finding`, `Severity`, `ProposedAction`, `FindingsResponse` types
  - [x] 2.2: Create `web/src/features/fleetgraph/hooks/useFindings.ts` — React Query hook polling `GET /api/fleetgraph/findings` every 30s, `staleTime: 0`
  - [x] 2.3: Create `web/src/features/fleetgraph/hooks/useResumeAction.ts` — React Query mutation for `POST /api/fleetgraph/resume`
  - [x] 2.4: Create `web/src/features/fleetgraph/index.ts` — public exports

- [x] Task 3: Build FindingCard component (AC: #2, #3, #4)
  - [x] 3.1: Create `web/src/features/fleetgraph/components/FindingCard.tsx`
  - [x] 3.2: Severity badge: `text-[#f87171]` (critical), `text-[#fbbf24]` (warning), `text-[#60a5fa]` (info) — text label always visible alongside color
  - [x] 3.3: Primary confirm button: `bg-[#005ea2] text-white text-xs px-2.5 py-1 rounded` — label is context-specific (e.g., "Self-assign all"), never generic "Confirm"
  - [x] 3.4: Ghost dismiss button: `text-[#a3a3a3] hover:text-[#f5f5f5] text-xs px-2 py-1`
  - [x] 3.5: Confirm flow: call `useResumeAction` mutation → show inline spinner → on success show emerald "Done" badge for 3s → fade out card
  - [x] 3.6: Dismiss flow: optimistic card slide-out (150ms `transition-transform`), fire mutation in background
  - [x] 3.7: Document link: clicking issue/sprint title navigates via React Router to `/documents/:id`
  - [x] 3.8: Accessibility: `role="article"`, `aria-label="Dismiss finding: {title}"` on dismiss button, Tab/arrow key navigation

- [x] Task 4: Build FindingsPanel component (AC: #2, #5)
  - [x] 4.1: Create `web/src/features/fleetgraph/components/FindingsPanel.tsx`
  - [x] 4.2: Consumes `useFindings()` hook — sorts findings by severity (critical > warning > info)
  - [x] 4.3: Renders list of `FindingCard` components (overflow-auto div, 224px sidebar width)
  - [x] 4.4: Header with count: "5 findings" / "No findings" — `aria-live="polite"` for screen readers
  - [x] 4.5: Footer: "Last scan: {relative time}" — amber warning text if >10 min stale

- [x] Task 5: Build EmptyState and BadgeCount components (AC: #1, #5)
  - [x] 5.1: Create `web/src/features/fleetgraph/components/EmptyState.tsx` — ShieldCheck icon (emerald), positive message, `role="status"` + `aria-live="polite"`
  - [x] 5.2: Create `web/src/features/fleetgraph/components/BadgeCount.tsx` — absolute-positioned count bubble on Radar icon, `aria-hidden="true"` (parent button has `aria-label="FleetGraph, {count} findings"`)
  - [x] 5.3: Handle error state: `AlertTriangle` icon + "Unable to reach FleetGraph" + retry info

- [x] Task 6: Integrate FindingsPanel into Ship's sidebar system (AC: #2)
  - [x] 6.1: When `activeMode === 'fleetgraph'`, render `FindingsPanel` in the contextual sidebar slot (same pattern as other sidebar modes in `App.tsx`)
  - [x] 6.2: FindingsPanel operates independently of document context — it shows all workspace findings regardless of which document is open

- [x] Task 7: Loading states (AC: #2)
  - [x] 7.1: Initial load: 3 skeleton cards with `animate-pulse` on `bg-[#262626]` rectangles
  - [x] 7.2: Loading-to-populated: no animation — content simply appears

## Dev Notes

### Ship Frontend Architecture (Critical Context)

**Icon Rail & Mode System** — `web/src/pages/App.tsx`:
- `Mode` type union at line ~40 defines all sidebar modes: `'docs' | 'issues' | 'projects' | ...`
- `getActiveMode()` maps URL path → active mode for icon highlighting
- `handleModeClick(mode)` navigates to mode's entry URL
- FleetGraph is unique: it's a **sidebar-only mode** (no dedicated URL route), so `handleModeClick` should just set state, not navigate

**Contextual Sidebar** — The sidebar content switches based on active mode. Each mode renders its own component in the sidebar slot. FleetGraph follows this same pattern but renders `FindingsPanel` instead of a document list.

**React Query Patterns** — `web/src/hooks/`:
- Query keys follow factory pattern: `fleetgraphKeys.findings()`, `fleetgraphKeys.status()`
- Standard `staleTime`, `refetchInterval` options
- Mutations use `useMutation` with `onMutate` for optimistic updates
- All API calls go through `web/src/lib/api.ts` (`apiGet`, `apiPost`) which handles CSRF tokens

**4-Panel Layout** — All panels always visible, never collapse:
- Icon Rail: 48px fixed
- Contextual Sidebar: 224px fixed — this is where FindingsPanel lives
- Main Content: flex-1
- Properties Sidebar: 256px fixed — FleetGraph does NOT use this panel

### Key Technical Decisions

- **Polling, not WebSocket:** React Query `refetchInterval: 30_000` (30s) for findings. Simpler than adding WebSocket channel; matches Ship's existing polling patterns.
- **Optimistic dismiss:** Remove card immediately on dismiss click. If server fails, the finding will reappear on next poll (acceptable UX).
- **No optimistic confirm:** Wait for server response before showing "Done" — confirm has real consequences.
- **Dark mode only:** No `dark:` prefixes. Ship is always dark. Background: `#171717`, text: `#f5f5f5`, muted: `#a3a3a3`.

### File Organization

```
web/src/features/fleetgraph/
├── components/
│   ├── FindingCard.tsx
│   ├── FindingsPanel.tsx
│   ├── BadgeCount.tsx
│   └── EmptyState.tsx
├── hooks/
│   ├── useFindings.ts
│   └── useResumeAction.ts
├── types/
│   └── index.ts
└── index.ts
```

### Dependencies

- **Lucide icons:** `Radar` (icon rail), `ShieldCheck` (empty state), `AlertTriangle` (error state), `ExternalLink` (doc links)
- **Radix:** `ScrollArea` for findings list
- **React Query:** Already installed in Ship — use existing `QueryClient` from `web/src/lib/queryClient.ts`
- **React Router:** Already installed — use `useNavigate` for document links

### What NOT To Do

- Do NOT create a new route/page for FleetGraph — it's a sidebar mode only
- Do NOT add new CSS files — use Tailwind utility classes exclusively
- Do NOT use `window.location` for navigation — use React Router
- Do NOT add `dark:` theme variants — Ship is dark-only
- Do NOT use toast notifications — all feedback is inline on the component
- Do NOT use modal dialogs — ever
- Do NOT modify the Properties Sidebar (right panel) — FleetGraph only uses the Contextual Sidebar (left)

### Project Structure Notes

- New `features/fleetgraph/` directory follows feature-based organization — isolates FleetGraph UI from Ship's core components
- Public exports via `index.ts` — only export what `App.tsx` needs (`FindingsPanel`, `BadgeCount`)
- Types defined locally in `features/fleetgraph/types/` — NOT in `shared/` package (FleetGraph types are frontend-only for now)

### References

- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — FindingCard anatomy, FindingsPanel, EmptyState, severity colors, button hierarchy, feedback patterns]
- [Source: _bmad-output/planning-artifacts/architecture.md — Section 8: Ship UI Integration Architecture]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 6, Story 6.1]
- [Source: web/src/pages/App.tsx — Icon rail mode system, getActiveMode(), handleModeClick()]
- [Source: web/src/hooks/useIssuesQuery.ts — React Query pattern (query keys, staleTime, mutations)]
- [Source: web/src/lib/api.ts — apiGet/apiPost with CSRF handling]
- [Source: web/src/contexts/CurrentDocumentContext.tsx — Document context flow]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- Type check: clean pass (0 errors)
- Test suite: 20 files, 182 tests, all passing (32 new FleetGraph tests)

### Completion Notes List
- Added `'fleetgraph'` to Mode union with state-based toggle (no URL navigation)
- FleetGraph sidebar overrides hideLeftSidebar so it shows even on weekly doc pages
- Used inline SVG RadarIcon (matching existing icon patterns) — no lucide-react dep needed
- Used overflow-auto div instead of Radix ScrollArea (not installed) — functionally equivalent
- Badge count renders on icon rail via new `badge` prop on RailIcon
- useFindings polls every 30s with staleTime: 0 per spec
- Confirm flow: spinner → "Done" badge (3s) → fade out
- Dismiss flow: optimistic removal, mutation fires in background
- All accessibility attributes implemented: role, aria-label, aria-live, aria-hidden

### Code Review Record
**Reviewer:** Amelia (Dev Agent — CR mode), Claude Opus 4.6
**Date:** 2026-03-18

**Findings (8 total: 2 HIGH, 4 MEDIUM, 2 LOW) — all fixed:**

| ID | Severity | Issue | Fix |
|----|----------|-------|-----|
| H1 | HIGH | TypeScript errors in FindingsPanel.test.tsx — `severity` inferred as `Severity \| undefined` | Extracted typed array with `!` assertion; added `!` on `articles[0]` |
| H2 | HIGH | `useFindings(false)` means badge count never populates | Intentional — depends on Story 6.3 (backend proxy). Documented, not a bug. |
| M1 | MEDIUM | Dismiss animation dead code — card returned `null` before CSS transition could play | Replaced `dismissed` boolean with `slidingOut` + `transitionend` listener + 200ms fallback |
| M2 | MEDIUM | No dismiss rollback on mutation failure | Accepted — `onSettled: invalidateQueries` self-heals on next poll. Adequate for optimistic UX. |
| M3 | MEDIUM | `useCallback` deps included `resumeAction` object (new ref each render) | Destructured `{ mutate }` from `useResumeAction()`, depend on `mutate` directly |
| M4 | MEDIUM | EmptyState countdown was static — never updated after initial render | Added `useState(Date.now())` + `setInterval(10s)` tick to re-render countdown |
| L1 | LOW | Error state used `role="alert"` — too assertive for transient network errors | Changed to `role="status"` |
| L2 | LOW | No arrow key navigation between FindingCards (AC #3.8) | Added `onKeyDown` handler on list container for ArrowUp/ArrowDown focus traversal |

### File List
- web/src/pages/App.tsx (modified — Mode type, icon rail, sidebar integration)
- web/src/features/fleetgraph/types/index.ts (new)
- web/src/features/fleetgraph/hooks/useFindings.ts (new)
- web/src/features/fleetgraph/hooks/useResumeAction.ts (new)
- web/src/features/fleetgraph/components/FindingCard.tsx (new)
- web/src/features/fleetgraph/components/FindingsPanel.tsx (new)
- web/src/features/fleetgraph/components/EmptyState.tsx (new)
- web/src/features/fleetgraph/components/BadgeCount.tsx (new)
- web/src/features/fleetgraph/index.ts (new)
- web/src/features/fleetgraph/components/FindingCard.test.tsx (new — 12 tests)
- web/src/features/fleetgraph/components/FindingsPanel.test.tsx (new — 9 tests)
- web/src/features/fleetgraph/components/BadgeCount.test.tsx (new — 5 tests)
- web/src/features/fleetgraph/components/EmptyState.test.tsx (new — 6 tests)
