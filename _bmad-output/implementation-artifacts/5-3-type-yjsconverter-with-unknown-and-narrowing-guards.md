# Story 5.3: Type yjsConverter with unknown + Narrowing Guards

Status: ready-for-dev

> **YOLO-safe:** This story can be executed under YOLO permissions. All changes are local file edits — no destructive operations, no deploys, no interactive prompts. `pnpm type-check` and `pnpm test` are the only verification commands needed. Collaboration functionality is covered by unit tests.

## Story

As a developer maintaining the Yjs collaboration layer,
I want structural `any` in `yjsConverter.ts` replaced with explicit TipTap node types and `unknown` with narrowing guards,
So that the converter expresses its actual intent rather than silencing the type system with broad annotations.

## Acceptance Criteria

1. **Given** `api/src/utils/yjsConverter.ts` is updated to use explicit interfaces for TipTap node shapes where the structure is known
   **When** `pnpm type-check` is run
   **Then** zero new compiler errors are introduced

2. **Given** the typed interfaces are in place
   **When** `any` annotations without an accompanying narrowing check are counted in the file
   **Then** the number of `any` usages is reduced by ≥8 compared to the baseline of ~13 in this file

3. **Given** the changes are applied
   **When** `pnpm test` is run
   **Then** all tests pass with no new failures — collaboration functionality unchanged (baseline: 6 pre-existing failures in `auth.test.ts` only)

4. **Given** the changes are applied
   **When** the violation-counting script is run (see Story 5.1 AC #4)
   **Then** `api.any1` is further reduced compared to post-Story-5.2 state (this story targets ≥8 of the remaining `: any` violations in `api/`)

## Tasks / Subtasks

- [ ] Task 1: Audit all `any` usages in `yjsConverter.ts` (AC: #2)
  - [ ] Run: `grep -n ": any\|any\[\]\|as any" api/src/utils/yjsConverter.ts`
  - [ ] Expected output will show ~13 locations across these patterns:
    - `inheritedMarks: any[]` (line 24)
    - `): any[]` return types on helper functions (lines 24, 35, 115)
    - `const mark: any` (line 29)
    - `const result: any[]` (line 35)
    - `const content: any[]` (lines 63, 116)
    - `const node: any` (lines 79, 130)
    - `content: any` parameter on `jsonToYjs` (line 164)
    - `children: any[]` parameter on `jsonToYjsChildren` (line 203)
    - `const attrs: Record<string, any>` (lines 175, 210)
    - `): any | null` return on `loadContentFromYjsState` (line 235)
  - [ ] Categorize each: (a) genuinely-shaped TipTap node → use interface, (b) mixed-type container → use union, (c) truly polymorphic → use `unknown` with guard

- [ ] Task 2: Define TipTap node interfaces (AC: #1, #2)
  - [ ] Add these interfaces at the top of `yjsConverter.ts` (after imports):
    ```typescript
    // TipTap JSON node shapes — matches ProseMirror schema used by TipTap
    interface TipTapMark {
      type: string;
      attrs?: Record<string, unknown>;
    }

    interface TipTapTextNode {
      type: 'text';
      text: string;
      marks?: TipTapMark[];
    }

    interface TipTapElementNode {
      type: string;
      attrs?: Record<string, unknown>;
      content?: TipTapNode[];
    }

    type TipTapNode = TipTapTextNode | TipTapElementNode;

    interface TipTapDoc {
      type: 'doc';
      content: TipTapNode[];
    }
    ```

- [ ] Task 3: Update `extractTextWithMarks` (lines 24–56) (AC: #1, #2)
  - [ ] Change signature: `function extractTextWithMarks(element: Y.XmlElement, inheritedMarks: TipTapMark[] = []): TipTapTextNode[]`
  - [ ] Change `const mark: any` → `const mark: TipTapMark`
  - [ ] Change `const result: any[]` → `const result: TipTapTextNode[]`
  - [ ] The push calls already produce text-node-shaped objects — TypeScript will verify this

- [ ] Task 4: Update `yjsToJson` (lines 62–110) (AC: #1, #2)
  - [ ] Change return type: `export function yjsToJson(fragment: Y.XmlFragment): TipTapDoc`
  - [ ] Change `const content: any[]` → `const content: TipTapNode[]`
  - [ ] Change `const node: any` → `const node: TipTapElementNode`
  - [ ] The return `{ type: 'doc', content }` already matches `TipTapDoc`

- [ ] Task 5: Update `yjsElementToJson` (lines 115–158) (AC: #1, #2)
  - [ ] Change signature: `function yjsElementToJson(element: Y.XmlElement): TipTapNode[]`
  - [ ] Change `const content: any[]` → `const content: TipTapNode[]`
  - [ ] Change `const node: any` → `const node: TipTapElementNode`

- [ ] Task 6: Update `jsonToYjs` and `jsonToYjsChildren` (lines 164–228) (AC: #1, #2)
  - [ ] Change `content: any` parameter on `jsonToYjs` → `content: TipTapDoc`
  - [ ] Change `children: any[]` parameter on `jsonToYjsChildren` → `children: TipTapNode[]`
  - [ ] Inside the function bodies, the `node` variable is now `TipTapNode` (a union type)
  - [ ] Use a type narrowing check to distinguish text vs element nodes:
    ```typescript
    for (const node of content.content) {
      if (node.type === 'text' && 'text' in node) {
        // node is TipTapTextNode here
        const textNode = node as TipTapTextNode;
        const text = new Y.XmlText();
        fragment.push([text]);
        text.insert(0, textNode.text || '');
        if (textNode.marks) {
          const attrs: Record<string, string | boolean> = {};
          for (const mark of textNode.marks) {
            attrs[mark.type] = mark.attrs ? JSON.stringify(mark.attrs) : true as unknown as string;
          }
          text.format(0, text.length, attrs);
        }
      } else {
        // node is TipTapElementNode
        const elemNode = node as TipTapElementNode;
        // ...existing logic
      }
    }
    ```
  - [ ] Replace `const attrs: Record<string, any>` with `Record<string, string | boolean>` (Y.XmlText.format only accepts these types)
  - [ ] Run `pnpm type-check` after each function update — fix errors before proceeding

- [ ] Task 7: Update `loadContentFromYjsState` return type (line 235) (AC: #1, #2)
  - [ ] Change `): any | null` → `): TipTapDoc | null`

- [ ] Task 8: Verify `any` count reduction (AC: #2)
  - [ ] Run: `grep -c ": any\|any\[\]" api/src/utils/yjsConverter.ts`
  - [ ] Target: ≤5 remaining (down from ~13 baseline) — a ≥8 reduction
  - [ ] If any `any` remains, confirm it has an accompanying type guard (not a bare suppression)

- [ ] Task 9: Run violation count script (AC: #4)
  - [ ] Run the node violation-counting script from Story 5.1 AC #4
  - [ ] Record the new totals for Story 5.5

- [ ] Task 10: Run unit tests (AC: #3)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm only the 6 pre-existing `auth.test.ts` failures remain
  - [ ] ⚠️ `pnpm test` truncates the DB. Run `pnpm db:seed` afterward if needed

## Dev Notes

### Context

`api/src/utils/yjsConverter.ts` bridges Yjs's XML DOM model (`Y.XmlFragment`, `Y.XmlElement`, `Y.XmlText`) to TipTap's ProseMirror JSON format. Both sides have well-defined shapes. The current file uses `any` extensively because the TipTap JSON format was not typed — this story introduces that typing.

TipTap's JSON format is a tree of nodes. Every node has:
- `type: string` (e.g. `'doc'`, `'paragraph'`, `'text'`, `'heading'`)
- `attrs?: Record<string, unknown>` (e.g. `{ level: 1 }` for headings)
- `content?: TipTapNode[]` (children, absent on leaf nodes)
- `text?: string` and `marks?: TipTapMark[]` (only on text nodes)

This is well-known and the interfaces in Task 2 are standard TipTap representations.

### Y.XmlText.format() Types

`Y.XmlText.format(index, length, attrs)` — the `attrs` parameter in Yjs is typed as `Record<string, unknown>` or `Record<string, any>`. If TypeScript complains about the mark attrs format call, cast appropriately or check the yjs type definitions. The existing `y-protocols.d.ts` may give hints.

### The `mark.attrs || true` Pattern

The existing code at line 177 does:
```typescript
attrs[mark.type] = mark.attrs || true;
```
This sets the mark attribute to either an attrs object or `true` (for marks with no attrs like bold/italic). Since `Y.XmlText.format` attrs values should be strings or numbers in Yjs, this may need adjustment. Check what Yjs actually accepts — boolean `true` may serialize fine in practice.

### Caution: Do Not Break Collaboration

The collaboration system is tested via `pnpm test` (there are collaboration-related tests). Run tests BEFORE and AFTER this story. If any tests that were previously passing start failing, the change broke something in the conversion logic.

### File Locations

- **Primary file:** `api/src/utils/yjsConverter.ts` (245 lines, modify in-place)
- **No new files needed**

### Baseline Numbers (for Story 5.5 comparison)

From `gauntlet_docs/baselines.md` + current file analysis:
- yjsConverter.ts `: any` count: ~13 (run `grep -c ": any\|any\[\]" api/src/utils/yjsConverter.ts` to confirm current state)
- Target: ≤5 remaining (≥8 reduction)

### Commit Message

```
fix(types): replace any with TipTap node interfaces in yjsConverter.ts
```

### References

- [Source: gauntlet_docs/ShipShape-fix-plan.md] — Fix 1-C, root cause and approach
- [Source: api/src/utils/yjsConverter.ts] — The file being modified (245 lines)
- [Source: gauntlet_docs/baselines.md#Cat-1] — Before violation counts

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `api/src/utils/yjsConverter.ts` (modified — replace any with TipTap interfaces and narrowing guards)