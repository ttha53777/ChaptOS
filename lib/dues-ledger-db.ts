/**
 * Loads an org's dues receivables and credits and runs the allocator over them.
 *
 * The DB half of lib/dues-ledger.ts (which stays pure so the client can import
 * it). Shared by dues-charge-service (the Dues tab) and dues-service (the
 * reconciliation's drift check), which is why it lives here and not in either
 * service — services don't call each other.
 *
 * What counts:
 *   lines    — live lines on live charges
 *   waivers  — live waivers
 *   payments — posted, undeleted Dues income rows attributed to a member, created
 *              on or after OrganizationConfig.duesLedgerStartedAt. Earlier ones
 *              were already netted into the "Earlier balance" carryover charge
 *              the cutover minted, so counting them again would pay it twice.
 */
import { db } from "@/lib/db";
import { duesPaymentWhere } from "@/lib/dues";
import { allocate, type LedgerCredit, type LedgerLine, type LineAllocation } from "@/lib/dues-ledger";
import { toCents } from "@/lib/money";
import type { DuesAudience } from "@/lib/state";

type Scoped = ReturnType<typeof db>;

export interface ChargeRow {
  id:            number;
  name:          string;
  dueDate:       string | null;
  note:          string | null;
  audienceKind:  DuesAudience;
  audienceLabel: string;
  semesterId:    number | null;
  createdAt:     Date;
}

export interface PaymentRow {
  id:            number;
  brotherId:     number;
  amountCents:   number;
  date:          string;
  paymentMethod: string | null;
  createdAt:     Date;
}

export interface WaiverRow {
  id:          number;
  brotherId:   number;
  amountCents: number;
  reason:      string | null;
  chargeId:    number | null;
  createdAt:   Date;
}

export interface LoadedLedger {
  charges:   Map<number, ChargeRow>;
  /** brotherId → that member's allocated lines (oldest-due first). */
  allocated: Map<number, LineAllocation[]>;
  /** brotherId → credit with no line left to cover; non-zero means the books disagree. */
  unapplied: Map<number, number>;
  payments:  PaymentRow[];
  waivers:   WaiverRow[];
  cutover:   Date | null;
}

export async function loadDuesLedger(scoped: Scoped, opts: { brotherId?: number } = {}): Promise<LoadedLedger> {
  const who = opts.brotherId !== undefined ? { brotherId: opts.brotherId } : {};
  const config = await scoped.organizationConfig.find();
  const cutover = config?.duesLedgerStartedAt ?? null;

  const [chargeRows, lineRows, waiverRows, paymentRows] = await Promise.all([
    scoped.duesCharge.findMany({
      where:   { voidedAt: null },
      select:  { id: true, name: true, dueDate: true, note: true, audienceKind: true, audienceLabel: true, semesterId: true, createdAt: true },
      orderBy: { id: "asc" },
    }),
    scoped.duesChargeLine.findMany({
      where:  { ...who, voidedAt: null, charge: { voidedAt: null } },
      select: { id: true, chargeId: true, brotherId: true, amountCents: true, createdAt: true },
    }),
    scoped.duesWaiver.findMany({
      where:   { ...who, voidedAt: null },
      select:  { id: true, brotherId: true, amountCents: true, reason: true, chargeId: true, createdAt: true },
      orderBy: { id: "asc" },
    }),
    scoped.transaction.findMany({
      where: {
        ...duesPaymentWhere,
        brotherId: opts.brotherId ?? { not: null },
        ...(cutover ? { createdAt: { gte: cutover } } : {}),
      },
      select:  { id: true, brotherId: true, amount: true, date: true, paymentMethod: true, createdAt: true },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
  ]);

  const charges = new Map(chargeRows.map(c => [c.id, c as ChargeRow]));
  const payments: PaymentRow[] = paymentRows.map(p => ({
    id: p.id, brotherId: p.brotherId!, amountCents: toCents(p.amount), date: p.date, paymentMethod: p.paymentMethod, createdAt: p.createdAt,
  }));

  const lines = new Map<number, LedgerLine[]>();
  for (const l of lineRows) {
    const c = charges.get(l.chargeId);
    if (!c) continue;
    const list = lines.get(l.brotherId) ?? [];
    list.push({ lineId: l.id, chargeId: l.chargeId, amountCents: l.amountCents, dueDate: c.dueDate, createdAt: l.createdAt.toISOString() });
    lines.set(l.brotherId, list);
  }

  const credits = new Map<number, LedgerCredit[]>();
  const credit = (brotherId: number, c: LedgerCredit) => credits.set(brotherId, [...(credits.get(brotherId) ?? []), c]);
  for (const w of waiverRows) credit(w.brotherId, { amountCents: w.amountCents, chargeId: w.chargeId });
  for (const p of payments) credit(p.brotherId, { amountCents: p.amountCents });

  const allocated = new Map<number, LineAllocation[]>();
  const unapplied = new Map<number, number>();
  for (const brotherId of new Set([...lines.keys(), ...credits.keys()])) {
    const r = allocate(lines.get(brotherId) ?? [], credits.get(brotherId) ?? []);
    allocated.set(brotherId, r.lines);
    if (r.unappliedCents) unapplied.set(brotherId, r.unappliedCents);
  }

  return { charges, allocated, unapplied, payments, waivers: waiverRows, cutover };
}

/**
 * What the charges say a member owes, in cents: Σ lines − Σ credits, which is
 * what Membership.duesOwed must equal. The reconciliation reports any gap.
 */
export function ledgerOwesCents(ledger: LoadedLedger, brotherId: number): number {
  const lines = ledger.allocated.get(brotherId) ?? [];
  return lines.reduce((s, l) => s + l.restCents, 0) - (ledger.unapplied.get(brotherId) ?? 0);
}
