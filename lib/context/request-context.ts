/**
 * RequestContext — one object created per request, threaded into services.
 *
 * Authorization model (three tiers, checked in order):
 *
 *   isPlatformAdmin  Cross-org superuser. All permission bits set. Can operate
 *                    on any org via the active-org cookie. Subject to rate
 *                    limiting. All actions auditable via PlatformAdmin table.
 *
 *   isOrgAdmin       Per-org admin. All permission bits set WITHIN ctx.orgId
 *                    only. Switching to a different org yields a regular member
 *                    context. Does not bypass rate limiting.
 *
 *   Regular member   Permission bitfield from assigned BrotherRole rows.
 *                    maxRank = highest role rank held.
 *
 * Design: explicit param passing, no AsyncLocalStorage. Easier to test, easier
 * to reason about, no accidental ambient state.
 */

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { type Permission, computePermissions, hasPermission } from "@/lib/permissions";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export interface RequestContext {
  requestId:       string;
  orgId:           number;
  actorId:         number;
  actorName:       string;
  actorEmail:      string | null;
  authUserId:      string;
  membershipId:    number | null;
  permissions:     number;
  maxRank:         number;
  isOrgAdmin:      boolean;
  isPlatformAdmin: boolean;
  db:              ReturnType<typeof db>;
}

export interface BuildContextOpts {
  /** Require this permission; 403 if missing (platform admins and org admins bypass). */
  requirePerm?: Permission;
  /** Allow this brother id through even without the permission (self-edit). */
  selfId?: number;
  /** Rate-limit writes per actor. Pass false to skip. Default: true with 30/10s. */
  rateLimit?: boolean | { limit: number; windowMs: number };
}

export type BuildContextResult =
  | { ctx: RequestContext; error?: undefined }
  | { ctx?: undefined; error: Response };

/**
 * Resolve the per-request context. Returns an error Response if auth fails,
 * permission is missing, or rate limit is exceeded — route returns it verbatim.
 *
 *   const { ctx, error } = await buildContext({ requirePerm: "MANAGE_TREASURY" });
 *   if (error) return error;
 *   // ctx.db.transaction.create(...)
 */
export async function buildContext(opts: BuildContextOpts = {}): Promise<BuildContextResult> {
  const user = await requireUser();
  if (!user) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  // ── Resolve isOrgAdmin for the active org ─────────────────────────────────
  // requireUser() already loaded memberships; find the one for the active org.
  const activeMembership = user.memberships.find(m => m.organizationId === user.orgId);
  const isOrgAdmin = activeMembership?.isOrgAdmin ?? false;

  // ── Resolve permission bitfield + maxRank ─────────────────────────────────
  let permissions = 0;
  let maxRank = 0;

  if (user.isPlatformAdmin || isOrgAdmin) {
    // Both elevated tiers get all permission bits within the active org.
    // The distinction between them lives in audit trails and cross-org access,
    // not in per-request capabilities.
    permissions = ~0 >>> 0;
    maxRank = Number.POSITIVE_INFINITY;
  } else {
    try {
      const rows = await prisma.brotherRole.findMany({
        where: { brotherId: user.id, role: { organizationId: user.orgId } },
        select: { role: { select: { permissions: true, rank: true } } },
      });
      const roles = rows.map(r => r.role);
      permissions = computePermissions(roles);
      maxRank = roles.reduce((m, r) => Math.max(m, r.rank), 0);
    } catch (e) {
      // Pre-migration table missing — treat as no roles. Same posture as
      // require-permission.ts before this refactor.
      console.warn("buildContext: role lookup failed:", (e as Error).message);
    }
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
  // Checked before the permission gate so that authenticated actors cannot
  // enumerate permission states without consuming rate-limit tokens. Applies
  // to all tiers — privileged actors should never need 30 mutations in 10s.
  if (opts.rateLimit !== false) {
    const { limit, windowMs } = typeof opts.rateLimit === "object"
      ? opts.rateLimit
      : { limit: 30, windowMs: 10_000 };
    const rl = rateLimit(`mutate:${user.id}`, limit, windowMs);
    if (!rl.ok) return { error: tooManyRequests(rl) };
  }

  // ── Permission gate ────────────────────────────────────────────────────────
  // Platform admins and org admins bypass (both have all bits set above, so
  // hasPermission would pass anyway — the explicit check prevents short-circuit
  // bugs if the ~0 value ever changes).
  if (opts.requirePerm && !user.isPlatformAdmin && !isOrgAdmin) {
    const allowedAsSelf = opts.selfId !== undefined && opts.selfId === user.id;
    if (!allowedAsSelf && !hasPermission(permissions, opts.requirePerm)) {
      return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
    }
  }

  // ── Resolve Membership id ─────────────────────────────────────────────────
  // We already have the membership from requireUser(); use it directly when
  // available to avoid a redundant DB round-trip.
  const membershipId = activeMembership?.id ?? null;

  const ctx: RequestContext = {
    requestId:       randomUUID(),
    orgId:           user.orgId,
    actorId:         user.id,
    actorName:       user.name,
    actorEmail:      user.email,
    authUserId:      user.authUserId,
    membershipId,
    permissions,
    maxRank,
    isOrgAdmin,
    isPlatformAdmin: user.isPlatformAdmin,
    db:              db(user.orgId),
  };

  return { ctx };
}
