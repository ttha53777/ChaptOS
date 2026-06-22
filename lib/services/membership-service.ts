/**
 * Membership lifecycle — a member's relationship to a single org.
 *
 * Today this owns `leaveOrg`: a member disconnecting themselves from the active
 * org. It's the self-serve inverse of an admin's deleteBrother and a narrow
 * cousin of deleteOrg — it removes only the caller's own Membership + role
 * grants, never the Brother account or any other org's data.
 *
 * Like every service in this directory it takes a RequestContext, goes through
 * ctx.db (org-scoped), never touches Response objects, and emits an
 * OperationalEvent so the activity feed and audit trail stay in lockstep.
 */

import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";

/**
 * Remove the caller's own membership in the active org ("leave organization").
 *
 * Authorization: any member may leave their own membership — no admin gate. The
 * caller MUST pass the org's current slug as a confirmation token; if it doesn't
 * match the active org we refuse, so a malformed/replayed request can't drop a
 * membership in the wrong org (same posture as deleteOrg).
 *
 * Guard: an org admin who is the *only* admin is blocked — leaving would orphan
 * the org with no one able to manage it. They must promote another admin first.
 * Leaving as the last member, or leaving your only org, is allowed.
 *
 * Scope (per product decision): delete the Membership row and the caller's
 * BrotherRole grants for THIS org only. The Brother account, Brother.organizationId
 * (legacy home org), attendance/transactions/activity, and memberships in other
 * orgs are all left untouched. BrotherRole only cascades on Brother deletion, not
 * Membership deletion, so we delete it explicitly — otherwise a stale admin/officer
 * grant would silently re-apply if the user is ever re-invited.
 */
export async function leaveOrg(
  ctx: RequestContext,
  confirmSlug: string,
): Promise<{ organizationId: number; slug: string }> {
  const org = await ctx.db.organization.findUnique({
    where: { id: ctx.orgId },
    select: { id: true, slug: true, name: true },
  });
  if (!org) throw new NotFoundError("Organization");

  if (confirmSlug !== org.slug) {
    throw new ValidationError("Confirmation does not match the organization slug");
  }

  // Last-admin guard. ctx.db.membership is org-scoped (organizationId injected),
  // so this counts only admins in the active org.
  if (ctx.isOrgAdmin) {
    const otherAdmins = await ctx.db.membership.count({
      where: { isOrgAdmin: true, brotherId: { not: ctx.actorId } },
    });
    if (otherAdmins === 0) {
      throw new ConflictError("You're the last admin. Promote another admin before leaving.");
    }
  }

  // Atomic teardown: revoke role grants AND drop the membership together so a
  // partial failure can't leave the user access-less but still holding old roles.
  // The tx client is unscoped, so organizationId is injected manually on each write.
  await ctx.db.$transaction(async (tx) => {
    await tx.brotherRole.deleteMany({
      where: { brotherId: ctx.actorId, organizationId: ctx.orgId },
    });
    await tx.membership.deleteMany({
      where: { brotherId: ctx.actorId, organizationId: ctx.orgId },
    });
  });

  await emit(ctx, "membership.left", { type: "Organization", id: ctx.orgId }, {
    brotherId: ctx.actorId,
    name: ctx.actorName,
    orgName: org.name,
  });

  return { organizationId: org.id, slug: org.slug };
}
