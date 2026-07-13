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

  // Per-org display names. A person is one Brother but many Memberships, so the
  // name shown on THIS org's roster is their Membership.name here, falling back
  // to the account-level Brother.name when they never set one. Roster-only
  // members (added by an admin, no auth account) have no Membership row and so
  // always fall back. One org-scoped query for the whole list — no N+1.
  const overrides = await ctx.db.membership.findMany({
    where:  { brotherId: { in: brotherIds }, name: { not: null } },
    select: { brotherId: true, name: true },
  });
  const nameByBrotherId = new Map(overrides.map(m => [m.brotherId, m.name!]));

  return brothers.map(b => ({
    ...b,
    name: nameByBrotherId.get(b.id) ?? b.name,
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
  // `name` is handled separately below — it lands on Membership.name (the
  // per-org display name), not on the Brother row.
  const canManageBrothers = ctx.isPlatformAdmin || hasPermission(ctx.permissions, "MANAGE_BROTHERS");
  const allowed = canManageBrothers
    ? ["role", "duesOwed", "gpa", "serviceHours"] as const
    : ["role", "gpa", "serviceHours"] as const;

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

  // The name is an ORG-LOCAL identity: it lands on this org's Membership row, so
  // renaming yourself here never touches what another org calls you. setName is
  // an updateMany, so a target with no Membership in this org — a roster-only
  // member an admin added, who has no auth account and so never joined — reports
  // count 0, and we fall back to the account-level Brother.name. That's the same
  // row listVisibleBrothers falls back to for them, so the roster stays correct.
  let namedViaMembership = false;
  if (input.name !== undefined) {
    const { count } = await ctx.db.membership.setName(brotherId, input.name);
    namedViaMembership = count > 0;
    if (!namedViaMembership) data.name = input.name;
    changedFields.push("name");
  }

  // ctx.db.brother is scoped by Brother.organizationId — the legacy HOME org (see
  // AGENTS.md, Phase 1). A multi-org member's Brother row lives in their home org,
  // so this update throws P2025 in any of their OTHER orgs. That's correct for the
  // Brother-owned columns (an org may only edit the dues/GPA of its own members —
  // the pre-existing Phase 1 rule), but a per-org rename is legitimately this org's
  // business: it already landed on the Membership above and needs nothing from the
  // Brother row. So when the name was the only change, skip the home-org-scoped
  // write rather than 404 a rename that already succeeded.
  //
  // The read-back still goes through an org-scoped delegate: the membership we just
  // wrote proves this brother belongs to THIS org, so it's the tenancy-safe way to
  // resolve the row without loosening scopedBrother's home-org filter.
  let brother;
  if (Object.keys(data).length > 0) {
    brother = await ctx.db.brother.update({ where: { id: brotherId }, data });
  } else {
    const m = await ctx.db.membership.findFirst({
      where:  { brotherId },
      select: { brother: true },
    });
    if (!m) throw new NotFoundError("Brother");
    brother = m.brother;
  }

  await emit(ctx, "brother.updated", { type: "Brother", id: brother.id }, {
    // brother.name is the account-level name and may be stale now (a per-org
    // rename leaves it untouched), so report what the caller actually set.
    name: input.name ?? brother.name,
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
