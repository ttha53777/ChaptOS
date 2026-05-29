/**
 * RequestContext — one object created per request, threaded into services.
 *
 * Replaces the requireUser + requirePermission + checkMutationRate + db(orgId)
 * preamble that opens every route handler. Resolves Membership and assigns a
 * requestId so structured events + error logs can be correlated across calls.
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
  isPlatformAdmin: boolean;
  db:              ReturnType<typeof db>;
}

export interface BuildContextOpts {
  /** Require this permission; 403 if missing (platform admins bypass). */
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

  // Resolve permission bitfield + maxRank. Platform admins bypass.
  let permissions = 0;
  let maxRank = 0;
  if (user.isPlatformAdmin) {
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

  // Permission gate (after computing, so the returned ctx is accurate even on 403).
  if (opts.requirePerm && !user.isPlatformAdmin) {
    const allowedAsSelf = opts.selfId !== undefined && opts.selfId === user.id;
    if (!allowedAsSelf && !hasPermission(permissions, opts.requirePerm)) {
      return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
    }
  }

  // Rate limit (default on, opt-out with rateLimit: false).
  if (opts.rateLimit !== false) {
    const { limit, windowMs } = typeof opts.rateLimit === "object"
      ? opts.rateLimit
      : { limit: 30, windowMs: 10_000 };
    const rl = rateLimit(`mutate:${user.id}`, limit, windowMs);
    if (!rl.ok) return { error: tooManyRequests(rl) };
  }

  // Resolve Membership for this org. May not exist for platform admins acting
  // on an org they don't belong to — kept null in that case.
  let membershipId: number | null = null;
  try {
    const m = await prisma.membership.findUnique({
      where: { brotherId_organizationId: { brotherId: user.id, organizationId: user.orgId } },
      select: { id: true },
    });
    membershipId = m?.id ?? null;
  } catch {
    // Membership table missing pre-migration — non-fatal.
  }

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
    isPlatformAdmin: user.isPlatformAdmin,
    db:              db(user.orgId),
  };

  return { ctx };
}
