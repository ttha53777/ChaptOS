/**
 * Dues allocation: who has paid for what.
 *
 * A charge line says what a member was billed ("Fall dues · $140 · due Oct 1").
 * A payment says money arrived, and a waiver says part of a tab was forgiven —
 * neither names the charge it was for. This module decides, deterministically,
 * which lines each credit covers, which is what turns a single balance into
 * "overdue", "paid 31 of 52" and a member's line-by-line tab.
 *
 * The rule, oldest-due-first:
 *   1. A waiver pinned to a charge (DuesWaiver.chargeId) covers that line first.
 *   2. Everything else — payments, unpinned waivers, a pinned waiver's overflow —
 *      covers open lines in order: earliest due date, then lines with no due date,
 *      then the order they were billed in.
 *
 * Integer cents throughout, so a split $100 three ways allocates to the penny.
 *
 * Pure module: no DB, no env, no Prisma. The Dues tab imports it on the client
 * to re-derive a member's standing optimistically, and the server is the source
 * of truth (lib/services/dues-charge-service.ts). See the client-bundle note in
 * lib/org-types.ts for why nothing server-side may be imported here.
 */

export type DuesStanding = "overdue" | "due" | "paid" | "none";

/** One member's share of one live charge. */
export interface LedgerLine {
  lineId:      number;
  chargeId:    number;
  amountCents: number;
  /** YYYY-MM-DD, or null for "no due date" (owed, never overdue). */
  dueDate:     string | null;
  /** ISO timestamp the line was billed; breaks ties between equal due dates. */
  createdAt:   string;
}

/** Money off a member's tab: a payment, or a waiver (optionally pinned to a charge). */
export interface LedgerCredit {
  amountCents: number;
  chargeId?:   number | null;
}

export interface LineAllocation extends LedgerLine {
  paidCents: number;
  restCents: number;
}

/** Earliest due first; no due date after every dated line; then billing order. */
export function compareLines(a: LedgerLine, b: LedgerLine): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.lineId - b.lineId;
}

/**
 * Apply one member's credits to their lines.
 *
 * `unappliedCents` is credit with nothing left to cover. The write path keeps it
 * at zero (a payment can't exceed what's owed), so a non-zero value means the
 * books disagree — surfaced by the reconciliation, never silently dropped.
 */
export function allocate(
  lines: readonly LedgerLine[],
  credits: readonly LedgerCredit[],
): { lines: LineAllocation[]; unappliedCents: number } {
  const out: LineAllocation[] = [...lines]
    .sort(compareLines)
    .map(l => ({ ...l, paidCents: 0, restCents: l.amountCents }));

  let pool = 0;
  for (const c of credits) {
    let left = c.amountCents;
    if (c.chargeId != null) {
      const pinned = out.find(l => l.chargeId === c.chargeId);
      if (pinned) {
        const take = Math.min(left, pinned.restCents);
        pinned.paidCents += take;
        pinned.restCents -= take;
        left -= take;
      }
    }
    pool += left;
  }

  for (const l of out) {
    if (pool <= 0) break;
    const take = Math.min(pool, l.restCents);
    l.paidCents += take;
    l.restCents -= take;
    pool -= take;
  }

  return { lines: out, unappliedCents: pool };
}

export interface MemberSummary {
  standing:     DuesStanding;
  billedCents:  number;
  paidCents:    number;
  owesCents:    number;
  overdueCents: number;
  /** Days past the earliest overdue line's due date; 0 when nothing is overdue. */
  lateDays:     number;
  /** The open line that's next in line to be paid, if any. */
  next:         { chargeId: number; dueDate: string | null } | null;
}

/**
 * A member's standing over some set of allocated lines — all of them for the
 * whole tab, or one term's / one charge's for a scoped view. Allocation always
 * runs over everything first, so a scoped view never re-orders who paid what.
 */
export function summarize(lines: readonly LineAllocation[], today: string): MemberSummary {
  const sorted = [...lines].sort(compareLines);
  let billed = 0, paid = 0, owes = 0, overdue = 0;
  let firstOverdue: string | null = null;
  let next: MemberSummary["next"] = null;

  for (const l of sorted) {
    billed += l.amountCents;
    paid   += l.paidCents;
    owes   += l.restCents;
    if (l.restCents > 0) {
      if (!next) next = { chargeId: l.chargeId, dueDate: l.dueDate };
      if (l.dueDate !== null && l.dueDate < today) {
        overdue += l.restCents;
        if (firstOverdue === null) firstOverdue = l.dueDate;
      }
    }
  }

  const standing: DuesStanding =
    billed === 0 ? "none" : owes === 0 ? "paid" : overdue > 0 ? "overdue" : "due";

  return {
    standing,
    billedCents:  billed,
    paidCents:    paid,
    owesCents:    owes,
    overdueCents: overdue,
    lateDays:     firstOverdue ? daysBetween(firstOverdue, today) : 0,
    next,
  };
}

export interface ChargeStats {
  /** People billed on it (live lines). */
  people:     number;
  /** Of those, how many have it fully covered. */
  paidPeople: number;
  totalCents: number;
  outCents:   number;
}

/** Per-charge progress over every member's allocation. */
export function chargeStats(allocated: Iterable<readonly LineAllocation[]>): Map<number, ChargeStats> {
  const by = new Map<number, ChargeStats>();
  for (const member of allocated) {
    for (const l of member) {
      const s = by.get(l.chargeId) ?? { people: 0, paidPeople: 0, totalCents: 0, outCents: 0 };
      s.people += 1;
      s.totalCents += l.amountCents;
      s.outCents += l.restCents;
      if (l.restCents === 0) s.paidPeople += 1;
      by.set(l.chargeId, s);
    }
  }
  return by;
}

/** Whole days from `a` to `b`, both YYYY-MM-DD. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Today in the org's zone as YYYY-MM-DD — "overdue" flips at the chapter's midnight, not the server's. */
export function duesToday(timeZone?: string | null, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
