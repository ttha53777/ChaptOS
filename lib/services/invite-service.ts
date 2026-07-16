import { randomBytes } from "node:crypto";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError } from "@/lib/errors";
import { expiryToDate, type CreateInviteInput } from "@/lib/validation/invite";
import type { InviteMode } from "@/lib/state";

export interface InviteDto {
  id:              number;
  token:           string;
  mode:            InviteMode;
  expiresAt:       string | null;
  createdAt:       string;
  redemptionCount: number;
  createdByName:   string | null;
}

/** Mint a URL-safe, crypto-strong invite token (256 bits of entropy). */
function mintToken(): string {
  return randomBytes(32).toString("base64url");
}

function toDto(
  invite: { id: number; token: string; mode: string; expiresAt: Date | null; createdAt: Date },
  redemptionCount: number,
  createdByName: string | null,
): InviteDto {
  return {
    id:              invite.id,
    token:           invite.token,
    mode:            invite.mode as InviteMode,
    expiresAt:       invite.expiresAt ? invite.expiresAt.toISOString() : null,
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
 * List the org's ACTIVE invites (not revoked, not expired) newest-first, each
 * with its redemption count. Expired/revoked links are hidden — they can't be
 * redeemed, so surfacing them would only clutter the settings list.
 */
export async function listInvites(ctx: RequestContext): Promise<InviteDto[]> {
  const invites = await ctx.db.orgInvite.findMany({
    where: {
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
  const creatorIds = [...new Set(invites.map(i => i.createdByBrotherId).filter((id): id is number => id !== null))];
  const [countByInvite, creators] = await Promise.all([
    ctx.db.orgInvite.redemptionCountByInvite(invites.map(i => i.id)),
    creatorIds.length > 0
      ? ctx.db.brother.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const nameById = new Map(creators.map(b => [b.id, b.name]));

  return invites.map(invite => toDto(
    invite,
    countByInvite.get(invite.id) ?? 0,
    invite.createdByBrotherId ? (nameById.get(invite.createdByBrotherId) ?? null) : null,
  ));
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
