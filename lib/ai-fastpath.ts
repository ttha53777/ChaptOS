// ────────────────────────────────────────────────────────────────────────────
// Deterministic fast-path for "Ask the Chapter".
//
// The chat route normally costs at least TWO sequential LLM round-trips per
// question (pick tools → run tools → write answer), each paying reasoning-token
// latency before the first visible token. But a large fraction of real
// questions ("who hasn't paid dues?", "treasury balance?", "what's on this
// week?") map to exactly ONE obviously-correct DB query with no free parameters
// to infer. For those we skip the model entirely: match the question against a
// small deterministic table, call the SAME read handler the model would have
// (via runTool — we never reimplement DB access), and format a terse answer in
// the system prompt's voice. Target: <100ms, no model call at all.
//
// FAIL-OPEN BY DESIGN. Any non-match, ambiguity, thrown error, or {error}-shaped
// tool result returns null → the route falls through to the normal LLM loop. A
// wrong fast-path answer is worse than a slow correct one, so when in doubt we
// return null and let the model handle it.
// ────────────────────────────────────────────────────────────────────────────

import { runTool } from "@/lib/ai-tools";
import type { db } from "@/lib/db";
import { isoWeekBounds } from "@/lib/dates";

export interface FastPathResult {
  /** The complete answer text, streamed as a single SSE `text` event. */
  text: string;
  /** Which pattern matched — for timing/telemetry. */
  pattern: string;
}

// A tool result is either the "happy" shape or, when a list tool matched nothing,
// the explicit empty envelope from listResult() — {count:0, items:[], hint}. We
// must never blindly destructure the happy shape; helpers below branch on empty.
type ToolResult = unknown;

function isErrorResult(r: ToolResult): boolean {
  return typeof r === "object" && r !== null && "error" in r;
}

function isEmptyEnvelope(r: ToolResult): boolean {
  // listResult() empty shape: { count: 0, items: [], hint }
  return (
    typeof r === "object" &&
    r !== null &&
    "count" in r &&
    (r as { count: unknown }).count === 0
  );
}

// ── Money / number formatting ───────────────────────────────────────────────
function money(n: number): string {
  // Whole dollars when round, else two decimals — matches how officers read it.
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded)
    ? `$${rounded.toLocaleString("en-US")}`
    : `$${rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Format a name + a single metric, for ranking answers.
function nameLine(b: { name: string }, metric: string): string {
  return `**${b.name}** — ${metric}`;
}

// ── Brother list shapes ─────────────────────────────────────────────────────
interface BrotherRow {
  name: string;
  attendance: number;
  gpa: number;
  duesOwed: number;
  serviceHours: number;
  status: string;
}
interface BrotherListResult {
  summary: { count: number; totalDuesOwed: number; owingCount: number };
  brothers: BrotherRow[];
}

function asBrotherList(r: ToolResult): BrotherListResult | null {
  if (isErrorResult(r) || isEmptyEnvelope(r)) return null;
  if (typeof r !== "object" || r === null) return null;
  if (!("brothers" in r) || !("summary" in r)) return null;
  return r as BrotherListResult;
}

// ────────────────────────────────────────────────────────────────────────────
// Intent table
//
// Each entry: a matcher over the NORMALIZED question, the tool + args to run,
// and a formatter over the tool result. Keep matchers narrow — only fire when
// there's exactly one obviously-correct call. Order matters: first match wins,
// so put more-specific patterns before broader ones.
// ────────────────────────────────────────────────────────────────────────────

interface Intent {
  pattern: string;
  /** Returns the tool args when this intent matches the question, else null. */
  match: (q: string) => { tool: string; args: Record<string, unknown> } | null;
  /** Render the answer; return null to abort → fall through to the LLM. */
  format: (result: ToolResult) => string | null;
}

// Normalize: lowercase, strip punctuation to spaces, collapse whitespace.
function normalize(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Helper: does the normalized question contain every term in the group?
// Uses whole-WORD matching (normalize() already space-separates tokens), so a
// short term like "owe" doesn't spuriously match inside "lowest". For
// multi-word terms ("at risk") we fall back to substring, which is safe because
// those are long enough not to collide.
function hasWord(q: string, term: string): boolean {
  if (term.includes(" ")) return q.includes(term);
  return new RegExp(`\\b${term}\\b`).test(q);
}
function hasAll(q: string, terms: string[]): boolean {
  return terms.every(t => hasWord(q, t));
}

const INTENTS: Intent[] = [
  // ── Dues owed: "who hasn't paid dues", "who owes dues", "outstanding dues" ──
  {
    pattern: "dues-owed",
    match: q => {
      if (!q.includes("due")) return null; // must be about dues at all
      // \bowes?\b catches "owe"/"owes" as whole words without matching "lowest".
      const owes = /\bowes?\b/.test(q);
      const owesPhrasings =
        owes ||
        hasWord(q, "unpaid") ||
        hasWord(q, "outstanding") ||
        q.includes("hasn t paid") || q.includes("haven t paid") || q.includes("not paid");
      return owesPhrasings ? { tool: "list_brothers", args: { owes_dues_only: true } } : null;
    },
    format: result => {
      const list = asBrotherList(result);
      if (isEmptyEnvelope(result)) return "Everyone's paid up — no outstanding dues.";
      if (!list) return null;
      if (list.brothers.length === 0 || list.summary.owingCount === 0) {
        return "Everyone's paid up — no outstanding dues.";
      }
      const lines = list.brothers
        .filter(b => b.duesOwed > 0)
        .map(b => nameLine(b, `${money(b.duesOwed)} owed`));
      return [
        `${list.summary.owingCount} ${list.summary.owingCount === 1 ? "brother owes" : "brothers owe"} ${money(list.summary.totalDuesOwed)} total (dues):`,
        ...lines.map(l => `- ${l}`),
      ].join("\n");
    },
  },

  // ── At-risk: "who's at risk", "at-risk brothers" ────────────────────────────
  {
    pattern: "at-risk",
    match: q =>
      q.includes("at risk") || hasAll(q, ["who", "risk"])
        ? { tool: "list_brothers", args: { status: "At Risk" } }
        : null,
    format: result => {
      if (isEmptyEnvelope(result)) return "No one's at risk right now.";
      const list = asBrotherList(result);
      if (!list) return null;
      if (list.brothers.length === 0) return "No one's at risk right now.";
      const lines = list.brothers.map(b =>
        nameLine(b, `${Math.round(b.attendance)}% attendance, ${b.gpa.toFixed(2)} GPA`),
      );
      return [
        `${list.brothers.length} at risk (computed status):`,
        ...lines.map(l => `- ${l}`),
      ].join("\n");
    },
  },

  // ── Treasury balance ────────────────────────────────────────────────────────
  {
    pattern: "treasury-balance",
    match: q =>
      (q.includes("treasury") || (q.includes("balance") && !q.includes("budget"))) &&
      (q.includes("balance") || q.includes("how much") || q.includes("what s") || q.includes("what is"))
        ? { tool: "get_treasury", args: {} }
        : null,
    format: result => {
      if (isErrorResult(result)) return null;
      const t = result as { balance?: number };
      if (typeof t.balance !== "number") return null;
      return `${money(t.balance)} (treasury balance).`;
    },
  },

  // ── This week's events ──────────────────────────────────────────────────────
  {
    pattern: "this-week-events",
    match: q => {
      if (!q.includes("this week")) return null;
      if (!(q.includes("event") || q.includes("on") || q.includes("happening") || q.includes("agenda") || q.includes("calendar"))) return null;
      const { start, end } = isoWeekBounds(new Date());
      return { tool: "list_calendar_events", args: { start, end, order_by: "date", order: "asc" } };
    },
    format: result => {
      if (isEmptyEnvelope(result)) return "Nothing on the calendar this week.";
      if (isErrorResult(result) || !Array.isArray(result)) return null;
      const rows = result as Array<{ title: string; date: string; time?: string | null; category?: string }>;
      if (rows.length === 0) return "Nothing on the calendar this week.";
      const lines = rows.map(e => `- **${e.title}** — ${e.date}${e.time ? ` ${e.time}` : ""}${e.category ? ` (${e.category})` : ""}`);
      return [`This week (calendar):`, ...lines].join("\n");
    },
  },
];

/**
 * Pure matcher — which intent (if any) a question routes to, and the args it
 * would run. Exported for unit tests so the regex table can be exercised without
 * a DB. Returns null when no intent fires (→ falls through to the LLM).
 */
export function matchIntent(question: string): { pattern: string; tool: string; args: Record<string, unknown> } | null {
  const q = normalize(question);
  if (!q) return null;
  for (const intent of INTENTS) {
    let call: { tool: string; args: Record<string, unknown> } | null = null;
    try { call = intent.match(q); } catch { continue; }
    if (call) return { pattern: intent.pattern, ...call };
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Entry point
// ────────────────────────────────────────────────────────────────────────────

/**
 * Try to answer `question` deterministically without an LLM call. Returns a
 * FastPathResult on a confident match, or null to fall through to the normal
 * tool-calling loop. Never throws — any failure is treated as a miss.
 */
export async function tryFastPath(question: string, scoped: ReturnType<typeof db>, orgId: number): Promise<FastPathResult | null> {
  const matched = matchIntent(question);
  if (!matched) return null;

  const intent = INTENTS.find(i => i.pattern === matched.pattern);
  if (!intent) return null; // unreachable, but keeps us fail-open

  try {
    const result = await runTool(matched.tool, matched.args, scoped, orgId);
    if (isErrorResult(result)) return null; // tool failed → let the model retry
    const text = intent.format(result);
    if (text == null || text.trim() === "") return null; // formatter abstained
    return { text, pattern: intent.pattern };
  } catch {
    return null; // any throw → fall through to the LLM path
  }
}
