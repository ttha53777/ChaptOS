/**
 * The Ask Chapt mark's state: which face the talking tile wears.
 * (docs/ask-chapt-mark-plan.md, look and motion in _design/Ask Chapt Talking Tile.html)
 *
 * Two parts, both pure (no React, no DOM), so they're unit-tested and the
 * native app can reuse them:
 *
 *  - `markStateFor(facts)` maps what the widget already knows about the
 *    composer and the newest turn to the face that turn deserves.
 *  - `createMarkMachine()` applies the timing rules to a stream of those
 *    targets, so the face only changes at real phase boundaries: a phase holds
 *    at least `DWELL_MS` (a quick composing → tool call → composing flip
 *    doesn't twitch the face), except a move into done / unsure / offline,
 *    which always goes at once; `done` holds `DONE_MS` and then gives way to
 *    idle.
 *
 * No server or wire change: every input is state the widget already has.
 */

export type MarkState =
  | "idle"
  | "hover"
  | "listening"
  | "thinking"
  | "answering"
  | "done"
  | "unsure"
  | "offline";

/** The newest assistant turn, reduced to what the face reads off it. */
export interface MarkTurn {
  /** The model is writing its reply (the `composing` event, until a tool call). */
  composing?: boolean;
  /** A `verdict_draft` headline has arrived. */
  draft?: string;
  /** Streamed prose so far (`text` deltas). */
  content: string;
  answer?: {
    shape?: { type: string } | null;
    askback?: { questions: unknown[] } | null;
  } | null;
  proposals?: unknown[] | null;
  /** The stream broke. */
  error?: unknown;
  /** The server ended the turn with a status notice (timeout / error / cut_short). */
  notice?: unknown;
  /** The person pressed Stop. */
  stopped?: boolean;
}

export interface MarkFacts {
  /** A turn is in flight. */
  streaming: boolean;
  /** Dictation is on. */
  dictating: boolean;
  /** The composer's text, or just whether it has any (focus doesn't matter). */
  typed: boolean;
  /** The newest assistant message, if the thread has one. */
  turn?: MarkTurn | null;
}

/** States the timing rules let through at once, whatever the dwell. */
const URGENT: ReadonlySet<MarkState> = new Set(["done", "unsure", "offline"]);

/** A phase holds at least this long before an ordinary change shows. */
export const DWELL_MS = 500;
/** How long the done face (and its one hop) holds before idle. */
export const DONE_MS = 2400;

/**
 * The face a turn deserves right now, before any timing rule.
 *
 * Order matters: a turn in flight wins over the composer (you can type the
 * next question while one streams), the composer wins over how the last turn
 * settled (typing is the start of the next ask, which is what releases unsure
 * and offline), and a settled turn reads failed, then unsure, then answered.
 */
export function markStateFor({ streaming, dictating, typed, turn }: MarkFacts): MarkState {
  if (streaming) {
    if (!turn) return "thinking";
    const writing = !!turn.composing || !!turn.draft || turn.content.length > 0 || !!turn.answer;
    return writing ? "answering" : "thinking";
  }
  if (dictating || typed) return "listening";
  if (!turn) return "idle";
  if (turn.error || turn.notice) return "offline";
  // Stopped by the person: nothing went wrong and nothing was answered.
  if (turn.stopped) return "idle";
  const a = turn.answer;
  if (a && (a.shape?.type === "decline" || (a.askback?.questions?.length ?? 0) > 0)) return "unsure";
  if (a || turn.content.trim() || (turn.proposals?.length ?? 0) > 0) return "done";
  return "idle";
}

export interface MarkMachine {
  /** Feed the latest target (from `markStateFor`). Cheap to call on every render. */
  set(target: MarkState): void;
  /** What the mark shows now. */
  readonly shown: MarkState;
  dispose(): void;
}

/**
 * Timing over a stream of targets. `onChange` fires only when the shown face
 * actually changes. Starting on `done` (a thread reopened after its answer
 * landed) shows idle: the hop belongs to the moment an answer arrives, not to
 * every time the panel opens, or to a thread you typed in and cleared.
 */
export function createMarkMachine(
  initial: MarkState,
  onChange: (s: MarkState) => void,
  now: () => number = Date.now,
): MarkMachine {
  let target = initial;
  let shown: MarkState = initial === "done" ? "idle" : initial;
  // The done hold for the current `done` target has already run out.
  let doneSpent = initial === "done";
  // No dwell owed by the first change after mount.
  let since = -Infinity;
  let dwellTimer: ReturnType<typeof setTimeout> | null = null;
  let doneTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const clear = (t: ReturnType<typeof setTimeout> | null) => { if (t) clearTimeout(t); };

  function show(s: MarkState) {
    if (disposed || s === shown) return;
    shown = s;
    since = now();
    clear(doneTimer);
    doneTimer = null;
    if (s === "done") {
      doneTimer = setTimeout(() => {
        doneTimer = null;
        doneSpent = true;
        // The hold ran out: idle, unless something newer has been asked for.
        settle();
      }, DONE_MS);
    }
    onChange(s);
  }

  /** What the target means once the done hold is accounted for. */
  function wanted(): MarkState {
    return target === "done" && doneSpent ? "idle" : target;
  }

  function settle() {
    if (disposed) return;
    clear(dwellTimer);
    dwellTimer = null;
    const next = wanted();
    if (next === shown) return;
    // done's own expiry is the end of a hold, not a flip — it never waits.
    const wait = URGENT.has(next) || (shown === "done" && doneSpent) ? 0 : since + DWELL_MS - now();
    if (wait <= 0) show(next);
    else dwellTimer = setTimeout(() => { dwellTimer = null; settle(); }, wait);
  }

  return {
    set(t) {
      if (disposed) return;
      if (t !== target) {
        // Only an answer arriving earns the hop: done straight off a turn in
        // flight. Back at done any other way (typing, then clearing the
        // composer) the answer is old news, so it's idle.
        if (t === "done") doneSpent = !(target === "thinking" || target === "answering");
        target = t;
      }
      settle();
    },
    get shown() { return shown; },
    dispose() {
      disposed = true;
      clear(dwellTimer);
      clear(doneTimer);
    },
  };
}
