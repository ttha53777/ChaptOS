/**
 * One-time, onboarding-only org setup helpers.
 *
 * applyRoleSet REPLACES the template-seeded roles with an AI-proposed, founder-
 * confirmed set. This is the ONE place that intentionally bypasses the role
 * service's rename/delete guards: provisioning seeds template roles with
 * isSystem=true, and updateRole/deleteRole refuse to touch isSystem roles (a
 * protection the Settings → Roles UI relies on). We keep that protection for
 * normal use and instead write directly through the org-scoped ctx.db.role
 * wrapper — still tenant-safe (organizationId is injected), just not subject to
 * the isSystem block.
 *
 * Hard invariant: the founder NEVER loses access. Their rank-100, all-permission
 * role is preserved untouched (and their BrotherRole link with it); only the
 * OTHER seeded roles are replaced. The caller must additionally gate this to a
 * FRESH org (no non-founder members) so it can't be abused after onboarding.
 */

import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ForbiddenError } from "@/lib/errors";

/** A validated non-founder role: rank < 100, permissions already a bitfield. */
export interface RoleToApply {
  name: string;
  rank: number;
  permissions: number;
  color: string;
}

/** Rank reserved for the founder/admin role; proposals always stay below it. */
const FOUNDER_RANK = 100;

export interface ApplyRoleSetResult {
  preservedFounderRoleId: number;
  deletedRoleIds: number[];
  createdRoleIds: number[];
}

/**
 * Replace the seeded non-founder roles with `roles`. Org-scoped via ctx.db.
 * Authorization: org admins only (same posture as the config setters). The
 * caller is responsible for the fresh-org gate.
 */
export async function applyRoleSet(
  ctx: RequestContext,
  roles: RoleToApply[],
): Promise<ApplyRoleSetResult> {
  if (!ctx.isOrgAdmin && !ctx.isPlatformAdmin) {
    throw new ForbiddenError("Only an org admin can configure roles");
  }

  // FRESH-ORG GATE — this guard-bypassing path is for onboarding only. Once the
  // org has more than the founder, refuse: role replacement could strip a real
  // member's assignment, and the protection we bypass exists for a reason.
  const brothers = await ctx.db.brother.findMany({ select: { id: true }, take: 2 });
  if (brothers.length > 1) {
    throw new ForbiddenError("Role setup is only available during initial onboarding");
  }

  // Identify the founder's role(s). The founder holds the rank-100 seeded role;
  // we preserve whatever roles they currently hold so their access is untouched.
  const founderLinks = await ctx.db.brotherRole.findMany({
    where: { brotherId: ctx.actorId },
    select: { roleId: true },
  });
  const founderRoleIds = new Set(founderLinks.map(l => l.roleId));

  const existing = await ctx.db.role.findMany({
    orderBy: { rank: "desc" },
    select: { id: true, rank: true, name: true },
  });

  // The role to preserve at all costs: the founder's highest-rank held role (the
  // rank-100 all-perms one from provisioning). Never delete or modify it.
  const preserved = existing
    .filter(r => founderRoleIds.has(r.id))
    .sort((a, b) => b.rank - a.rank)[0];
  if (!preserved) {
    // Defensive: a founder with no role would be a provisioning bug. Refuse
    // rather than risk leaving them without access.
    throw new ForbiddenError("Founder role not found; refusing to replace roles");
  }

  // Delete every OTHER role — but only ones with no members (onboarding is fresh,
  // so only the preserved founder role has a member). Skip any that somehow has a
  // member, to never strip a real assignment.
  const deletedRoleIds: number[] = [];
  for (const r of existing) {
    if (r.id === preserved.id) continue;
    const memberCount = await ctx.db.brotherRole.count({ where: { roleId: r.id } });
    if (memberCount > 0) continue;
    await ctx.db.role.delete({ where: { id: r.id } });
    deletedRoleIds.push(r.id);
    await emit(ctx, "role.deleted", { type: "Role", id: r.id }, {
      name: r.name,
      affectedBrothers: 0,
    });
  }

  // Create the proposed roles as NORMAL roles (isSystem=false → editable later in
  // Settings). Ranks are already clamped < 100 by the validator; clamp again as
  // defense in depth so nothing can tie/exceed the founder role.
  const createdRoleIds: number[] = [];
  for (const role of roles) {
    const rank = Math.max(0, Math.min(FOUNDER_RANK - 1, Math.round(role.rank)));
    const created = await ctx.db.role.create({
      data: {
        name:        role.name,
        color:       role.color,
        rank,
        permissions: role.permissions,
        isSystem:    false,
      },
      select: { id: true },
    });
    createdRoleIds.push(created.id);
    await emit(ctx, "role.created", { type: "Role", id: created.id }, {
      name: role.name,
      rank,
    });
  }

  return { preservedFounderRoleId: preserved.id, deletedRoleIds, createdRoleIds };
}
