# Ask Chapt list forms: build plan

Handoff document. It is written so a fresh Claude Code session in this repo can build the feature from this file plus the mock, with no other context.

- **Mock (the visual spec):** `_design/Ask Chapt List Forms Mock.html`. Open it in a browser. Every form has a Today / New switch and a build note. Section ids: `#ranked #dated #logbook #status #record #table #roll #mixed #receipt #pastdue #plan #zero #yesno #ladder`.
- **Status (2026-11-10):** Phases 0–7 built and committed (b49e156 … 8915f8d), behind `ASK_CHAPT_FORMS=1` (off by default; turn it on in Vercel when ready). Not built: the optional `"doc"` ref / Docs drawer; the `voted` roll split (a manager's poll read names only who hasn't voted). Ledger screenshots were skipped: `lib/aesthetic.ts` pins every user to paper. Evals: 12/16 list-form cases passed before the OpenAI key ran out of credits; the flag-off/flag-on full-suite comparison is still to run.
- **Date written:** 2026-11-10.

## 1. What this is

Ask Chapt answers "several things" with one picture: a verdict sentence, then a ruled list of boxes (`.reslist > .res`: glyph, title + subtitle, value, chevron). That list is used even when the rows share something the eye could use. This project replaces that one picture with thirteen forms, each used only when it fits, and keeps the list as the fallback.

Out of scope, do not change: the verdict, ask-back, proposals (writ cards), the reasoning ledger, file citations, and the four shapes that already ship (`tally`, `breakdown`, `week`, `missing`).

| # | Form | Shape `type` | Used when | Draws |
|---|---|---|---|---|
| 01 | Standings | `ranked` | rows of one kind each carry one number | bars on one scale, the org's threshold line, an "under the bar" cut; dated rows keep date order with a date stub and no rank |
| 02 | Today line | `dated` | calendar things (tasks, deadlines, events), at least one today or later | one rail in date order, a Today rule, per-row distance; only an open task can be "late" |
| 03 | Logbook | `logbook` | calendar things, all in the past (events or finished work) | the count, then month shelves of small dated tickets |
| 04 | Progress | `status` | every row has a status and they differ | one block per row, stuck rows first, done rows folded |
| 05 | The record | `record` | the question was a lookup for one thing | the peek card inline |
| 06 | Side by side | `table` | rows of one kind with the same 2 to 4 measures | sortable columns, only under-threshold cells tinted |
| 07 | Roll call | `roll` | the rows are just people, any number | name chips under a count, with an optional two- or three-way split |
| 08 | By drawer | (client only) | rows of more than one kind, not all on the calendar | the list, grouped under tabs for the app section each row lives in |
| 09 | Receipt | `receipt` | every row is a payment | the figure asked for, an amount column, totals that sum from the lines shown |
| 10 | Past due | `pastdue` | every row is open work whose date has passed | bars reaching back from a shared Today edge, owner avatar |
| 11 | Game plan | (client only) | every row carries a `tier` | cards for "do first", rows for "then", quiet lines for "later" |
| 12 | Nothing yet | `zero` | a count or list question, the filter is a real category, nothing in it | one dashed slot, what was checked, and what those records are filed as instead |
| 13 | Yes or no | `yesno` | a yes-or-no question and every row can be marked pass or fail | a computed YES/NO stamp, one face per row, only the exceptions as rows |

## 2. How the mock maps onto the real architecture

The mock describes a `layout` field and a server that inspects rows. **Do not build it that way.** The app already has the right mechanism and three facts force its use:

1. **Rows are capped at 6.** `parseComposeAnswer` in `lib/ai-tools.ts` slices `args.rows` to `opts.maxRows ?? 6`. Eleven absentees, nine meetings or fifty-two members cannot arrive as model rows.
2. **Refs are matched by title and repeated titles are dropped.** `lib/ai-refs.ts` marks a label that resolves to two ids as `AMBIGUOUS`. Nine rows titled "Chapter Meeting" get no refs.
3. **The model never supplies numbers.** Existing rule: the model names a shape, the server builds it from data read this turn.

So every data form is a new member of the existing `AnswerShape` union, requested through the existing `shape` property of `compose_answer`, and built in `lib/ai-shapes.ts` from `ShapeEvidence`. The pieces that already exist and must be reused:

| Piece | Where | What it does |
|---|---|---|
| `ShapeRequest`, `parseShapeRequest`, `SHAPE_TYPES` | `lib/ai-shape-request.ts` | the model's half: a type plus a few closed-enum params; malformed input is dropped, never fatal |
| `ShapeEvidence`, `createShapeEvidence` | `lib/ai-shapes.ts` | records each successful read tool call (name, args, result) this turn |
| `buildShape` → `BuiltShape { shape, rows }` | `lib/ai-shapes.ts` | builds from evidence, re-reading the DB through the scoped client; never throws; returns null to fall back |
| answer assembly | `app/api/ai/chat/route.ts` around the `if (answerCall)` block | `built ? built.rows : attachRefs(citedRows, refIndex)`, then `resolveScreen`, then `send("answer", …)` |
| wire types | `lib/api-types/chat.ts` | `AnswerData.shape?: AnswerShape`; "new types may be added; ignore ones you don't know" |
| client dispatch | `app/components/chat/AnswerShape.tsx` (`isKnownShape`, `ShapeBlock`) and `AnswerBlock.tsx` | unknown shape types render the plain rows |
| row actions and keyboard | `app/components/chat/types.ts` (`rowAction`, `stepRow`) | one precedence for click and Enter: peek, idea, nav, ask |

Conventions every new shape must keep:

- **`rows` line up 1:1 with the shape's `items`.** The shape carries only the extra facts by index; identity, title and `ref` stay on the row. That is what keeps keyboard selection and taps correct, and what an older client falls back to.
- **Numbers and dates on the wire, never phrases.** Send `date: "2026-11-04"` and `today: "2026-11-10"`, not "6 days late". The client computes labels from `shape.today` (a snapshot, so an answer reopened tomorrow from `localStorage` stays self-consistent).
- **A builder shows nothing the evidence tool did not already return to this user.** Tools are gated by `ToolAccess` (`canAccess` in `lib/ai-tools.ts`). A builder may re-read the DB, but only for fields the same tool call exposes to this caller. This is the privacy rule for rankings and tables.
- **Closed enums for every model-chosen parameter.** A metric, a test or a grouping is an enum the server maps to a query. This is also what stops nonsense like ranking graduation years: only known metrics can be ranked.

### 2.1 Which records are in the picture (the selection rule)

A builder needs to know the set. Rule, implemented once in a helper (`selectFromEvidence`):

1. The **source** is the most recent successful call of a tool the shape accepts (table in section 4). No such call this turn: return null.
2. If the model sent rows, every one resolves to a record in that source, and there are fewer than the row cap: the set is **exactly those records** (the model listed a deliberate subset).
3. Otherwise the set is the **whole source result**, capped per shape. When capped, set `truncated: { of }` and the client shows "+ N more"; forms whose point is a total or a count (`receipt`, `logbook`, `yesno`) must not draw a net, a headline count or a stamp over a truncated set.

Resolving rows to source records uses id-carrying payloads directly, not `RefIndex` title matching, so recurring titles work. Add an optional `date` (`YYYY-MM-DD`) to the compose_answer row schema so a row can disambiguate "Chapter Meeting"; keep its description to one short line because the tool schema rides on every request.

### 2.2 Who picks the form

The mock's "ladder" becomes two things:

- **Prompt guidance** (`lib/ai-prompt.ts`, the existing `ANSWER SHAPES:` paragraph): which shape to name for which question, in the ladder's order, with the three tie-break rules: a number on every row beats a date; a shared date beats sorting by kind; never choose by how many rows came back.
- **A `qualifies` check inside each builder**: every record in the set must have what the form needs, or the builder returns null and the list is drawn. A wrong pick costs nothing.

Two forms need no server or prompt change and are decided on the client from rows that already arrive:

- **Game plan:** every row has `tier`.
- **By drawer:** every row has `ref`, and there are at least two distinct `ref.type` values.

### 2.3 Verdict consistency

The model writes the verdict before the server computes the picture, so they can disagree. Use the existing retry path (push a `role: "tool"` error and `continue`, as the citation retry does) for the two cases where a contradiction is visible:

- `yesno`: the verdict's leading word disagrees with the computed `holds`. Feed back the computed result and the failing names.
- `logbook` / `zero`: the verdict states a count that differs from the built count.

One retry at most, then send the shape and a verdict rewritten by a server template ("No. 1 of 6 hasn't.").

## 3. Wire types to add (`lib/api-types/chat.ts`)

All additive. Extend the `AnswerShape` union; export each interface from `lib/api-types/index.ts` and re-export through `app/components/chat/types.ts`. Money is integer cents. Nullable is `| null`, not `?:`, where the server always sends the key.

```ts
export type RankMetric = "service_hours" | "gpa" | "attendance" | "dues_owed" | "event_attendance";

/** One number per row on a shared scale. rows[i] ↔ items[i]. */
export interface RankedShape {
  type: "ranked";
  metric: RankMetric;
  kicker: string;                       // server-built: "Service hours · new members · Fall 26"
  unit: "hrs" | "usd" | "pct" | "gpa";
  better: "higher" | "lower";           // dues_owed is "lower": colours and cut line flip
  max: number;                          // scale end; 100 for pct, 4 for gpa, else the largest value
  min: number;                          // scale start; 0 except gpa (see 4.1)
  bar: { at: number; label: string } | null;   // the org's threshold, null when unset
  order: "rank" | "date";               // "date": date stubs, no rank numerals, no cut line
  items: Array<{ num: number | null; date: string | null }>;   // num null = not measured yet
  truncated: { of: number } | null;
}

/** Calendar things around today. rows[i] ↔ items[i], date order. */
export interface DatedShape {
  type: "dated";
  today: string;
  items: Array<{ date: string; time: string | null; kind: "task" | "event"; late: boolean; done: boolean }>;
}

/** Calendar things that already happened. rows[i] ↔ items[i], oldest first. */
export interface LogbookShape {
  type: "logbook";
  noun: { one: string; many: string };  // "service event" / "service events", from the org's type label
  period: string;                       // "Fall 26"
  items: Array<{ date: string }>;
  truncated: { of: number } | null;
}

export interface StatusShape {
  type: "status";
  kicker: string;
  today: string;
  items: Array<{ state: "done" | "open" | "stuck"; why: "late" | "unowned" | null; date: string | null; owner: string | null }>;
}

/** The peek card, inline. cards[i] is for rows[i]. */
export interface RecordShape { type: "record"; cards: PeekCard[] }

export interface TableShape {
  type: "table";
  kicker: string;
  cols: Array<{ key: RankMetric; label: string; unit: RankedShape["unit"]; better: "higher" | "lower"; bar: number | null }>;
  cells: Array<Record<string, number | null>>;   // null = not measured: drawn as a dash, never tinted
  dates: Array<string | null> | null;            // set when rows are dated things; first column shows the stub
  truncated: { of: number } | null;
}

export interface RollShape {
  type: "roll";
  groups: Array<{ label: string; flag: boolean }>;   // flag = the group the question is about; no implied good/bad order
  items: Array<{ group: number; note: string | null }>;
  truncated: { of: number } | null;
}

export interface ReceiptShape {
  type: "receipt";
  kicker: string;
  headline: "out" | "in" | "net";       // which total leads; from the request, default by what the lines contain
  totals: { out: number; in: number; net: number } | null;   // null when truncated: no sum over a sample
  items: Array<{ date: string; cents: number; pending: boolean }>;
  truncated: { of: number } | null;
}

export interface PastDueShape {
  type: "pastdue";
  today: string;
  items: Array<{ date: string; owner: { kind: "member" | "role" | "everyone" | "none"; label: string } }>;
}

export interface ZeroShape {
  type: "zero";
  filter: string;                       // the org's own word: "Service"
  noun: string;                         // "events"
  searched: { count: number; scope: string };   // 41, "since Aug 24"
  instead: Array<{ label: string; count: number }>;
  canCreate: boolean;                   // show "Plan one" only when the caller may propose it
}

export type YesNoTest = "dues_paid" | "task_done" | "attended" | "service_met" | "gpa_met" | "voted";

/** rows are ordered failures first. rows[i] ↔ items[i]. */
export interface YesNoShape {
  type: "yesno";
  test: YesNoTest;
  holds: boolean;
  headline: string;                     // server-built: "5 of 6 have paid"
  kicker: string;                       // "Exec · dues for Fall 26"
  items: Array<{ pass: boolean }>;
}
```

Also:

- Move `PeekCard`, `PeekFact`, `PeekRow`, `PeekSection`, `PeekTone` from `lib/services/peek-service.ts` into `lib/api-types` (type-only; re-export from the service so imports don't move). They become wire types the moment `RecordShape` ships.
- `RefType` gains `"transaction"` in Phase 6. Widening a union is additive only if clients ignore unknown values; the web client already treats an unknown ref as no action. Say so in the type's comment.
- Add each new shape to `tests/contracts/api-types.contract.ts` in the style used there, so `tsc` fails when a builder's return drifts.

## 4. Per-form build notes

Evidence = the read tools whose result can be the source. Names are from `lib/ai-tools.ts`. Items marked **verify** were not confirmed while planning.

### 4.1 `ranked` (Standings) — mock `#ranked`
- **Evidence:** `list_brothers`, `get_custom_metrics` (members); for `event_attendance`, `list_calendar_events`.
- **Request:** `{ type: "ranked", metric }`.
- **Build:** read the metric for the set. Thresholds come from `orgStanding(scoped, orgId, rows)` (already used by `buildTally`), which also returns `measured`; an unmeasured member gets `num: null`, sorts last, is drawn as "not recorded" and is never coloured (see memory note "measured standing").
- **`better: "lower"`** for `dues_owed`: rank ascending is best, the cut line reads "over the bar", fill colours swap.
- **Scale:** bars from zero make GPAs of 3.1 to 3.9 look identical. For `gpa` set `min` to one whole point below the lowest value (floor), and draw a broken-axis mark at the left. Percentages always run 0 to 100.
- **Dated variant:** `metric: "event_attendance"` gives `order: "date"`. **Verify** whether `list_calendar_events` returns an attendance rate; if not, the builder computes present / roster per event with one grouped query, gated on the same permission `get_event_attendance` requires.
- **Cap:** 12 rows, then `truncated`. A "show all" control is a follow-up question chip, not client paging.
- **Qualifies:** at least 2 records, all one kind.

### 4.2 `dated` (Today line) — mock `#dated`
- **Evidence:** `list_deadlines` and/or `list_calendar_events`, `weekly_digest`.
- **Build:** merge, sort by date then time. `late = kind is task && status is "open" && date < today`. `done = task done, or event date < today`. Dated tasks are mirrored as deadline-type CalendarEvents; reuse the dedupe in `weekFromRows` (date + title).
- **Qualifies:** at least one item with `date >= today`; not all inside one 7-day window when the request named a week (that stays `week`).
- **Client groups:** Before today, Today, Next 7 days, Later, computed from `shape.today`. "Late" is a per-row flag and a count in the first group's label, never a group.

### 4.3 `logbook` — mock `#logbook`
- **Evidence:** `list_calendar_events`, `list_service_events`, `list_parties`, `list_programming_events`, `list_fundraisers`, or `list_deadlines` with `status: "done"`.
- **Build:** all dates before today, oldest first. `noun` comes from the tool call's type filter mapped to the org's event-type label, else "event". Months with nothing are not sent and not drawn.
- **Client:** count, then one shelf per month. More than 12 tickets in a month: show 8 and "+ N more". Tickets spanning more than one calendar year: group shelves under a year heading.
- **Rule from review:** the headline count is drawn only when the set is complete (`truncated` null). A "last three parties" answer shows the shelves without the big number.
- **One result is still a logbook** (see mock strip "Same question, any week").

### 4.4 `status` (Progress) — mock `#status`
- **Evidence:** `list_deadlines`.
- **Build:** `Task.status` is only `"open" | "done"` (`@/lib/state`). `stuck` is derived: open and (past due → `why: "late"`, or no assignee → `why: "unowned"`). A task assigned to a role or to everyone is owned.
- **Tasks have no project link** (no event or project column on `Task`). So the kicker is built from the tool call's filter, and the form is granted only when that call was filtered (window, assignee or search). An unfiltered "all my tasks" read stays a list or becomes `dated`.
- **Client:** one block per row up to 24; beyond that draw a three-segment bar with counts. Done rows fold to one line, except when the request says the done rows are the answer (`focus: "done"`), where the open rows fold instead.
- **Qualifies:** at least two distinct states.

### 4.5 `record` — mock `#record`
- **Evidence:** any tool that yields a ref for the row.
- **Request:** `{ type: "record" }`. Prompt rule: only for lookups ("when is the next…", "who is our…"). Never for a count or list that came back short.
- **Build:** for each row (max 2) with a ref, `getPeek(ctx, type, id)` from `lib/services/peek-service.ts`. That function takes a `RequestContext`; the route has `ctx`. Pass the card through unchanged, so permissions match the peek sheet exactly.
- **Client:** reuse the card body from `PeekSheet.tsx` (extract a `PeekCardBody` component used by both). Add the row's own `value` to the card head so the asked-for fact is on the card ("lowest GPA" must show the GPA).
- **Past events:** the peek card builder decides the facts; do not show future-tense facts ("agenda not set") for a past event. **Verify** what `getPeek` returns for past events and adjust there.

### 4.6 `table` (Side by side) — mock `#table`
- **Evidence:** `list_brothers`, `get_custom_metrics`; dated: `list_parties`, `list_calendar_events`.
- **Request:** `{ type: "table", metrics: RankMetric[] }`, 2 to 4.
- **Build:** one column per metric the org tracks (**verify** the tracked-metrics source the Brotherhood page uses, `useTrackedMetrics`, and its server equivalent); an untracked metric is dropped, and fewer than 2 remaining columns returns null.
- **Client:** default order is the source order, not "most misses first". Sorting is local state. On phones the first column is sticky and the rest scrolls.
- **Text columns (email, phone) are out of scope for v1.** Contact questions stay a list.

### 4.7 `roll` (Roll call) — mock `#roll`
- **Evidence:** `list_brothers`, `get_event_attendance` (absent / excused), `list_polls` (`notVoted`), `list_attendance_exemptions`, `list_join_requests`.
- **Request:** `{ type: "roll", split?: "excused" | "voted" | "paid" }`.
- **Build:** members only, any count from 1. The split is computed from the source, never from model text. `flag: true` marks the group the question is about; the client styles that group as the emphasised one and makes no good/bad claim about the other.
- **Cap:** 60 chips, then `truncated`.

### 4.8 By drawer — mock `#mixed` (client only)
- In `AnswerBlock`, when there is no shape, every row has `ref`, and the rows span at least two `ref.type` values: group rows by type in sidebar order and render each group under a tab. Row order inside a group is the original order.
- Until Phase 6 the drawers are Roster, Timeline and Tasks (the three ref types that exist). Treasury and Docs drawers need `"transaction"` and `"doc"` refs.
- Skip when the rows are all tasks and events with dates (the prompt sends those to `dated`).
- Honour `OrganizationConfig.enabledWorkflows`: a drawer for a switched-off section is not drawn; its rows join the plain list below.

### 4.9 `receipt` — mock `#receipt`
- **Blocked on a new read tool.** There is no tool that lists individual transactions for a filter; `sum_transactions` aggregates and `get_treasury` returns ten recent rows without ids. Add `list_transactions` (filters: date window, category slug, type, linked calendar event via `TransactionCalendarEvent`, text search on description; returns `id, date, type, amountCents, category, description, status`, capped). Gate it exactly like `get_treasury`.
- Add ref type `"transaction"`: an extractor in `EXTRACTORS` (`lib/ai-refs.ts`), `PEEK_TYPES`, and a card builder in `peek-service.ts`.
- **Build:** cents from `amountCents` (fall back to `Math.round(amount * 100)`); `pending` from the linked reimbursement state (**verify** the relation; `list_reimbursements` exists). Exclude `deletedAt` rows.
- **`headline`:** request param; default `"out"` when all lines are expenses, `"in"` when all are income, else `"net"`.
- **Totals** are summed by the builder from the lines sent. `truncated` set: `totals` is null and the client draws no sum.

### 4.10 `pastdue` — mock `#pastdue`
- **Evidence:** `list_deadlines` with `open_only` and an end date before today.
- **Build:** owner from `assignments`: a member → `member`, a role → `role` with the role name (not "no owner"), `everyone` → `everyone`, none → `none`.
- **Client:** scale is whole weeks, rounded up from the oldest row, capped at 8 weeks; a capped bar gets a broken end and its label carries the real number. When every row has the same due date the bars carry nothing: draw the rows without the track.
- **Qualifies:** every item open and `date < today`.

### 4.11 Game plan — mock `#plan` (client only)
- In `AnswerBlock`, when every row has `tier` and at least two distinct tiers are present, render `PlanBlock` in place of `.reslist`. The wire does not change.
- At most two cards; a third `high` row becomes a full-width card. Keep each row's action from `rowAction` (arrow = nav, dashed plus = idea).
- **Steps and menus are not priorities.** A how-to sequence or "give me five ideas" must not be drawn as do-first / later. With a single tier present the block is not used and today's list stays. If that proves too coarse, add an optional `rowsAre: "ranked" | "steps" | "options"` to compose_answer in a later pass; do not guess from text.

### 4.12 `zero` (Nothing yet) — mock `#zero`
- Today a no-data answer is plain text (compose_answer says not to use it "when there's no data to show"). Change that sentence so a clean, filtered zero uses `shape: { type: "zero" }` with an empty `rows`.
- **v1 covers calendar events filtered by type only.** Evidence: a `list_calendar_events` / `list_service_events` / `list_programming_events` call whose result is empty and whose args include a type filter that equals a real event-type slug for this org.
- **Build:** `searched.count` = events in the same window without the type filter; `instead` = that set grouped by type, largest first, max 5. If the filter word is not one of the org's types, return null (the prompt tells the model to ask back).
- **No outlined "likely" chip in v1.** The mock outlines Philanthropy; there is no alias table to justify that, so all chips are equal.
- **"Plan one":** opens the existing `EventIdeaPanel` prefilled with the type; shown only when the caller can use `propose_add_calendar_event` (`PROPOSAL_META`).
- **Good-news zeros are not this form.** "Nobody owes dues" stays a `tally`; "nothing overdue" stays a sentence.

### 4.13 `yesno` — mock `#yesno`
- **Request:** `{ type: "yesno", test: YesNoTest }`.
- **Tests and evidence:** `dues_paid` (`list_brothers` / `list_dues_charges`: owes 0), `task_done` (`list_deadlines`), `attended` (`get_event_attendance`), `service_met` and `gpa_met` (`list_brothers` + threshold; null when the org has no such threshold), `voted` (`list_polls`).
- **Build:** `holds = every item passes`. Any unmeasured row: return null. Rows ordered failures first. `headline` and `kicker` are server templates per test.
- **Client:** stamp from `holds`; faces from rows (max 24, then "+ N"); failing rows as `.res` rows; passing rows folded. A clean yes draws no rows. One record: stamp plus that record as the single row.
- Apply the verdict check from 2.3.

## 5. Client structure

- Split `app/components/chat/AnswerShape.tsx` into `app/components/chat/shapes/` (one file per sheet, plus `index.tsx` exporting `ShapeBlock` and `isKnownShape` from a registry object keyed by type). Move the four existing sheets first with no behaviour change.
- Shared pieces to extract once: `DateStub` (month / day, tone), `FoldLine` (the one-line fold with chevron), `Sheet` (kicker + legend header), and relative-date helpers (`daysBetween(shape.today, date)` → "6 days late", "in 2 days", "3 days ago").
- `AnswerBlock.tsx`: after the shape check, add the two client-only branches (Game plan, By drawer) before the plain `.reslist`.
- **Every tappable element goes through `rowAction`** and shows the right affordance, and a row with no action renders inert. The mock shows a chevron everywhere; do not copy that.
- **Keyboard:** `stepRow` walks `rows`. Each sheet must mark the element bound to `rows[selectedRow]` as selected (chips, tickets, table rows, bars) and scroll it into view. Folded rows are skipped while folded.
- **File-cited answers:** if any row has `citations`, do not replace rows with a built shape (the route would drop the chips). Guard in the route: skip `buildShape` when `rowCitations` has any entry.
- **Persistence:** answers are stored in `localStorage` (`chaptos_chat_v2`). Old stored answers have none of the new shapes and need no migration.

### CSS

- Paper is the 1:1 target. Put it in a new file `app/paper-chat-forms.css`, imported in `app/layout.tsx` next to `./paper-chat.css` (a new file avoids the stale `globals.css` dev-server problem). Prefix every rule `html[data-aesthetic="paper"] .chat-root …` and use the `shp-` class prefix.
- Port the mock's CSS blocks nearly verbatim with this token map (same one `paper-chat.css` documents): `--paper-3 → --card-3`, `--line-2 → --line-med`, `--ink-2 → --ink-soft`, `--ink-3 → --muted`, pastels `--peach… → --pp-peach…`, `--display → --font-fraunces`, `--mono → --font-geist-mono`, `--sans → --font-geist-sans`, easing `--pp-ease-spring`.
- Ledger (the non-paper look) still ships. Give each form a plain, functional version in `app/components/chat-spotlight.css` using the existing `.shp`, `.shp-h`, `.shp-kicker`, `.shp-legend` rules there. Verify Ledger is not otherwise changed.
- Dark mode: the Past due light bar needed `color-mix` against the card to stay distinct from the heavy one; keep that.
- Phone: the mock's `@media (max-width:600px)` rules are the spec; the widget's phone sheet is `usePhoneSheet.ts`.

## 6. Prompt and schema

- `lib/ai-shape-request.ts`: add the new types to `SHAPE_TYPES` and the new params (`metric` widened to `RankMetric`, `metrics`, `test`, `split`, `headline`, `focus`) to `ShapeRequest` and `parseShapeRequest`. Unknown values are dropped, never fatal.
- `compose_answer` schema in `lib/ai-tools.ts`: extend `shape.properties` and add row `date`. Keep the description terse; move the "which shape when" text to the system prompt, because the tool schema is sent on every request and every loop iteration.
- `lib/ai-prompt.ts`: extend the `ANSWER SHAPES:` paragraph with the ladder in order and the three tie-breaks. State which read tool each shape needs this turn, as the existing text does.
- `TOOL_UI` in `lib/ai-tools.ts`: add `list_transactions` (Phase 6).
- Gate rollout with an env flag (follow the pattern used for chat files: **verify** its name in `app/api/ai/chat/route.ts` / `lib`). When off, the new types are not advertised in the schema or the prompt. The client always knows how to draw them.

## 7. Phases

Each phase ships on its own and leaves `tsc --noEmit` and the test suite green. Commit per phase.

**Phase 0 — groundwork, no behaviour change**
- Split `AnswerShape.tsx` into `shapes/`; extract `DateStub`, `FoldLine`, `Sheet`, date helpers.
- Add `selectFromEvidence` and the shape registry in `lib/ai-shapes.ts` (consider splitting into `lib/ai-shapes/*.ts`; keep `lib/ai-shape-request.ts` import-free to avoid the ai-tools ↔ ai-shapes cycle).
- Create `app/paper-chat-forms.css`; extend `scripts/_shapes-shot.ts` to take a list of cases.
- Add the env flag.
- Done when: the four existing shapes screenshot pixel-identical in paper and ledger.

**Phase 1 — client-only forms: Game plan, By drawer**
- `PlanBlock`, `DrawerBlock`, CSS, keyboard.
- Done when: an advisory answer with two tiers draws the plan; a mixed-ref answer draws drawers; a single-tier answer and an all-calendar answer still draw the list.

**Phase 2 — calendar family: `dated`, `logbook`, `pastdue`**
- Types, request parsing, builders (pure `xFromRows` functions plus thin async wrappers, as `weekFromRows` / `buildWeek`), sheets, prompt text, tests, evals.
- Done when: the mock's three example questions produce the three forms against dev data, with recurring "Chapter Meeting" rows carrying refs.

**Phase 3 — people family: `ranked`, `table`, `roll`**
- Includes thresholds, `measured`, `better: "lower"`, the GPA scale, tracked metrics, caps.
- Done when: a regular member's answer contains no field `list_brothers` would not return to them (add a tenancy / permission test).

**Phase 4 — judgments: `yesno`, `status`**
- Includes the verdict consistency retry from 2.3.
- Done when: a verdict that says "Yes" over a failing set is corrected, and an unmeasured row suppresses the stamp.

**Phase 5 — `record`, `zero`**
- Move Peek types to `lib/api-types`; extract `PeekCardBody`; change the compose_answer "no data" sentence.
- Done when: a count question with one result is a logbook, a lookup is a card, and a zero for a non-existent type asks back.

**Phase 6 — money: `list_transactions`, `"transaction"` ref, `receipt`, Treasury drawer**
- New tool, extractor, peek card, builder, sheet. Optional: `"doc"` ref from `search_docs` for a Docs drawer.
- Done when: receipt totals equal `sum_transactions` for the same filter in a test.

**Phase 7 — tune and turn on**
- Run `npm run eval:chat` with the flag off and on; compare shape adoption and answer correctness. Review `shape` / `shapeMs` telemetry already logged by the route. Turn the flag on in Vercel.

## 8. Tests and verification

- **Unit (vitest, `tests/ai/answer-shapes.test.ts` pattern):** each pure builder: qualification, ordering, caps and `truncated`, `better: "lower"`, unmeasured, late vs past event, role-owned task, receipt sums, yes/no `holds`, zero with unknown filter → null.
- **Parsing:** `parseShapeRequest` drops unknown enums; `parseComposeAnswer` accepts row `date`.
- **Contract:** `tests/contracts/api-types.contract.ts` for every new shape.
- **Permission:** a member without the relevant permission gets null from `receipt`, and no hidden columns from `ranked` / `table`.
- **Evals:** add cases to `evals/ask-the-chapter/cases.jsonl`, one per form plus the tie-break cases (tasks + events → `dated`; meetings with attendance → `ranked` by date; "has all of exec paid" → `yesno`; one service event → `logbook`). Re-derive assertions from the seed; the eval set has drifted from seed data before.
- **Visual:** `scripts/_shapes-shot.ts` runs the real builders on dev data and stubs the SSE stream; shoot each form in `AES=paper|ledger`, `THEME=ivory|dusk`, widths 1280 and 390. Dev events are all in the past, so forms that need future dates need a `TODAY` override in the driver, as the week case already does with `WEEK=`.
- **Gates:** `npx tsc --noEmit` and `npm test`. There is no lint script. The full vitest run tends to fail one arbitrary test that passes alone; re-run before investigating.

## 9. Things that will bite

- **Dev and prod share one database.** Verify read-only. Never create, approve or delete from a browser session against it. For UI states that need writes, stub the API with Playwright `page.route`, or use the isolated dev server on :3100 with a throwaway Postgres.
- **`AGENTS.md`: this Next.js version differs from training data.** Read `node_modules/next/dist/docs/` before touching routing or build config. This project needs neither.
- **Route handlers stay thin, services don't call services.** Builders live in `lib/`, read through `ctx.db` (org-scoped, RLS enforcing). Roster reads go through `ctx.db.member`, keyed by `brotherId`. There is no `ctx.db.brother`.
- **Prisma `select` keys are not type-checked.** A stale key passes `tsc` and fails at runtime.
- **The pg pool is 2 per instance.** A builder that fires three parallel scoped queries queues the third; batch or sequence them.
- **A row whose `screen` is not resolved to `{label, path}` crashes the app** through `isEventIdea`. Every row a builder emits must still pass through `resolveScreen` (the route does this after `built.rows`; keep it that way).
- **`lib/` files that reach the client bundle** must not import `lib/db`, `lib/errors` or `lib/dues`. Keep shape rendering helpers client-safe and builders server-only.
- **JSX in this repo drops the space after `{expr}` and after `</b>` / `</em>`.** Diff rendered text for missing spaces in the new sheets.
- **The API JSON is a contract** (a native app is planned against `lib/api-types`). Additive only; never rename or retype a shipped field.
- **Commits:** no `Co-Authored-By: Claude` trailer in this repo.

## 10. Decisions still open

These were raised in design review and are not settled. Defaults are given so work is not blocked.

| Question | Default in this plan |
|---|---|
| What does a regular member see in rankings and tables of GPA and dues? | Only what the read tool already returns to them; no extra rule. Peer-privacy was deferred earlier. |
| Should worst-first rankings of named people exist at all? | Yes for officers; default order is source order for tables, rank order only when the question ranks. |
| Game plan for steps and option menus | Not used unless two tiers are present; add `rowsAre` later if needed. |
| "Likely" chip in Nothing yet | Off until there is an alias source. |
| Zero for things other than events by type | Not in v1. |
| Text columns in Side by side | Not in v1. |
| Who writes kickers ("Service events · Fall 26") | The server, from the tool call's filter and the org's labels. Never the model. |
| Overlap with `tally` / `week` / `missing` | Existing shapes win where they apply: owes-dues / at-risk / no-hours subsets → `tally`; a window of 7 days or fewer → `week`; a named thing not found → `missing`. |

## 11. Kickoff prompt for the next session

> Read `docs/ask-chapt-list-forms-plan.md` and open `_design/Ask Chapt List Forms Mock.html`. Build Phase 0, then Phase 1, in the real app. Follow `AGENTS.md`. Before writing code, read `lib/ai-shapes.ts`, `lib/ai-shape-request.ts`, `lib/ai-refs.ts`, the `if (answerCall)` block in `app/api/ai/chat/route.ts`, `app/components/chat/AnswerShape.tsx`, `AnswerBlock.tsx`, and the "Answer shapes" section of `app/paper-chat.css`, and confirm the items this plan marks **verify**. Stop after each phase with `npx tsc --noEmit` and `npm test` results and paper + ledger screenshots from `scripts/_shapes-shot.ts`. Do not write to the shared database.
