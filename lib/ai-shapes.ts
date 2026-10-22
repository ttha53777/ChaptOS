// Answer shapes — the picture an Ask Chapt answer is drawn as when a ruled list
// of rows isn't the clearest one (_design/Ask Chapt Reply States.html).
//
// The model only NAMES a shape in compose_answer (`shape: {type, metric?,
// start?}`). Everything drawn — every dot, bar, amount and calendar block — is
// built here from org-scoped reads, never from model text. Same rule as the
// answer's `sources` and its row `ref`s: what the model claims is a request, what
// reaches the screen is the database.
//
// Each shape is only built when the model actually consulted that kind of data
// this turn (the evidence below). That keeps a stray `shape` on an unrelated
// answer from painting, say, the whole roster under a question about parties.
//
// A shape also brings its own rows, derived from the same data: they are what
// an older client that doesn't know `shape` renders, and what keyboard
// selection walks on a client that does. A failed build is never fatal — the
// answer goes out with the model's own rows, exactly as before shapes existed.

import type { db } from "@/lib/db";
import type { AnswerRow } from "@/lib/ai-tools";
import { orgThresholds } from "@/lib/ai-tools";
import type { RefIndex } from "@/lib/ai-refs";
import { DATE_RE, isValidCalendarDate, todayISO } from "@/lib/dates";
import type { ShapeRequest } from "@/lib/ai-shape-request";
import { getBrotherStatus, type Brother as BrotherType } from "@/app/data";
import { fmtUsd, money } from "@/lib/money";
import type {
  AnswerShape, AskBack, AskBackPerson, BreakdownPart, BreakdownShape,
  EntityRef, LookedSource, MissingShape, TallyMark, TallyMetric, TallyShape, WeekItem, WeekShape,
} from "@/lib/api-types";

type Scoped = ReturnType<typeof db>;

export { SHAPE_TYPES, TALLY_METRICS, parseShapeRequest, type ShapeRequest, type ShapeType } from "@/lib/ai-shape-request";

// ────────────────────────────────────────────────────────────────────────────
// Evidence — what the model read this turn, by tool name
// ────────────────────────────────────────────────────────────────────────────

export interface ShapeEvidence {
  add(toolName: string, args: Record<string, unknown>, result: unknown): void;
  /** The most recent successful call of a tool, if it ran this turn. */
  get(toolName: string): { args: Record<string, unknown>; result: unknown } | undefined;
}

export function createShapeEvidence(): ShapeEvidence {
  const seen = new Map<string, { args: Record<string, unknown>; result: unknown }>();
  return {
    add(toolName, args, result) {
      if (typeof result === "object" && result !== null && "error" in result) return;
      seen.set(toolName, { args, result });
    },
    get: toolName => seen.get(toolName),
  };
}

export interface BuiltShape {
  shape: AnswerShape;
  rows: AnswerRow[];
}

/**
 * Build the requested shape, or null when the turn didn't read the data it
 * needs, the data is empty, or anything goes wrong. Never throws: this runs on
 * the answer path, after the model has already finished.
 */
export async function buildShape(req: ShapeRequest, evidence: ShapeEvidence, scoped: Scoped, orgId: number): Promise<BuiltShape | null> {
  try {
    if (req.type === "tally") return await buildTally(req, evidence, scoped, orgId);
    if (req.type === "breakdown") return await buildBreakdown(evidence, scoped);
    if (req.type === "week") return await buildWeek(req, evidence, scoped);
    if (req.type === "missing") return await buildMissing(req, evidence, scoped);
  } catch (e) {
    console.error(`buildShape(${req.type}) failed:`, e);
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Tally — the whole roster as dots, the subset the question is about filled
// ────────────────────────────────────────────────────────────────────────────

/** Past this many members the dots stop being countable; the client draws a bar. */
export const TALLY_MAX_MARKS = 150;
const TALLY_TOP = 4;

interface TallyMember {
  id: number;
  name: string;
  role: string;
  attendance: number;
  duesOwed: number;
  serviceHours: number;
  status: string;
}

interface MetricDef {
  hits: (m: TallyMember) => boolean;
  order: (a: TallyMember, b: TallyMember) => number;
  value: (m: TallyMember) => string | null;
  /** A dollar-ranked metric marks its biggest few as "top", with a "$X+" legend. */
  ranked: boolean;
  hitWord: string;
  hitLegend: string;
  restLegend: string;
}

const byName = (a: TallyMember, b: TallyMember) => a.name.localeCompare(b.name);

const METRICS: Record<TallyMetric, MetricDef> = {
  owes_dues: {
    hits: m => m.duesOwed > 0,
    order: (a, b) => b.duesOwed - a.duesOwed || byName(a, b),
    value: m => fmtUsd(m.duesOwed),
    ranked: true,
    hitWord: "owe", hitLegend: "Owes", restLegend: "Paid up",
  },
  at_risk: {
    hits: m => m.status === "At Risk",
    order: (a, b) => a.attendance - b.attendance || byName(a, b),
    value: m => `${Math.round(m.attendance)}%`,
    ranked: false,
    hitWord: "at risk", hitLegend: "At risk", restLegend: "Everyone else",
  },
  no_service_hours: {
    hits: m => m.serviceHours <= 0,
    order: byName,
    value: () => null,
    ranked: false,
    hitWord: "no service hours", hitLegend: "No hours yet", restLegend: "Has hours",
  },
};

/** Which subset the model's own list_brothers call was about, when it didn't say. */
function inferMetric(args: Record<string, unknown>): TallyMetric | undefined {
  if (args.owes_dues_only === true || args.order_by === "duesOwed") return "owes_dues";
  if (args.status === "At Risk") return "at_risk";
  return undefined;
}

/** Pure: roster → tally. Exported for tests. */
export function tallyFromRoster(metric: TallyMetric, roster: TallyMember[]): BuiltShape | null {
  if (roster.length === 0) return null;
  const def = METRICS[metric];
  const hits = roster.filter(def.hits).sort(def.order);
  const rest = roster.filter(m => !def.hits(m)).sort(byName);
  const topCount = def.ranked && hits.length > TALLY_TOP ? TALLY_TOP : 0;

  const marks: TallyMark[] | null = roster.length > TALLY_MAX_MARKS ? null : [
    ...hits.map((m, i): TallyMark => ({ id: m.id, name: m.name, state: i < topCount ? "top" : "hit", value: def.value(m) })),
    ...rest.map((m): TallyMark => ({ id: m.id, name: m.name, state: "rest", value: null })),
  ];
  const topLabel = topCount > 0 ? `${fmtUsd(Math.floor(hits[topCount - 1].duesOwed))}+` : null;

  const shape: TallyShape = {
    type: "tally",
    metric,
    of: roster.length,
    hit: hits.length,
    hitWord: def.hitWord,
    hitLegend: def.hitLegend,
    restLegend: def.restLegend,
    topLabel,
    marks,
  };
  const rows: AnswerRow[] = hits.slice(0, TALLY_TOP).map(m => {
    const value = def.value(m);
    return {
      kind: "person",
      title: m.name,
      ...(m.role ? { subtitle: m.role } : {}),
      ...(value ? { value } : {}),
      ref: { type: "member", id: m.id },
    };
  });
  return { shape, rows };
}

async function buildTally(req: ShapeRequest, evidence: ShapeEvidence, scoped: Scoped, orgId: number): Promise<BuiltShape | null> {
  const read = evidence.get("list_brothers");
  if (!read) return null;
  const metric = req.metric ?? inferMetric(read.args);
  if (!metric) return null;
  // The model may have read a filtered or limited list; a tally needs everyone,
  // so re-read the roster the same way list_brothers does (thresholds cached).
  const [rows, thresholds] = await Promise.all([scoped.member.listRoster(), orgThresholds(scoped, orgId)]);
  return tallyFromRoster(metric, rows.map(b => ({
    id: b.id,
    name: b.name,
    role: b.role,
    attendance: money(b.attendance),
    duesOwed: money(b.duesOwed),
    serviceHours: money(b.serviceHours),
    status: getBrotherStatus(b as BrotherType, thresholds),
  })));
}

// ────────────────────────────────────────────────────────────────────────────
// Breakdown — a total split by category, ranked, with the budget line
// ────────────────────────────────────────────────────────────────────────────

const BREAKDOWN_MAX_PARTS = 6;

interface CategoryMeta { slug: string; label: string; color: string; colorDark: string | null }

/** Pure: per-category amounts → breakdown. Exported for tests. */
export function breakdownFromAmounts(input: {
  kind: "income" | "expense";
  period: string;
  amounts: Array<{ category: string; amount: number }>;
  budgets: Map<string, number> | null;
  categories: CategoryMeta[];
}): BuiltShape | null {
  const meta = new Map(input.categories.map(c => [c.slug, c]));
  const ranked = input.amounts
    .map(a => ({ ...a, amount: money(a.amount) }))
    .filter(a => a.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  if (ranked.length === 0) return null;
  const total = money(ranked.reduce((s, a) => s + a.amount, 0));

  // Past six, the tail folds into one "Other" line so the ribbon stays readable.
  const head = ranked.length > BREAKDOWN_MAX_PARTS ? ranked.slice(0, BREAKDOWN_MAX_PARTS - 1) : ranked;
  const tail = ranked.length > BREAKDOWN_MAX_PARTS ? ranked.slice(BREAKDOWN_MAX_PARTS - 1) : [];
  const share = (n: number) => Math.round((n / total) * 1000) / 10;

  const parts: BreakdownPart[] = head.map(a => {
    const m = meta.get(a.category);
    const budget = input.budgets?.get(a.category);
    return {
      slug: a.category,
      label: m?.label ?? a.category,
      color: m?.color ?? null,
      colorDark: m?.colorDark ?? null,
      amount: a.amount,
      share: share(a.amount),
      budget: budget != null && budget > 0 ? money(budget) : null,
    };
  });
  if (tail.length > 0) {
    const amount = money(tail.reduce((s, a) => s + a.amount, 0));
    parts.push({ slug: null, label: `Other (${tail.length})`, color: null, colorDark: null, amount, share: share(amount), budget: null });
  }

  const shape: BreakdownShape = {
    type: "breakdown",
    kind: input.kind,
    period: input.period,
    total,
    parts,
    hasBudget: parts.some(p => p.budget != null),
  };
  const rows: AnswerRow[] = parts.map(p => ({
    kind: "money",
    title: p.label,
    subtitle: p.budget == null
      ? `${p.share}% of ${fmtUsd(total)}`
      : p.amount > p.budget ? `${fmtUsd(money(p.amount - p.budget))} over budget` : `of ${fmtUsd(p.budget)} budget`,
    value: fmtUsd(p.amount),
    screen: "treasury",
  }));
  return { shape, rows };
}

async function buildBreakdown(evidence: ShapeEvidence, scoped: Scoped): Promise<BuiltShape | null> {
  const sums = evidence.get("sum_transactions");
  const budgetRead = evidence.get("get_budget");
  const budgetResult = budgetRead?.result as {
    semester?: string; allocations?: Array<{ category: string; planned: number; spent: number }>;
  } | undefined;

  let kind: "income" | "expense" = "expense";
  let period: string;
  let semester: string | undefined;
  let amounts: Array<{ category: string; amount: number }>;

  const byCategory = (sums?.result as { byCategory?: Array<{ category: string; income: number; expense: number }> } | undefined)?.byCategory;
  if (sums && Array.isArray(byCategory)) {
    // Draw exactly what the model read — its own filters, its own numbers.
    const filters = (sums.result as { filters?: { start?: string; end?: string; semester?: string; type?: string } }).filters ?? {};
    kind = filters.type === "income" ? "income" : "expense";
    semester = filters.semester;
    period = semester ?? (filters.start || filters.end ? `${filters.start ?? "…"} – ${filters.end ?? "today"}` : "All time");
    amounts = byCategory.map(g => ({ category: g.category, amount: kind === "income" ? g.income : g.expense }));
  } else if (budgetResult?.semester) {
    // Only the budget was read. Its allocations cover budgeted categories only,
    // so re-sum the semester's spending to catch everything else too.
    semester = budgetResult.semester;
    period = semester;
    const groups = await scoped.transaction.groupBy({
      by: ["category"],
      where: { deletedAt: null, semester, type: "expense" },
      _sum: { amount: true },
    });
    amounts = groups.map(g => ({ category: g.category, amount: g._sum.amount ?? 0 }));
  } else {
    return null;
  }

  // Budget ticks only mean something on spending, for the semester they were set for.
  const budgets = kind === "expense" && semester && budgetResult?.semester === semester && Array.isArray(budgetResult.allocations)
    ? new Map(budgetResult.allocations.map(a => [a.category, a.planned]))
    : null;

  const categories = await scoped.transactionCategory.findMany({
    where: { kind },
    select: { slug: true, label: true, color: true, colorDark: true },
  });
  return breakdownFromAmounts({ kind, period: `${kind === "income" ? "Earned" : "Spent"} · ${period}`, amounts, budgets, categories });
}

// ────────────────────────────────────────────────────────────────────────────
// Week — seven days of events and open deadlines
// ────────────────────────────────────────────────────────────────────────────

const WEEK_MAX_ITEMS = 24;

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** "7:00 PM" / "19:00" → minutes past midnight; free text sorts last. */
export function minutesOf(time: string | null): number {
  if (!time) return 24 * 60;
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?\s*$/i.exec(time);
  if (!m) return 24 * 60 + 1;
  let h = Number(m[1]) % 24;
  const min = Number(m[2] ?? 0);
  if (m[3]) { h = h % 12; if (m[3].toLowerCase() === "p") h += 12; }
  return h * 60 + min;
}

/** Pure: rows in the window → week. Exported for tests. */
export function weekFromRows(input: {
  start: string;
  events: Array<{ id: number; title: string; date: string; time: string | null; category: string }>;
  deadlines: Array<{ id: number; title: string; dueDate: string | null }>;
  types: Array<{ slug: string; label: string; color: string; colorDark: string | null }>;
}): BuiltShape {
  const types = new Map(input.types.map(t => [t.slug, t]));
  // A dated task also lives on the Timeline as a `deadline`-type event. Show it
  // once — as the task, which is what peeks and gets ticked off.
  const sameDay = (date: string, title: string) => `${date}|${title.trim().toLowerCase()}`;
  const taskKeys = new Set(input.deadlines.filter(d => d.dueDate).map(d => sameDay(d.dueDate!, d.title)));
  const events = input.events.filter(e => !(e.category === "deadline" && taskKeys.has(sameDay(e.date, e.title))));
  const items: WeekItem[] = [
    ...events.map((e): WeekItem => {
      const t = types.get(e.category);
      return {
        ref: { type: "event", id: e.id },
        kind: e.category === "deadline" ? "deadline" : "event",
        date: e.date,
        time: e.time?.trim() || null,
        title: e.title,
        cat: { slug: e.category, label: t?.label ?? e.category, color: t?.color ?? null, colorDark: t?.colorDark ?? null },
      };
    }),
    ...input.deadlines.filter(d => d.dueDate).map((d): WeekItem => ({
      ref: { type: "task", id: d.id },
      kind: "deadline",
      date: d.dueDate!,
      time: null,
      title: d.title,
      cat: null,
    })),
  ]
    // Within a day: deadlines first (they're what a glance is for), then by time.
    .sort((a, b) => a.date.localeCompare(b.date)
      || (a.kind === b.kind ? 0 : a.kind === "deadline" ? -1 : 1)
      || minutesOf(a.time) - minutesOf(b.time))
    .slice(0, WEEK_MAX_ITEMS);

  const shape: WeekShape = { type: "week", start: input.start, items };
  const rows: AnswerRow[] = items.map(it => ({
    kind: it.kind === "deadline" ? "task" : "event",
    title: it.title,
    subtitle: it.kind === "deadline" ? "Deadline" : it.cat?.label ?? "Event",
    value: weekdayShort(it.date) + (it.time ? ` · ${it.time}` : ""),
    ref: it.ref,
  }));
  return { shape, rows };
}

function weekdayShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function startArg(read: { args: Record<string, unknown> } | undefined): string | undefined {
  const s = read?.args.start;
  return typeof s === "string" && DATE_RE.test(s) && isValidCalendarDate(s) ? s : undefined;
}

async function buildWeek(req: ShapeRequest, evidence: ShapeEvidence, scoped: Scoped): Promise<BuiltShape | null> {
  const cal = evidence.get("list_calendar_events");
  const due = evidence.get("list_deadlines");
  const digest = evidence.get("weekly_digest");
  if (!cal && !due && !digest) return null;
  const digestStart = (digest?.result as { weekRange?: { start?: string } } | undefined)?.weekRange?.start;
  const start = req.start ?? startArg(cal) ?? startArg(due)
    ?? (typeof digestStart === "string" && isValidCalendarDate(digestStart) ? digestStart : undefined)
    ?? todayISO();
  const end = addDaysISO(start, 6);

  const [events, deadlines, types] = await Promise.all([
    scoped.calendarEvent.findMany({
      where: { date: { gte: start, lte: end } },
      select: { id: true, title: true, date: true, time: true, category: true },
      orderBy: { date: "asc" },
    }),
    scoped.task.findMany({
      where: { dueDate: { gte: start, lte: end }, status: "open" },
      select: { id: true, title: true, dueDate: true },
    }),
    scoped.calendarEventType.findMany({ select: { slug: true, label: true, color: true, colorDark: true } }),
  ]);
  return weekFromRows({ start, events, deadlines, types });
}

// ────────────────────────────────────────────────────────────────────────────
// Missing — a search that found nothing, shown as its receipt
// ────────────────────────────────────────────────────────────────────────────

/** One searchable item, as the receipt and the closest-match rows need it. */
export interface LookItem {
  title: string;
  date: string | null;
  ref?: EntityRef;
}

interface LookSourceDef {
  source: LookedSource;
  label: string;
  /** Re-read the same scope the model's call covered — every title in it, not just its filtered hits. */
  fetch: (scoped: Scoped, args: Record<string, unknown>) => Promise<LookItem[]>;
  scope: (args: Record<string, unknown>) => string;
}

/** Enough to cover any chapter's history; titles only. */
const LOOK_FETCH_MAX = 2000;

function windowArgs(args: Record<string, unknown>): { start?: string; end?: string } {
  const pick = (v: unknown) => (typeof v === "string" && DATE_RE.test(v) && isValidCalendarDate(v) ? v : undefined);
  return { start: pick(args.start), end: pick(args.end) };
}
function dateWhere(args: Record<string, unknown>) {
  const { start, end } = windowArgs(args);
  return start || end ? { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } : undefined;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}
function windowLabel(args: Record<string, unknown>): string {
  const { start, end } = windowArgs(args);
  if (start && end) return `${fmtDay(start)} – ${fmtDay(end)}`;
  if (start) return `from ${fmtDay(start)}`;
  if (end) return `through ${fmtDay(end)}`;
  return "all dates";
}

/**
 * The places a "not found" can honestly claim it looked: the search tools whose
 * scope can be re-read by title. A tool that isn't here never appears in the
 * receipt, so the receipt can't claim a search it can't stand behind.
 */
const LOOK_SOURCES: Record<string, LookSourceDef> = {
  list_calendar_events: {
    source: "events", label: "Timeline",
    fetch: async (scoped, args) => {
      const date = dateWhere(args);
      const rows = await scoped.calendarEvent.findMany({
        where: { ...(date ? { date } : {}), ...(typeof args.category === "string" ? { category: args.category } : {}) },
        select: { id: true, title: true, date: true }, take: LOOK_FETCH_MAX,
      });
      return rows.map(r => ({ title: r.title, date: r.date, ref: { type: "event", id: r.id } }));
    },
    scope: args => `${windowLabel(args)} · ${typeof args.category === "string" ? args.category : "all types"}`,
  },
  list_service_events: {
    source: "service", label: "Service events",
    fetch: async (scoped, args) => {
      const date = dateWhere(args);
      const rows = await scoped.serviceEvent.findMany({ where: date ? { date } : {}, select: { title: true, date: true }, take: LOOK_FETCH_MAX });
      return rows.map(r => ({ title: r.title, date: r.date }));
    },
    scope: windowLabel,
  },
  list_programming_events: {
    source: "programming", label: "Programming board",
    fetch: async (scoped, args) => {
      // Ideas are undated, so only a start bound narrows the board.
      const { start, end } = windowArgs(args);
      const rows = await scoped.programmingEvent.findMany({
        where: start ? { date: { gte: start, ...(end ? { lte: end } : {}) } } : {},
        select: { title: true, date: true }, take: LOOK_FETCH_MAX,
      });
      return rows.map(r => ({ title: r.title, date: r.date }));
    },
    scope: args => (windowArgs(args).start ? windowLabel(args) : "ideas, drafts, confirmed"),
  },
  list_deadlines: {
    source: "deadlines", label: "Deadlines",
    fetch: async (scoped, args) => {
      const date = dateWhere(args);
      const rows = await scoped.task.findMany({ where: { dueDate: date ?? { not: null } }, select: { id: true, title: true, dueDate: true }, take: LOOK_FETCH_MAX });
      return rows.map(r => ({ title: r.title, date: r.dueDate, ref: { type: "task", id: r.id } }));
    },
    scope: windowLabel,
  },
  search_docs: {
    source: "docs", label: "Docs",
    fetch: async scoped => {
      const rows = await scoped.doc.findMany({ select: { title: true }, take: LOOK_FETCH_MAX });
      return rows.map(r => ({ title: r.title, date: null }));
    },
    scope: () => "every doc and link",
  },
};

const TERM_STOPWORDS = new Set(["the", "and", "for", "our", "with", "event", "events", "this", "that", "next", "last"]);

/** "the Beach Clean-up" → ["beach", "cleanup"]. Exported for tests. */
export function termTokens(term: string): string[] {
  const words = term.toLowerCase().split(/\s+/).map(w => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(w => w.length >= 3 && !TERM_STOPWORDS.has(w));
  return [...new Set(words)];
}

/** Share of the term's words a title contains, 0–1. Hyphens and spacing don't count against it. */
export function termScore(tokens: string[], title: string): number {
  if (tokens.length === 0) return 0;
  const hay = title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  return tokens.filter(t => hay.includes(t)).length / tokens.length;
}

/**
 * Pure: what each source holds → the receipt, or null when the claim "nothing
 * matched" isn't true. If any title fully matches, the model missed it, and a
 * NO MATCH stamp over a real match would be a lie — so nothing is drawn and the
 * model's own rows stand. Exported for tests.
 */
export function missingFromLooks(term: string, looks: Array<{ def: Pick<LookSourceDef, "source" | "label">; scope: string; items: LookItem[] }>, today: string): BuiltShape | null {
  const tokens = termTokens(term);
  if (tokens.length === 0 || looks.length === 0) return null;
  if (looks.some(l => l.items.some(it => termScore(tokens, it.title) === 1))) return null;

  const shape: MissingShape = {
    type: "missing",
    term,
    looked: looks.map(l => ({ source: l.def.source, label: l.def.label, scope: l.scope, of: l.items.length })),
  };
  // Closest = most of the term's words, then nearest to today.
  const dist = (d: string | null) => (d ? Math.abs(Date.parse(d) - Date.parse(today)) : Number.MAX_SAFE_INTEGER);
  const seen = new Set<string>();
  const closest = looks
    .flatMap(l => l.items.map(it => ({ it, def: l.def, score: termScore(tokens, it.title) })))
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score || dist(a.it.date) - dist(b.it.date))
    .filter(c => { const k = c.it.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 3);
  const rows: AnswerRow[] = closest.map(({ it, def }) => {
    const when = it.date ? `${fmtDay(it.date)}${it.date < today ? " · past" : ""}` : null;
    return {
      kind: def.source === "deadlines" ? "task" : def.source === "docs" ? "generic" : "event",
      title: it.title,
      subtitle: [def.label, when].filter(Boolean).join(" · "),
      ...(it.ref ? { ref: it.ref } : def.source === "docs" ? { screen: "docs" as const } : { ask: `Tell me about "${it.title}"` }),
    };
  });
  return { shape, rows };
}

async function buildMissing(req: ShapeRequest, evidence: ShapeEvidence, scoped: Scoped): Promise<BuiltShape | null> {
  if (!req.term) return null;
  const used = Object.entries(LOOK_SOURCES).flatMap(([tool, def]) => {
    const read = evidence.get(tool);
    return read ? [{ def, args: read.args }] : [];
  });
  if (used.length === 0) return null;
  // Sequential: the scoped pool is two connections, and these are cheap.
  const looks: Array<{ def: LookSourceDef; scope: string; items: LookItem[] }> = [];
  for (const u of used) looks.push({ def: u.def, scope: u.def.scope(u.args), items: await u.def.fetch(scoped, u.args) });
  return missingFromLooks(req.term, looks, todayISO());
}

// ────────────────────────────────────────────────────────────────────────────
// Which one — an ask-back whose chips are all members becomes person cards
// ────────────────────────────────────────────────────────────────────────────

/**
 * When every chip of an ask-back question names a member seen this turn (2–4 of
 * them — a get_brother that matched several), attach who each one is, so the
 * client can draw people instead of bare names. The chips themselves are
 * untouched: tapping a card still sends the chip's text, as before.
 */
export async function attachPeople(askback: AskBack, refs: RefIndex, scoped: Scoped, orgId: number): Promise<AskBack> {
  const resolved = askback.questions.map(q => {
    if (q.chips.length < 2 || q.chips.length > 4) return null;
    const ids = q.chips.map(c => refs.lookup(c, "person"));
    if (ids.some(r => !r || r.type !== "member")) return null;
    if (new Set(ids.map(r => r!.id)).size !== ids.length) return null;
    return ids.map(r => r!.id);
  });
  const wanted = [...new Set(resolved.flatMap(ids => ids ?? []))];
  if (wanted.length === 0) return askback;

  try {
    const [rows, thresholds] = await Promise.all([
      scoped.member.listRoster({ where: { brotherId: { in: wanted } } }),
      orgThresholds(scoped, orgId),
    ]);
    const byId = new Map(rows.map(b => [b.id, b]));
    return {
      ...askback,
      questions: askback.questions.map((q, qi) => {
        const ids = resolved[qi];
        if (!ids || ids.some(id => !byId.has(id))) return q;
        const people = peopleCards(ids.map(id => {
          const b = byId.get(id)!;
          return { id, name: b.name, role: b.role, attendance: money(b.attendance), status: getBrotherStatus(b as BrotherType, thresholds) };
        }));
        return { ...q, people };
      }),
    };
  } catch (e) {
    console.error("attachPeople failed:", e);
    return askback;
  }
}

/** Pure: candidates → cards, flagging the facts that tell them apart. Exported for tests. */
export function peopleCards(list: Array<{ id: number; name: string; role: string; attendance: number; status: string }>): AskBackPerson[] {
  const STANDING: Record<string, string> = { Good: "Good standing", Watch: "On watch", "At Risk": "At risk" };
  const facts = list.map(p => [
    { key: "status", label: STANDING[p.status] ?? p.status },
    { key: "attendance", label: `${Math.round(p.attendance)}% attendance` },
  ]);
  const differs = (key: string) => new Set(facts.map(f => f.find(x => x.key === key)!.label)).size > 1;
  return list.map((p, i) => ({
    ref: { type: "member", id: p.id },
    name: p.name,
    role: p.role || null,
    facts: facts[i].map(f => ({ label: f.label, diff: differs(f.key) })),
  }));
}
