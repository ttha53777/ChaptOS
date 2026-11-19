/**
 * The intent line and the guessed ledger rows shown before the model names a tool.
 * Ported from the web (app/components/chat/intent.ts, which mobile can't import); keep
 * the two in step. Same honesty rules: guesses are pending-only, never post a finding,
 * are reconciled by source when a real step arrives, dropped once the batch is known,
 * and never persisted. No keyword match means no rows.
 */
import type { LedgerStep } from "./types";

interface Guess { match: string[]; intent: string; plan: Array<{ verb: string; source: string }> }

const ROSTER = { verb: "Reading the roster", source: "Roster" };
const ATTENDANCE = { verb: "Pulling attendance", source: "Attendance" };
const TREASURY = { verb: "Reading the treasury", source: "Treasury" };
const LEDGER = { verb: "Summing the ledger", source: "Treasury · ledger" };
const BUDGET = { verb: "Opening the budget", source: "Budget" };
const TIMELINE = { verb: "Checking deadlines", source: "Timeline" };
const EVENTS = { verb: "Scanning the calendar", source: "Events" };

const GUESSES: Guess[] = [
  { match: ["reimburse", "pay me back"], intent: "Drafting your reimbursement…", plan: [] },
  { match: ["excuse", "can t make", "cant make", "won t make"], intent: "Finding the event…", plan: [EVENTS] },
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

const normalize = (q: string) => q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

function guessFor(question: string): Guess | null {
  const q = normalize(question);
  if (!q) return null;
  return GUESSES.find(g => g.match.some(t => q.includes(t))) ?? null;
}

export const intentFor = (question: string) => guessFor(question)?.intent ?? "Searching the records…";

export function planFor(question: string): LedgerStep[] {
  return (guessFor(question)?.plan ?? []).map((p, i) => ({ id: `guess:${i}`, verb: p.verb, source: p.source, status: "pending" as const, provisional: true }));
}

/** A real step replaces the guess that named the same record (in place), else appends. */
export function reconcileStep(steps: LedgerStep[], incoming: LedgerStep): LedgerStep[] {
  const hit = steps.findIndex(s => s.provisional && s.source === incoming.source);
  if (hit === -1) return [...steps, incoming];
  const next = [...steps];
  next[hit] = incoming;
  return next;
}

export const dropProvisional = (steps: LedgerStep[]) => steps.filter(s => !s.provisional);

/** Freeze the ledger once the turn is over: drop guesses and never-run steps, settle the rest. Same array when nothing changes. */
export function settleLedger(steps: LedgerStep[] | undefined): LedgerStep[] {
  if (!steps || steps.length === 0) return steps ?? [];
  const keep = steps.filter(s => !s.provisional && s.status !== "pending");
  const changed = keep.length !== steps.length || keep.some(s => s.status !== "done");
  if (!changed) return steps;
  return keep.map(s => (s.status === "done" ? s : { ...s, status: "done" as const }));
}
