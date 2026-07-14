import type { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { resolveMemberName } from "@/lib/member-names";
import { hasPermission } from "@/lib/permissions";
import { ReimbursementStatus, TransactionStatus, TransactionType } from "@/lib/state";
import type { CreateReimbursementInput, UpdateReimbursementInput } from "@/lib/validation/reimbursement";

// Fallback bucket when neither the requester nor the approving treasurer named one.
// Budget allocations are user-named per org, so this may match no allocation — the
// spend still hits the treasury balance, it just won't land on a budget line.
const UNCATEGORIZED = "Reimbursement";

// The include shape used everywhere we return a reimbursement to the client.
// The org-scoped delegate's create/update/findMany signatures aren't generic
// over `include` (see lib/db/tenant.ts), so the payload type needs a manual cast.
const REIMBURSEMENT_INCLUDE = {
  brother: { select: { id: true, name: true, avatarUrl: true } },
} satisfies Prisma.ReimbursementInclude;

type ReimbursementRow = Prisma.ReimbursementGetPayload<{ include: typeof REIMBURSEMENT_INCLUDE }>;

// Reimbursement rows carry an `amountCents` BigInt for finance-grade precision
// (mirrors Transaction). BigInt is not JSON-serializable — Response.json() throws
// on it — so strip it before returning, exactly like transaction-service's mapTx.
function mapReimbursement<T extends { amountCents: bigint | null }>(raw: T): Omit<T, "amountCents"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { amountCents, ...rest } = raw;
  return rest;
}

// Org-local display name (Membership.name), same fallback rule as the roster.
// Without this, a member who renamed themselves in this org would still show
// their stale name on reimbursement requests.
async function withResolvedBrother(ctx: RequestContext, rows: ReimbursementRow[]): Promise<ReimbursementRow[]> {
  const brothers = rows.map(r => r.brother).filter((b): b is NonNullable<ReimbursementRow["brother"]> => b != null);
  if (brothers.length === 0) return rows;
  const nameByBrotherId = await ctx.db.membership.resolveNames(brothers);
  return rows.map(r => r.brother
    ? { ...r, brother: { ...r.brother, name: nameByBrotherId.get(r.brother.id) ?? r.brother.name } }
    : r);
}

export async function listReimbursements(ctx: RequestContext) {
  const rows = await ctx.db.reimbursement.findMany({
    orderBy: { createdAt: "desc" },
    include: REIMBURSEMENT_INCLUDE,
  }) as ReimbursementRow[];
  const resolved = await withResolvedBrother(ctx, rows);
  return resolved.map(mapReimbursement);
}

export async function createReimbursement(ctx: RequestContext, input: CreateReimbursementInput) {
  // A reimbursement is a self-service request: any member may file for themselves.
  // Filing on another member's behalf requires treasury authority.
  const canManage = ctx.isPlatformAdmin || ctx.isOrgAdmin || hasPermission(ctx.permissions, "MANAGE_TREASURY");
  const isSelf    = input.brotherId === ctx.actorId;
  if (!isSelf && !canManage) throw new ForbiddenError("Cannot file a reimbursement for another member");

  // Guard against a cross-tenant brotherId: the tenant wrapper scopes by org, so a
  // brother from another org resolves to null here.
  const brother = await ctx.db.brother.findUnique({ where: { id: input.brotherId } });
  if (!brother) throw new NotFoundError("Brother");

  const r = await ctx.db.reimbursement.create({
    data: {
      brotherId:   input.brotherId,
      amount:      input.amount,
      amountCents: BigInt(Math.round(input.amount * 100)),
      date:        input.date,
      description: input.description,
      category:    input.category ?? null,
    },
    include: REIMBURSEMENT_INCLUDE,
  }) as ReimbursementRow;
  await emit(ctx, "reimbursement.created", { type: "Reimbursement", id: r.id }, {
    brotherId:   r.brotherId,
    amount:      r.amount,
    description: r.description,
  });
  const [resolved] = await withResolvedBrother(ctx, [r]);
  return mapReimbursement(resolved);
}

/**
 * Approving a reimbursement is the moment a request becomes money movement, so it
 * mints the expense row in the ledger — atomically, because every balance in the app
 * is derived by summing Transaction rows and nothing else. Reversing an approval
 * takes that row back out of the books. Both directions run in one transaction so a
 * partial failure can't leave the two ledgers disagreeing about real money.
 */
export async function updateReimbursement(ctx: RequestContext, id: number, input: UpdateReimbursementInput) {
  // Org-scoped read: also pre-verifies the id is in this org, which the raw tx
  // client below can't do for itself (see lib/db/tenant.ts).
  const existing = await ctx.db.reimbursement.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Reimbursement");

  const approving = input.status === ReimbursementStatus.Approved
                 && existing.status !== ReimbursementStatus.Approved;
  const reversing = existing.status === ReimbursementStatus.Approved
                 && input.status !== undefined
                 && input.status !== ReimbursementStatus.Approved;

  // Approving an already-approved request is refused rather than treated as a no-op,
  // so "approve twice" has one answer regardless of timing: the compare-and-set below
  // rejects the racing case, and this rejects the sequential one.
  if (input.status === ReimbursementStatus.Approved && existing.status === ReimbursementStatus.Approved) {
    throw new ConflictError("This reimbursement has already been approved.");
  }

  // getBudget matches expenses on the semester *label*, not semesterId, so a ledger
  // row without one stays invisible to the budget page even with the right category.
  // Read it before opening the transaction — it's a plain lookup, and the tx should
  // hold open for as little as possible.
  const semester = approving
    ? await ctx.db.semester.findFirst({
        where:  { isActive: true },
        select: { id: true, label: true },
      })
    : null;

  // Who the money went to, by the name they go by in THIS org (Membership.name),
  // not their account-level Brother.name — the ledger is read by chapter officers,
  // so it should say what the roster says.
  const payee = approving ? await resolveMemberName(ctx.db, existing.brotherId) : null;

  const category = input.category ?? existing.category ?? UNCATEGORIZED;

  // The tx client is raw and NOT org-scoped, so every write inside carries
  // organizationId explicitly (the house pattern — see task-service.ts).
  const orgId = ctx.orgId;
  const { row, ledgerId } = await ctx.db.$transaction(async (tx) => {
    let ledgerId: number | null = null;

    if (approving) {
      // Compare-and-set. Two concurrent PATCHes would otherwise both read "pending",
      // both mint a Transaction, and double-count the expense against the chapter.
      // Only one can win this conditional flip; the loser mints nothing.
      const claimed = await tx.reimbursement.updateMany({
        where: { id, organizationId: orgId, status: { not: ReimbursementStatus.Approved } },
        data:  { status: ReimbursementStatus.Approved },
      });
      if (claimed.count === 0) throw new ConflictError("This reimbursement has already been approved.");

      const ledger = await tx.transaction.create({
        data: {
          organizationId: orgId,
          type:        TransactionType.Expense,
          category,
          amount:      existing.amount,
          amountCents: existing.amountCents ?? BigInt(Math.round(existing.amount * 100)),
          date:        existing.date,
          description: payee
            ? `Reimbursement: ${payee} - ${existing.description}`
            : `Reimbursement: ${existing.description}`,
          status:      TransactionStatus.Posted,
          semester:    semester?.label ?? null,
          semesterId:  semester?.id    ?? null,
        },
        select: { id: true },
      });
      ledgerId = ledger.id;
    }

    if (reversing && existing.transactionId !== null) {
      // The payout is no longer approved, so its ledger row must leave every balance.
      // Soft-delete is the only removal path: Transaction.status is CHECK-constrained
      // to posted|scheduled, and every aggregation already filters deletedAt: null.
      await tx.transaction.updateMany({
        where: { id: existing.transactionId, organizationId: orgId, deletedAt: null },
        data:  { deletedAt: new Date() },
      });
    }

    // Re-bucketing an already-approved request has to move the ledger row too, or the
    // budget line it was posted to and the request itself would disagree about where
    // the money went — the same two-books drift this whole change exists to close.
    if (!approving && !reversing && input.category != null && existing.transactionId !== null) {
      await tx.transaction.updateMany({
        where: { id: existing.transactionId, organizationId: orgId, deletedAt: null },
        data:  { category: input.category },
      });
    }

    const row = await tx.reimbursement.update({
      where: { id },
      data: {
        // On the approving path the status flip already happened in the compare-and-set.
        ...(input.status        !== undefined && !approving ? { status:        input.status        } : {}),
        ...(input.rejectionNote !== undefined              ? { rejectionNote: input.rejectionNote } : {}),
        ...(input.category      !== undefined              ? { category:      input.category      } : {}),
        ...(approving ? { transactionId: ledgerId } : {}),
        ...(reversing ? { transactionId: null     } : {}),
      },
      include: REIMBURSEMENT_INCLUDE,
    }) as ReimbursementRow;

    return { row, ledgerId };
  });

  // Emit after commit: emit() writes through the raw prisma singleton and swallows
  // its own errors, so it neither joins nor rolls back the transaction above.
  if (approving && ledgerId !== null) {
    await emit(ctx, "reimbursement.approved", { type: "Reimbursement", id: row.id }, {
      brotherId:     row.brotherId,
      amount:        row.amount,
      category,
      transactionId: ledgerId,
      selfApproved:  row.brotherId === ctx.actorId,
    });
  } else {
    await emit(ctx, "reimbursement.updated", { type: "Reimbursement", id: row.id }, {
      status:    row.status,
      brotherId: row.brotherId,
      ...(reversing && existing.transactionId !== null
        ? { voidedTransactionId: existing.transactionId }
        : {}),
    });
  }

  const [resolved] = await withResolvedBrother(ctx, [row]);
  return mapReimbursement(resolved);
}
