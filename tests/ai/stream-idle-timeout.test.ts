/**
 * Unit tests for withIdleTimeout — the watchdog that bounds the gap between
 * streamed chunks so a stalled AI stream can't hang the SSE response forever.
 *
 * Driven with hand-rolled async iterables (no OpenAI, no DB) and fake timers so
 * the "20s idle" is instantaneous in test time.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withIdleTimeout, StreamIdleTimeoutError } from "@/lib/ai-stream";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** An async iterable that yields the given values immediately, then completes. */
async function* fromValues<T>(...values: T[]): AsyncGenerator<T> {
  for (const v of values) yield v;
}

/** An iterable that yields one value, then stalls forever (never resolves). */
function stallingAfterOne<T>(first: T): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let sent = false;
      return {
        next() {
          if (!sent) {
            sent = true;
            return Promise.resolve({ value: first, done: false });
          }
          return new Promise<IteratorResult<T>>(() => {}); // never resolves
        },
      };
    },
  };
}

describe("withIdleTimeout", () => {
  it("passes through all chunks when the stream is lively", async () => {
    const out: number[] = [];
    const onAbort = vi.fn();
    for await (const v of withIdleTimeout(fromValues(1, 2, 3), 20_000, onAbort)) {
      out.push(v);
    }
    expect(out).toEqual([1, 2, 3]);
    expect(onAbort).not.toHaveBeenCalled();
  });

  it("aborts and throws StreamIdleTimeoutError when the stream stalls", async () => {
    const onAbort = vi.fn();
    const received: string[] = [];

    const run = (async () => {
      for await (const v of withIdleTimeout(stallingAfterOne("hello"), 20_000, onAbort)) {
        received.push(v);
      }
    })();
    // Surface the rejection synchronously to the assertion below.
    const settled = run.then(() => "ok").catch((e: unknown) => e);

    // First chunk arrives immediately; drain microtasks so it's consumed.
    await vi.advanceTimersByTimeAsync(0);
    expect(received).toEqual(["hello"]);
    expect(onAbort).not.toHaveBeenCalled();

    // Now let the idle timer fire.
    await vi.advanceTimersByTimeAsync(20_000);
    const result = await settled;
    expect(result).toBeInstanceOf(StreamIdleTimeoutError);
    expect((result as StreamIdleTimeoutError).idleMs).toBe(20_000);
    expect(onAbort).toHaveBeenCalledOnce();
  });

  it("does not fire if each chunk arrives within the idle window", async () => {
    const onAbort = vi.fn();
    // Yields a value every 10s; with a 20s idle bound it never times out.
    async function* slowButSteady(): AsyncGenerator<number> {
      for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 10_000));
        yield i;
      }
    }
    const out: number[] = [];
    const run = (async () => {
      for await (const v of withIdleTimeout(slowButSteady(), 20_000, onAbort)) out.push(v);
    })();
    await vi.advanceTimersByTimeAsync(40_000);
    await run;
    expect(out).toEqual([0, 1, 2]);
    expect(onAbort).not.toHaveBeenCalled();
  });

  it("clears the timer on normal completion (no late abort)", async () => {
    const onAbort = vi.fn();
    for await (const _ of withIdleTimeout(fromValues("a"), 20_000, onAbort)) { /* drain */ }
    // Advance well past the idle window — the timer must already be cleared.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onAbort).not.toHaveBeenCalled();
  });
});
