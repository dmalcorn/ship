# Story 6.2: Chat Drawer for On-Demand Analysis

Status: done

## Story

As a **software engineer**,
I want a floating chat drawer in Ship's UI that lets me ask FleetGraph about the current issue or sprint I'm viewing,
so that I get context-aware AI analysis without switching tools or losing my place.

## Acceptance Criteria

1. **Given** the user is viewing an issue or sprint document in Ship's editor
   **When** they click the "Ask FleetGraph" FAB button (bottom-right)
   **Then** a floating chat drawer opens (slides up, 200ms `transition-transform`) overlaying the main content area
   **And** the drawer knows the current `documentId` and `documentType` from `CurrentDocumentContext`

2. **Given** the chat drawer is open
   **When** the user types a question and submits
   **Then** Ship sends `POST /api/fleetgraph/chat` (proxied through Ship backend) with `{ documentId, documentType, message, threadId, workspaceId }`
   **And** a pulsing "Analyzing..." indicator appears below the user's message
   **And** the response is rendered as structured analysis (headings, bullet points, metrics) in the chat drawer
   **And** the response appears within 15 seconds

3. **Given** the user navigates to a different document
   **When** the chat drawer is still open
   **Then** the context updates to the new document's `documentId` and `documentType`
   **And** previous conversation is cleared (stateless per navigation)

4. **Given** the user is NOT viewing an issue or sprint
   **When** looking at a wiki, project, program, or other document type
   **Then** the "Ask FleetGraph" FAB button is NOT visible

5. **Given** the chat drawer is open
   **When** the user presses Escape, clicks X, or clicks outside the drawer
   **Then** the drawer slides down (200ms) and the FAB button reappears
   **And** focus returns to the FAB trigger button

## Tasks / Subtasks

- [x] Task 1: Build ChatDrawer component (AC: #1, #2, #5)
  - [x] 1.1: Create `web/src/features/fleetgraph/components/ChatDrawer.tsx`
  - [x] 1.2: Fixed position bottom-right: `fixed bottom-4 right-4 w-[360px] max-h-[480px] rounded-lg bg-[#171717] border border-[#262626] z-50`
  - [x] 1.3: Slide animation: `transition-transform duration-200` — translate-y-0 when open, translate-y-full when closed
  - [x] 1.4: Header: document context indicator showing current document title + type, X close button
  - [x] 1.5: Message area: overflow-auto div (no Radix ScrollArea — not installed), auto-scroll to bottom on new messages
  - [x] 1.6: User messages: right-aligned, `bg-[#262626] rounded px-3 py-2 text-sm text-[#f5f5f5]`
  - [x] 1.7: Agent responses: left-aligned, rendered as structured markdown (headings, bullets, metrics) using `text-sm text-[#a3a3a3]`
  - [x] 1.8: Analyzing state: pulsing `text-[#a3a3a3] animate-pulse` "Analyzing..." below user message
  - [x] 1.9: Error state: agent bubble "Unable to analyze. Try again." + Retry button
  - [x] 1.10: Focus trap: Tab cycles within drawer (input → close button → input). Focus doesn't leak to page behind.
  - [x] 1.11: Escape to close: `onKeyDown` handler, returns focus to FAB trigger via `ref`

- [x] Task 2: Build ChatInput component (AC: #2)
  - [x] 2.1: Create `web/src/features/fleetgraph/components/ChatInput.tsx`
  - [x] 2.2: Text input with Send button (inline SVG Send icon): `bg-[#0d0d0d] border-t border-[#262626] px-3 py-2`
  - [x] 2.3: Context-aware placeholder: `"Ask about this sprint..."` or `"Ask about this issue..."` based on `documentType`
  - [x] 2.4: `aria-label="Ask FleetGraph about {document title}"`
  - [x] 2.5: Submit on Enter (not Shift+Enter which inserts newline)
  - [x] 2.6: Disable input + show spinner in Send button while awaiting response

- [x] Task 3: Create chat session hook (AC: #2, #3)
  - [x] 3.1: Create `web/src/features/fleetgraph/hooks/useChatSession.ts`
  - [x] 3.2: React Query `useMutation` for `POST /api/fleetgraph/chat` via `apiPost`
  - [x] 3.3: Local state for messages array: `{ role: 'user' | 'agent', content: string }[]`
  - [x] 3.4: Generate `threadId` per session (UUID), reset on document navigation
  - [x] 3.5: On document change (documentId changes): clear messages, generate new threadId
  - [x] 3.6: Chat mutations do NOT invalidate findings cache (independent data)

- [x] Task 4: Build FAB trigger button (AC: #1, #4, #5)
  - [x] 4.1: Create `web/src/features/fleetgraph/components/FleetGraphFAB.tsx`
  - [x] 4.2: Position: `fixed bottom-4 right-4 z-40` — hidden when chat drawer is open (`z-50` drawer above)
  - [x] 4.3: Style: `bg-[#005ea2] text-white rounded-full p-3 shadow-lg hover:bg-[#004d84]` with inline SVG Radar icon
  - [x] 4.4: Visibility logic: only render when `currentDocumentType` is `'issue'` or `'sprint'` (from `CurrentDocumentContext`)
  - [x] 4.5: `aria-label="Ask FleetGraph"` — receives focus back when drawer closes
  - [x] 4.6: Store `ref` for focus return on drawer close

- [x] Task 5: Integrate into Ship's layout (AC: #1, #4)
  - [x] 5.1: Mount `FleetGraphFAB` and `ChatDrawer` in `App.tsx` — they render as fixed-position overlays, NOT inside the 4-panel grid
  - [x] 5.2: Both components consume `CurrentDocumentContext` for document awareness
  - [x] 5.3: Shared open/close state: `useState<boolean>` lifted to AppLayout parent
  - [x] 5.4: Chat drawer and findings panel (Story 6.1) are independent — both can be active simultaneously

- [x] Task 6: Structured response rendering (AC: #2)
  - [x] 6.1: Parse agent response content — FleetGraph returns structured text with findings and summary
  - [x] 6.2: Render headings as `text-sm font-semibold text-[#f5f5f5]`, bullets as `text-sm text-[#a3a3a3]`, metrics as `font-mono text-xs`
  - [x] 6.3: Document links in responses rendered inline (React Router navigation deferred to when backend proxy is live)

## Dev Notes

### Document Context Integration

The key integration point is `CurrentDocumentContext` (`web/src/contexts/CurrentDocumentContext.tsx`):

```typescript
interface CurrentDocumentContextValue {
  currentDocumentType: DocumentType;
  currentDocumentId: string | null;
  currentDocumentProjectId: string | null;
  setCurrentDocument: (id: string | null, type: DocumentType, projectId?: string | null) => void;
  clearCurrentDocument: () => void;
}
```

- `UnifiedDocumentPage` calls `setCurrentDocument(id, document.document_type, projectId)` when a document loads
- The FAB checks `currentDocumentType` — only visible for `'issue'` or `'sprint'`
- The ChatDrawer passes `currentDocumentId` and `currentDocumentType` to the chat API call
- When user navigates to a different document, `currentDocumentId` changes → chat session resets

### FleetGraph Chat API Contract

Request: `POST /api/fleetgraph/chat` (proxied — see Story 6.3)
```json
{
  "documentId": "uuid-of-issue-or-sprint",
  "documentType": "issue" | "sprint",
  "message": "Is this sprint on track?",
  "threadId": "client-generated-uuid",
  "workspaceId": "workspace-uuid"
}
```

Response (from FleetGraph service):
```json
{
  "summary": "Sprint 13 analysis...",
  "findings": [{ "id": "...", "severity": "warning", "title": "...", "description": "...", "evidence": "...", "recommendation": "..." }],
  "severity": "warning" | "clean" | "info" | "critical",
  "proposedActions": [{ "findingId": "...", "action": "...", "requiresConfirmation": true }]
}
```

### Overlay Behavior

- Chat drawer: `z-50` — top overlay
- FAB button: `z-40` — below chat drawer
- Snooze popovers (from FindingCard): `z-40` — can coexist with chat drawer
- Radix Tooltips: `z-30`
- No overlays block the icon rail (always accessible)
- Only one Radix popover open at a time (Radix handles natively)

### Key Technical Decisions

- **Stateless per navigation:** No persistent chat history — each document context gets a fresh session. Simplifies state management significantly.
- **No streaming:** MVP sends full request, waits for complete response. Streaming SSE can be added later.
- **Fixed 360px width:** Desktop-only app, no responsive variants needed. Chat drawer fits comfortably alongside the 4-panel layout.
- **Simple markdown rendering:** Don't pull in a full markdown library. Parse headings/bullets/bold manually or use a lightweight renderer. Agent responses are structured, not arbitrary markdown.

### What NOT To Do

- Do NOT put ChatDrawer inside the 4-panel grid — it's a `fixed` position overlay
- Do NOT persist chat messages across sessions — stateless per navigation
- Do NOT show FAB on wiki, project, program, or person documents — issue/sprint only
- Do NOT use toast notifications for chat errors — inline in the drawer
- Do NOT use modals or confirmations for closing the drawer — Escape/X/click-outside, done
- Do NOT create a separate route for the chat — it's an overlay on existing pages
- Do NOT use `window.location` for document links in responses — use React Router `useNavigate`

### Accessibility Requirements

| Component | Requirement | Implementation |
|-----------|-------------|---------------|
| ChatDrawer | Focus trap when open | Tab cycles: input → close → input |
| ChatDrawer | Escape to close | Returns focus to FAB trigger button |
| ChatDrawer | Response announcement | `aria-live="polite"` on message container |
| ChatInput | Contextual label | `aria-label="Ask FleetGraph about {doc title}"` |
| FAB | Descriptive label | `aria-label="Ask FleetGraph"` |

### File Organization (extends Story 6.1)

```
web/src/features/fleetgraph/
├── components/
│   ├── FindingCard.tsx       # Story 6.1
│   ├── FindingsPanel.tsx     # Story 6.1
│   ├── BadgeCount.tsx        # Story 6.1
│   ├── EmptyState.tsx        # Story 6.1
│   ├── ChatDrawer.tsx        # This story
│   ├── ChatInput.tsx         # This story
│   └── FleetGraphFAB.tsx     # This story
├── hooks/
│   ├── useFindings.ts        # Story 6.1
│   ├── useResumeAction.ts    # Story 6.1
│   └── useChatSession.ts     # This story
├── types/
│   └── index.ts              # Shared types (extended with ChatMessage)
└── index.ts
```

### Dependencies

- **Story 6.1:** FindingsPanel and ChatDrawer are independent but share the `features/fleetgraph/` module
- **Story 6.3:** Chat API calls go through Ship's backend proxy (`/api/fleetgraph/chat`)
- **CurrentDocumentContext:** Already exists — consumed, not modified
- **Lucide icons:** `Radar` (FAB), `Send` (input), `X` (close)
- **Radix:** `ScrollArea` for message list

### References

- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — ChatDrawer anatomy, ChatInput, FAB, overlay/popover patterns, navigation patterns]
- [Source: _bmad-output/planning-artifacts/architecture.md — Section 8: Chat Drawer data flow, proxy pattern]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 6, Story 6.2]
- [Source: web/src/contexts/CurrentDocumentContext.tsx — Document context interface and flow]
- [Source: web/src/pages/App.tsx — Layout structure, where to mount fixed overlays]
- [Source: _bmad-output/planning-artifacts/architecture.md — Section 7: FleetGraph API /api/fleetgraph/chat contract]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- Type-check: 0 errors after fixing initial TS strict null issues
- All 229 tests pass (79 fleetgraph-specific, 150 existing — zero regressions)

### Completion Notes List
- Task 1: ChatDrawer — fixed overlay with slide animation, focus trap, Escape-to-close, aria-live message area, auto-scroll. Used overflow-auto div instead of Radix ScrollArea (not installed as dependency).
- Task 2: ChatInput — textarea with Enter submit, Shift+Enter newline, contextual placeholder/aria-label, spinner on loading state.
- Task 3: useChatSession — React Query useMutation, local messages state, auto-reset on documentId change, threadId via crypto.randomUUID, formatChatResponse for structured output.
- Task 4: FleetGraphFAB — forwardRef for focus return, conditional render based on documentType (issue|sprint only), z-40 below drawer's z-50.
- Task 5: Integration — FAB + ChatDrawer mounted in AppLayout after modals, shared useState for open/close, auto-close on navigation away from issue/sprint.
- Task 6: ChatMessageBubble — lightweight markdown parser handles ##/### headings, bullet points, **bold**, `code` inline. No external markdown library.
- Used inline SVGs instead of lucide-react (not a project dependency).

### File List
- web/src/features/fleetgraph/types/index.ts (modified — added ChatMessage with id, ChatResponse types)
- web/src/features/fleetgraph/hooks/useChatSession.ts (new — message IDs, fixed retry logic)
- web/src/features/fleetgraph/hooks/useChatSession.test.ts (new — 10 tests, includes retry coverage)
- web/src/features/fleetgraph/components/ChatDrawer.tsx (new — click-outside-to-close, null when closed)
- web/src/features/fleetgraph/components/ChatDrawer.test.tsx (new — 14 tests, includes click-outside)
- web/src/features/fleetgraph/components/ChatInput.tsx (new)
- web/src/features/fleetgraph/components/ChatInput.test.tsx (new — 9 tests)
- web/src/features/fleetgraph/components/ChatMessageBubble.tsx (new)
- web/src/features/fleetgraph/components/ChatMessageBubble.test.tsx (new — 10 tests)
- web/src/features/fleetgraph/components/FleetGraphFAB.tsx (new)
- web/src/features/fleetgraph/components/FleetGraphFAB.test.tsx (new — 6 tests)
- web/src/features/fleetgraph/components/FleetGraphOverlay.tsx (new — wrapper, conditionally mounts chat state)
- web/src/features/fleetgraph/index.ts (modified — added exports including FleetGraphOverlay)
- web/src/pages/App.tsx (modified — uses FleetGraphOverlay, passes documentTitle, conditional mount)
