import { randomBytes } from "node:crypto";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError } from "@/lib/errors";
import { expiryToDate, type CreateInviteInput } from "@/lib/validation/invite";
import { deriveInviteStatus, InviteStatus, type InviteMode } from "@/lib/state";

export interface InviteDto {
  id:              number;
  token:           string;
  mode:            InviteMode;
  label:           string | null;
  maxUses:         number | null;
  status:          InviteStatus;
  expiresAt:       string | null;
  revokedAt:       string | null;
  createdAt:       string;
  redemptionCount: number;
  createdByName:   string | null;
}

/** One person's join through a link — the "who actually used this" drill-down. */
export interface InviteRedemptionDto {
  brotherId:  number;
  name:       string;
  redeemedAt: string;
  /**
   * False when the redeemer belongs to a different home org (Brother.organizationId
   * ≠ this org). They hold a Membership here and their access works, but Phase 1
   * roster reads scope by Brother.organizationId, so they never show on the
   * roster. Surfacing the flag is what stops that from looking like a silent
   * failure to the admin who sent the link. See AGENTS.md on Membership vs home org.
   */
  onRoster:   boolean;
}

type InviteRow = {
  id: number; token: string; mode: string; label: string | null; maxUses: number | null;
  expiresAt: Date | null; revokedAt: Date | null; createdAt: Date;
};

/** Mint a URL-safe, crypto-strong invite token (256 bits of entropy). */
function mintToken(): string {
  return randomBytes(32).toString("base64url");
}

function toDto(
  invite: InviteRow,
  redemptionCount: number,
  createdByName: string | null,
): InviteDto {
  return {
    id:              invite.id,
    token:           invite.token,
    mode:            invite.mode as InviteMode,
    label:           invite.label,
    maxUses:         invite.maxUses,
    status:          deriveInviteStatus(invite, redemptionCount),
    expiresAt:       invite.expiresAt ? invite.expiresAt.toISOString() : null,
    revokedAt:       invite.revokedAt ? invite.revokedAt.toISOString() : null,
    createdAt:       invite.createdAt.toISOString(),
    redemptionCount,
    createdByName,
  };
}

export async function createInvite(ctx: RequestContext, input: CreateInviteInput): Promise<InviteDto> {
  const invite = await ctx.db.orgInvite.create({
    data: {
      token:              mintToken(),
      mode:               input.mode,
      label:              input.label ?? null,
      maxUses:            input.maxUses ?? null,
      expiresAt:          expiryToDate(input.expiry),
      createdByBrotherId: ctx.actorId,
    },
  });

  await emit(ctx, "invite.created", { type: "OrgInvite", id: invite.id }, {
    mode:   input.mode as InviteMode,
    expiry: input.expiry,
  });

  return toDto(invite, 0, ctx.actorName);
}

/**
 * List the org's invites newest-first, each with its redemption count.
 *
 * Defaults to ACTIVE only. `includeInactive` returns revoked / expired /
 * exhausted links too: they used to be filtered out in SQL, which meant
 * revoking a link made it vanish with no trace and no record of who had already
 * joined through it. The rows were always in the DB; only the read hid them.
 *
 * Note that "exhausted" can't be a SQL filter — it compares maxUses against a
 * count from another table — so the active-only path filters revoked/expired in
 * the query and drops exhausted rows after the counts land.
 */
export async function listInvites(
  ctx: RequestContext,
  opts: { includeInactive?: boolean } = {},
): Promise<InviteDto[]> {
  const invites = await ctx.db.orgInvite.findMany({
    where: opts.includeInactive ? {} : {
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
  });
  // One batched groupBy instead of one COUNT() per invite (N+1 → 2 queries).
  // The invite ids were just fetched org-scoped above, so grouping redemptions
  // by them is equivalent. An invite with no redemptions is absent from the
  // map, so `?? 0` reproduces the previous per-invite count of zero exactly.
  // Both derive only from the fetched `invites`, so fetch them together.
  const creatorIds = [...new Set(invites.map(i => i.createdByBrotherId))];
  const [countByInvite, creators] = await Promise.all([
    ctx.db.orgInvite.redemptionCountByInvite(invites.map(i => i.id)),
    creatorIds.length > 0
      ? ctx.db.brother.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const nameById = new Map(creators.map(b => [b.id, b.name]));

  const dtos = invites.map(invite => toDto(
    invite,
    countByInvite.get(invite.id) ?? 0,
    nameById.get(invite.createdByBrotherId) ?? null,
  ));

  // Exhausted links are dead but not revoked or expired, so the SQL filter above
  // can't catch them. Drop them here to keep "active" honest.
  return opts.includeInactive ? dtos : dtos.filter(d => d.status === InviteStatus.Active);
}

/**
 * Who actually joined through a link, newest-first. The settings list has always
 * shown a count; this is the drill-down behind it, and the only place an admin
 * can see that a redeemer landed off-roster (see InviteRedemptionDto.onRoster).
 *
 * Verifies the invite belongs to this org first — InviteRedemption carries no
 * organizationId of its own, so the parent lookup IS the tenancy check.
 */
export async function listInviteRedemptions(
  ctx: RequestContext, inviteId: number,
): Promise<InviteRedemptionDto[]> {
  const invite = await ctx.db.orgInvite.findUnique({ where: { id: inviteId } });
  if (!invite) throw new NotFoundError("Invite");

  const rows = await ctx.db.inviteRedemption.findMany({
    where:   { inviteId },
    orderBy: { redeemedAt: "desc" },
  });
  if (rows.length === 0) return [];

  const brotherIds = rows.map(r => r.brotherId);
  // Resolved through Membership, not ctx.db.brother, and that choice is the
  // whole trick: a redeemer whose home org is elsewhere has NO row in
  // ctx.db.brother (scoped by Brother.organizationId), so a roster-style read
  // would silently drop exactly the people this list exists to reveal. Every
  // redeemer does hold a Membership here — redeem-invite upserts one — and
  // Membership is org-scoped, so this stays tenancy-safe while reaching the
  // Brother row through the relation. One query for names + home org.
  const memberships = await ctx.db.membership.findMany({
    where:  { brotherId: { in: brotherIds } },
    select: { brotherId: true, name: true, brother: { select: { name: true, organizationId: true } } },
  });
  const byBrotherId = new Map(memberships.map(m => [m.brotherId, m]));

  return rows.map(r => {
    const m = byBrotherId.get(r.brotherId);
    return {
      brotherId:  r.brotherId,
      // Per-org display name wins, same rule as the roster (brother-service).
      name:       m?.name ?? m?.brother.name ?? "Unknown member",
      redeemedAt: r.redeemedAt.toISOString(),
      onRoster:   m?.brother.organizationId === ctx.orgId,
    };
  });
}

/** Revoke an invite (idempotent). Throws NotFoundError if it isn't this org's. */
export async function revokeInvite(ctx: RequestContext, id: number): Promise<void> {
  const existing = await ctx.db.orgInvite.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Invite");
  if (existing.revokedAt) return; // already revoked — idempotent

  await ctx.db.orgInvite.update({ where: { id }, data: { revokedAt: new Date() } });
  await emit(ctx, "invite.revoked", { type: "OrgInvite", id }, {
    mode: existing.mode as InviteMode,
  });
}
