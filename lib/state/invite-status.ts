/**
 * Whether an invite link can still be used, and if not, why.
 *
 * DERIVED, never stored. The underlying facts — revokedAt, expiresAt, maxUses
 * vs. the redemption count — are the source of truth; a stored status column
 * would need a cron to stay honest as clocks move past expiresAt.
 *
 * The distinction earns its keep on the join screen: "expired", "revoked", and
 * "full" call for different next steps from the invitee, and collapsing them
 * into one message (as the flow used to) left people with nothing to do.
 */

export const InviteStatus = {
  /** Usable right now. */
  Active: "active",
  /** Past expiresAt. */
  Expired: "expired",
  /** An admin turned it off. */
  Revoked: "revoked",
  /** Hit its maxUses cap. */
  Exhausted: "exhausted",
} as const;

export type InviteStatus = (typeof InviteStatus)[keyof typeof InviteStatus];

export const INVITE_STATUSES: readonly InviteStatus[] = Object.values(InviteStatus);

export function isInviteStatus(value: unknown): value is InviteStatus {
  return typeof value === "string" && (INVITE_STATUSES as readonly string[]).includes(value);
}

/**
 * Precedence matters: a revoked link reports "revoked" even if it also expired,
 * because that's the fact the admin acted on and the one the invitee should be
 * told. Expiry beats exhaustion for the same reason — it's the cheaper fix
 * ("ask for a fresh link") and doesn't imply the roster is full.
 */
export function deriveInviteStatus(
  invite: { expiresAt: Date | null; revokedAt: Date | null; maxUses: number | null },
  redemptionCount: number,
  now: Date = new Date(),
): InviteStatus {
  if (invite.revokedAt) return InviteStatus.Revoked;
  if (invite.expiresAt && invite.expiresAt < now) return InviteStatus.Expired;
  if (invite.maxUses !== null && redemptionCount >= invite.maxUses) return InviteStatus.Exhausted;
  return InviteStatus.Active;
}
