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
import type {
  DuesBoard, DuesBookEntry, DuesChargeIssued, DuesChargePreview, DuesChargeSummary, DuesWaived,
  MemberDuesBook, MemberDuesStanding,
} from "@/lib/api-types/dues";
import { chargeStats, compareLines, duesToday, summarize, type LineAllocation } from "@/lib/dues-ledger";
import { loadDuesLedger, unbillTx, writeChargeTx, writeWaiverTx, type ChargeRow } from "@/lib/dues-ledger-db";
import { audienceLabel, resolveTargets, type DuesTargetSpec, type ExistingCharge } from "@/lib/dues-targets";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { emit } from "@/lib/events";
import { money, toCents } from "@/lib/money";
import { hasPermission } from "@/lib/permissions";
import { DuesAudience } from "@/lib/state";
import type {
  DuesAudienceInput, IssueDuesChargeInput, UpdateDuesChargeInput, WaiveDuesInput,
} from "@/lib/validation/dues";

const dollars = (cents: number) => cents / 100;

const fmtDue = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

async function orgToday(ctx: RequestContext): Promise<string> {
  return orgTodayOf(ctx.db);
}

async function orgTodayOf(scoped: RequestContext["db"]): Promise<string> {
  const org = await scoped.organization.findFirst({ select: { timeZone: true } });
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
    lines:        [...lines].sort(compareLines).map(l => ({ chargeId: l.chargeId, amount: dollars(l.amountCents), rest: dollars(l.restCents) })),
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
  return buildDuesBoard(ctx.db, { ...opts, viewerId: ctx.actorId });
}

/**
 * The board over an org-scoped client. getDuesBoard's body, split out so Ask
 * Chapt's read tool (which holds a scoped db, not a request context) answers from
 * the very same allocation the Dues tab shows. Read-only; no permission check —
 * every member may see the board.
 */
export async function buildDuesBoard(
  scoped: RequestContext["db"],
  opts: { semester?: string; viewerId?: number | null } = {},
): Promise<DuesBoard> {
  const [ledger, roster, today, term] = await Promise.all([
    loadDuesLedger(scoped),
    scoped.member.listRoster(),
    orgTodayOf(scoped),
    opts.semester
      ? scoped.semester.findFirst({ where: { label: opts.semester }, select: { id: true, label: true } })
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
    viewer: members.find(m => m.brotherId === opts.viewerId) ?? null,
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

// ── Writes ───────────────────────────────────────────────────────────────────

/** Same gate as dues-service: treasury, org admin, or platform admin. */
function assertCanManageDues(ctx: RequestContext): void {
  const allowed = ctx.isPlatformAdmin || ctx.isOrgAdmin || hasPermission(ctx.permissions, "MANAGE_TREASURY");
  if (!allowed) throw new ForbiddenError("Cannot hand out or change dues");
}

function toSpec(a: DuesAudienceInput): DuesTargetSpec {
  if (a.kind === "role") {
    return { kind: "role", rates: a.rates.map(r => ({ key: r.key, amountCents: toCents(r.amount) })) };
  }
  const amount = a.amount.mode === "each"
    ? { mode: "each" as const, cents: toCents(a.amount.amount) }
    : { mode: "split" as const, totalCents: toCents(a.amount.total) };
  return a.kind === "all" ? { kind: "all", amount, exclude: a.exclude } : { kind: "pick", amount, brotherIds: a.brotherIds };
}

/**
 * Resolve a "Hand out dues" request against the live roster: who, how much each,
 * and who already has a same-named charge this term. The preview and the write
 * both run this, so the receipt an officer reads is exactly what gets billed.
 */
async function resolveIssue(ctx: RequestContext, input: IssueDuesChargeInput) {
  const [term, roster, memberRoles, roles] = await Promise.all([
    input.semester
      ? ctx.db.semester.findFirst({ where: { label: input.semester }, select: { id: true, label: true } })
      : ctx.db.semester.findFirst({ where: { isActive: true }, select: { id: true, label: true } }),
    ctx.db.member.listRoster({ where: { archivedAt: null } }),
    ctx.db.brotherRole.findMany({ select: { brotherId: true, roleId: true } }),
    ctx.db.role.findMany({ select: { id: true, name: true } }),
  ]);
  if (input.semester && !term) throw new NotFoundError("Semester");

  const roleIds = new Map<number, number[]>();
  for (const r of memberRoles) roleIds.set(r.brotherId, [...(roleIds.get(r.brotherId) ?? []), r.roleId]);
  const members = roster.map(m => ({ brotherId: m.id, name: m.name, roleIds: roleIds.get(m.id) ?? [] }));
  const onRoster = new Set(members.map(m => m.brotherId));
  const roleName = new Map(roles.map(r => [r.id, r.name]));

  const a = input.audience;
  if (a.kind === "role") {
    const unknown = a.rates.filter(r => typeof r.key === "number" && !roleName.has(r.key));
    if (unknown.length) throw new ValidationError("That role isn't in this chapter.");
  }
  if (a.kind === "pick") {
    const off = a.brotherIds.filter(id => !onRoster.has(id));
    if (off.length) throw new ValidationError(`${off.length === 1 ? "1 person isn't" : `${off.length} people aren't`} on the roster.`);
  }

  // "Already billed for this" is asked of live charges filed under the same term.
  const sameTerm = await ctx.db.duesCharge.findMany({
    where:  { voidedAt: null, semesterId: term?.id ?? null },
    select: { id: true, name: true, createdAt: true, lines: { where: { voidedAt: null }, select: { brotherId: true } } },
  });
  const existing: ExistingCharge[] = sameTerm.map(c => ({ chargeId: c.id, name: c.name, brotherIds: new Set(c.lines.map(l => l.brotherId)) }));

  const spec = toSpec(a);
  const resolved = resolveTargets(spec, members, { name: input.name, existing, onDuplicate: input.onDuplicate });
  const label = audienceLabel(spec, resolved.lines.length, id => roleName.get(id));
  const rateCard = a.kind === "role"
    ? a.rates.map(r => ({
        key: r.key,
        label: r.key === "base" ? "Everyone" : r.key === "none" ? "Members with no role" : roleName.get(r.key)!,
        amountCents: toCents(r.amount),
      }))
    : undefined;
  const dup = sameTerm.find(c => c.id === resolved.duplicateOf) ?? null;
  return { term, resolved, label, rateCard, dup };
}

/** The live receipt for the "Hand out dues" sheet. Writes nothing. */
export async function previewDuesCharge(ctx: RequestContext, input: IssueDuesChargeInput): Promise<DuesChargePreview> {
  assertCanManageDues(ctx);
  const { resolved: r, label, dup } = await resolveIssue(ctx, input);
  return {
    audienceLabel: label,
    selected:      r.selected,
    people:        r.lines.length,
    total:         dollars(r.totalCents),
    lines:         r.lines.map(l => ({
      brotherId: l.brotherId,
      amount:    dollars(l.amountCents),
      parts:     l.parts ? l.parts.map(p => ({ key: p.key, amount: dollars(p.amountCents) })) : null,
    })),
    duplicateOf:   dup ? { id: dup.id, name: dup.name, createdAt: dup.createdAt.toISOString() } : null,
    already:       r.already.length,
    skipped:       r.skipped.length,
    stacked:       r.stacked,
  };
}

/** Hand out dues: one charge, a line per person, every balance raised in the same transaction. */
export async function issueDuesCharge(ctx: RequestContext, input: IssueDuesChargeInput): Promise<DuesChargeIssued> {
  assertCanManageDues(ctx);
  const { term, resolved: r, label, rateCard, dup } = await resolveIssue(ctx, input);
  if (r.lines.length === 0) {
    throw new ConflictError(
      r.selected > 0 && r.skipped.length === r.selected
        ? `Everyone picked already has “${dup?.name ?? input.name}”. Choose “Bill them again” to bill them a second time.`
        : "Nobody to bill. Pick at least one person and set an amount.",
    );
  }

  const { chargeId } = await ctx.db.$transaction(tx => writeChargeTx(tx, ctx, {
    name:          input.name,
    dueDate:       input.dueDate,
    note:          input.note?.trim() || null,
    audienceKind:  input.audience.kind === "all" ? DuesAudience.All : input.audience.kind === "role" ? DuesAudience.Role : DuesAudience.Pick,
    audienceLabel: label,
    rateCard,
    semesterId:    term?.id ?? null,
  }, r.lines));

  await emit(ctx, "dues.charge_issued", { type: "DuesCharge", id: chargeId }, {
    chargeId, name: input.name, people: r.lines.length, total: dollars(r.totalCents), dueDate: input.dueDate,
  });
  return { id: chargeId, name: input.name, people: r.lines.length, total: dollars(r.totalCents), skipped: r.skipped.length };
}

async function liveCharge(ctx: RequestContext, id: number) {
  const c = await ctx.db.duesCharge.findFirst({ where: { id, voidedAt: null }, select: { id: true, name: true, dueDate: true, note: true } });
  if (!c) throw new NotFoundError("Charge");
  return c;
}

/** Rename it, move its due date, change the note. Amounts are changed by waiving or taking people off. */
export async function updateDuesCharge(ctx: RequestContext, id: number, input: UpdateDuesChargeInput): Promise<void> {
  assertCanManageDues(ctx);
  const before = await liveCharge(ctx, id);
  const data = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
    ...(input.note !== undefined ? { note: input.note?.trim() || null } : {}),
  };
  const changedFields = (Object.keys(data) as (keyof typeof data)[]).filter(k => data[k] !== before[k]);
  if (!changedFields.length) return;
  await ctx.db.duesCharge.update({ where: { id }, data });
  await emit(ctx, "dues.charge_updated", { type: "DuesCharge", id }, { chargeId: id, name: data.name ?? before.name, changedFields });
}

/**
 * Take a charge back — the toast's Undo, or "Take back this charge". Lowers every
 * balance it raised, all-or-nothing: refused once anyone has paid toward it or
 * had it waived (unbillTx says how many).
 */
export async function voidDuesCharge(ctx: RequestContext, id: number): Promise<void> {
  assertCanManageDues(ctx);
  const c = await liveCharge(ctx, id);
  const orgId = ctx.orgId;
  const lines = await ctx.db.$transaction(async tx => {
    const claimed = await tx.duesCharge.updateMany({ where: { id, organizationId: orgId, voidedAt: null }, data: { voidedAt: new Date() } });
    if (claimed.count === 0) throw new ConflictError("This charge was already taken back.");
    const live = await tx.duesChargeLine.findMany({
      where:  { chargeId: id, organizationId: orgId, voidedAt: null },
      select: { brotherId: true, amountCents: true },
    });
    await unbillTx(tx, ctx, live);
    await tx.duesChargeLine.updateMany({ where: { chargeId: id, organizationId: orgId, voidedAt: null }, data: { voidedAt: new Date() } });
    return live;
  });
  await emit(ctx, "dues.charge_voided", { type: "DuesCharge", id }, {
    chargeId: id, name: c.name, people: lines.length, total: dollars(lines.reduce((s, l) => s + l.amountCents, 0)),
  });
}

/** Take one person off a charge, lowering their balance by their line. */
export async function voidDuesChargeLine(ctx: RequestContext, chargeId: number, brotherId: number): Promise<void> {
  assertCanManageDues(ctx);
  const c = await liveCharge(ctx, chargeId);
  const orgId = ctx.orgId;
  const line = await ctx.db.$transaction(async tx => {
    const l = await tx.duesChargeLine.findFirst({
      where:  { chargeId, brotherId, organizationId: orgId, voidedAt: null },
      select: { id: true, brotherId: true, amountCents: true },
    });
    if (!l) throw new NotFoundError("Charge line");
    const claimed = await tx.duesChargeLine.updateMany({ where: { id: l.id, voidedAt: null }, data: { voidedAt: new Date() } });
    if (claimed.count === 0) throw new ConflictError("They were already taken off this charge.");
    await unbillTx(tx, ctx, [l]);
    return l;
  });
  await emit(ctx, "dues.line_voided", { type: "DuesCharge", id: chargeId }, {
    chargeId, name: c.name, brotherId, amount: dollars(line.amountCents),
  });
}

/** Forgive part of a member's tab. No money moves, so nothing reaches the ledger. */
export async function waiveDues(ctx: RequestContext, input: WaiveDuesInput): Promise<DuesWaived> {
  assertCanManageDues(ctx);
  const member = await ctx.db.member.findRosterRow(input.brotherId);
  if (!member) throw new NotFoundError("Brother");
  const chargeId = input.chargeId ?? null;
  if (chargeId !== null) {
    const onIt = await ctx.db.duesChargeLine.count({ where: { chargeId, brotherId: member.id, voidedAt: null, charge: { voidedAt: null } } });
    if (!onIt) throw new ValidationError(`${member.name} isn't on that charge.`);
  }
  const amountCents = toCents(input.amount);
  const reason = input.reason?.trim() || null;
  const { waiverId, newOwed } = await ctx.db.$transaction(tx => writeWaiverTx(tx, ctx, {
    brotherId: member.id, amountCents, reason, chargeId, memberName: member.name, owed: member.duesOwed,
  }));
  await emit(ctx, "dues.waived", { type: "DuesWaiver", id: waiverId }, {
    brotherId: member.id, amount: dollars(amountCents), reason, chargeId, newOwed,
  });
  return { waiverId, brotherId: member.id, duesOwed: newOwed };
}

/** Undo a waiver: the amount goes back on their tab. */
export async function voidDuesWaiver(ctx: RequestContext, id: number): Promise<DuesWaived> {
  assertCanManageDues(ctx);
  const w = await ctx.db.duesWaiver.findFirst({ where: { id, voidedAt: null }, select: { id: true, brotherId: true, amountCents: true } });
  if (!w) throw new NotFoundError("Waiver");
  const orgId = ctx.orgId;
  const restored = await ctx.db.$transaction(async tx => {
    const claimed = await tx.duesWaiver.updateMany({ where: { id, organizationId: orgId, voidedAt: null }, data: { voidedAt: new Date() } });
    if (claimed.count === 0) throw new ConflictError("This waiver was already undone.");
    const memberTx = ctx.db.member.onTx(tx);
    const { count } = await memberTx.updateManyByBrotherIds([w.brotherId], { duesOwed: { increment: w.amountCents / 100 } });
    if (count === 0) throw new NotFoundError("Brother");
    return money((await memberTx.findByBrotherId(w.brotherId))?.duesOwed ?? 0);
  });
  await emit(ctx, "dues.waiver_voided", { type: "DuesWaiver", id }, {
    brotherId: w.brotherId, amount: dollars(w.amountCents), restoredOwed: restored,
  });
  return { waiverId: id, brotherId: w.brotherId, duesOwed: restored };
}
