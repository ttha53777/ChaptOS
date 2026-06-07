import type { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { CreateRoleInput, UpdateRoleInput } from "@/lib/validation/role";

export async function listRoles(ctx: RequestContext) {
  const roles = await ctx.db.role.findMany({
    orderBy: [{ rank: "desc" }, { name: "asc" }],
  });
  // One batched groupBy instead of one COUNT() per role (N+1 → 2 queries).
  // Org-scoped identically; a role with no members is absent from the map, so
  // `?? 0` reproduces the previous per-role count of zero exactly.
  const countByRole = await ctx.db.brotherRole.countByRole(roles.map(r => r.id));
  return roles.map(r => ({
    id:          r.id,
    name:        r.name,
    color:       r.color,
    rank:        r.rank,
    permissions: r.permissions,
    isSystem:    r.isSystem,
    memberCount: countByRole.get(r.id) ?? 0,
  }));
}

/**
 * A role's permission bits may only include bits the actor already holds.
 * Without this, a non-admin with MANAGE_ROLES could mint a lower-rank role
 * carrying permissions they were never granted (e.g. MANAGE_TREASURY) and then
 * grant it to themselves — a privilege-escalation path the rank check alone
 * does not close. Org/platform admins have every bit (ctx.permissions = all),
 * so ~ctx.permissions === 0 and this is a no-op for them.
 */
function assertAssignablePermissions(ctx: RequestContext, bits: number): void {
  if ((bits & ~ctx.permissions) !== 0) {
    throw new ForbiddenError("Cannot assign permissions you do not hold");
  }
}

export async function createRole(ctx: RequestContext, input: CreateRoleInput) {
  if (input.rank >= ctx.maxRank) {
    throw new ForbiddenError("Cannot create a role at or above your own rank");
  }
  assertAssignablePermissions(ctx, input.permissions);
  const role = await ctx.db.role.create({
    data: {
      name:        input.name,
      color:       input.color ?? null,
      rank:        input.rank,
      permissions: input.permissions,
      isSystem:    false,
    },
  });
  await emit(ctx, "role.created", { type: "Role", id: role.id }, {
    name: role.name,
    rank: role.rank,
  });
  return role;
}

export async function updateRole(ctx: RequestContext, roleId: number, input: UpdateRoleInput) {
  const existing = await ctx.db.role.findUnique({ where: { id: roleId } });
  if (!existing) throw new NotFoundError("Role");

  if (existing.rank >= ctx.maxRank) {
    throw new ForbiddenError("Cannot edit a role at or above your own rank");
  }

  const data: Prisma.RoleUpdateInput = {};
  const changedFields: string[] = [];

  if (input.name !== undefined) {
    if (existing.isSystem) throw new ValidationError("System roles cannot be renamed");
    data.name = input.name;
    changedFields.push("name");
  }
  if (input.color !== undefined) {
    data.color = input.color;
    changedFields.push("color");
  }
  if (input.rank !== undefined) {
    if (input.rank >= ctx.maxRank) {
      throw new ForbiddenError("Cannot raise rank to or above your own");
    }
    data.rank = input.rank;
    changedFields.push("rank");
  }
  if (input.permissions !== undefined) {
    // Same escalation guard as createRole: never let an actor widen a role to
    // bits they don't hold. Admins hold every bit, so this is a no-op for them.
    assertAssignablePermissions(ctx, input.permissions);
    data.permissions = input.permissions;
    changedFields.push("permissions");
  }

  if (changedFields.length === 0) throw new ValidationError("No valid fields provided");

  const role = await ctx.db.role.update({ where: { id: roleId }, data });
  await emit(ctx, "role.updated", { type: "Role", id: role.id }, {
    name: role.name,
    changedFields,
  });
  return role;
}

export async function deleteRole(ctx: RequestContext, roleId: number) {
  const existing = await ctx.db.role.findUnique({ where: { id: roleId } });
  if (!existing) throw new NotFoundError("Role");
  if (existing.isSystem) throw new ValidationError("System roles cannot be deleted");
  if (existing.rank >= ctx.maxRank) {
    throw new ForbiddenError("Cannot delete a role at or above your own rank");
  }

  const memberCount = await ctx.db.brotherRole.count({ where: { roleId } });
  await ctx.db.role.delete({ where: { id: roleId } });
  await emit(ctx, "role.deleted", { type: "Role", id: roleId }, {
    name: existing.name,
    affectedBrothers: memberCount,
  });
}

export async function grantRole(ctx: RequestContext, brotherId: number, roleId: number) {
  const [brother, role] = await Promise.all([
    ctx.db.brother.findUnique({ where: { id: brotherId }, select: { id: true, name: true } }),
    ctx.db.role.findUnique({ where: { id: roleId }, select: { id: true, name: true, rank: true } }),
  ]);
  if (!brother) throw new NotFoundError("Brother");
  if (!role)    throw new NotFoundError("Role");
  if (role.rank >= ctx.maxRank) {
    throw new ForbiddenError("Cannot grant a role at or above your own rank");
  }

  try {
    await ctx.db.brotherRole.create({ data: { brotherId, roleId } });
  } catch (e) {
    // P2002 = already assigned
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      throw new ConflictError("Brother already has that role");
    }
    throw e;
  }

  await emit(ctx, "role.granted", { type: "BrotherRole", id: roleId }, {
    roleName:    role.name,
    brotherName: brother.name,
    brotherId,
  });

  return { brotherId, roleId };
}

export async function revokeRole(ctx: RequestContext, brotherId: number, roleId: number) {
  const [brother, role] = await Promise.all([
    ctx.db.brother.findUnique({ where: { id: brotherId }, select: { id: true, name: true } }),
    ctx.db.role.findUnique({ where: { id: roleId }, select: { id: true, name: true, rank: true } }),
  ]);
  if (!brother) throw new NotFoundError("Brother");

  // Revoke is idempotent: the goal is "this brother does not hold this role".
  // If the role no longer exists in the org (e.g. it was deleted while a stale
  // chip lingered in the client), that goal is already satisfied — return
  // quietly rather than 404'ing on a chip the user is trying to clear. No emit:
  // nothing actually changed.
  if (!role) return { revoked: false as const };

  if (role.rank >= ctx.maxRank) {
    throw new ForbiddenError("Cannot revoke a role at or above your own rank");
  }

  try {
    await ctx.db.brotherRole.delete({
      where: { brotherId_roleId: { brotherId, roleId } },
    });
  } catch (e) {
    // P2025 = the brother didn't have that role. End-state already satisfied, so
    // succeed idempotently instead of erroring on a no-op revoke.
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025") {
      return { revoked: false as const };
    }
    throw e;
  }

  await emit(ctx, "role.revoked", { type: "BrotherRole", id: roleId }, {
    roleName:    role.name,
    brotherName: brother.name,
    brotherId,
  });

  return { revoked: true as const };
}
