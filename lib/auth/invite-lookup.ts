/**
 * Shared invite-token resolution for the two pre-auth invite paths:
 * GET /api/auth/invite-status (read-only pre-flight) and
 * POST /api/auth/request-join (the write, via lib/auth/join-request-submit).
 *
 * Both need the exact same question answered — "is this token usable, and for
 * which org?" — and they MUST answer it identically, or the join screen tells
 * someone they can ask to join and the submit call then refuses. Keeping the
 * rule in one place is the point of this module.
 *
 * The lookup is global (unscoped `prisma`, not `db(orgId)`) on purpose: the
 * redeemer has no membership anywhere yet, so the token IS the org resolution.
 * Everything downstream of it is scoped by the org the token names.
 */

import { prisma } from "@/lib/prisma"; // lint-modules:ignore (pre-auth: token lookup precedes any org scoping)
import { deriveInviteStatus, InviteStatus } from "@/lib/state";

/** Why a link can't be used. Mirrors InviteStatus minus "active", plus not_found. */
export type InviteDeadReason = Exclude<InviteStatus, "active"> | "not_found";

export interface ResolvedInvite {
  id:             number;
  orgId:          number;
  orgSlug:        string;
  orgName:        string;
  orgLogoUrl:     string | null;
  redemptionCount: number;
}

export type InviteLookup =
  | { ok: true;  invite: ResolvedInvite }
  | { ok: false; reason: InviteDeadReason; invite: ResolvedInvite | null };

/**
 * Resolve a raw token to its org and usability.
 *
 * On failure the resolved invite is still returned when one existed, so the
 * join screen can say "this link to <Org> has expired" rather than the useless
 * "invite unavailable" that covered every case before. Only `not_found` carries
 * a null invite.
 */
export async function resolveInviteToken(token: string): Promise<InviteLookup> {
  if (!token) return { ok: false, reason: "not_found", invite: null };

  const row = await prisma.orgInvite.findUnique({
    where: { token },
    select: {
      id: true, expiresAt: true, revokedAt: true, maxUses: true,
      _count:       { select: { redemptions: true } },
      organization: { select: { id: true, slug: true, name: true, logoUrl: true } },
    },
  });
  if (!row) return { ok: false, reason: "not_found", invite: null };

  const invite: ResolvedInvite = {
    id:              row.id,
    orgId:           row.organization.id,
    orgSlug:         row.organization.slug,
    orgName:         row.organization.name,
    orgLogoUrl:      row.organization.logoUrl,
    redemptionCount: row._count.redemptions,
  };

  const status = deriveInviteStatus(row, invite.redemptionCount);
  return status === InviteStatus.Active
    ? { ok: true, invite }
    : { ok: false, reason: status, invite };
}

/** HTTP status for a dead link. 404 only for a token we've never seen. */
export function deadReasonStatus(reason: InviteDeadReason): number {
  return reason === "not_found" ? 404 : 410;
}

/** User-facing copy. Kept server-side so both routes and any client fallback agree. */
export const DEAD_REASON_MESSAGE: Record<InviteDeadReason, string> = {
  not_found: "This invite link isn't valid.",
  revoked:   "This invite link has been turned off.",
  expired:   "This invite link has expired.",
  exhausted: "This invite link has reached its limit.",
};
