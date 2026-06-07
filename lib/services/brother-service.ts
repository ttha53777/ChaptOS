import type { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { emit } from "@/lib/events";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";
import type { CreateBrotherInput, UpdateBrotherInput } from "@/lib/validation/brother";

export async function listVisibleBrothers(ctx: RequestContext) {
  // Excludes ghost members (Atomic Samurai backdoor users).
  const brothers = await ctx.db.brother.findMany({ where: { isGhost: false }, orderBy: { id: "asc" } });
  const brotherIds = brothers.map(b => b.id);
  // Scope role assignments to the active org. A multi-org member has BrotherRole
  // rows in several orgs; without this filter another org's roles leak into this
  // org's UI as chips that can't be revoked here (the revoke path is org-scoped,
  // so deleting a foreign-org role 404s / no-ops and the chip reappears on reload).
  const brotherRoles = await prisma.brotherRole.findMany({
    where: { brotherId: { in: brotherIds }, organizationId: ctx.orgId },
    select: { brotherId: true, role: { select: { id: true, name: true, color: true, rank: true } } },
  });
  const rolesByBrotherId = new Map<number, { id: number; name: string; color: string | null; rank: number }[]>();
  for (const br of brotherRoles) {
    const list = rolesByBrotherId.get(br.brotherId) ?? [];
    list.push(br.role);
    rolesByBrotherId.set(br.brotherId, list);
  }
  return brothers.map(b => ({
    ...b,
    roles: (rolesByBrotherId.get(b.id) ?? []).sort((a, z) => z.rank - a.rank),
  }));
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
    select: { name: true, isAdmin: true },
  });
  if (!target) throw new NotFoundError("Brother");

  if (target.isAdmin) {
    const adminCount = await ctx.db.brother.count({ where: { isAdmin: true } });
    if (adminCount <= 1) {
      throw new ConflictError("Cannot delete the last admin. Promote another brother first.");
    }
  }

  await ctx.db.brother.delete({ where: { id: brotherId } });
  await emit(ctx, "brother.removed", { type: "Brother", id: brotherId }, { name: target.name });
}
