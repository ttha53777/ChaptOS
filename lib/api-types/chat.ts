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
