/**
 * Check if a graph invoke result was interrupted (non-throwing interrupt pattern).
 * With MemorySaver checkpointer, interrupt() returns normally with __interrupt__ key.
 */
export function isInterruptedResult(result: Record<string, unknown>): boolean {
  return "__interrupt__" in result;
}

/**
 * Extract interrupt payload from graph state (for non-throwing interrupt pattern).
 */
export async function extractInterruptPayloadFromState(
  graph: { getState: (config: { configurable: { thread_id: string } }) => Promise<{
    tasks?: Array<{ interrupts?: Array<{ value?: unknown }> }>;
  }> },
  config: { configurable: { thread_id: string } }
): Promise<Record<string, unknown> | null> {
  const state = await graph.getState(config);
  const task = state?.tasks?.[0];
  const interruptValue = task?.interrupts?.[0]?.value;
  return (interruptValue as Record<string, unknown>) ?? null;
}
