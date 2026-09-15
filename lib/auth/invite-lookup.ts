/** Token-bound bootstrap lookup, shared by landing, pre-flight, and submission.
 * The privileged read resolves only public org metadata and link capacity;
 * callers must separately verify the account's own membership/request.
 */

import { prismaPrivileged } from "@/lib/prisma-privileged";
import type { Prisma } from "@/app/generated/prisma/client";
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
  pendingCount: number;
  maxUses: number | null;
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
export async function resolveInviteToken(token: string, client: Pick<Prisma.TransactionClient, "orgInvite"> = prismaPrivileged): Promise<InviteLookup> {
  if (!token || token.length > 256) return { ok: false, reason: "not_found", invite: null };

  // Narrow bootstrap capability: the token resolves an org before a ctx exists.
  const row = await client.orgInvite.findUnique({
    where: { token },
    select: {
      id: true, expiresAt: true, revokedAt: true, maxUses: true,
      _count:       { select: { redemptions: true, joinRequests: { where: { status: "pending" } } } },
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
    pendingCount: row._count.joinRequests,
    maxUses: row.maxUses,
  };

  const status = deriveInviteStatus(row, invite.redemptionCount, new Date(), invite.pendingCount);
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
  reserved: "All places on this link are reserved by people waiting for review. Ask an organizer for another link.",
};
