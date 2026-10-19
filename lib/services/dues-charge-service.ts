/**
 * Dues as charges: the Dues tab's board and each member's tab.
 *
 * A charge is a named, dated bill ("Fall dues · due Oct 1") with one line per
 * person billed. Payments and waivers don't name a charge; lib/dues-ledger.ts
 * allocates them oldest-due-first, and everything here is read off that
 * allocation (see lib/dues-ledger-db.ts for what counts).
 *
 * Reads are open to every member: the whole chapter sees the Dues tab, and
 * Membership.duesOwed already reaches every member through /api/brothers.
 * Writes (handing out, waiving, taking back) are treasury-only.
 */
import type { RequestContext } from "@/lib/context";
import type { DuesBoard, DuesBookEntry, DuesChargeSummary, MemberDuesBook, MemberDuesStanding } from "@/lib/api-types/dues";
import { chargeStats, duesToday, summarize, type LineAllocation } from "@/lib/dues-ledger";
import { loadDuesLedger, type ChargeRow } from "@/lib/dues-ledger-db";
import { NotFoundError } from "@/lib/errors";

const dollars = (cents: number) => cents / 100;

const fmtDue = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

async function orgToday(ctx: RequestContext): Promise<string> {
  const org = await ctx.db.organization.findFirst({ select: { timeZone: true } });
  return duesToday(org?.timeZone);
}

function standingDTO(brotherId: number, lines: readonly LineAllocation[], today: string): MemberDuesStanding {
  const s = summarize(lines, today);
  return {
    brotherId,
    standing:     s.standing,
    billed:       dollars(s.billedCents),
    paid:         dollars(s.paidCents),
    owes:         dollars(s.owesCents),
    overdue:      dollars(s.overdueCents),
    lateDays:     s.lateDays,
    nextChargeId: s.next?.chargeId ?? null,
    nextDueDate:  s.next?.dueDate ?? null,
    open:         lines.filter(l => l.restCents > 0).map(l => ({ chargeId: l.chargeId, rest: dollars(l.restCents) })),
  };
}

/**
 * Which charges a term's view shows: the term's own, plus any charge filed under
 * no term (the "Earlier balance", or one handed out while no term was active)
 * for as long as money is still out on it — an unpaid carryover must not vanish
 * from every view just because it belongs to none.
 */
function inTerm(c: ChargeRow, termId: number | null, outCents: number): boolean {
  if (termId === null) return true;
  return c.semesterId === termId || (c.semesterId === null && outCents > 0);
}

export async function getDuesBoard(ctx: RequestContext, opts: { semester?: string } = {}): Promise<DuesBoard> {
  const [ledger, roster, today, term] = await Promise.all([
    loadDuesLedger(ctx.db),
    ctx.db.member.listRoster(),
    orgToday(ctx),
    opts.semester
      ? ctx.db.semester.findFirst({ where: { label: opts.semester }, select: { id: true, label: true } })
      : Promise.resolve(null),
  ]);
  if (opts.semester && !term) throw new NotFoundError("Semester");

  const stats = chargeStats(ledger.allocated.values());
  const termId = term?.id ?? null;
  const visible = [...ledger.charges.values()].filter(c => {
    const s = stats.get(c.id);
    return s !== undefined && inTerm(c, termId, s.outCents);
  });
  const visibleIds = new Set(visible.map(c => c.id));

  const amountsOf = new Map<number, Set<number>>();
  for (const lines of ledger.allocated.values()) {
    for (const l of lines) amountsOf.set(l.chargeId, (amountsOf.get(l.chargeId) ?? new Set()).add(l.amountCents));
  }

  const charges: DuesChargeSummary[] = visible
    .map(c => {
      const s = stats.get(c.id)!;
      const amounts = amountsOf.get(c.id) ?? new Set<number>();
      return {
        id:            c.id,
        name:          c.name,
        dueDate:       c.dueDate,
        note:          c.note,
        audienceKind:  c.audienceKind,
        audienceLabel: c.audienceLabel,
        semesterId:    c.semesterId,
        createdAt:     c.createdAt.toISOString(),
        people:        s.people,
        paidPeople:    s.paidPeople,
        total:         dollars(s.totalCents),
        outstanding:   dollars(s.outCents),
        overdue:       c.dueDate !== null && c.dueDate < today && s.outCents > 0,
        amounts:       [...amounts].sort((a, b) => a - b).map(dollars),
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id));

  // The roster as it stands, plus anyone archived who still has a line in view —
  // leaving the chapter doesn't settle a tab.
  const members: MemberDuesStanding[] = [];
  for (const m of roster) {
    const lines = (ledger.allocated.get(m.id) ?? []).filter(l => visibleIds.has(l.chargeId));
    if (m.archivedAt && lines.length === 0) continue;
    members.push(standingDTO(m.id, lines, today));
  }

  const sum = (k: "billed" | "paid" | "owes" | "overdue") =>
    dollars(members.reduce((s, m) => s + Math.round(m[k] * 100), 0));

  return {
    today,
    term: term ? { id: term.id, label: term.label } : null,
    charges,
    members,
    totals: { billed: sum("billed"), paid: sum("paid"), owes: sum("owes"), overdue: sum("overdue") },
    viewer: members.find(m => m.brotherId === ctx.actorId) ?? null,
  };
}

/** One member's tab, line by line: what they were billed, paid and had waived. */
export async function getMemberDuesBook(ctx: RequestContext, brotherId: number): Promise<MemberDuesBook> {
  const member = await ctx.db.member.findRosterRow(brotherId);
  if (!member) throw new NotFoundError("Brother");

  const [ledger, today] = await Promise.all([loadDuesLedger(ctx.db, { brotherId }), orgToday(ctx)]);
  const lines = ledger.allocated.get(brotherId) ?? [];

  const entries: (DuesBookEntry & { at: string })[] = [];
  for (const l of lines) {
    const c = ledger.charges.get(l.chargeId)!;
    entries.push({
      kind: "charge", date: l.createdAt.slice(0, 10), at: l.createdAt,
      title: c.name, detail: c.dueDate ? `Due ${fmtDue(c.dueDate)}` : null,
      amount: dollars(l.amountCents), chargeId: c.id, refId: l.lineId,
    });
  }
  for (const p of ledger.payments) {
    entries.push({
      kind: "payment", date: p.date, at: p.createdAt.toISOString(),
      title: "Paid", detail: p.paymentMethod, amount: -dollars(p.amountCents), chargeId: null, refId: p.id,
    });
  }
  for (const w of ledger.waivers) {
    entries.push({
      kind: "waiver", date: w.createdAt.toISOString().slice(0, 10), at: w.createdAt.toISOString(),
      title: "Waived", detail: w.reason, amount: -dollars(w.amountCents), chargeId: w.chargeId, refId: w.id,
    });
  }
  // By the day it happened, then by when it was entered: a payment carries only a
  // date (it may be back-dated), so a same-day tie falls back to creation order.
  const key = (e: { date: string; at: string }) => `${e.date}|${e.at}`;
  entries.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a.refId - b.refId));

  return {
    brotherId,
    standing: standingDTO(brotherId, lines, today),
    entries:  entries.map(({ at: _at, ...e }) => e),
    open: lines
      .filter(l => l.restCents > 0)
      .map(l => ({ chargeId: l.chargeId, name: ledger.charges.get(l.chargeId)!.name, dueDate: l.dueDate, rest: dollars(l.restCents) })),
  };
}
