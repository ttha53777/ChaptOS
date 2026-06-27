/**
 * Idle watchdog for streamed AI responses.
 *
 * The OpenAI client's `timeout` bounds the initial connect / non-stream call, but
 * once a streaming response starts it does NOT bound the gap BETWEEN chunks — a
 * stalled stream (server wedged mid-generation, dropped connection that never
 * RSTs) would hang the `for await` loop, and with it the SSE response, forever.
 *
 * `withIdleTimeout` wraps any async iterable and races each pull against an idle
 * timer that resets on every yielded chunk. If `ms` elapses with no new chunk, it
 * invokes `onAbort` (the caller passes `() => completion.controller.abort()` to
 * tear down the underlying HTTP stream) and throws `StreamIdleTimeoutError`. The
 * route catches it, emits an SSE `error` event, and closes the stream gracefully
 * instead of leaving the client hanging.
 */

export class StreamIdleTimeoutError extends Error {
  constructor(public readonly idleMs: number) {
    super(`AI stream idle for ${idleMs}ms`);
    this.name = "StreamIdleTimeoutError";
  }
}

/** Default idle bound for chat/setup streams. Sits above normal inter-chunk gaps. */
export const STREAM_IDLE_MS = 20_000;

/**
 * Yield from `source`, but throw StreamIdleTimeoutError if more than `ms` passes
 * between chunks. `onAbort` runs once on timeout, before throwing, so the caller
 * can abort the upstream request (e.g. completion.controller.abort()).
 *
 * The timer is cleared on every chunk and in a finally block, so a normally-
 * completing stream leaves no dangling timer.
 */
export async function* withIdleTimeout<T>(
  source: AsyncIterable<T>,
  ms: number,
  onAbort: () => void,
): AsyncGenerator<T> {
  const iterator = source[Symbol.asyncIterator]();
  try {
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const idle = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          // Tear down the upstream stream so its socket/reader is released, then
          // signal the stall to the caller.
          try { onAbort(); } catch { /* abort is best-effort */ }
          reject(new StreamIdleTimeoutError(ms));
        }, ms);
      });
      try {
        const result = await Promise.race([iterator.next(), idle]);
        if (result.done) return;
        yield result.value;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
  } finally {
    // If we exit early (timeout, downstream break, or error), let the source
    // release its resources. return() is optional on iterators; guard it.
    await iterator.return?.();
  }
}
