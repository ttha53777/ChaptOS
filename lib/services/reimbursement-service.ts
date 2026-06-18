import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError } from "@/lib/errors";
import type { CreateReimbursementInput, UpdateReimbursementInput } from "@/lib/validation/reimbursement";

export async function listReimbursements(ctx: RequestContext) {
  return ctx.db.reimbursement.findMany({
    orderBy: { createdAt: "desc" },
    include: { brother: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

export async function createReimbursement(ctx: RequestContext, input: CreateReimbursementInput) {
  const r = await ctx.db.reimbursement.create({
    data: {
      brotherId:   input.brotherId,
      amount:      input.amount,
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
  return r;
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
  return r;
}
