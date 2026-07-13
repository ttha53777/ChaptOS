import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma"; // lint-modules:ignore (pre-auth onboarding; redeemer has no ctx yet)
import { db } from "@/lib/db"; // lint-modules:ignore (pre-auth onboarding; redeemer has no ctx yet)
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { parseAvatarFromMetadata } from "@/lib/avatar";
import { logActivity } from "@/lib/activity";
import { claimedResponse } from "@/lib/auth/session-cookies";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { logError } from "@/lib/observability";

// Pre-auth invite redemption. The redeemer has a Supabase session but may have
// no Brother / no Membership in this org yet, so there's no RequestContext to
// build — same situation as /api/auth/claim, which this mirrors. The org is
// resolved from the TOKEN (a global lookup, since the redeemer isn't a member),
// then all writes are scoped to that org via db(orgId) (app role, like claim).

/** Fire-and-forget structured event for a redemption (no ctx here). */
async function emitRedeemEvent(
  orgId: number, inviteId: number, brotherId: number, mode: string, reused: boolean,
) {
  try {
    await prisma.operationalEvent.create({
      data: {
        organizationId: orgId,
        requestId:      randomUUID(),
        actorId:        brotherId,
        action:         "invite.redeemed",
        subjectType:    "OrgInvite",
        subjectId:      inviteId,
        metadata:       { mode, orgId, brotherId, reused },
      },
    });
  } catch {
    // Non-fatal — telemetry must not break the join.
  }
}

export async function POST(req: NextRequest) {
  // ── 1. Validate Supabase session ─────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // ── 2. Rate-limit (per-user + per-IP) ─────────────────────────────────────
  const perUser = rateLimit(`redeem:${user.id}`, 5, 60_000);
  if (!perUser.ok) return tooManyRequests(perUser);
  const perIp = rateLimit(`redeem-ip:${clientIp(req)}`, 20, 60_000);
  if (!perIp.ok) return tooManyRequests(perIp);

  const body = await req.json().catch(() => ({}));
  const token = String(body.token ?? "").trim();
  if (!token) return Response.json({ error: "Missing invite token" }, { status: 400 });

  // ── 3. Global token lookup (redeemer isn't a member yet) ──────────────────
  const invite = await prisma.orgInvite.findUnique({
    where: { token },
    select: {
      id: true, mode: true, expiresAt: true, revokedAt: true,
      organization: { select: { id: true, slug: true, name: true } },
    },
  });
  if (!invite) return Response.json({ error: "Invite not found" }, { status: 404 });
  if (invite.revokedAt) return Response.json({ error: "This invite has been revoked." }, { status: 410 });
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return Response.json({ error: "This invite has expired." }, { status: 410 });
  }

  const orgId   = invite.organization.id;
  const orgSlug = invite.organization.slug;

  // ── 4. claim mode → hand off to the existing name-match claim flow ────────
  // We validated expiry/revoke above, so a dead claim link is rejected before
  // the user is sent to /pending-access. We write nothing here.
  if (invite.mode === "claim") {
    return Response.json({ ok: true, mode: "claim", orgSlug });
  }

  // ── 5. open mode ──────────────────────────────────────────────────────────
  // A Google account maps to one Brother globally (authUserId @unique). If one
  // already exists, REUSE it and just add a Membership to this org (the
  // multi-org pattern from org-service). Otherwise create a fresh Brother.
  //
  // The name is parsed HERE, before the reuse branch — the join form asks every
  // redeemer for one, and it's the name they want *in this org*. It used to be
  // read only inside the create branch, so an existing member joining a second
  // org had what they typed silently discarded. It now always lands on their
  // Membership for this org (below), which is what makes per-org names work.
  const name = String(body.name ?? "").trim();
  if (!name) return Response.json({ error: "Name is required" }, { status: 400 });

  const existing = await prisma.brother.findUnique({
    where: { authUserId: user.id },
    select: { id: true },
  });

  let brotherId: number;
  let reused: boolean;

  if (existing) {
    brotherId = existing.id;
    reused = true;
  } else {
    const { avatarUrl } = parseAvatarFromMetadata(user.user_metadata);
    try {
      const created = await db(orgId).brother.create({
        data: {
          name,
          role:         "Brother",
          attendance:   0,
          duesOwed:     0,
          gpa:          0,
          serviceHours: 0,
          isAdmin:      false,
          isGhost:      false,
          authUserId:   user.id,
          avatarUrl,
          email:        user.email ?? null,
        },
      });
      brotherId = created.id;
      reused = false;
    } catch (e) {
      // Concurrent redeem race: another tab created the Brother first. Fall
      // back to the reuse path rather than erroring.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const now = await prisma.brother.findUnique({ where: { authUserId: user.id }, select: { id: true } });
        if (!now) {
          logError(e, { route: "/api/auth/redeem-invite", method: "POST", userId: user.id, extra: { stage: "create_race", orgId } });
          return Response.json({ error: "Failed to join. Please try again." }, { status: 500 });
        }
        brotherId = now.id;
        reused = true;
      } else {
        logError(e, { route: "/api/auth/redeem-invite", method: "POST", userId: user.id, extra: { stage: "create_brother", orgId } });
        return Response.json({ error: "Failed to join. Please try again." }, { status: 500 });
      }
    }
  }

  // ── 6. Membership (idempotent) — plain member, no admin ───────────────────
  // `name` lands here, not on the Brother row: it's this person's identity in
  // THIS org, so a member reusing an existing account keeps whatever their other
  // orgs call them. Set on update too — re-redeeming with a different name is a
  // rename, and it must not be a silent no-op the way the old `update: {}` was.
  try {
    await prisma.membership.upsert({
      where:  { brotherId_organizationId: { brotherId, organizationId: orgId } },
      create: { brotherId, organizationId: orgId, isOrgAdmin: false, name },
      update: { name },
    });
  } catch (e) {
    logError(e, { route: "/api/auth/redeem-invite", method: "POST", userId: user.id, extra: { stage: "membership", orgId } });
    return Response.json({ error: "Failed to join. Please try again." }, { status: 500 });
  }

  // ── 7. Record the redemption (idempotent on re-click) ─────────────────────
  await prisma.inviteRedemption.upsert({
    where:  { inviteId_brotherId: { inviteId: invite.id, brotherId } },
    create: { inviteId: invite.id, brotherId },
    update: {},
  }).catch(e => logError(e, { route: "/api/auth/redeem-invite", method: "POST", userId: user.id, extra: { stage: "redemption", orgId } }));

  await logActivity({
    actorId: brotherId,
    type:    "success",
    message: `${user.email ?? "A new member"} joined via invite link`,
    orgId,
  });
  void emitRedeemEvent(orgId, invite.id, brotherId, invite.mode, reused);

  return claimedResponse(orgId, { mode: "open", orgSlug });
}
