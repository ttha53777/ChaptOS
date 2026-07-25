/**
 * Turning streamed tool_call deltas into reasoning-ledger steps.
 *
 * The chat route announces a step the moment the model has NAMED a tool, which
 * happens mid-turn — well before `finish_reason` and the batch dispatching. That
 * buys the ledger its first rows during the model's own round trip, and gives it
 * a real cascade, because with parallel tool calls each name lands only after the
 * previous call's arguments have finished streaming.
 *
 * The two rules that make it safe live here, out of the route, so they can be
 * tested without an OpenAI client:
 *   1. WHEN a name is final (`stepNameSettled`) — deltas may fragment a name, and
 *      one real tool name is a strict prefix of another, so a premature read
 *      would post the wrong verb on the wrong record.
 *   2. WHICH index a step belongs to (`assembleToolCalls`) — ids must key off the
 *      RAW delta index. Compacting the array renumbers every later call, and
 *      every step_done after the gap silently stops matching.
 */

export interface ToolCallSlot {
  id: string;
  name: string;
  argsBuf: string;
}

export type IndexedToolCall = ToolCallSlot & { idx: number };

/**
 * True once `slot.name` can be trusted as a whole tool name.
 *
 * Arguments starting proves the name field is closed — OpenAI sends a tool
 * call's `name` complete in its opening delta and then streams `arguments`, but
 * that isn't contractual, and `get_brother` is a strict prefix of
 * `get_brother_attendance`. Requiring the name to be a KNOWN tool as well makes
 * a truncated name structurally unable to render: it simply waits, and the
 * dispatch pass announces it instead.
 */
export function stepNameSettled(slot: ToolCallSlot, known: Record<string, unknown>): boolean {
  return slot.argsBuf.length > 0 && slot.name in known;
}

/**
 * Flatten the per-index delta accumulator into call order, carrying the raw
 * index. Calls that never received a name are dropped — but AFTER the index is
 * captured, so the surviving calls keep the ids already sent to the client.
 */
export function assembleToolCalls(byIndex: Map<number, ToolCallSlot>): IndexedToolCall[] {
  return Array.from(byIndex.entries())
    .sort(([a], [b]) => a - b)
    .filter(([, slot]) => slot.name)
    .map(([idx, slot]) => ({ ...slot, idx }));
}

/** Ledger step id: iteration + RAW delta index. Stable across both emit sites. */
export function stepId(iter: number, idx: number): string {
  return `${iter}:${idx}`;
}
