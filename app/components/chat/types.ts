// Client-side shapes for the Ask Chapt Spotlight. These mirror the SSE
// protocol documented in app/api/ai/chat/route.ts — the server is the source
// of truth; everything here is defensive-parsed off the wire.

export type StepStatus = "pending" | "active" | "done";

export interface LedgerStep {
  id: string;
  verb: string;
  source?: string;
  status: StepStatus;
  finding?: string;
}

export interface AnswerRow {
  kind: "person" | "money" | "event" | "task" | "generic";
  title: string;
  subtitle?: string;
  value?: string;
  ask?: string;
}

export interface AnswerData {
  verdict: string; // may contain one *emphasis* span — rendered, never injected
  rows: AnswerRow[];
  follows: Array<{ label: string; ask: string }>;
  sources: string[];
}

export interface ProposalPermInfo {
  name: string;
  label: string;
  canApprove: boolean;
  holders?: { roleTitles: string[]; memberName?: string };
}

export interface ProposalDisplayInfo {
  kind: string;
  title: string;
  rows: Array<{ k: string; v: string; em?: boolean }>;
}

export type WritState = "pending" | "confirming" | "approved" | "discarded" | "dismissed" | "error";

export interface ProposalCard {
  id: string;                      // local id for keying
  action: string;
  endpoint: string;
  method: "POST" | "PATCH";
  payload: Record<string, unknown>;
  summary: string;
  display: ProposalDisplayInfo;
  perm: ProposalPermInfo;
  sig: string | null;
  iat: number;
  state: WritState;
  resultMessage?: string;
  stamp?: string;                  // "6:12 PM · Marcus S." — set when settled
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  /** Plain-prose fallback (refusals, how-to, fast-path) — the serif note style. */
  content: string;
  /** The reasoning ledger: live while streaming, then frozen as the trace. */
  steps?: LedgerStep[];
  /** The model is writing the answer rather than calling tools (server-signalled). */
  composing?: boolean;
  /** Structured verdict+rows answer (compose_answer path). */
  answer?: AnswerData | null;
  proposals?: ProposalCard[];
  feedback?: "up" | "down";
  /** The user hit Stop mid-stream — render whatever arrived, no caret. */
  stopped?: boolean;
}

export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** "Andre Whitfield" → "AW" for the person-row avatar. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase() || "·";
}

/** Local wall-clock stamp, e.g. "6:12 PM". */
export function timeStamp(d: Date = new Date()): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
