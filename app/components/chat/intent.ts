// The serif intent line and the speculative plan rows the ledger shows before
// the model has named a single tool.
//
// WHY THIS EXISTS. Between `open` and the first tool-call delta the model is
// spending reasoning tokens, and nothing is on the wire — the longest single
// stretch of a request, and the one the mock never had (its plan was authored
// up front). We fill it with a keyword guess at the records the question is
// about, rendered PENDING so it reads as "expected", never as "found".
//
// HONESTY RULES — the guess must never be able to masquerade as a result:
//   • provisional rows are always `pending`; they never spin and never post a
//     finding, because we have not read anything yet;
//   • the moment the model names a real tool they are reconciled by source and
//     the leftovers are dropped (see ChatWidget's `step_start` handling);
//   • they are stripped before the trace is persisted, so the audit record only
//     ever contains records actually consulted;
//   • no keyword match means NO rows. A blank ledger under the intent line is
//     the correct answer when we genuinely can't tell.
//
// Verbs and sources are copied from TOOL_UI (lib/ai-tools.ts) so a guess that
// turns out right lines up exactly with the real step that replaces it.

import type { LedgerStep } from "./types";

interface Guess {
  /** Substrings that put the question in this subject. */
  match: string[];
  /** Serif italic line above the ledger — describes the QUESTION, not the answer. */
  intent: string;
  /** Up to two records we'd expect to read, as {verb, source} from TOOL_UI. */
  plan: Array<{ verb: string; source: string }>;
}

const ROSTER = { verb: "Reading the roster", source: "Roster" };
const ATTENDANCE = { verb: "Pulling attendance", source: "Attendance" };
const TREASURY = { verb: "Reading the treasury", source: "Treasury" };
const LEDGER = { verb: "Summing the ledger", source: "Treasury · ledger" };
const BUDGET = { verb: "Opening the budget", source: "Budget" };
const TIMELINE = { verb: "Checking deadlines", source: "Timeline" };
const EVENTS = { verb: "Scanning the calendar", source: "Events" };

// Ordered — first match wins, so put the specific subjects above the general.
const GUESSES: Guess[] = [
  { match: ["dues", "due", "owe", "paid", "payment"], intent: "Reading the chapter's dues…", plan: [ROSTER] },
  { match: ["attendance", "attend", "missed", "absent", "showed up"], intent: "Cross-checking attendance…", plan: [ATTENDANCE, ROSTER] },
  { match: ["budget", "spent", "spending", "expense"], intent: "Opening the books…", plan: [BUDGET, LEDGER] },
  { match: ["treasury", "balance", "money", "funds", "cash"], intent: "Reading the books…", plan: [TREASURY, LEDGER] },
  { match: ["deadline", "due date", "overdue"], intent: "Checking the timeline…", plan: [TIMELINE] },
  { match: ["event", "calendar", "schedule", "happening", "agenda", "this week", "next week"], intent: "Scanning what's coming up…", plan: [EVENTS, TIMELINE] },
  { match: ["gpa", "grade", "academic", "service hour", "service hours"], intent: "Reading the roster…", plan: [ROSTER] },
  { match: ["roster", "member", "brother", "who is", "who's"], intent: "Reading the roster…", plan: [ROSTER] },
  { match: ["officer", "role", "president", "treasurer"], intent: "Checking who holds what…", plan: [] },
];

const DEFAULT_INTENT = "Searching the records…";

function normalize(question: string): string {
  return question.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function guessFor(question: string): Guess | null {
  const q = normalize(question);
  if (!q) return null;
  return GUESSES.find(g => g.match.some(term => q.includes(term))) ?? null;
}

/** The serif line above the ledger. Describes the question, so it can't be wrong. */
export function intentFor(question: string): string {
  return guessFor(question)?.intent ?? DEFAULT_INTENT;
}

/**
 * Pending rows to show while the model decides. Empty when we can't tell —
 * an empty ledger is better than an invented one.
 */
export function planFor(question: string): LedgerStep[] {
  const guess = guessFor(question);
  if (!guess) return [];
  return guess.plan.map((p, i) => ({
    id: `guess:${i}`,
    verb: p.verb,
    source: p.source,
    status: "pending" as const,
    provisional: true,
  }));
}

/**
 * Fold a real step into a provisional plan. A guess that named the same record
 * is REPLACED in place (the row keeps its position, so nothing jumps); anything
 * else appends. Called for every `step` event.
 */
export function reconcileStep(steps: LedgerStep[], incoming: LedgerStep): LedgerStep[] {
  const hit = steps.findIndex(s => s.provisional && s.source === incoming.source);
  if (hit === -1) return [...steps, incoming];
  const next = [...steps];
  next[hit] = incoming;
  return next;
}

/** Drop any guess the model didn't corroborate. Called once the batch is known. */
export function dropProvisional(steps: LedgerStep[]): LedgerStep[] {
  return steps.filter(s => !s.provisional);
}

/**
 * Freeze the ledger for the record, once the turn is over one way or another.
 * Guesses and steps that were named but never ran are removed (neither is
 * something we consulted); anything still spinning is settled, so a trace can
 * never rehydrate with a node that will never resolve.
 *
 * Returns the SAME array when nothing needs changing — this runs on every prose
 * delta, and a fresh array each time would rerender the thread per token.
 */
export function settleLedger(steps: LedgerStep[] | undefined): LedgerStep[] {
  if (!steps || steps.length === 0) return steps ?? [];
  const keep = steps.filter(s => !s.provisional && s.status !== "pending");
  const changed = keep.length !== steps.length || keep.some(s => s.status !== "done");
  if (!changed) return steps;
  return keep.map(s => (s.status === "done" ? s : { ...s, status: "done" as const }));
}
