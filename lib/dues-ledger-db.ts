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
import type { Prisma } from "@/app/generated/prisma/client";
import { db } from "@/lib/db";
import { duesPaymentWhere } from "@/lib/dues";
import { allocate, type LedgerCredit, type LedgerLine, type LineAllocation } from "@/lib/dues-ledger";
import { ConflictError } from "@/lib/errors";
import { atLeast, money, toCents } from "@/lib/money";
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

// ── Writes ───────────────────────────────────────────────────────────────────
//
// The two primitives every balance-moving dues write is made of, run inside the
// caller's ctx.db.$transaction. They live here, not in a service, because both
// dues-charge-service (the Dues tab) and dues-service (adjustDues, Spotlight's
// charge/waive) need them, and services don't call each other.

type Tx = Prisma.TransactionClient;
interface WriteCtx { orgId: number; actorId: number; db: Scoped }

export interface NewCharge {
  name:          string;
  dueDate:       string | null;
  note:          string | null;
  audienceKind:  DuesAudience;
  audienceLabel: string;
  rateCard?:     Prisma.InputJsonValue;
  semesterId:    number | null;
}

/**
 * Create a charge and its lines, and raise each member's balance by their line.
 *
 * Balances are raised in one statement per distinct amount (a by-role charge has
 * a handful), and each statement must touch exactly the members it names: a
 * member who left the roster between the caller's read and this write would get
 * a line with no balance behind it, so the whole charge rolls back instead.
 */
export async function writeChargeTx(
  tx: Tx,
  ctx: WriteCtx,
  charge: NewCharge,
  lines: readonly { brotherId: number; amountCents: number }[],
): Promise<{ chargeId: number }> {
  if (lines.length === 0) throw new ConflictError("Nobody to bill.");
  const created = await tx.duesCharge.create({
    data: { ...charge, organizationId: ctx.orgId, createdById: ctx.actorId },
    select: { id: true },
  });
  await tx.duesChargeLine.createMany({
    data: lines.map(l => ({ organizationId: ctx.orgId, chargeId: created.id, brotherId: l.brotherId, amountCents: l.amountCents })),
  });

  const memberTx = ctx.db.member.onTx(tx);
  const byAmount = new Map<number, number[]>();
  for (const l of lines) byAmount.set(l.amountCents, [...(byAmount.get(l.amountCents) ?? []), l.brotherId]);
  for (const [cents, ids] of byAmount) {
    const { count } = await memberTx.updateManyByBrotherIds(ids, { duesOwed: { increment: cents / 100 } });
    if (count !== ids.length) throw new ConflictError("The roster changed while this was being handed out. Try again.");
  }
  return { chargeId: created.id };
}

/**
 * Lower a member's balance without money moving, and record why.
 *
 * Compare-and-set like a payment: a waiver can't take a balance below zero, with
 * the same half-cent tolerance (lib/money.ts atLeast) so waiving a drifted
 * $199.99999999999997 "$200" in full isn't refused. A sub-cent remainder is
 * snapped to exactly zero, for the same reason as recordDuesPayment.
 */
export async function writeWaiverTx(
  tx: Tx,
  ctx: WriteCtx,
  w: { brotherId: number; amountCents: number; reason: string | null; chargeId: number | null; memberName: string; owed: number },
): Promise<{ waiverId: number; newOwed: number }> {
  const memberTx = ctx.db.member.onTx(tx);
  const dollars = w.amountCents / 100;
  const claimed = await memberTx.compareAndSetDues(w.brotherId, {
    guard: { duesOwed: { gte: atLeast(dollars) } },
    data:  { duesOwed: { decrement: dollars } },
  });
  if (claimed.count === 0) {
    throw new ConflictError(
      `Cannot waive $${dollars.toFixed(2)} — ${w.memberName} owes $${money(w.owed).toFixed(2)}.`,
    );
  }
  const waiver = await tx.duesWaiver.create({
    data: {
      organizationId: ctx.orgId, brotherId: w.brotherId, amountCents: w.amountCents,
      reason: w.reason, chargeId: w.chargeId, createdById: ctx.actorId,
    },
    select: { id: true },
  });
  return { waiverId: waiver.id, newOwed: await snapOwed(memberTx, w.brotherId) };
}

/**
 * Lower each member's balance by their line when a line comes off (a charge
 * taken back, or one person taken off it). All-or-nothing: if anyone no longer
 * owes their full line — they've paid toward it, or it was waived — nothing
 * moves, because taking it back would leave them owed a credit.
 */
export async function unbillTx(
  tx: Tx,
  ctx: WriteCtx,
  lines: readonly { brotherId: number; amountCents: number }[],
): Promise<void> {
  const memberTx = ctx.db.member.onTx(tx);
  const blocked: number[] = [];
  for (const l of lines) {
    const { count } = await memberTx.compareAndSetDues(l.brotherId, {
      guard: { duesOwed: { gte: atLeast(l.amountCents / 100) } },
      data:  { duesOwed: { decrement: l.amountCents / 100 } },
    });
    if (count === 0) blocked.push(l.brotherId);
    else await snapOwed(memberTx, l.brotherId);
  }
  if (blocked.length) {
    throw new ConflictError(
      blocked.length === 1
        ? "1 person has already paid toward this or had it waived. Take back what's left with a waiver instead."
        : `${blocked.length} people have already paid toward this or had it waived. Take them off one by one, or waive what's left.`,
      { brotherIds: blocked },
    );
  }
}

/**
 * A dues payment made before the cutover was voided: its money had been netted
 * into the "Earlier balance" carryover, which the allocator treats as the whole
 * story. Voiding it raises duesOwed, so the carryover line has to grow by the
 * same amount or the books disagree by exactly that payment.
 */
export async function reinstateCarryoverTx(tx: Tx, orgId: number, brotherId: number, amountCents: number): Promise<void> {
  if (amountCents <= 0) return;
  const carry = await tx.duesCharge.findFirst({
    where:  { organizationId: orgId, audienceKind: "carryover", voidedAt: null },
    select: { id: true },
  }) ?? await tx.duesCharge.create({
    data:   { organizationId: orgId, name: "Earlier balance", audienceKind: "carryover", audienceLabel: "Carried over" },
    select: { id: true },
  });
  const line = await tx.duesChargeLine.findFirst({
    where:  { organizationId: orgId, chargeId: carry.id, brotherId },
    select: { id: true, voidedAt: true },
  });
  if (!line) {
    await tx.duesChargeLine.create({ data: { organizationId: orgId, chargeId: carry.id, brotherId, amountCents } });
  } else if (line.voidedAt) {
    await tx.duesChargeLine.update({ where: { id: line.id }, data: { amountCents, voidedAt: null } });
  } else {
    await tx.duesChargeLine.update({ where: { id: line.id }, data: { amountCents: { increment: amountCents } } });
  }
}

/** Was this dues payment made before the org started keeping charges? */
export function predatesCutover(createdAt: Date, cutover: Date | null): boolean {
  return cutover !== null && createdAt < cutover;
}

async function snapOwed(memberTx: ReturnType<Scoped["member"]["onTx"]>, brotherId: number): Promise<number> {
  const row = await memberTx.findByBrotherId(brotherId);
  const owed = money(row?.duesOwed ?? 0);
  if (owed === 0 && (row?.duesOwed ?? 0) !== 0) await memberTx.updateManyByBrotherIds([brotherId], { duesOwed: 0 });
  return owed;
}
