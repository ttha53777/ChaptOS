# Ask Chapt mark: the talking tile, built into the app

Source of truth for the look and motion: `_design/Ask Chapt Talking Tile.html`
(geometry, timings, easing, every state). This plan says how it gets into the
real widget without jank.

## Status

**Phases 1–5 built 2026-11-28 (uncommitted).** `lib/chat/mark-state.ts`
(+ `tests/ai/chat-mark-state.test.ts`), `app/components/chat/ChaptMark.tsx`,
`chapt-mark.css`, `chapt-mark-path.ts` (pencil keyframes), `useMarkState.ts`.
Two deviations: the pencil's eye tracking animates `.cmk-drift` (the loop
wrapper) rather than `.look`, so the answering pose's CSS transition stays
intact; and `done` hops only when an answer arrives (done straight off
thinking/answering), not when a thread is reopened or the composer is
cleared. Verified with `scripts/_askmark-shot.ts` (stubbed stream, no model
calls): walks pass for answer / decline / timeout, same `<svg>` node, mark
renders = state changes (5 over 32 deltas), no long frames; 375px and 320px
phone headers fit. Native app: not started.

## Why

Today Ask Chapt wears the generic AI sparkle (`SparkleIcon` on the launcher,
`IcSpark` in the Spotlight header). The talking tile does two jobs the sparkle
can't:

1. **It's ours.** It's the ChaptOS smile tile with a speech tail, so the
   assistant reads as the product speaking, not a bolted-on AI.
2. **It shows status where you already look.** The header mark becomes a
   second, glanceable status read (listening, working, writing, done, stuck)
   next to the working line, without adding UI.

What it is not: a new information surface. Every state below is driven by
state the widget **already has**; no server or wire change.

## The states and where each one comes from

| Mark state | Driven by (all already in `ChatWidget.tsx`) | Surface |
|---|---|---|
| `idle` | default | launcher, header |
| `hover` | CSS `:hover` / `:focus-visible` on `.chat-launcher` (no React state) | launcher |
| `listening` | `dictation.listening`, or the composer has any text in it (focus doesn't matter) | header |
| `thinking` | `streaming` and the live message is not `composing` (tools running, working line rolling) | header |
| `answering` | `streaming` and `composing === true`, or a `verdict_draft` / `text` delta has arrived | header |
| `done` | `done` event on a turn with an answer and no `error` / `notice` → one hop, then `idle` after ~2.4s | header |
| `unsure` | the settled answer's `shape.type === "decline"`, or it carries an ask-back (chips / people / areas); holds until the next ask | header |
| `offline` | the turn ended with `error` or a `notice` (`timeout` / `error` / `cut_short`); holds until the next ask | header |

Note on `offline`: when chat is disabled (`enabled !== true`) the launcher is
hidden entirely, so there is no surface for "chat off". The grey face is
therefore used for **a turn that failed**, which is honest and useful. If a
"chat unavailable" launcher is wanted later, it's a product call, not part
of this.

## Architecture

**`lib/chat/mark-state.ts`**: the `MarkState` union plus a pure
`markStateFor(input)` that maps widget facts to a state. Pure, so it's unit-
tested and reusable by the native app (add it to the mobile-lint SHARED
whitelist when the app adopts it).

**`app/components/chat/ChaptMark.tsx`**: renders the one SVG with the mock's
layer structure. Props: `state`, `size`. It is `React.memo` with primitive
props and only ever writes `data-state` on the `<svg>`.

**`app/components/chat/chapt-mark.css`**: all poses and loops, imported by the
component. Kept in a component CSS file, not `app/globals.css`: the running
dev server has served stale globals before.

**`useMarkState()`** (in ChatWidget, or a small hook beside it): feeds
`markStateFor` and applies timing rules (see "Smoothness" below) so the value
handed to `ChaptMark` only changes at real phase boundaries.

## Smoothness: the rules that make it not janky

1. **One persistent SVG per surface, never remounted.** State changes flip one
   attribute; CSS transitions do the rest. No `key` changes, no conditional
   render between faces, no swapping components per state.
2. **Streaming must not re-render the mark.** ChatWidget re-renders on every
   delta. `ChaptMark` gets only `state` + `size` (memoized), and `useMarkState`
   returns a stable string that changes only at phase boundaries. Verify with a
   render counter (see Verification).
3. **Pose vs loop wrappers** (from the mock): `.pose` / `.look` / `.eye`
   *transition* to a pose; `.motion` / `.drift` / `.blink` *loop* inside them.
   Leaving a state eases out of the pose instead of snapping when its loop
   stops.
4. **Dwell / hysteresis.** A phase must hold at least 500ms before it can
   change, except a move into `done`, `unsure` or `offline`, which always
   goes immediately. That way a quick composing → tool call → composing flip
   doesn't make the face twitch between thinking and answering. `done` holds
   2.4s, then falls back to `idle`.
5. **Animate transform and opacity only.** Fill and stroke colour transitions
   are allowed only for the `offline` drain. No filters, stroke-width or
   layout properties.
6. **The pencil runs without JS per frame.** The mock drives it with
   `requestAnimationFrame`. In the app, sample the cursive paths once into
   about 48 keyframes (translate, rotate and a tiny wobble). Play them with the
   Web Animations API as three `element.animate()` calls: pencil transform,
   word-1 dash, word-2 dash. All three share one 2s `iterations: Infinity`
   timeline started at the same time, so they stay in sync. The eye tracking
   is a fourth keyframed animation on `.look` built from the same samples.
   Start them on entering `answering` and `cancel()` them on leaving (fade
   handled by CSS on `.pencil` / `.script`).
7. **Transform-origin trap.** The shared `.mk * { transform-box: fill-box;
   transform-origin: center }` also moves the pivot of any placement transform
   (it broke the pencil in the mock). Placement groups (`.pose`, `.motion`,
   the pencil mover) must set `transform-box: view-box`.
8. **Stagger blinks deterministically.** Seed `--bd` from `useId()` (hashed),
   not `Math.random()`, so marks on the same screen don't blink in unison and
   there's no hydration mismatch.
9. **Hover costs nothing.** Driven by `.chat-launcher:hover .mk`, so the
   pointer never triggers a React render.
10. **Reduced motion.** `prefers-reduced-motion` gives still faces. Every state
    must stay readable when still: the bubbles stay up, the pencil rests with
    both words written, `done` shows happy eyes with no hop. The WAAPI pencil
    checks `matchMedia` and doesn't start.
11. **Room around the mark.** The thought bubbles stick out above the tile by
    about 3 grid units (2px at 28px). The pencil sits within the tile. Give
    `.cs-mark` matching headroom so nothing clips (`overflow: visible` on the
    svg, no `overflow: hidden` on the bar).

## Phases

Each phase ships on its own.

**Phase 1: static mark, idle + hover.** Build `ChaptMark` and its CSS with every
state's markup present. Swap it into the launcher pill (replacing
`SparkleIcon`) and the desktop header `.cs-mark` (replacing `IcSpark` and its
lilac tilted tile). The launcher shadow stays lilac. Only `idle` and `hover`
are live. Visible win on day one, almost no risk.

**Phase 2: state machine.** Add `lib/chat/mark-state.ts` and `useMarkState`,
and wire `listening` / `thinking` / `done` / `unsure` / `offline` into the
header. Unit tests for `markStateFor` (every row of the table) and for the
dwell rules (fake timers: a 200ms flip doesn't change the face; `done` gives
way to `idle` at 2.4s; `offline` beats dwell).

**Phase 3: answering pencil.** Precompute the samples (module scope, once),
build the WAAPI keyframes, and wire start and cancel to the state. Check it
doesn't drift from the line at both header (30px) and stage sizes.

**Phase 4: phone.** The round launcher (`mobile-shell.css`, 50px) gets the mark
at about 30px, with a press dip instead of hover. The phone sheet header gets
the mark too, at 28px, left of the "Ask Chapt" title. It runs the same state
machine as desktop, since it's the only status read on the phone besides the
working line. The `.tick` (drag handle) stays where it is. The mark goes
beside it, outside the drag hit area, so a press on the mark doesn't start a
sheet drag. The ChatWidget's `phone ? tick : mark` branch becomes `tick` +
mark on phone. Check that the 375px header still fits the title, Approvals
and New with the mark added (drop the title's left margin if needed).

**Phase 5: the "ask this" glyph + cleanup.** Add `IcAsk` to `chat/icons.tsx`:
the mark's bubble silhouette on the 24-unit icon grid, outline only, no face,
`stroke-width 2`, `currentColor`:
`M7.3 3.3h9.4a4.8 4.8 0 0 1 4.8 4.8v5a4.8 4.8 0 0 1-4.8 4.8h-5.4l-4.1 3.4v-3.5a4.8 4.8 0 0 1-4.5-4.7v-5a4.8 4.8 0 0 1 4.6-4.8z`
(from the mock's "Inside answers" section). It replaces `IcSpark` in every
"ask this" spot:
  - the row affordance when `action === "ask"`: `AnswerBlock.tsx` row chev and
    `shapes/common.tsx` `Affordance` (14px)
  - the follow-up chip tile: `AnswerBlock.tsx` `.chip.next .tile` (13–14px)
  - the "Ask" pill in `shapes/Plan.tsx` `Go` (11px)

Colours and hover stay as they are (`.chev.ask`, `.go.ask` already violet), so
it's a glyph swap with no CSS change beyond checking the 11px pill
alignment. Then delete `SparkleIcon` (launcher) and `IcSpark` (no callers
left; grep first). The landing page's `#i-spark` symbol is a separate
marketing follow-up.

**Later: native app.** `mobile/` reuses `markStateFor` and re-implements the
drawing with `react-native-svg` + Reanimated (shared values per wrapper, no
`m.timing()` inside worklets). Its own plan.

## Verification

- **Unit (vitest):** `markStateFor` truth table; dwell hook with fake timers.
- **State walk (Playwright, read-only):** extend `scripts/_askmark-shot.ts`.
  Stub `/api/ai/chat` with a slowed SSE stream (step → step_start →
  composing → verdict_draft → answer → done) and record the header's
  `data-state` at each event. Expect `listening → thinking → answering →
  done → idle`. Run variants for a decline answer (`unsure`) and a
  `notice: timeout` (`offline`). Abort non-GET `/api` calls as usual (dev DB
  = prod).
- **No remounts:** tag the header `<svg>` with a JS property before asking and
  assert it's still the same node after the turn.
- **No extra renders:** dev-only render counter in `ChaptMark`. Over a full
  turn, renders must equal the number of state changes (about 5), not the
  number of deltas.
- **Frame budget:** a `PerformanceObserver` for `long-animation-frame` during a
  turn. No new long frames compared with a run on the current sparkle.
- **Reduced motion:** the same walk with `reducedMotion: "reduce"`. Screenshot
  each state; every face is readable and nothing moves.
- **Themes:** day and night (`chaptos:theme:v1`). The tile keeps its own
  lilac and ink like a sticker on both.

## Decisions

- **Listening** = dictation on, or the composer has text in it.
  (`input.trim().length > 0`, no focus requirement, no keystroke timing.)
- **Phone header** shows the mark beside the drag tick (Phase 4).
- **Inline "ask this" glyph** = the mark's bubble outline, no face (`IcAsk`,
  Phase 5). Chosen from the mock's "Inside answers" section.
