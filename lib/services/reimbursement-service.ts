import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";
import type { CreateReimbursementInput, UpdateReimbursementInput } from "@/lib/validation/reimbursement";

// Reimbursement rows carry an `amountCents` BigInt for finance-grade precision
// (mirrors Transaction). BigInt is not JSON-serializable — Response.json() throws
// on it — so strip it before returning, exactly like transaction-service's mapTx.
function mapReimbursement<T extends { amountCents: bigint | null }>(raw: T): Omit<T, "amountCents"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { amountCents, ...rest } = raw;
  return rest;
}

export async function listReimbursements(ctx: RequestContext) {
  const rows = await ctx.db.reimbursement.findMany({
    orderBy: { createdAt: "desc" },
    include: { brother: { select: { id: true, name: true, avatarUrl: true } } },
  });
  return rows.map(mapReimbursement);
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
    },
    include: { brother: { select: { id: true, name: true, avatarUrl: true } } },
  });
  await emit(ctx, "reimbursement.created", { type: "Reimbursement", id: r.id }, {
    brotherId:   r.brotherId,
    amount:      r.amount,
    description: r.description,
  });
  return mapReimbursement(r);
}

export async function updateReimbursement(ctx: RequestContext, id: number, input: UpdateReimbursementInput) {
  const existing = await ctx.db.reimbursement.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Reimbursement");

  const r = await ctx.db.reimbursement.update({
    where: { id },
    data: {
      ...(input.status        !== undefined ? { status:        input.status        } : {}),
      ...(input.rejectionNote !== undefined ? { rejectionNote: input.rejectionNote } : {}),
    },
    include: { brother: { select: { id: true, name: true, avatarUrl: true } } },
  });
  await emit(ctx, "reimbursement.updated", { type: "Reimbursement", id: r.id }, {
    status:    r.status,
    brotherId: r.brotherId,
  });
  return mapReimbursement(r);
}
