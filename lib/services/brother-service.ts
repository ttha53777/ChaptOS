import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";
import type { CreateBrotherInput, UpdateBrotherInput } from "@/lib/validation/brother";

export async function listVisibleBrothers(ctx: RequestContext) {
  // Excludes ghost members (Atomic Samurai backdoor users).
  return ctx.db.brother.findMany({ where: { isGhost: false }, orderBy: { id: "asc" } });
}

export async function createBrother(ctx: RequestContext, input: CreateBrotherInput) {
  const brother = await ctx.db.brother.create({
    data: {
      name:         input.name,
      role:         input.role,
      attendance:   0,
      duesOwed:     input.duesOwed,
      gpa:          input.gpa,
      serviceHours: input.serviceHours,
    },
  });
  await emit(ctx, "brother.added", { type: "Brother", id: brother.id }, {
    name: brother.name,
    role: brother.role,
  });
  return brother;
}

export async function updateBrother(
  ctx: RequestContext,
  brotherId: number,
  input: UpdateBrotherInput,
) {
  // Permission split: full MANAGE_BROTHERS can edit duesOwed too; self-edit
  // can only touch profile + service hours.
  const canManageBrothers = ctx.isPlatformAdmin || hasPermission(ctx.permissions, "MANAGE_BROTHERS");
  const allowed = canManageBrothers
    ? ["name", "role", "duesOwed", "gpa", "serviceHours"] as const
    : ["name", "role", "gpa", "serviceHours"] as const;

  const data: Prisma.BrotherUpdateInput = {};
  const changedFields: string[] = [];
  for (const key of allowed) {
    if (!(key in input)) continue;
    const value = input[key];
    if (value === undefined) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any)[key] = value;
    changedFields.push(key);
  }

  const brother = await ctx.db.brother.update({ where: { id: brotherId }, data });
  await emit(ctx, "brother.updated", { type: "Brother", id: brother.id }, {
    name: brother.name,
    changedFields,
  });
  return brother;
}

export async function deleteBrother(ctx: RequestContext, brotherId: number) {
  const target = await ctx.db.brother.findUnique({
    where: { id: brotherId },
    select: { name: true },
  });
  if (!target) throw new NotFoundError("Brother");

  // Guard: prevent deletion of the last org admin (Phase 2.5 model).
  // Org admin authority lives in Membership.isOrgAdmin, not the deprecated Brother.isAdmin.
  const targetMembership = await prisma.membership.findFirst({ // lint-direct-prisma:ignore
    where: { brotherId, organizationId: ctx.orgId, isOrgAdmin: true },
    select: { id: true },
  });
  if (targetMembership) {
    const adminCount = await prisma.membership.count({ // lint-direct-prisma:ignore
      where: { organizationId: ctx.orgId, isOrgAdmin: true },
    });
    if (adminCount <= 1) {
      throw new ConflictError("Cannot delete the last org admin. Promote another member first.");
    }
  }

  await ctx.db.brother.delete({ where: { id: brotherId } });
  await emit(ctx, "brother.removed", { type: "Brother", id: brotherId }, { name: target.name });
}
