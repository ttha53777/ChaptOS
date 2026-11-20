/**
 * Treasury → Dues, the rules both clients use (the web's app/components/treasury/dues/*,
 * the app's mobile/src/treasury/dues/*): standing words and order, a member's row over
 * the whole term or one charge, the lanes, the Overview card's figures, and the Hand out
 * sheet's dates, receipt and hint. Money is read off GET /api/dues as sent; nothing here
 * re-derives it beyond scoping and sorting.
 *
 * Pure. "Today" is the board's own `today` (the server's local date for the org).
 */
import type { Brother } from "@/lib/api-types";
import type { DuesBoard, DuesChargeSummary, DuesStanding, MemberDuesStanding } from "@/lib/api-types/dues";
import { roleTitle } from "@/lib/dashboard/roster";
import { daysBetween } from "@/lib/dues-ledger";
import { fmtUsd } from "@/lib/money";

/** Display order everywhere a list is grouped by standing: the ones to chase first. */
export const STANDING_ORDER: DuesStanding[] = ["overdue", "due", "paid", "none"];

/** The punch strip reads left to right as progress: settled first, gaps last. */
export const STRIP_ORDER: DuesStanding[] = ["paid", "due", "overdue", "none"];

export const STANDING: Record<DuesStanding, { lane: string; chip: string; hint: string }> = {
  overdue: { lane: "Overdue",       chip: "Overdue",        hint: "Past their due date" },
  due:     { lane: "Owes · Active", chip: "Not due yet",    hint: "Billed, still inside the window" },
  paid:    { lane: "Paid up",       chip: "Paid up",        hint: "Nothing left on the tab" },
  none:    { lane: "Nothing billed", chip: "Nothing billed", hint: "Not on any charge yet" },
};

export const money = fmtUsd;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-01" → "Oct 1". */
export function fmtDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m! - 1]} ${d}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Each charge's stub colour: stable per charge, neutral ("card") for the carried-over balance. */
export const CHARGE_TONES = ["butter", "lilac", "peach", "sky", "mint"] as const;
export type ChargeTone = typeof CHARGE_TONES[number] | "card";
export function chargeToneKey(c: Pick<DuesChargeSummary, "id" | "audienceKind">): ChargeTone {
  if (c.audienceKind === "carryover") return "card";
  return CHARGE_TONES[c.id % CHARGE_TONES.length]!;
}

/** "$140 ea" or "$90–140". */
export function chargeAmounts(c: Pick<DuesChargeSummary, "amounts">): { text: string; each: boolean } {
  const a = c.amounts;
  if (a.length === 1) return { text: money(a[0]!), each: true };
  return { text: `${money(a[0]!)}–${money(a[a.length - 1]!).slice(1)}`, each: false };
}

/** The short status under a tag's amount: "12d late", "due Oct 30". */
export function standingLine(s: DuesStanding, lateDays: number, nextDueDate: string | null): string {
  if (s === "overdue") return `${lateDays}d late`;
  if (s === "due") return nextDueDate ? `due ${fmtDay(nextDueDate)}` : "owes";
  return "";
}

/** "Overdue · 18 days" / "Due in 11 days" / "No due date" for one open line. */
export function dueLine(dueDate: string | null, today: string): string {
  if (!dueDate) return "No due date";
  const d = daysBetween(today, dueDate);
  if (d < 0) return `Overdue · ${plural(-d, "day")}`;
  if (d === 0) return "Due today";
  return `Due in ${plural(d, "day")}`;
}

/** Two initials for an avatar fallback. */
export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

/* ── People and rows ─────────────────────────────────────────────────────────── */

export type DuesFilter = "all" | DuesStanding;

export interface DuesPerson {
  id: number;
  name: string;
  title: string;
  avatarUrl: string | null;
  /** Highest-ranked role, for the Role grouping; null = holds none. */
  topRole: { id: number; name: string; rank: number } | null;
  /** Every role they hold — what a by-role charge bills them for. */
  roleIds: number[];
}

/** Roster rows → what the Dues tab shows for a person. */
export function toPeople(roster: readonly Pick<Brother, "id" | "name" | "avatarUrl" | "role" | "roles">[]): Map<number, DuesPerson> {
  const out = new Map<number, DuesPerson>();
  for (const b of roster) {
    const top = [...(b.roles ?? [])].sort((x, y) => y.rank - x.rank)[0] ?? null;
    out.set(b.id, {
      id: b.id, name: b.name, title: roleTitle(b), avatarUrl: b.avatarUrl ?? null,
      topRole: top ? { id: top.id, name: top.name, rank: top.rank } : null,
      roleIds: (b.roles ?? []).map(r => r.id),
    });
  }
  return out;
}

/** Anyone the board names but the roster doesn't (archived) still gets a row. */
export function personFor(people: Map<number, DuesPerson>, id: number): DuesPerson {
  return people.get(id) ?? { id, name: "Former member", title: "No longer on the roster", avatarUrl: null, topRole: null, roleIds: [] };
}

/** Every role someone on the roster holds, highest rank first. */
export interface RoleOption { id: number; name: string; rank: number }
export function rolesOf(roster: readonly Pick<Brother, "roles">[]): RoleOption[] {
  const out = new Map<number, RoleOption>();
  for (const b of roster) for (const r of b.roles ?? []) out.set(r.id, { id: r.id, name: r.name, rank: r.rank });
  return [...out.values()].sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name));
}

/** One member's position in the current view (the whole term, or one charge). */
export interface DuesRow {
  p: DuesPerson;
  s: DuesStanding;
  billed: number;
  paid: number;
  owes: number;
  lateDays: number;
  nextDueDate: string | null;
}

export function rowFor(m: MemberDuesStanding, p: DuesPerson, scope: DuesChargeSummary | null, today: string): DuesRow | null {
  if (!scope) {
    return { p, s: m.standing, billed: m.billed, paid: m.paid, owes: m.owes, lateDays: m.lateDays, nextDueDate: m.nextDueDate };
  }
  const line = m.lines.find(l => l.chargeId === scope.id);
  if (!line) return null;
  const late = line.rest > 0 && scope.dueDate !== null && scope.dueDate < today;
  return {
    p,
    s: line.rest === 0 ? "paid" : late ? "overdue" : "due",
    billed: line.amount,
    paid: Math.round((line.amount - line.rest) * 100) / 100,
    owes: line.rest,
    lateDays: late ? daysBetween(scope.dueDate!, today) : 0,
    nextDueDate: line.rest > 0 ? scope.dueDate : null,
  };
}

export function rowsOf(board: DuesBoard, people: Map<number, DuesPerson>, scope: DuesChargeSummary | null): DuesRow[] {
  return board.members.map(m => rowFor(m, personFor(people, m.brotherId), scope, board.today)).filter((r): r is DuesRow => r !== null);
}

/** The hero's sums over the rows in view. */
export function heroOf(rows: readonly DuesRow[]) {
  const count = (s: DuesStanding) => rows.filter(r => r.s === s).length;
  const sum = (pick: (r: DuesRow) => number, only?: DuesStanding) =>
    Math.round(rows.filter(r => !only || r.s === only).reduce((t, r) => t + pick(r), 0) * 100) / 100;
  const billed = sum(r => r.billed), paid = sum(r => r.paid);
  return {
    count, billed, paid,
    overdue: sum(r => r.owes, "overdue"), due: sum(r => r.owes, "due"),
    pct: billed ? Math.floor((paid / billed) * 100) : 0,
  };
}

export const stripOrder = (rows: readonly DuesRow[]) =>
  STRIP_ORDER.flatMap(s => rows.filter(r => r.s === s).sort((a, b) => a.p.name.localeCompare(b.p.name)));

export function visibleRows(rows: readonly DuesRow[], filter: DuesFilter, q: string): DuesRow[] {
  const needle = q.trim().toLowerCase();
  return rows.filter(r => (filter === "all" || r.s === filter)
    && (!needle || r.p.name.toLowerCase().includes(needle) || r.p.title.toLowerCase().includes(needle)));
}

export interface Lane { key: string; label: string; s: DuesStanding | null; rows: DuesRow[]; bill?: number | "none"; out: number }

/** The wall's lanes, by standing or by each person's top role, each sorted the web's way. */
export function lanesOf(rows: readonly DuesRow[], group: "standing" | "role"): Lane[] {
  const raw = group === "standing"
    ? STANDING_ORDER.map(s => ({ key: s as string, label: STANDING[s].lane, s: s as DuesStanding | null, rows: rows.filter(r => r.s === s), bill: undefined as number | "none" | undefined }))
    : (() => {
        const byRole = new Map<string, { label: string; rank: number; rows: DuesRow[] }>();
        for (const r of rows) {
          const key = r.p.topRole ? `r${r.p.topRole.id}` : "none";
          const lane = byRole.get(key) ?? { label: r.p.topRole?.name ?? "Members", rank: r.p.topRole?.rank ?? -Infinity, rows: [] };
          lane.rows.push(r);
          byRole.set(key, lane);
        }
        return [...byRole.entries()].sort((a, b) => b[1].rank - a[1].rank).map(([key, l]) => ({
          key, label: l.label, s: null as DuesStanding | null, rows: l.rows,
          bill: (key === "none" ? "none" : Number(key.slice(1))) as number | "none" | undefined,
        }));
      })();
  return raw.filter(l => l.rows.length).map(l => ({
    ...l,
    rows: [...l.rows].sort((a, b) => group === "role"
      ? STANDING_ORDER.indexOf(a.s) - STANDING_ORDER.indexOf(b.s) || b.owes - a.owes
      : b.owes - a.owes || b.lateDays - a.lateDays || a.p.name.localeCompare(b.p.name)),
    out: Math.round(l.rows.reduce((t, r) => t + r.owes, 0) * 100) / 100,
  }));
}

/** The list view's order. */
export const tableOrder = (rows: readonly DuesRow[]) =>
  [...rows].sort((a, b) => STANDING_ORDER.indexOf(a.s) - STANDING_ORDER.indexOf(b.s) || b.owes - a.owes);

/* ── Overview card ───────────────────────────────────────────────────────────── */

export function quickCardOf(board: DuesBoard, nameOf: (id: number) => string) {
  const by: Record<DuesStanding, MemberDuesStanding[]> = { overdue: [], due: [], paid: [], none: [] };
  for (const m of board.members) by[m.standing].push(m);
  const { billed, paid } = board.totals;
  const next = board.charges
    .filter(c => c.dueDate !== null && c.dueDate >= board.today && c.outstanding > 0)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0] ?? null;
  return {
    by,
    owe: by.overdue.length + by.due.length,
    billed, paid,
    pct: billed ? Math.floor((paid / billed) * 100) : 0,
    sum: (s: DuesStanding) => Math.round(by[s].reduce((t, m) => t + m.owes, 0) * 100) / 100,
    order: STRIP_ORDER.flatMap(s => [...by[s]].sort((a, b) => nameOf(a.brotherId).localeCompare(nameOf(b.brotherId)))),
    next,
    /** Most owed first. */
    owingFirst: (ms: readonly MemberDuesStanding[]) => [...ms].sort((a, b) => b.owes - a.owes),
  };
}

/* ── Hand out ────────────────────────────────────────────────────────────────── */

export type SheetMode = "all" | "role" | "pick";
export type DueChoice = "2w" | "eom" | "custom" | "none";

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The last day of today's month — or of next month, when today already is it. */
export function endOfMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
  return last === iso ? new Date(Date.UTC(y!, m! + 1, 0)).toISOString().slice(0, 10) : last;
}

/** Cents → "$140" or "$33.34". */
export const cash = (cents: number) => money(cents / 100);

/** "12.5" → 12.5; anything that isn't a positive amount → 0. Rounded to the cent. */
export function parseDollars(s: string): number {
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

export function dueDateOf(due: DueChoice, today: string, custom: string): string | null {
  return due === "2w" ? addDays(today, 14) : due === "eom" ? endOfMonth(today) : due === "custom" ? custom : null;
}

export const chargeSuggestions = (duesWord: string) =>
  [`Fall ${duesWord.toLowerCase()}`, `Spring ${duesWord.toLowerCase()}`, "Formal ticket", "Late fine", "Chapter shirt", "Retreat"];

/** Why Bill is off, in the order the sheet asks for things. */
export function handOutHint({ selectedCount, name, rowMissingAmt, customBad, lines, skipped }: {
  selectedCount: number; name: string; rowMissingAmt: boolean; customBad: boolean; lines: number; skipped: number;
}): string {
  return !selectedCount ? "Pick at least one person."
    : !name.trim() ? "Give it a name."
    : rowMissingAmt ? "Set an amount for every checked row."
    : customBad ? "Pick a due date."
    : !lines && skipped ? "They all have this already."
    : "Set an amount.";
}

/** "$90 ÷ 4 = $22.50 each, a cent more for the first few". */
export function splitNote(totalDollars: number, n: number): { lead: string; each: string; tail: string } | null {
  if (!n || !totalDollars) return null;
  const cents = Math.round(totalDollars * 100);
  return { lead: `${money(totalDollars)} ÷ ${n} = `, each: cash(Math.floor(cents / n)), tail: cents % n ? " each, a cent more for the first few" : " each" };
}

/* ── Member drawer ───────────────────────────────────────────────────────────── */

export const PAY_METHODS = [
  { k: "venmo", l: "Venmo" }, { k: "zelle", l: "Zelle" }, { k: "cash", l: "Cash" }, { k: "card", l: "Card" },
] as const;

/** The tab's headline status: "12 days late", "Due Oct 30", "Paid up". */
export function acctStatus(s: Pick<MemberDuesStanding, "standing" | "lateDays" | "nextDueDate">): string {
  return s.standing === "overdue" ? `${s.lateDays} days late` : s.standing === "due" ? (s.nextDueDate ? `Due ${fmtDay(s.nextDueDate)}` : "Owes") : STANDING[s.standing].chip;
}

/* ── Charge edit ─────────────────────────────────────────────────────────────── */

export function chargeChanges(charge: Pick<DuesChargeSummary, "name" | "dueDate" | "note">, name: string, noDue: boolean, dueDate: string, note: string) {
  const nextDue = noDue ? null : dueDate;
  const changes: { name?: string; dueDate?: string | null; note?: string | null } = {};
  if (name.trim() !== charge.name) changes.name = name.trim();
  if (nextDue !== charge.dueDate) changes.dueDate = nextDue;
  if ((note.trim() || null) !== charge.note) changes.note = note.trim() || null;
  return { changes, dirty: Object.keys(changes).length > 0, valid: !!name.trim() && (noDue || /^\d{4}-\d{2}-\d{2}$/.test(dueDate)) };
}
