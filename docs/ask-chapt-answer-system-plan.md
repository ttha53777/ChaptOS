# Ask Chapt answer system: build plan

Handoff document. A fresh Claude Code session in this repo should be able to build the feature from this file plus the mock, with no other context.

- **Mock (the visual spec):** `_design/Ask Chapt Answer System Mock.html`. Open it in a browser. Every answer has a Today / New switch and build notes. Section ids: `#audit #system #figure #facts #steps #reasons #quote #note #clarify #decline #slips #thread #rollout`.
- **Status (2026-11-12):** Phases 1–5 BUILT, uncommitted, behind `ASK_CHAPT_ANSWER_KIT=1` (Phase 1 is unflagged). `tests/ai/answer-kit.test.ts` (26) covers the pure builders; `scripts/_kit-shot.ts` drives every block in the real widget with shapes from the real builders. Not done: Phase 6 (evals, server-set tone, flag-on comparison); no live-model run yet. Decision 3 resolved: the rest-of-record panel shows what `list_brothers` already shows every member.
- **Builds on:** `docs/ask-chapt-list-forms-plan.md` (same mechanism, read its section 2 first) and the shipped shapes in `lib/ai-shapes*.ts` / `app/components/chat/shapes/`.

## 1. What this is

The list forms fixed answers that are "several like things". Every other answer still falls back to one of four plain looks:

| Today | Where it comes from |
|---|---|
| A verdict sentence and nothing under it | `compose_answer` with no rows and no shape (single figures, the treasury fast path's `draw`) |
| A prose column | the `text` SSE path → `MarkdownLite` → `.note` (refusals, single how-to, clarifying questions, proposal acks) |
| Names that can't be tapped | prose never carries refs; only rows do |
| Status written as content | `ChatWidget` writes `"(network error)"` into `content`; Stop renders `<div class="note"><em>Stopped.</em></div>`; the route sends timeouts and errors as `text` |

The system gives every answer the same three parts: **headline** (the verdict, one mark coloured by tone), **one body block** on a sheet, and a **footing** (sources, feedback, next questions). Status moments become **slips**. Eight bodies are added:

| Block | Shape `type` | Server work | Used when |
|---|---|---|---|
| Figure | `figure` | new builder | the question asks for one quantity |
| Fact card | existing `record` | client restyle + additive PeekCard fields | one record's details |
| Steps | `steps` | new closed playbook list | a product how-to with a known path |
| Reasons | `reasons` | new builder (attendance only in v1) | "why" about an attendance judgment |
| Quote | `quote` | new builder over `search_meeting_notes` | the answer is what the minutes say |
| Note | (client) + `note_refs` event | ref matching on the text path | everything else that is prose |
| Clarify | askback `areas` | closed enum | a question back whose answers are areas |
| Decline | `decline` | fixed copy | out of scope |

Out of scope, do not change: the reasoning ledger, the writ cards, approvals, file citations, and the 15 shapes that already ship.

## 2. Rules every phase keeps

These are the list-forms rules plus two new ones. Breaking any of them is a bug.

1. **The model names the block. The server fills every number, date, name and quote**, from tool calls that ran this turn (`ShapeEvidence`), re-reading through the scoped client when it must. A builder returns `null` when it can't qualify, and the answer then goes out exactly as today.
2. **Rows always ride along.** `rows` stay 1:1 with what a shape draws, so keyboard selection, taps and any client that doesn't know the type keep working. Wire changes are additive only (`lib/api-types` is a contract; see AGENTS.md).
3. **A builder shows nothing the evidence tool didn't already show this user.** Excuse reasons only when `canSeeExcuseReason(access, brotherId)`; a member's GPA/dues only if `get_brother`/`list_brothers` would return them to this caller (`ToolAccess`).
4. **Closed enums for every model-chosen parameter** (metric, playbook, area, panel, judgment). They map server-side to queries or copy.
5. **New (reality rule): nothing is drawn that the app doesn't have.** Every keycap label, field name and screen in a playbook or note must exist in the UI today. No tickets, RSVPs, reminders, member notes, nudges, vote counts, per-event budgets. If a fact isn't in the schema, the block omits it.
6. **New: one body per answer.** A shape, a list form, or a Note. Never prose plus a shape.

## 3. Wire changes (`lib/api-types/chat.ts`)

All optional. Add each in the phase that uses it; extend `tests/contracts/api-types.contract.ts` in the same commit.

```ts
// AnswerData
tone?: "good" | "watch" | "now" | "yours" | "chapt";   // colours the mark + block accents

// AnswerShape union gains:
interface FigureShape {
  type: "figure";
  metric: "balance" | "members";                        // v1
  value: number; unit: "usd" | "count";
  delta?: { by: number; since: string };                // since = YYYY-MM-DD
  series?: Array<{ date: string; value: number }>;      // >= 4 real points or omitted
  terms?: Array<{ label: string; amount: number; op: "+" | "-" }>; // must sum to value
  split?: Array<{ label: string; count: number }>;      // members only; must sum to value
  asOf: string;
}
interface StepsShape {
  type: "steps";
  playbook: string;                                     // key, for telemetry
  crumbs: Array<{ label: string; icon: string }>;
  steps: Array<{ title: string; hint?: string; fields?: Array<{ label: string; example?: string }> }>;
  screen: { label: string; path: string };              // resolved like row.screen
  perm?: { label: string; ok: boolean };
}
interface ReasonsShape {
  type: "reasons";
  judgment: "attendance";
  subject: { id: number; name: string; role: string; joinedAt: string };
  gauge: { value: number; atRisk: number; watch?: number };          // percent
  strip: Array<{ eventId: number; date: string; state: "there" | "missed" | "excused" | "unrecorded" | "ahead" }>;
  rest: Array<{ label: string; value: string; ok: boolean; note?: string }>;
  excluded: Array<{ eventId: number; date: string; why: "excused" | "unrecorded"; reason?: string }>;
  pathBack: { left: number; outcomes: Array<{ attend: number; pct: number; clears: boolean }> } | null;
  today: string;
}
interface QuoteShape {
  type: "quote";
  meeting: { id: number; title: string; date: string };
  text: string;                                         // verbatim minutes substring or a summary decision
  decided: boolean;
  items: Array<{ id: string; text: string; owner: string | null; due: string | null; done: boolean }>;
}
interface DeclineShape { type: "decline"; scope: string }   // fixed copy with the org's name

// AnswerRow
panel?: "gauge" | "strip" | "rest";                     // reasons rows only

// AskBackQuestion
areas?: Array<"attendance" | "money" | "service" | "tasks" | "events" | "roster">; // same length as chips

// PeekCard (Fact card)
date?: string;                                          // event/task cards, YYYY-MM-DD, for the date stub

// New SSE events (route doc comment + ChatStreamEvents)
notice    { kind: "timeout" | "error" | "cut_short" }  // sent alongside the existing text, never instead
note_refs { refs: Array<{ text: string; ref: EntityRef }> } // after a text answer finishes
```

`notice` is sent **in addition to** the text the route already writes (`CUT_SHORT_TEXT`, the timeout and error lines), so a client that doesn't know it still says something. The web client hides that text when a notice arrives.

## 4. Phases

Each phase is shippable alone. Phases 2-5 sit behind `ASK_CHAPT_ANSWER_KIT=1`, the same way list forms use `ASK_CHAPT_FORMS` (`formsEnabled()` / `offeredShapeTypes()` in `lib/ai-shape-request.ts`): off, the model is never offered the new types and requests for them are dropped. Clients always know how to draw them.

### Phase 1: the grammar (client only, no flag)

Touches every answer and changes no server behaviour.

- **Footing.** In `AnswerBlock.tsx`, replace `.meta-row` + `.follows` with one `Footing` component: `From` + source chips, thumbs on the right, `Next` chips (arrow icon) below. `askback` still suppresses follows.
- **Tone.** `answer.tone` doesn't exist yet, so derive it on the client for now: `tally`/`pastdue`/`yesno` NO → watch; `missing`/`zero` → now; advisory/plan → chapt; else now. Put `t-<tone>` on `.answer`. The verdict `em::before` and block accents read `--tone*` variables.
- **Note.** Restyle `MarkdownLite` into the Note: `#`–`###` become mono kickers, `-` bullets become tone diamonds, the margin rule sits on `.note`. Keep the streaming font sizes identical so the swap at `done` doesn't jump. Inline `` `code` `` becomes a keycap only when its text is in `UI_LABELS` (new closed list in `app/components/chat/ui-labels.ts`: "Open check-in", "Mark who attended", "Excuse", "Mark exempt…", "Log Expense", "Log Revenue", "Add Transaction", "Settings", "Thresholds", "Custom metrics", "Add metric"…; grep each one before adding). Anything else stays `<code>`.
- **Slips.** `ChatMessage` gains `error?: { at?: string }`. In the stream's catch branch, set `error` with the source of the last active ledger step instead of writing `"(network error)"`, and render a watch slip with **Try again** (re-sends the same question). For `stopped`, render a dashed slip that says how many steps finished, with **Finish it** (re-send). A message with proposals and no answer gets a lilac "Drafted, not sent" slip under the writ. Old `localStorage` messages whose content is literally `"(network error)"` render as the error slip too.
- **CSS.** New `app/paper-chat-kit.css`, imported next to `paper-chat-forms.css`. Don't add to `app/globals.css` (the running dev server can serve a stale copy; see memory `dev-server-stale-globals-css`).
- **Verify.** Extend `scripts/_shapes-shot.ts` with stubbed SSE for: prose answer, stopped, network error, proposal-only. Check 1440 / 390 / dark.

### Phase 2: Figure and Fact card

**Figure** (`lib/ai-shapes-figure.ts`, registered in `FAMILY_BUILDERS`):

- `balance`: needs a `get_treasury` call this turn. Terms come from its `breakdown`: opening balance (omit if null), door revenue (omit if 0), income, expense. They must equal `balance` via the same `netBalance()`, or terms are dropped. Series: re-read posted, non-deleted transactions plus party door revenue for the active semester (same audience as `get_treasury`, any member) and fold into a running balance by date. Only send it with at least 4 distinct dates. Delta: since the first of the current month.
- `members`: needs `list_brothers` (or the roster count read). Value = active roster; split = joined before vs during the active semester (`Membership.joinedAt` against the active `Semester` start). The two must sum.
- Fast path: `treasury-balance`'s `draw` in `lib/ai-fastpath.ts` returns the figure shape (`buildFigure` is pure given the result) so the fast path and the model draw the same thing.
- Prompt: add `figure` to the `ANSWER SHAPES` paragraph: "one quantity → figure with metric".

**Fact card**: no new shape. It's the existing `record` shape drawn differently when there is exactly one card of type `event` (or a dated task).

- `PeekCard.date` (additive) set in `eventPeek` / `taskPeek` (`lib/services/peek-service.ts`).
- `eventPeek` gains a "Spent so far" fact when `TransactionCalendarEvent` links exist (sum + count; same audience as `list_transactions`).
- Owner: only if the event has a linked Programming owner. Confirm whether that link exists before building; if it doesn't, leave it out (rule 5).
- Client: `shapes/Record.tsx` draws the ticket (date stub, countdown pill from `date` vs today, facts grid, Open button = existing peek).

### Phase 3: the plain-text paths move into compose_answer

Prompt edits live in `lib/ai-prompt.ts` (the `ANSWER FORMAT`, `PRODUCT HOW-TO`, `ASKING BACK` paragraphs). Afterwards, plain text is reserved for one-line proposal acknowledgements, and the client draws those as the Drafted slip.

- **Steps.** New `lib/ai-howto.ts`: `HOWTO_PLAYBOOKS`, a closed record keyed by playbook. Each entry has `screen` (a `SCREEN_PATHS` key), `crumbs`, `steps[{title, hint, fields}]` and `perm` (a permission bit or null). Write every entry by opening the real screen. Start with the ones the mock and evals need: `custom_metric` (Settings › Custom metrics: Name, Slug, Unit, Goal (per member), At Risk below, Watch below, KPI card headline; `MANAGE_SETTINGS`), `thresholds`, `log_expense` (Treasury › Log Expense, including linking an event), `open_checkin`, `mark_attendance`, `submit_excuse`, `mark_exempt`, `add_task`, `add_event`, `invite_member`. The model sends `shape: { type: "steps", playbook, examples? }`. `examples` only fills field keys the playbook declares, at most 40 chars each, as plain text. `perm.ok` comes from the caller's role bits. A how-to with no playbook is a Note.
- **Clarify.** `parseComposeAnswer`'s askback parser accepts `areas` (must match `chips` 1:1, else dropped). `shapes/`-style tiles in `AnswerBlock`'s `AskBackBlock`, with a fixed sketch per area (`app/components/chat/area-glyphs.tsx`). A tap sends the chip text as today. Prompt: one-line clarifying questions now go through askback, with `areas` when the choices are areas.
- **Decline.** `decline` shape, no rows, no sources. The scope line is fixed copy: `I only read {org}'s records in ChaptOS (events, money, people, minutes, docs).` The server fills the org name. Prompt: refusals use it, and the verdict answers any in-scope part first.

### Phase 4: Reasons (attendance)

`lib/ai-shapes-reasons.ts`. This is the biggest single piece.

- **Request:** `shape: { type: "reasons", judgment: "attendance" }`. It qualifies only when exactly one member was read through `get_brother_attendance` (or `get_brother`) this turn.
- **Builder reads** in waves (the pool is 2 per instance, so never three parallel scoped queries; see memory `scoped-query-pool-budget`):
  1. The member's roster row, the org thresholds (`attendanceAtRisk`, `attendanceWatch`, `serviceHoursGoal`, `gpaAtRisk`, `gpaWatch`) and the active semester.
  2. Every mandatory `CalendarEvent` in the semester (past and future), plus this member's `AttendanceRecord` and `AttendanceExcuse` rows.
- **Counting must equal the roster %.** Reuse the counting in `lib/attendance.ts`: mandatory only, and an approved excuse removes the event from both sides. Add a unit test asserting the gauge equals `Membership.attendance` on seeded data.
- **Strip states:** `there` / `missed` (a record exists) · `excused` (approved excuse) · `unrecorded` (past, no records for anyone) · `ahead` (future).
- **`rest`:** dues owed, service vs goal, GPA vs watch line, each included only when rule 3 allows it for this caller.
- **`excluded`:** approved excuses (reason only when `canSeeExcuseReason`) and unrecorded meetings.
- **`pathBack`:** a pure function `pathBack(attended, counted, left, atRisk)` returning the outcomes for attending all `left` meetings and all but one. Return null when `left === 0`. When even a clean run doesn't clear the bar, the client says so plainly.
- **Reason cards are the model's rows**, each with `panel`. Up to 4. Rows with an unknown or missing panel keep the card and lose the link. Strip tiles open the event peek. Extend `checkVerdict` so a percentage in the verdict must equal `gauge.value` (it already retries once, then replaces).
- **Prompt:** "why is X at risk / flagged / on watch for attendance" → `get_brother_attendance` then compose_answer with `reasons`. GPA, service and custom-metric "why" questions stay rows until a later phase; they have no per-event history.
- **Client:** `shapes/Reasons.tsx`: the folder (tab, stamp, gauge, strip, rest panel), the cards with hover/focus lighting their panel, the Fair strip, the Way back card, and the actions. **Draft a check-in task** sends a follow-up ask that the model turns into the existing `propose_add_deadline` (nothing new on the server). **Open his card** is the member peek.

### Phase 5: Quote and entity chips

- **Quote** (`lib/ai-shapes-quote.ts`): `shape: { type: "quote", meeting: <id>, decision?: <index>, quote?: <string> }`. The meeting must be in this turn's `search_meeting_notes` result. Use `quote` only if, after whitespace normalisation, it is a verbatim substring of that meeting's minutes (`description`). Otherwise fall back to `summary.decisions[decision]`, and with neither return null. `decided` is true when a decision index is valid. `items` are that meeting's `summary.actions`. Ticking one uses the existing meeting action-item route, with that route's permission. No vote counts, no recorder, no done dates (none are stored).
- **`note_refs`**: after a text answer completes, the route matches the text against the turn's `RefIndex` (exact, non-ambiguous labels only) and sends `note_refs`. The client wraps the first occurrence of each as an entity chip that opens the peek. Reasons cards use the same matcher on their subtitles.

### Phase 6: evals, tone, flag on

- `scripts/eval-ask-the-chapter.ts`: add `expectShape` cases. Two each for figure, steps, decline and reasons, one each for clarify and quote, plus negative cases (a GPA "why" must NOT be `reasons`; an out-of-scope question with an in-scope part must answer it in the verdict). Re-derive every assertion from the seed (memory `ask-the-chapter-eval-seed-drift`).
- `tone` moves to the server: the model may set it in compose_answer (closed enum), and the builder overrides it when the shape implies one (reasons → watch, decline → now). The client derivation from Phase 1 stays as the fallback.
- Run the full suite with the flag off, then on, and compare before turning `ASK_CHAPT_ANSWER_KIT=1` on in Vercel. (The OpenAI key ran out of credits during the last eval run.)

## 5. Files

| New | Purpose |
|---|---|
| `lib/ai-shapes-figure.ts`, `lib/ai-shapes-reasons.ts`, `lib/ai-shapes-quote.ts` | builders, registered in `FAMILY_BUILDERS` |
| `lib/ai-howto.ts` | closed playbook list (server only) |
| `app/components/chat/shapes/{Figure,Steps,Reasons,Quote,Decline}.tsx` | sheets, registered in `shapes/index.tsx` |
| `app/components/chat/{Footing,Slip}.tsx`, `ui-labels.ts`, `area-glyphs.tsx` | grammar pieces |
| `app/paper-chat-kit.css` | all new styles, paper only (paper is the only look since the Ledger removal) |
| `tests/ai/answer-kit.test.ts`, `tests/ai/answer-kit-db.test.ts` | pure builders + DB-backed |

| Changed | Why |
|---|---|
| `lib/ai-shape-request.ts` | new types, params, flag |
| `lib/ai-tools.ts` | compose_answer schema (`panel`, askback `areas`, shape params), `parseComposeAnswer` |
| `lib/ai-prompt.ts` | ANSWER FORMAT / SHAPES / HOW-TO / ASKING BACK paragraphs |
| `app/api/ai/chat/route.ts` | `notice` + `note_refs` events, decline scope fill |
| `lib/ai-fastpath.ts` | balance draws a figure |
| `lib/services/peek-service.ts` | `date`, Spent so far |
| `app/components/chat/{AnswerBlock,MarkdownLite,types}.tsx`, `ChatWidget.tsx` | footing, tone, note, slips, `error` |
| `lib/api-types/chat.ts` + contract test | wire types |

## 6. Tests and verification

- **Pure unit tests:** figure terms sum (or are dropped), series needs at least 4 points, members split sums, `pathBack` table (5 left / 8 counted / 5 attended / 75 → 77% clears and 69% doesn't; 0 left → null; unreachable → no clears), strip states, quote verbatim check (whitespace, curly quotes), playbook `examples` filtering, askback `areas` length mismatch dropped, `UI_LABELS` keycap gating.
- **DB tests** (memory `vitest-without-docker` if Docker hangs): reasons gauge equals `Membership.attendance` for seeded members; excuse reason hidden from a non-manager caller; figure balance equals `get_treasury`.
- **Visual:** `scripts/_shapes-shot.ts` per block on real dev data with stubbed SSE, pinning TODAY (dev data ends Sep 2026) and stubbing `/api/auth/me` terms (TermsGate). 1440 / 390 / dark. Compare against the mock sections.
- **Gates:** `npx tsc --noEmit` plus the vitest files above (there's no lint script; see memory `verification-gates`). The full vitest suite flakes one arbitrary test per run, so re-run it alone.

## 7. Things that will bite

- **Rows 1:1.** A builder that changes the set without replacing `rows` breaks keyboard selection.
- **`resolveScreen` on every row.** A row whose `screen` wasn't resolved crashes the app via `isEventIdea`. The steps shape's `screen` must also be resolved before the wire.
- **The compose_answer schema rides on every request.** Keep new descriptions to one line, and offer new enums only when the flag is on.
- **The `.who` class** inside answers is the assistant name label. Don't reuse it.
- **Recurring titles** ("Chapter Meeting") get no ref from `RefIndex`, so the reasons strip must carry `eventId` from the builder, not from refs.
- **Client bundle boundary.** `lib/ai-howto.ts` is server-only, so send resolved crumbs/steps over the wire and never import it from a client component (memory `lib-client-bundle-boundary`).
- **The figure series read** can queue behind the pool. Run it after `get_treasury`'s result is in, not in parallel with other scoped reads.
- **Don't revive the "Today" prose for errors.** Old `localStorage` messages hold `"(network error)"` as content; map that string to the slip.

## 8. Decisions still open

1. **Tone source:** client-derived only (Phase 1) or model-set (Phase 6)? Recommendation: both, with the builder override.
2. **Fact card owner:** only if a CalendarEvent ↔ Programming owner link exists today. Check before Phase 2.
3. **Reasons `rest` panel for non-managers** asking about someone else: show only what `get_brother` returns them, or hide the panel entirely? Recommendation: hide it unless the caller is the member or holds `MANAGE_BROTHERS`.
4. **Who decided an excuse** ("excused by Jordan"): `get_brother_attendance` doesn't return `decidedById` today. Add it, gated like the reason, or leave it out? Recommendation: leave it out for v1.
5. **Flag name:** `ASK_CHAPT_ANSWER_KIT`.

## 9. Kickoff prompt for the next session

> Build Phase 1 of `docs/ask-chapt-answer-system-plan.md` (the answer grammar: footing, tone, Note restyle, slips). Read the plan's sections 2 and 4, open `_design/Ask Chapt Answer System Mock.html` for the look (`#system`, `#note`, `#slips`), and match `app/paper-chat-forms.css` conventions. Client only: no wire or prompt changes. Verify with a `_shapes-shot.ts` extension at 1440/390/dark and `npx tsc --noEmit`, then stop and show me before Phase 2.
