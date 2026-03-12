# Story 1.3: Process-Level Crash Guards

Status: done

## Story

As an end user in an active collaborative editing session,
I want the server to survive unhandled async rejections,
So that a single Yjs WebSocket callback failure doesn't silently kill the server and drop all active sessions with no log flush.

## Acceptance Criteria

1. **Given** crash guards are registered in `api/src/index.ts`
   **When** an unhandled Promise rejection occurs anywhere in the process
   **Then** the error is logged with `[unhandledRejection]` prefix and the process **continues running** (no exit)

2. **Given** crash guards are registered in `api/src/index.ts`
   **When** an uncaught synchronous exception occurs
   **Then** the error is logged with `[uncaughtException]` prefix and `process.exit(1)` is called (allowing Elastic Beanstalk health check to trigger automatic restart)

3. **Given** the server has started
   **When** `process.listenerCount('unhandledRejection')` is checked
   **Then** it returns `1` (exactly one listener registered)

4. **Given** the server has started
   **When** `process.listenerCount('uncaughtException')` is checked
   **Then** it returns `1` (exactly one listener registered)

5. **Given** the changes are applied
   **When** `pnpm test` is run
   **Then** all tests pass with no new failures

## Tasks / Subtasks

- [ ] Task 1: Register crash guards in `api/src/index.ts` (AC: #1, #2, #3, #4)
  - [ ] Add `process.on('unhandledRejection', ...)` handler — log with `[unhandledRejection]` prefix, do NOT call `process.exit()`
  - [ ] Add `process.on('uncaughtException', ...)` handler — log with `[uncaughtException]` prefix, then call `process.exit(1)`
  - [ ] Place both registrations **outside** and **before** the `main()` async function call, so they are active even if `main()` itself throws

- [ ] Task 2: Verify listener counts (AC: #3, #4)
  - [ ] Start the API in dev mode and confirm via node REPL or startup log that listener counts are 1 each
  - [ ] Alternative: add a startup log line: `console.log('Crash guards registered');` after both registrations

- [ ] Task 3: Run unit tests (AC: #5)
  - [ ] `cd /workspace && pnpm test`
  - [ ] Confirm no new failures (baseline: 6 pre-existing failures in auth.test.ts)

## Dev Notes

### Context

Without these guards, an unhandled async rejection — e.g., from a Yjs WebSocket callback, a collaboration conflict during a network blip, or a promise chain with a missing `.catch()` — silently kills the Elastic Beanstalk instance. The result:
- All users in active collaborative sessions lose their WebSocket connection simultaneously
- Unsaved Yjs CRDT state is dropped
- No log is flushed (the process dies mid-stream)
- EB only detects the failure after the health check times out (minutes of downtime)

After this fix, unhandled rejections are logged and survive; uncaught synchronous exceptions log and exit cleanly (allowing EB's auto-restart to kick in immediately).

### Current State of `api/src/index.ts`

The file currently contains a single `main()` async function + `main().catch(...)` at the bottom:

```typescript
async function main() {
  // ... load secrets, create app, start server
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
```

There are no process-level event listeners registered anywhere.

### Exact Implementation

Add the two handlers **before** the `main()` function definition:

```typescript
// Process-level crash guards — must be registered before main() so they
// catch errors even if startup itself fails.

process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  // Log and continue — unhandledRejection does not leave the process in
  // an unknown state. In production, CloudWatch picks up stderr.
  console.error('[unhandledRejection] Unhandled promise rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err: Error) => {
  // uncaughtException leaves the process in an undefined state — exit is required.
  // Elastic Beanstalk health check will detect the exit and trigger restart.
  console.error('[uncaughtException] Uncaught exception:', err.message, err.stack);
  process.exit(1);
});
```

### Insert Point in `api/src/index.ts`

Add immediately after the `config(...)` / import block, before the `async function main()` line. The file currently has this structure:

```
imports
config() calls
                            ← INSERT CRASH GUARDS HERE
async function main() { ... }
main().catch(...)
```

### Why `unhandledRejection` should NOT exit

Unlike `uncaughtException`, an unhandled rejection does not leave the event loop or memory in an undefined state. Node.js prior to v15 would just print a warning; v15+ starts emitting a deprecation-then-exit by default. Registering a handler suppresses the default behavior and keeps the server alive. The specific rejection is logged for CloudWatch alerting.

### Why `uncaughtException` MUST exit

From the Node.js docs: *"It is not safe to resume normal operation after 'uncaughtException', because the application may be left in an unknown state."* Always exit and let the process manager restart.

### Evidence Required (for Story 1-5)

After implementation, capture:
```bash
node -e "
process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});
console.log('unhandledRejection listeners:', process.listenerCount('unhandledRejection'));
console.log('uncaughtException listeners:', process.listenerCount('uncaughtException'));
"
```
Expected output:
```
unhandledRejection listeners: 1
uncaughtException listeners: 1
```

### Commit Message

```
fix(errors): register process-level crash guards for unhandled rejections
```

### References

- [Source: gauntlet_docs/ShipShape-fix-plan.md#Fix-6-B] — Root cause + fix approach
- [Source: api/src/index.ts] — Current file structure
- [Source: gauntlet_docs/baselines.md] — Cat 6 baseline (no crash guards confirmed)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (Amelia - Dev Agent)

### Debug Log References

- Crash guard's uncaughtException handler correctly triggered when new server started on already-used port 3000 (confirmed by /tmp/api-server.log)

### Completion Notes List

- Added `process.on('unhandledRejection', ...)` and `process.on('uncaughtException', ...)` before `async function main()` in `api/src/index.ts`
- Verified: `unhandledRejection listeners: 1`, `uncaughtException listeners: 1`
- Tests: no new failures

### File List

- `api/src/index.ts` (modified — add process crash guards before main())
