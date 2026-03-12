# Story 2.4: Add manualChunks for Stable Vendors

Status: ready-for-dev

## Story

As a returning user loading the app after a new deploy,
I want stable vendor libraries served from browser cache,
So that only changed application code is re-downloaded, not unchanged libraries like React and Yjs.

## Acceptance Criteria

1. **Given** `manualChunks` is configured in `web/vite.config.ts` splitting out `vendor-react`, `vendor-yjs`, `vendor-prosemirror`, and `vendor-tiptap`
   **When** `pnpm build` is run
   **Then** the build produces separate named chunk files for each vendor group (confirmed by chunk filenames matching `vendor-react-*`, `vendor-yjs-*`, `vendor-prosemirror-*`, `vendor-tiptap-*` in Vite console output)

2. **Given** vendor chunks are split out
   **When** `pnpm build` is run
   **Then** the main `index-*.js` chunk gzip size is reduced compared to the 699 KB baseline (stable libs extracted means less in the entry chunk)

3. **Given** the production build is complete
   **When** `pnpm build && pnpm preview` is run
   **Then** the app loads correctly with no missing-chunk errors or console errors

4. **Given** the changes are applied
   **When** `pnpm test` is run
   **Then** all tests pass with no new failures

## Tasks / Subtasks

- [ ] Task 1: Add `manualChunks` to `build.rollupOptions` in `web/vite.config.ts` (AC: #1, #2)
  - [ ] Locate the `return { ... }` config object in `web/vite.config.ts` (currently ends at line 95, no `build` key exists)
  - [ ] Add a `build` section with `rollupOptions.output.manualChunks`:

    ```typescript
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
                return 'vendor-react';
              }
              if (id.includes('/yjs/') || id.includes('y-indexeddb') || id.includes('y-websocket')) {
                return 'vendor-yjs';
              }
              if (id.includes('@tiptap/pm') || id.includes('prosemirror')) {
                return 'vendor-prosemirror';
              }
              if (id.includes('@tiptap/')) {
                return 'vendor-tiptap';
              }
            }
          },
        },
      },
    },
    ```

  - [ ] Place the `build` key at the top level of the returned config object, alongside `plugins`, `resolve`, `server`, `preview`

- [ ] Task 2: Verify chunk output (AC: #1, #2)
  - [ ] Run `cd /workspace/web && pnpm build`
  - [ ] Confirm build output lists chunks named: `vendor-react-*.js`, `vendor-yjs-*.js`, `vendor-prosemirror-*.js`, `vendor-tiptap-*.js`
  - [ ] Note the new gzip size of `index-*.js` — expect reduction from 699 KB baseline
  - [ ] Record chunk sizes for Story 2.5 evidence

- [ ] Task 3: Verify preview (AC: #3)
  - [ ] `pnpm build && pnpm preview`
  - [ ] Open browser and navigate through app pages (docs, issues, projects)
  - [ ] Confirm no console errors, no chunk-loading errors in Network tab

- [ ] Task 4: Run unit tests (AC: #4)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm no new failures (baseline: 6 pre-existing failures in `auth.test.ts`)

## Dev Notes

### Context

The current `vite.config.ts` has no `build.rollupOptions` configuration, so Vite uses its default chunking strategy. This results in all stable vendor libraries (React, Yjs, TipTap, ProseMirror) being bundled into the large `index-*.js` chunk (699 KB gzip). When app code changes and a new deploy goes out, users must re-download the entire chunk including unchanged vendor code.

`manualChunks` lets us give stable vendors their own content-addressed filenames. Because their code doesn't change between deploys, browsers serve them from cache — only the smaller app code chunk needs re-downloading.

### Where to Add in vite.config.ts

Current file structure (lines 46–95):
```typescript
return {
  plugins: [...],
  resolve: { alias: {...} },
  server: { ... },
  preview: { ... },
  // ← ADD build: { ... } HERE
};
```

Full updated return block structure:
```typescript
return {
  plugins: [...],
  resolve: { alias: {...} },
  server: { ... },
  preview: { ... },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react';
            }
            if (id.includes('/yjs/') || id.includes('y-indexeddb') || id.includes('y-websocket')) {
              return 'vendor-yjs';
            }
            if (id.includes('@tiptap/pm') || id.includes('prosemirror')) {
              return 'vendor-prosemirror';
            }
            if (id.includes('@tiptap/')) {
              return 'vendor-tiptap';
            }
          }
        },
      },
    },
  },
};
```

### Vendor Group Rationale

| Chunk | Packages | Why grouped |
|---|---|---|
| `vendor-react` | react, react-dom, react-router-dom | Core framework — almost never changes |
| `vendor-yjs` | yjs, y-indexeddb, y-websocket | CRDT/collab stack — stable between app deploys |
| `vendor-prosemirror` | @tiptap/pm, prosemirror-* | Editor core — updates independently of app code |
| `vendor-tiptap` | @tiptap/* | Editor extensions — separate from prosemirror core |

### Trade-offs

- **More HTTP requests on cold load:** Each new chunk is an additional HTTP/2 request. With HTTP/2 multiplexing, this is negligible (4 extra requests).
- **Better cache efficiency on re-deploy:** Users with a warm cache skip all 4 vendor chunks entirely.
- **No functional risk:** `manualChunks` is purely a bundling optimization; it has no effect on runtime behavior.

### TypeScript Note

The `manualChunks` function signature uses `id: string`. TypeScript will require this type annotation when `strict` mode is on. The `vite.config.ts` already imports from `vite` — no new imports are needed.

### Commit Message

```
fix(bundle): add manualChunks to split vendor libs for better cache reuse
```

### References

- [Source: gauntlet_docs/ShipShape-fix-plan.md#Fix-2-C] — Root cause + fix approach
- [Source: web/vite.config.ts] — Current config (no build.rollupOptions)
- [Source: gauntlet_docs/baselines.md#Cat-2] — Before evidence (699 KB gzip index chunk)

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `web/vite.config.ts` (modified — add build.rollupOptions.output.manualChunks)
