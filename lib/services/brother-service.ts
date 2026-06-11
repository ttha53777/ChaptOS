import type { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";
import type { CreateBrotherInput, UpdateBrotherInput } from "@/lib/validation/brother";
import {
  sanitizeCustomFields,
  type CustomMemberFieldDef,
  type CustomFieldValues,
} from "@/lib/custom-member-fields";

/** Fetch the org's current custom field definitions from config (server-side only). */
async function getFieldDefs(ctx: RequestContext): Promise<CustomMemberFieldDef[]> {
  const config = await ctx.db.organizationConfig.find();
  if (!config) return [];
  const raw = config.customMemberFields;
  return Array.isArray(raw) ? (raw as unknown as CustomMemberFieldDef[]) : [];
}

export async function listVisibleBrothers(ctx: RequestContext) {
  // Excludes ghost members (Atomic Samurai backdoor users).
  const brothers = await ctx.db.brother.findMany({ where: { isGhost: false }, orderBy: { id: "asc" } });
  const brotherIds = brothers.map(b => b.id);
  // Scope role assignments to the active org. A multi-org member has BrotherRole
  // rows in several orgs; without the org-scoped wrapper's filter another org's
  // roles leak into this org's UI as chips that can't be revoked here (the revoke
  // path is org-scoped, so deleting a foreign-org role 404s / no-ops and the chip
  // reappears on reload). ctx.db injects organizationId: ctx.orgId automatically.
  const brotherRoles = await ctx.db.brotherRole.listWithRole(brotherIds);
  const rolesByBrotherId = new Map<number, { id: number; name: string; color: string | null; rank: number }[]>();
  for (const br of brotherRoles) {
    const list = rolesByBrotherId.get(br.brotherId) ?? [];
    list.push(br.role);
    rolesByBrotherId.set(br.brotherId, list);
  }

  // Fetch field definitions once for the whole list — avoids N+1.
  const defs = await getFieldDefs(ctx);

  return brothers.map(b => ({
    ...b,
    // Strip unknown / deleted field ids on read so the client never sees orphan values.
    customFields: sanitizeCustomFields(b.customFields, defs),
    roles: (rolesByBrotherId.get(b.id) ?? []).sort((a, z) => z.rank - a.rank),
  }));
}

export async function createBrother(ctx: RequestContext, input: CreateBrotherInput) {
  let customFields: CustomFieldValues = {};
  if (input.customFields) {
    const defs = await getFieldDefs(ctx);
    customFields = sanitizeCustomFields(input.customFields, defs);
  }

  const brother = await ctx.db.brother.create({
    data: {
      name:         input.name,
      role:         input.role,
      attendance:   0,
      duesOwed:     input.duesOwed,
      gpa:          input.gpa,
      serviceHours: input.serviceHours,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      customFields: customFields as any,
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

  // Custom fields: allowed for both admins and self-edit.
  // Definitions are always fetched server-side — the client never influences
  // which fields are valid, only the values.
  if (input.customFields !== undefined) {
    const defs = await getFieldDefs(ctx);
    const sanitized = sanitizeCustomFields(input.customFields, defs);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any).customFields = sanitized;
    changedFields.push("customFields");
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
