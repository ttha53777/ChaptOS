import type { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { CreateRoleInput, UpdateRoleInput } from "@/lib/validation/role";

export async function listRoles(ctx: RequestContext) {
  const roles = await ctx.db.role.findMany({
    orderBy: [{ rank: "desc" }, { name: "asc" }],
  });
  const memberCounts = await Promise.all(
    roles.map(r => ctx.db.brotherRole.count({ where: { roleId: r.id } })),
  );
  return roles.map((r, i) => ({
    id:          r.id,
    name:        r.name,
    color:       r.color,
    rank:        r.rank,
    permissions: r.permissions,
    isSystem:    r.isSystem,
    memberCount: memberCounts[i],
  }));
}

export async function createRole(ctx: RequestContext, input: CreateRoleInput) {
  if (input.rank >= ctx.maxRank) {
    throw new ForbiddenError("Cannot create a role at or above your own rank");
  }
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
    await ctx.db.brotherRole.create({ data: { brotherId, roleId, organizationId: ctx.orgId } });
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
  if (!role)    throw new NotFoundError("Role");
  if (role.rank >= ctx.maxRank) {
    throw new ForbiddenError("Cannot revoke a role at or above your own rank");
  }

  try {
    await ctx.db.brotherRole.delete({
      where: { brotherId_roleId: { brotherId, roleId } },
    });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025") {
      throw new NotFoundError("Brother does not have that role");
    }
    throw e;
  }

  await emit(ctx, "role.revoked", { type: "BrotherRole", id: roleId }, {
    roleName:    role.name,
    brotherName: brother.name,
    brotherId,
  });
}
