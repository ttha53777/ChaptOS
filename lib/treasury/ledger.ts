/**
 * The Treasury page's rules, shared by the web (app/org/[slug]/treasury/page.tsx) and the
 * app (mobile/src/app/(tabs)/more/treasury.tsx), so the two read the same books the same
 * way: which term is on screen, what's in it, the balance and projection, the gates
 * (books never opened / opened but nothing moved), the breakdown, Coming up, the digest's
 * figures, the statement, and the reimbursement queue.
 *
 * Pure: no React, no clock. "Today" (a local YYYY-MM-DD) and "now" (ms) come in from the
 * caller; a date-only string is read as a calendar date, never through a time zone.
 */
import type { Reimbursement, Transaction, TransactionCategory } from "@/lib/api-types";
import { fmtUsd, money as round2 } from "@/lib/money";
import { netBalance } from "@/lib/treasury-balance";
import { inTerm, termOfTx, type TermRow } from "@/lib/treasury-term";

export type { TermRow };

/** What the page needs of a party (the web's PartyEvent and the wire's Party both fit). */
export interface LedgerParty { id: number; name: string; date: string; doorRevenue: number; attendance: number; notes?: string | null }

/** The org's category catalogue, as both clients hold it. */
export interface CatalogLike {
  options(kind: "income" | "expense", keep?: string | null): { slug: string; label: string }[];
  labelFor(kind: "income" | "expense", slug: string): string;
  colorFor(kind: "income" | "expense", slug: string): string | null;
}

/**
 * The org's own income/expense vocabulary as both clients read it. `options` adds back
 * the row's current slug when it's hidden or deleted, so editing an old row never
 * re-buckets it; `labelFor` falls back to the slug (rows outlive their categories).
 */
export interface Catalog extends CatalogLike {
  all: TransactionCategory[];
  options(kind: "income" | "expense", keep?: string | null): TransactionCategory[];
  labelFor(kind: string, slug: string): string;
  colorFor(kind: string, slug: string): string | null;
}

export function catalogOf(list: readonly TransactionCategory[]): Catalog {
  const byKey = new Map<string, TransactionCategory>();
  for (const c of list) byKey.set(`${c.kind} ${c.slug}`, c);
  return {
    all: [...list],
    options: (kind, keep) => {
      const visible = list.filter(c => c.kind === kind && !c.hidden).sort((a, b) => a.displayOrder - b.displayOrder);
      if (!keep || visible.some(c => c.slug === keep)) return visible;
      const archived = byKey.get(`${kind} ${keep}`);
      return archived
        ? [...visible, archived]
        : [...visible, { id: -1, kind, slug: keep, label: keep, color: "#7a7266", colorDark: null, builtin: false, hidden: true, displayOrder: 9999 }];
    },
    labelFor: (kind, slug) => byKey.get(`${kind} ${slug}`)?.label ?? slug,
    colorFor: (kind, slug) => byKey.get(`${kind} ${slug}`)?.color ?? null,
  };
}

export const fmt$ = (n: number) => fmtUsd(n ?? 0);
export { round2 };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-10-14" → "Oct 14". */
export function fmtDate(s: string): string {
  const [, m, d] = s.split("-").map(Number);
  return `${MONTHS[m! - 1]} ${d}`;
}

/** "2026-10-14" → the paper date block: day, month, weekday. */
export function ppDay(s: string): { d: number; m: string; w: string } {
  const [y, m, d] = s.split("-").map(Number);
  return { d: d!, m: MONTHS[m! - 1] ?? "", w: DOW[new Date(y!, m! - 1, d!).getDay()]! };
}

/** The briefing kicker's "Thu · Nov 19". */
export function dateLabelOf(now: Date): string {
  return `${DOW[now.getDay()]} · ${MONTHS[now.getMonth()]} ${now.getDate()}`;
}

/** A reimbursement is an exact amount owed: always two decimals ($210 → $210.00). */
export function fmtReimb(n: number): string {
  const [int, cents] = Math.abs(n ?? 0).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}$${int!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}

/** "submitted 3 days ago": how stale a request is. */
export function relativeAge(iso: string, nowMs: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((nowMs - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/* ── Which term ───────────────────────────────────────────────────────────────── */

/** Every term something is filed under, plus the active one: chronological where the
 *  dates are known, unknown legacy labels first. */
export function termsOf(transactions: readonly Transaction[], termRows: readonly TermRow[], activeLabel: string | null): string[] {
  const seen = new Set<string>();
  for (const t of transactions) if (!t.deletedAt) { const k = termOfTx(t, termRows); if (k) seen.add(k); }
  if (activeLabel) seen.add(activeLabel);
  const start = (l: string) => termRows.find(r => r.label === l)?.startDate ?? "";
  return Array.from(seen).sort((a, b) => start(a).localeCompare(start(b)) || a.localeCompare(b));
}

/** Picked, else active, else the newest term anything is filed under, else everything (""). */
export const termOnScreen = (picked: string | null, activeLabel: string | null, terms: readonly string[]) =>
  picked ?? activeLabel ?? terms[terms.length - 1] ?? "";

/* ── The books for one term ───────────────────────────────────────────────────── */

export interface Books<P extends LedgerParty = LedgerParty> {
  activeTxns: Transaction[];
  incomeTxns: Transaction[];
  expenseTxns: Transaction[];
  totalIncome: number;
  totalExpenses: number;
  postedExpenses: number;
  scheduledDrain: number;
  parties: P[];
  totalDoorRev: number;
  balance: number;
  projected: number;
  /** Net of the term's rows (the log's "All" total). */
  net: number;
}

export function booksOf<P extends LedgerParty>({ transactions, parties, termRows, term, openingBalance }: {
  transactions: readonly Transaction[]; parties: readonly P[]; termRows: readonly TermRow[]; term: string; openingBalance: number | null;
}): Books<P> {
  const activeTxns = transactions.filter(t => !t.deletedAt && (!term || termOfTx(t, termRows) === term))
    .sort((a, b) => b.date.localeCompare(a.date));
  const incomeTxns = activeTxns.filter(t => t.type === "income");
  const expenseTxns = activeTxns.filter(t => t.type === "expense");
  const sum = (xs: Transaction[]) => xs.reduce((s, t) => s + t.amount, 0);
  const totalIncome = sum(incomeTxns), totalExpenses = sum(expenseTxns);
  const postedExpenses = sum(expenseTxns.filter(t => t.status !== "scheduled"));
  const scheduledDrain = sum(expenseTxns.filter(t => t.status === "scheduled"));
  // PartyEvent has no term column: placed by date, inside the term's range or its year.
  const inTermParties = term ? parties.filter(p => inTerm(p.date, term, termRows)) : [...parties];
  const totalDoorRev = inTermParties.reduce((s, p) => s + p.doorRevenue, 0);
  const balance = netBalance({ openingBalance, doorRevenue: totalDoorRev, income: totalIncome, expense: postedExpenses });
  return {
    activeTxns, incomeTxns, expenseTxns, totalIncome, totalExpenses, postedExpenses, scheduledDrain,
    parties: inTermParties, totalDoorRev, balance,
    projected: Math.round((balance - scheduledDrain) * 1.3),
    net: activeTxns.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0),
  };
}

/**
 * The three kinds of state.
 *  booksUnopened   nobody answered the opening balance and nothing was ever logged
 *                  (0 is an answer, so this tests `!= null`); only once the sections landed
 *  statedUnstarted the books are open but nothing moved in this term
 */
export function booksState({ loaded, openingBalance, transactions, parties, books }: {
  loaded: boolean; openingBalance: number | null | undefined; transactions: readonly Transaction[]; parties: readonly LedgerParty[]; books: Books;
}) {
  const hasOpeningBalance = openingBalance != null;
  const everLogged = transactions.some(t => !t.deletedAt) || parties.length > 0;
  const booksUnopened = loaded && !hasOpeningBalance && !everLogged;
  const hasEntries = books.activeTxns.length > 0 || books.parties.length > 0;
  return { booksUnopened, statedUnstarted: loaded && hasOpeningBalance && !hasEntries };
}

/* ── The log ──────────────────────────────────────────────────────────────────── */

export type TxTab = "all" | "income" | "expense";

/** The category filter: the org's categories for the tab, plus any the rows still use. */
export function categoryOptions(tab: TxTab, catalog: CatalogLike, rows: readonly Transaction[]): { slug: string; label: string }[] {
  const kinds: ("income" | "expense")[] = tab === "income" ? ["income"] : tab === "expense" ? ["expense"] : ["income", "expense"];
  const seen = new Set<string>();
  const out: { slug: string; label: string }[] = [];
  for (const kind of kinds) for (const c of catalog.options(kind)) {
    if (seen.has(c.slug)) continue;
    seen.add(c.slug); out.push({ slug: c.slug, label: c.label });
  }
  for (const t of rows) {
    if (seen.has(t.category)) continue;
    seen.add(t.category); out.push({ slug: t.category, label: catalog.labelFor(t.type, t.category) });
  }
  return out;
}

export function tabRows(books: Books, tab: TxTab, category: string): Transaction[] {
  const base = tab === "income" ? books.incomeTxns : tab === "expense" ? books.expenseTxns : books.activeTxns;
  return category === "all" ? base : base.filter(t => t.category === category);
}

/** The visible rows, newest first, each with the running balance at its date (over the
 *  whole term, so a filtered view still shows the real balance). */
export function withRunning(active: readonly Transaction[], visible: readonly Transaction[], search: string): (Transaction & { running: number })[] {
  const sorted = [...active].sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  const at = new Map<number, number>();
  for (const t of sorted) { running += t.type === "income" ? t.amount : -t.amount; at.set(t.id, running); }
  const needle = search.trim().toLowerCase();
  const rows = needle ? visible.filter(t => t.description?.toLowerCase().includes(needle) || t.category.toLowerCase().includes(needle)) : visible;
  return rows.map(t => ({ ...t, running: at.get(t.id) ?? 0 })).sort((a, b) => b.date.localeCompare(a.date));
}

export const tabTotal = (books: Books, tab: TxTab) => tab === "income" ? books.totalIncome : tab === "expense" ? books.totalExpenses : books.net;

/* ── Breakdown, chart inputs, statement ──────────────────────────────────────── */

export interface CatRow { slug: string; label: string; value: number; color: string | null }

/** Every category with money in it this term, biggest first (no "Other" bucket: each row
 *  is a door into that category's entries). */
export function breakdownOf(books: Books, kind: "income" | "expense", catalog: CatalogLike): CatRow[] {
  const by = new Map<string, number>();
  for (const t of kind === "expense" ? books.expenseTxns : books.incomeTxns) by.set(t.category, (by.get(t.category) ?? 0) + t.amount);
  return [...by.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    .map(([slug, v]) => ({ slug, label: catalog.labelFor(kind, slug), value: round2(v), color: catalog.colorFor(kind, slug) }));
}

/** A movement of money for the chart: signed (+ in, − out). */
export interface ChartEntry { date: string; amount: number; label: string }

/** Posted vs scheduled the way the balance is summed: only scheduled EXPENSES are not
 *  yet in the account, so the solid line ends on the printed balance. */
export function chartEntries(books: Books, catalog: CatalogLike): { posted: ChartEntry[]; scheduled: ChartEntry[] } {
  const label = (t: Transaction) => t.description || catalog.labelFor(t.type, t.category);
  return {
    posted: [
      ...books.activeTxns.filter(t => !(t.type === "expense" && t.status === "scheduled"))
        .map(t => ({ date: t.date, amount: t.type === "income" ? t.amount : -t.amount, label: label(t) })),
      ...books.parties.filter(p => p.doorRevenue > 0).map(p => ({ date: p.date, amount: p.doorRevenue, label: `${p.name} — door` })),
    ],
    scheduled: books.activeTxns.filter(t => t.type === "expense" && t.status === "scheduled")
      .map(t => ({ date: t.date, amount: -t.amount, label: label(t) })),
  };
}

/** Where the line ends (a past term closes on its last day) and where it starts. */
export function chartWindow(termRow: TermRow | null, today: string, posted: readonly ChartEntry[]): { asOf: string; termStart: string } {
  const asOf = termRow && termRow.endDate < today ? termRow.endDate : today;
  return { asOf, termStart: termRow?.startDate ?? [...posted.map(e => e.date)].sort()[0] ?? asOf };
}

/** The statement's lines for one side, biggest first. */
export function statementOf(list: readonly Transaction[], type: "income" | "expense", catalog: CatalogLike): { label: string; amt: number }[] {
  const m = new Map<string, number>();
  for (const t of list) m.set(t.category, (m.get(t.category) ?? 0) + t.amount);
  return [...m.entries()].sort((x, y) => y[1] - x[1]).map(([slug, amt]) => ({ label: catalog.labelFor(type, slug), amt }));
}

/* ── Coming up ───────────────────────────────────────────────────────────────── */

export interface UpcomingCharge { id: number; name: string; dueDate: string | null; outstanding: number; people: number; paidPeople: number }

export function comingUp<P extends LedgerParty>({ transactions, parties, charges, today, chargesToday }: {
  transactions: readonly Transaction[]; parties: readonly P[]; charges: readonly UpcomingCharge[]; today: string; chargesToday?: string;
}) {
  return {
    dues: charges.filter(c => c.dueDate !== null && c.dueDate >= (chargesToday ?? today) && c.outstanding > 0)
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)).slice(0, 3),
    parties: [...parties].filter(p => p.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4),
    txns: transactions.filter(t => !t.deletedAt && t.date > today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4),
  };
}

/* ── Digest ──────────────────────────────────────────────────────────────────── */

export interface DuesRollup { owingCount: number; duesTotal: number; overdue: { n: number; amt: number }; unassigned: boolean }

/** Owing from the roster's duesOwed; overdue from the Dues board (only it knows when). */
export function duesRollup(roster: readonly { duesOwed: number }[], overdueMembers: readonly { overdue: number }[]): DuesRollup {
  return {
    owingCount: roster.filter(b => b.duesOwed > 0).length,
    duesTotal: roster.reduce((s, b) => s + b.duesOwed, 0),
    overdue: { n: overdueMembers.length, amt: overdueMembers.reduce((s, m) => s + m.overdue, 0) },
    // Dues are assigned on the roster on their own schedule: $0 out isn't "settled" when nobody was billed.
    unassigned: roster.length > 0 && roster.every(b => b.duesOwed === 0),
  };
}

/**
 * The digest's figures, each clause a live number (the clients set the words in bold):
 *   "$2,288 in the account, up $2,288 since the term opened. 3 members still owe $420 in
 *    dues, 13 overdue · $2,240, and Rob’s $40 reimbursement is waiting on you. Next out:
 *    formal venue deposit, $500 on Dec 5."
 */
export function digestOf({ books, openingBalance, duesOn, dues, pending, canTreasury, upcomingTxns, memberWord, duesWord }: {
  books: Books; openingBalance: number | null; duesOn: boolean; dues: DuesRollup; pending: readonly Reimbursement[]; canTreasury: boolean;
  upcomingTxns: readonly Transaction[]; memberWord: (plural: boolean) => string; duesWord: string;
}) {
  const termNet = books.balance - (openingBalance ?? 0);
  const firstName = (n: string) => n.trim().split(/\s+/)[0];
  const reimb = canTreasury && pending.length > 0 ? {
    bold: pending.length === 1 ? `${firstName(pending[0]!.brother.name)}’s ${fmt$(pending[0]!.amount)}` : `${pending.length} requests`,
    rest: pending.length === 1 ? "reimbursement is" : "reimbursements are",
  } : null;
  const duesClause = !duesOn ? null : dues.owingCount > 0 ? {
    kind: "owe" as const,
    who: `${dues.owingCount} ${memberWord(dues.owingCount !== 1).toLowerCase()}`,
    verb: dues.owingCount === 1 ? "owes" : "owe",
    amount: fmt$(Math.round(dues.duesTotal)),
    word: duesWord.toLowerCase(),
    overdue: dues.overdue.n > 0 ? `${dues.overdue.n} overdue · ${fmt$(Math.round(dues.overdue.amt))}` : null,
  } : dues.unassigned ? null : { kind: "paid" as const, text: `Every ${memberWord(false).toLowerCase()} is paid up` };
  const nextOut = upcomingTxns.find(t => t.type === "expense");
  return {
    balance: fmt$(Math.round(books.balance)),
    moved: Math.round(termNet) !== 0 ? `, ${termNet > 0 ? "up" : "down"} ${fmt$(Math.round(Math.abs(termNet)))} since the term opened` : "",
    dues: duesClause,
    reimb,
    nextOut: nextOut ? {
      what: `${nextOut.description.split(" — ")[0]!.toLowerCase()}, ${fmt$(Math.round(nextOut.amount))}`,
      on: `${ppDay(nextOut.date).m} ${ppDay(nextOut.date).d}`,
    } : null,
  };
}

/* ── Reimbursements ──────────────────────────────────────────────────────────── */

export function reimbQueue(list: readonly Reimbursement[]) {
  const pending = list.filter(r => r.status === "pending");
  return { pending, archived: list.filter(r => r.status !== "pending"), pendingTotal: pending.reduce((s, r) => s + r.amount, 0) };
}

/** The empty queue's words, for a treasurer and for everyone else. */
export function reimbEmpty(canTreasury: boolean, anyResolved: boolean): { title: string; body: string } {
  return canTreasury
    ? { title: anyResolved ? "Nothing waiting on you." : "No requests yet.", body: "When someone asks to be paid back, their receipt lands here for you to approve or decline." }
    : { title: "No open requests.", body: "Paid for something out of pocket? Send a request with the receipt and it shows up here until the treasurer settles it." };
}

/* ── Day one: the opening balance field ──────────────────────────────────────── */

/** Digits and one decimal point only, cents capped at two, thousands grouped. */
export function formatAmount(input: string): string {
  const clean = input.replace(/[^0-9.]/g, "");
  const dot = clean.indexOf(".");
  let int = (dot === -1 ? clean : clean.slice(0, dot)).replace(/^0+(?=\d)/, "").slice(0, 9);
  if (dot === -1) return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (!int) int = "0";
  const cents = clean.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}

/** Index in `formatted` just past the `n`th non-comma character. */
export function caretAfter(formatted: string, n: number): number {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (formatted[i] !== ",") seen++;
    if (seen === n) return i + 1;
  }
  return formatted.length;
}

/** The typed opening balance, or null when it isn't a number. */
export function parseOpening(raw: string): number | null {
  const v = parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}
