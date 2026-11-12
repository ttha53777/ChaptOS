// Figure (docs/ask-chapt-answer-system-plan.md, Phase 2): one quantity, drawn
// big, with how it's counted. v1 covers the treasury balance and the roster
// count.
//
// Same rule as every shape: the model names `figure` + a metric, and every
// number here is read back from the database. The "how it's counted" terms are
// the same parts get_treasury adds up (netBalance), so they can't disagree with
// the figure; if they ever would, they're dropped rather than drawn wrong.

import type { db } from "@/lib/db";
import type { AnswerRow } from "@/lib/ai-tools";
import type { ShapeRequest } from "@/lib/ai-shape-request";
import { listItems, prop, type ShapeEvidence } from "@/lib/ai-shape-evidence";
import { getActiveSemester } from "@/lib/attendance";
import { money } from "@/lib/money";
import type { FigureShape } from "@/lib/api-types";
import type { BuiltShape } from "@/lib/ai-shapes";

type Scoped = ReturnType<typeof db>;
interface Opts { rows: AnswerRow[]; today: string }

/** Fewer points than this isn't a trend; no sparkline is drawn. */
export const FIGURE_MIN_POINTS = 4;
/** A sparkline is a glance: more dates than this are thinned, keeping the last. */
export const FIGURE_MAX_POINTS = 40;

export async function buildFigure(req: ShapeRequest, evidence: ShapeEvidence, scoped: Scoped, _orgId: number, o: Opts): Promise<BuiltShape | null> {
  if (req.figure === "balance") return buildBalance(evidence, scoped, o.today);
  if (req.figure === "members") return buildMembers(evidence, scoped, o.today);
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Balance
// ────────────────────────────────────────────────────────────────────────────

interface TreasuryRead {
  balance: number;
  breakdown: { openingBalance: number | null; doorRevenue: number; income: number; expense: number };
}

function treasuryRead(result: unknown): TreasuryRead | null {
  const t = result as Partial<TreasuryRead> | null;
  if (!t || typeof t.balance !== "number" || !t.breakdown) return null;
  const b = t.breakdown;
  if (typeof b.doorRevenue !== "number" || typeof b.income !== "number" || typeof b.expense !== "number") return null;
  return { balance: t.balance, breakdown: { openingBalance: typeof b.openingBalance === "number" ? b.openingBalance : null, doorRevenue: b.doorRevenue, income: b.income, expense: b.expense } };
}

/** The first day of `today`'s month — what "since" a balance delta is measured from. */
export function monthStart(today: string): string {
  return `${today.slice(0, 7)}-01`;
}

/**
 * Pure: get_treasury's result + dated ledger movements → the figure. Exported
 * for tests. `moves` are signed (income and door revenue positive, expenses
 * negative), any order; `windowStart` bounds the sparkline, not the sums.
 */
export function balanceFigure(input: {
  read: TreasuryRead;
  moves: Array<{ date: string; amount: number }>;
  today: string;
  windowStart: string | null;
  termLabel: string | null;
}): BuiltShape<FigureShape> {
  const { read, today } = input;
  const b = read.breakdown;
  const parts: NonNullable<FigureShape["terms"]> = [
    ...(b.openingBalance != null && b.openingBalance !== 0 ? [{ label: "Opening", amount: money(Math.abs(b.openingBalance)), op: (b.openingBalance < 0 ? "-" : "+") as "+" | "-" }] : []),
    ...(b.doorRevenue > 0 ? [{ label: "Door revenue", amount: money(b.doorRevenue), op: "+" as const }] : []),
    { label: "Income", amount: money(b.income), op: "+" },
    { label: "Expenses", amount: money(b.expense), op: "-" },
  ];
  const sum = parts.reduce((s, t) => s + (t.op === "+" ? t.amount : -t.amount), 0);
  const terms = Math.abs(sum - read.balance) < 0.01 ? parts : null;

  // Running balance by date, from the opening balance. The last point must land
  // on the figure itself, or the line is describing a different ledger.
  const byDate = new Map<string, number>();
  for (const m of input.moves) byDate.set(m.date, (byDate.get(m.date) ?? 0) + m.amount);
  const dates = [...byDate.keys()].filter(d => d <= today).sort();
  let running = b.openingBalance ?? 0;
  const points: Array<{ date: string; value: number }> = [];
  let before = running;
  const since = monthStart(today);
  for (const d of dates) {
    running += byDate.get(d)!;
    if (d < since) before = running;
    if (!input.windowStart || d >= input.windowStart) points.push({ date: d, value: money(running) });
  }
  const landed = points.length > 0 && Math.abs(points[points.length - 1].value - read.balance) < 0.01;
  let series = landed && points.length >= FIGURE_MIN_POINTS ? points : null;
  if (series && series.length > FIGURE_MAX_POINTS) {
    const step = series.length / FIGURE_MAX_POINTS;
    series = Array.from({ length: FIGURE_MAX_POINTS }, (_, i) => series![Math.min(series!.length - 1, Math.round((i + 1) * step) - 1)]);
  }
  const by = money(read.balance - before);
  return {
    shape: {
      type: "figure",
      metric: "balance",
      kicker: input.termLabel ? `Treasury · balance · ${input.termLabel}` : "Treasury · balance",
      value: money(read.balance),
      unit: "usd",
      delta: landed && by !== 0 ? { by, since } : null,
      series,
      terms,
      split: null,
      asOf: today,
    },
    rows: [],
  };
}

async function buildBalance(evidence: ShapeEvidence, scoped: Scoped, today: string): Promise<BuiltShape | null> {
  const read = treasuryRead(evidence.get("get_treasury")?.result);
  if (!read) return null;
  // The same rows get_treasury sums (non-deleted transactions, every party's
  // door take), now with their dates. Any member can read the treasury, so this
  // shows nothing the tool didn't. Two reads, one at a time (pool of 2).
  const txs = await scoped.transaction.findMany({ where: { deletedAt: null }, select: { date: true, type: true, amount: true } }) as Array<{ date: string; type: string; amount: number }>;
  const parties = await scoped.partyEvent.findMany({ select: { date: true, doorRevenue: true } }) as Array<{ date: string; doorRevenue: number | null }>;
  const semester = await getActiveSemester(scoped);
  const moves = [
    ...txs.map(t => ({ date: t.date, amount: t.type === "income" ? t.amount : -t.amount })),
    ...parties.filter(p => p.doorRevenue).map(p => ({ date: p.date, amount: p.doorRevenue! })),
  ];
  return balanceFigure({ read, moves, today, windowStart: semester?.startDate ?? null, termLabel: semester?.label ?? null });
}

// ────────────────────────────────────────────────────────────────────────────
// Members
// ────────────────────────────────────────────────────────────────────────────

/** Pure: roster joined dates → the figure, split by whether they joined this term. */
export function membersFigure(input: { joined: string[]; termStart: string | null; termLabel: string | null; today: string }): BuiltShape<FigureShape> | null {
  const n = input.joined.length;
  if (n === 0) return null;
  const during = input.termStart ? input.joined.filter(d => d.slice(0, 10) >= input.termStart!).length : 0;
  const split = input.termStart && input.termLabel && during > 0
    ? [{ label: `Joined before ${input.termLabel}`, count: n - during }, { label: "Joined this term", count: during }]
    : null;
  return {
    shape: {
      type: "figure",
      metric: "members",
      kicker: input.termLabel ? `Roster · active · ${input.termLabel}` : "Roster · active",
      value: n,
      unit: "count",
      delta: null,
      series: null,
      terms: null,
      split,
      asOf: input.today,
    },
    rows: [],
  };
}

async function buildMembers(evidence: ShapeEvidence, scoped: Scoped, today: string): Promise<BuiltShape | null> {
  // Only a whole-roster read counts: "who owes dues" also calls list_brothers,
  // and its count is a subset, not the roster.
  const read = evidence.get("list_brothers");
  if (!read) return null;
  const args = read.args;
  if (args.owes_dues_only === true || (typeof args.status === "string" && args.status !== "Any")) return null;
  const listed = prop(read.result, "brothers") ?? listItems(read.result);
  if (!Array.isArray(listed) || listed.length === 0) return null;
  const roster = await scoped.member.listRoster();
  const semester = await getActiveSemester(scoped);
  return membersFigure({ joined: roster.map(r => r.joinedAt), termStart: semester?.startDate ?? null, termLabel: semester?.label ?? null, today });
}
