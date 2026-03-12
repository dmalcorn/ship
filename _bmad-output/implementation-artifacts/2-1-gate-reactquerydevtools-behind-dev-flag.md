# Story 2.1: Gate ReactQueryDevtools Behind DEV Flag

Status: ready-for-dev

## Story

As a government user on a VPN or CAC workstation,
I want the app to not ship developer debugging tools to production,
So that my initial page load is smaller and parses faster on constrained hardware.

## Acceptance Criteria

1. **Given** `ReactQueryDevtools` is conditionally rendered only when `import.meta.env.DEV` is `true` in `web/src/main.tsx`
   **When** `pnpm build` is run (production build)
   **Then** `@tanstack/react-query-devtools` does NOT appear in the production bundle (confirmed by `grep -r 'react-query-devtools' web/dist/` returning zero results)

2. **Given** the DEV flag gate is in place
   **When** running `pnpm dev` (development mode)
   **Then** the devtools panel is still available and functional (visible at bottom of browser window)

3. **Given** the production build is complete
   **When** `pnpm build && pnpm preview` is run
   **Then** the app loads correctly with no console errors

4. **Given** the changes are applied
   **When** `pnpm test` is run
   **Then** all tests pass with no new failures

## Tasks / Subtasks

- [ ] Task 1: Wrap `ReactQueryDevtools` in a DEV-only conditional in `web/src/main.tsx` (AC: #1, #2)
  - [ ] Locate line 265 in `web/src/main.tsx`: `<ReactQueryDevtools initialIsOpen={false} />`
  - [ ] Replace the unconditional render with a conditional: `{import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}`
  - [ ] Keep the existing `import { ReactQueryDevtools } from '@tanstack/react-query-devtools'` at the top — Vite's tree-shaking with the `DEV` constant will dead-code-eliminate the entire module from production builds

- [ ] Task 2: Verify bundle exclusion (AC: #1)
  - [ ] Run `cd /workspace/web && pnpm build`
  - [ ] Run `grep -r 'react-query-devtools\|ReactQueryDevtools' web/dist/` — expect zero matches
  - [ ] Note the new gzip size of `dist/assets/index-*.js` for comparison with baseline (699 KB)

- [ ] Task 3: Verify dev mode still works (AC: #2)
  - [ ] Confirm devtools panel appears at bottom of app when running `pnpm dev`

- [ ] Task 4: Verify preview build (AC: #3)
  - [ ] Run `pnpm build && pnpm preview`
  - [ ] Open browser — confirm no console errors

- [ ] Task 5: Run unit tests (AC: #4)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm no new failures (baseline: 6 pre-existing failures in `auth.test.ts`)

## Dev Notes

### Context

`ReactQueryDevtools` is a developer panel that exposes all React Query cache contents — it has no value in production and ships ~105 KB gzip. Because it is currently rendered unconditionally at line 265 of `main.tsx`, Vite cannot tree-shake it from production bundles. Wrapping it in `import.meta.env.DEV` is a compile-time boolean constant that Vite replaces with `false` in production builds, enabling full dead-code elimination of the entire devtools package.

### Exact Implementation

In `web/src/main.tsx`, change **line 265** from:

```tsx
<ReactQueryDevtools initialIsOpen={false} />
```

to:

```tsx
{import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
```

That's the entire change. The import at line 6 stays — Vite handles the elimination at build time.

### File Locations

- **Primary file:** `web/src/main.tsx`
- **Change location:** Line 265, inside `<PersistQueryClientProvider>`, after `<BrowserRouter>...</BrowserRouter>` block
- **Current structure at change site:**

```tsx
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistQueryClientProvider ...>
      <ToastProvider>
        <MutationErrorToast />
        <BrowserRouter>
          <ReviewQueueProvider>
            <App />
          </ReviewQueueProvider>
        </BrowserRouter>
      </ToastProvider>
      <ReactQueryDevtools initialIsOpen={false} />  {/* ← change this line */}
    </PersistQueryClientProvider>
  </React.StrictMode>
);
```

### Bundle Baseline

From `gauntlet_docs/baselines.md`:
- Index chunk gzip (before): **699 KB** (measured; audit says 589 KB — methodology difference)
- DevTools confirmed in bundle: ✅ YES
- Expected savings from this story alone: ~105 KB gzip

### Commit Message

```
fix(bundle): gate ReactQueryDevtools behind import.meta.env.DEV
```

### References

- [Source: gauntlet_docs/ShipShape-fix-plan.md#Fix-2-A] — Root cause + fix approach
- [Source: web/src/main.tsx#L6,L265] — Import and usage locations
- [Source: gauntlet_docs/baselines.md#Cat-2] — Before evidence (699 KB gzip, devtools confirmed)

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `web/src/main.tsx` (modified — wrap ReactQueryDevtools in DEV flag conditional)
