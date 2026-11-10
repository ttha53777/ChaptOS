// Ask Chapt (POST /api/ai/chat) wire shapes. Type-only: see lib/api-types/index.ts for the rules.
import type { AttachmentKind, FileLimits } from "./chat-attachments";
//
// The response is a server-sent-event stream: `event: <name>\ndata: <json>\n\n`.
// ChatStreamEvents maps every event name to its JSON payload; the route's
// send() is typed against it, so the server cannot emit an event this file
// doesn't describe. Clients should still parse defensively and ignore unknown
// events — new ones may be added (additively) without bumping anything.

/**
 * POST /api/ai/chat body. The server keeps the last few turns and trims long
 * earlier ones; the newest user message is answered in full.
 */
export interface ChatRequest {
  messages: { role: "user" | "assistant"; content: string }[];
  /** Every file currently attached to this conversation (ChatAttachmentInfo.id), on every request. At most 5. */
  attachmentIds?: string[];
}

/**
 * What POST /api/ai/chat answers INSTEAD of a stream when Ask Chapt is switched
 * off for the deployment (Content-Type: application/json, not text/event-stream).
 * GET /api/ai/chat answers the same shape as a cheap probe.
 */
export interface ChatAvailability {
  enabled: boolean;
  /** GET only: members may attach files (the paperclip shows). Absent or false means they can't. */
  files?: boolean;
  /** GET only, when `files` is true. */
  fileLimits?: FileLimits;
}

/**
 * Record kinds a row can open. New kinds are added over time ("transaction"
 * joined with the list forms): a client must treat a ref whose type it doesn't
 * know as no ref at all — the row still has its title and `ask`.
 */
export type RefType = "member" | "event" | "task" | "transaction";

export interface EntityRef {
  type: RefType;
  id: number;
}

export type AnswerTier = "high" | "medium" | "later";

export interface AnswerRow {
  kind: "person" | "money" | "event" | "task" | "generic";
  title: string;
  subtitle?: string;
  value?: string;
  ask?: string;
  /** Server-attached record id — present when the row can open a peek. */
  ref?: EntityRef;
  /** Impact tier on an advisory row; fills the same slot as `value`. */
  tier?: AnswerTier;
  /** Server-resolved screen path, relative to the org (e.g. "/treasury/dues"). */
  screen?: { label: string; path: string };
  /** Where in an attached file this row came from. Only ever a unit the server showed the model this turn. */
  citations?: AnswerCitation[];
}

/**
 * A server-attested pointer into an attached file. Open its text with
 * GET /api/ai/attachments/[attachmentId]/units/[unit].
 */
export interface AnswerCitation {
  attachmentId: string;
  name: string;
  kind: AttachmentKind;
  /** "p7", "s2", "l3", "sh1" or "sh1!B2:D9". */
  unit: string;
  /** For display: "p. 7", "§ Article IV", "Lines 81–160", "Events!B2:D9". */
  locator: string;
}

/**
 * How a question's chips relate, and so what tapping one means. "one" (the
 * default when absent) — alternatives, so a tap sends that reply immediately,
 * exactly as a typed reply would. "many" — constraints that can all hold at
 * once, so taps stage a selection and the user sends them as one reply.
 */
export type AskBackSelect = "one" | "many";

export interface AskBackQuestion {
  question: string;
  chips: string[];
  select?: AskBackSelect;
  /**
   * Present when every chip names a member (a name that matched several people):
   * who each one is, in chip order. Tapping a card sends that chip's text, so a
   * client that ignores this still works from `chips` alone.
   */
  people?: AskBackPerson[];
}

export interface AskBackPerson {
  ref: EntityRef;
  name: string;
  role: string | null;
  /** Short facts; `diff` marks the ones that tell the candidates apart. */
  facts: Array<{ label: string; diff: boolean }>;
}

export interface AskBack {
  lead?: string;
  questions: AskBackQuestion[];
}

export interface AnswerData {
  verdict: string; // may contain one *emphasis* span — rendered, never injected
  rows: AnswerRow[];
  follows: Array<{ label: string; ask: string }>;
  sources: string[];
  /** Questions the answer asks back, each with tappable likely replies. */
  askback?: AskBack;
  /** File passages backing the verdict as a whole (rows carry their own). */
  citations?: AnswerCitation[];
  /**
   * The picture the answer is drawn as, built server-side from org data (never
   * model text). When present, `rows` are the shape's own fallback rows, so a
   * client that doesn't know `shape` — or this shape's `type` — renders those.
   */
  shape?: AnswerShape;
}

/** Discriminated by `type`. New types may be added; ignore ones you don't know. */
export type AnswerShape =
  | TallyShape | BreakdownShape | WeekShape | MissingShape
  | DatedShape | LogbookShape | PastDueShape
  | RankedShape | TableShape | RollShape
  | YesNoShape | StatusShape
  | RecordShape | ZeroShape
  | ReceiptShape;

export type TallyMetric = "owes_dues" | "at_risk" | "no_service_hours";

export interface TallyMark {
  id: number; // brotherId — peek with { type: "member", id }
  name: string;
  /** "top" = the biggest few of a dollar-ranked metric; "rest" = not in the subset. */
  state: "top" | "hit" | "rest";
  value: string | null;
}

/** The whole roster as dots, the subset the question is about filled. */
export interface TallyShape {
  type: "tally";
  metric: TallyMetric;
  of: number;
  hit: number;
  /** "owe" → "14 / 52 owe". */
  hitWord: string;
  hitLegend: string;
  restLegend: string;
  /** "$260+" when the top marks are set apart; null otherwise. */
  topLabel: string | null;
  /** Hits first (in rank order), then everyone else by name. null past 150 members — draw a bar. */
  marks: TallyMark[] | null;
}

export interface BreakdownPart {
  /** The category slug; null for the folded "Other" line. */
  slug: string | null;
  label: string;
  /** The org's category hex (light), and its dark override. */
  color: string | null;
  colorDark: string | null;
  amount: number;
  /** Percent of `total`, one decimal. */
  share: number;
  /** This semester's planned amount, when a budget covers the category. */
  budget: number | null;
}

/** A total split by category, ranked. `rows` line up 1:1 with `parts`. */
export interface BreakdownShape {
  type: "breakdown";
  kind: "income" | "expense";
  /** "Spent · Fall 2026". */
  period: string;
  total: number;
  parts: BreakdownPart[];
  hasBudget: boolean;
}

export interface WeekItem {
  ref: EntityRef;
  kind: "event" | "deadline";
  date: string; // YYYY-MM-DD, inside the week
  time: string | null;
  title: string;
  /** The event's type; null for a deadline. */
  cat: { slug: string; label: string; color: string | null; colorDark: string | null } | null;
}

/** Seven days from `start`. `rows` line up 1:1 with `items`. */
export interface WeekShape {
  type: "week";
  start: string; // YYYY-MM-DD
  items: WeekItem[];
}

export interface ProposalPermInfo {
  /** null = self-service: the member acts on their own record, needs no permission, and nothing is filed in Approvals. */
  name: string | null;
  label: string;
  canApprove: boolean;
  holders?: { roleTitles: string[]; memberName?: string };
}

export interface ProposalDisplayInfo {
  kind: string;
  title: string;
  rows: Array<{ k: string; v: string; em?: boolean }>;
}

/** A drafted write the member confirms before it runs (the "writ" card). */
export interface ChatProposal {
  action: string;
  /** The API route the confirmed card calls, with `payload` as its body. */
  endpoint: string;
  method: "POST" | "PATCH";
  payload: Record<string, unknown>;
  summary: string;
  display: ProposalDisplayInfo;
  perm: ProposalPermInfo;
  /** HMAC over the card (lib/ai-approval-sig.ts); echo it back when recording the approval. Null when signing is off. */
  sig: string | null;
  iat: number;
}

/** Every event POST /api/ai/chat streams, by name → JSON payload. */
export interface ChatStreamEvents {
  /** Sent first, before any work — paint the thinking state. */
  open: Record<string, never>;
  /** A ledger step is named (pending). */
  step: { id: string; verb: string; source?: string };
  /** That step started running. */
  step_start: { id: string };
  /** That step finished, optionally with a one-line finding. */
  step_done: { id: string; finding?: string };
  /** Guessed steps the model didn't take — remove them. */
  step_drop: { ids: string[] };
  /** The model is writing its reply. */
  composing: Record<string, never>;
  /** Streamed plain-text reply, appended delta by delta. */
  text: { delta: string };
  /** The structured reply (verdict + rows). Terminal for the answer body. */
  answer: AnswerData;
  /** A drafted write to confirm. */
  proposal: ChatProposal;
  /** End of stream. */
  done: Record<string, never>;
}

export type ChatStreamEventName = keyof ChatStreamEvents;

export type LookedSource = "events" | "service" | "programming" | "deadlines" | "docs";

/**
 * A search that found nothing, shown as its receipt: every place searched this
 * turn, the window it covered and how many items were in it — each with zero
 * matches, or the server would not have sent this shape. `rows` are the closest
 * real titles.
 */
export interface MissingShape {
  type: "missing";
  term: string;
  looked: Array<{ source: LookedSource; label: string; scope: string; of: number }>;
}

// ── List forms (docs/ask-chapt-list-forms-plan.md) ──────────────────────────
// Each replaces the plain row list when every record in the answer qualifies.
// Same rule as the shapes above: `rows[i]` is the record `items[i]` draws, so
// identity, title and ref stay on the row and these carry only the extra facts.
// Dates are YYYY-MM-DD and `today` is the server's day when the answer was
// built: clients compute "6 days late" from those, never receive the phrase.

/** The set was cut to fit: `of` records matched in all. Draw "+ N more", and no total or count over the cut. */
export interface ShapeTruncation { of: number }

/** Calendar things around today, in date order — the Today line. */
export interface DatedShape {
  type: "dated";
  today: string;
  items: Array<{
    date: string;
    time: string | null;
    kind: "task" | "event";
    /** An open task whose date has passed. Never an event. */
    late: boolean;
    /** A finished task, or an event that already happened. */
    done: boolean;
  }>;
  truncated: ShapeTruncation | null;
}

/** Calendar things that already happened, oldest first — counted, shelved by month. */
export interface LogbookShape {
  type: "logbook";
  /** Marks the current month "so far". */
  today: string;
  noun: { one: string; many: string };
  /** "Fall 2026", "since Aug 24", "All time". */
  period: string;
  items: Array<{ date: string }>;
  truncated: ShapeTruncation | null;
}

export interface PastDueOwner {
  kind: "member" | "role" | "everyone" | "none";
  label: string;
}

/** Open work whose date has passed, measured back from today. */
export interface PastDueShape {
  type: "pastdue";
  today: string;
  items: Array<{ date: string; owner: PastDueOwner }>;
  truncated: ShapeTruncation | null;
}

/** A number every row of one kind carries. */
export type RankMetric = "service_hours" | "gpa" | "attendance" | "dues_owed" | "event_attendance";
export type MetricUnit = "hrs" | "usd" | "pct" | "gpa";

/** One number per row on a shared scale — Standings. */
export interface RankedShape {
  type: "ranked";
  metric: RankMetric;
  /** "Service hours · 8 members · SPR26". */
  kicker: string;
  unit: MetricUnit;
  /** dues_owed is "lower": the cut reads "over the bar" and the colours swap. */
  better: "higher" | "lower";
  /** Scale end: 100 for pct, 4 (or more) for gpa, else the largest value. */
  max: number;
  /** Scale start: 0, except gpa, which starts a whole point under the lowest (drawn with a broken axis). */
  min: number;
  /** The org's own threshold; null when it never set one — then no cut line and no colour. */
  bar: { at: number; label: string } | null;
  /** "date": dated rows keep date order with a date stub, no rank numerals, no cut line. */
  order: "rank" | "date";
  /** num null = nothing recorded for that row yet: drawn as "not recorded", never coloured, sorted last. */
  items: Array<{ num: number | null; date: string | null }>;
  truncated: ShapeTruncation | null;
}

/** The same 2 to 4 measures per row, as columns — Side by side. */
export interface TableShape {
  type: "table";
  kicker: string;
  cols: Array<{ key: RankMetric; label: string; unit: MetricUnit; better: "higher" | "lower"; bar: number | null }>;
  /** cells[i][col.key]; null = not recorded, drawn as a dash and never tinted. */
  cells: Array<Record<string, number | null>>;
  /** Set when rows are dated things; null for people. */
  dates: Array<string | null> | null;
  truncated: ShapeTruncation | null;
}

/** People, as name chips under a count, optionally split two ways — Roll call. */
export interface RollShape {
  type: "roll";
  /** `flag` marks the group the question is about; no good/bad order is implied. */
  groups: Array<{ label: string; flag: boolean }>;
  items: Array<{ group: number; note: string | null }>;
  truncated: ShapeTruncation | null;
}

export type YesNoTest = "dues_paid" | "task_done" | "attended" | "service_met" | "gpa_met" | "voted";

/**
 * A yes-or-no question, answered by a test the server ran on every record it
 * covers. `holds` is computed (yes only if every item passes) — the model
 * writes the sentence but can't choose the word. rows are failures first.
 */
export interface YesNoShape {
  type: "yesno";
  test: YesNoTest;
  holds: boolean;
  /** "5 of 6 have paid". */
  headline: string;
  /** "Dues · 6 members". */
  kicker: string;
  items: Array<{ pass: boolean }>;
}

/** Work with differing statuses — Progress. Stuck is derived: open and late, or open and owned by nobody. */
export interface StatusShape {
  type: "status";
  kicker: string;
  today: string;
  /** "done": the finished rows are the answer, so the open ones fold instead. */
  focus: "open" | "done";
  items: Array<{
    state: "done" | "open" | "stuck";
    why: "late" | "unowned" | null;
    date: string | null;
    owner: string | null;
  }>;
}

// ── Peek cards (GET /api/ai/peek, and inline in a `record` answer) ──────────

/** Colour intent for a fact or badge. */
export type PeekTone = "good" | "warn" | "risk" | "muted";

export interface PeekFact {
  k: string;
  v: string;
  /** Render the value in the mono face — figures, dates, counts. */
  mono?: boolean;
  tone?: PeekTone;
}

export interface PeekRow {
  title: string;
  subtitle?: string;
  value?: string;
  tone?: PeekTone;
}

export interface PeekSection {
  label: string;
  rows: PeekRow[];
  /** Shown in place of rows when the section is legitimately empty. */
  empty?: string;
}

export interface PeekCard {
  type: RefType;
  id: number;
  title: string;
  subtitle?: string;
  badge?: { label: string; tone: PeekTone };
  facts: PeekFact[];
  sections: PeekSection[];
}

/** A lookup for one thing (or the pair that share a job): the peek card itself, inline. cards[i] is rows[i]'s. */
export interface RecordShape {
  type: "record";
  cards: PeekCard[];
}

/**
 * A clean zero: the filter is a real category of this org and nothing is in
 * it. One empty slot, what was searched, and what those records are filed as
 * instead. rows are empty.
 */
export interface ZeroShape {
  type: "zero";
  /** The org's own word for the category: "Service". */
  filter: string;
  /** The category's slug, for re-asking. */
  slug: string;
  noun: string;
  /** "Fall 2026", "since Aug 24", "All time". */
  period: string;
  searched: { count: number; scope: string };
  instead: Array<{ slug: string; label: string; count: number }>;
  /** The caller may propose an event of this kind ("Plan one"). */
  canCreate: boolean;
}

/** Payments that add up — Receipt. rows[i] is the ledger line items[i] draws; money is integer cents. */
export interface ReceiptShape {
  type: "receipt";
  /** "Winter Formal · Fall 2026". */
  kicker: string;
  /** Which total leads: what went out, what came in, or the net. */
  headline: "out" | "in" | "net";
  /** Summed from exactly the lines sent (out and in are positive). null when the set is cut: no sum over a sample. */
  totals: { out: number; in: number; net: number } | null;
  /** cents is signed: an expense is negative. */
  items: Array<{ date: string; cents: number; pending: boolean }>;
  truncated: ShapeTruncation | null;
}
