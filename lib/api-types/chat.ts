// Ask Chapt (POST /api/ai/chat) wire shapes. Type-only: see lib/api-types/index.ts for the rules.
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
}

/**
 * What POST /api/ai/chat answers INSTEAD of a stream when Ask Chapt is switched
 * off for the deployment (Content-Type: application/json, not text/event-stream).
 * GET /api/ai/chat answers the same shape as a cheap probe.
 */
export interface ChatAvailability { enabled: boolean }

export type RefType = "member" | "event" | "task";

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
  /**
   * The picture the answer is drawn as, built server-side from org data (never
   * model text). When present, `rows` are the shape's own fallback rows, so a
   * client that doesn't know `shape` — or this shape's `type` — renders those.
   */
  shape?: AnswerShape;
}

/** Discriminated by `type`. New types may be added; ignore ones you don't know. */
export type AnswerShape = TallyShape | BreakdownShape | WeekShape | MissingShape;

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
