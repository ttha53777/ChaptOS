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
import { resolveInviteToken, deadReasonStatus, DEAD_REASON_MESSAGE } from "@/lib/auth/invite-lookup";
import { AT_CAPACITY_PUBLIC_MESSAGE, checkSeatAvailable } from "@/lib/billing/guard";
import { reconcileSeats } from "@/lib/billing/sync";

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

/**
 * Fire-and-forget record that the seat gate turned a redeemer away.
 *
 * The admin-side equivalent lives in brother-service and goes through emit();
 * this route has no ctx, so it writes the row directly like emitRedeemEvent
 * above. actorId is whoever tried — null when they have no Brother yet, which is
 * the common case for an invite link.
 */
async function emitSeatsBlockedEvent(
  orgId: number, brotherId: number | null, members: number, requiredTier: string, action: string,
) {
  try {
    await prisma.operationalEvent.create({
      data: {
        organizationId: orgId,
        requestId:      randomUUID(),
        actorId:        brotherId,
        action:         "billing.seats_blocked",
        subjectType:    "Subscription",
        subjectId:      orgId,
        metadata:       { members, requiredTier, action, via: "invite" },
      },
    });
  } catch {
    // Non-fatal — telemetry must not break the 402.
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

  // ── 3. Resolve the token (redeemer isn't a member yet) ────────────────────
  // Shared with GET /api/auth/invite-status so the pre-flight the join screen
  // rendered and the write it then attempts can never disagree.
  const lookup = await resolveInviteToken(token);
  if (!lookup.invite) {
    return Response.json({ error: DEAD_REASON_MESSAGE.not_found }, { status: 404 });
  }

  const orgId   = lookup.invite.orgId;
  const orgSlug = lookup.invite.orgSlug;
  const mode    = lookup.invite.mode;
  const inviteId = lookup.invite.id;

  // ── 4. Already in this org? ───────────────────────────────────────────────
  // Answered BEFORE the dead-link gate on purpose: someone who already has
  // access should be told so and sent to the org, not handed "this link
  // expired" for a link that has nothing left to do for them.
  //
  // This is also what stops the silent rename. This path used to fall straight
  // through to the membership upsert below, whose `update: { name }` quietly
  // overwrote the person's org display name with whatever they retyped on a
  // form they shouldn't have been shown. Now it writes nothing at all.
  const existing = await prisma.brother.findUnique({
    where:  { authUserId: user.id },
    select: { id: true },
  });
  if (existing) {
    const membership = await prisma.membership.findUnique({
      where:  { brotherId_organizationId: { brotherId: existing.id, organizationId: orgId } },
      select: { id: true },
    });
    if (membership) {
      return claimedResponse(orgId, { mode, orgSlug, alreadyMember: true });
    }
  }

  // ── 5. Dead-link gate ─────────────────────────────────────────────────────
  // Covers revoked, expired, and (new) exhausted — maxUses. The cap is soft:
  // the count is read here and the write happens below, so two simultaneous
  // redemptions can both pass. Hardening it would take a serializable
  // transaction or a counter column, and over-admitting a person or two on a
  // rush link isn't worth either.
  if (!lookup.ok) {
    return Response.json(
      { error: DEAD_REASON_MESSAGE[lookup.reason], reason: lookup.reason },
      { status: deadReasonStatus(lookup.reason) },
    );
  }

  // ── 6. claim mode → hand off to the existing name-match claim flow ────────
  // ONLY for genuinely new accounts. Brother.authUserId is unique globally, so
  // a user who already owns a Brother row can never be linked to a second one:
  // /api/auth/claim answers them 409 "already linked to a brother" every time,
  // and /pending-access offers nothing but a Sign out button. Routing them
  // there was a guaranteed dead end, so they take the membership path below
  // instead. Their roster entry in this org stays unclaimed for an officer to
  // reconcile — the honest Phase 1 outcome, and the join screen says as much.
  if (mode === "claim" && !existing) {
    return Response.json({ ok: true, mode: "claim", orgSlug });
  }

  // ── 6b. Seat gate ─────────────────────────────────────────────────────────
  // Reaching here means a NEW membership in this org — step 4 already returned
  // for anyone who belongs — so this redemption is a billable seat.
  //
  // The message is deliberately generic (AT_CAPACITY_PUBLIC_MESSAGE): the person
  // holding this link is not a member yet, and must not be able to read the
  // org's billing state out of an error body. The admin who shared the link sees
  // the real reason on their own billing page.
  //
  // Checked rather than thrown because this route builds its responses by hand
  // (no ctx, so no toResponse contract to honour).
  const seat = await checkSeatAvailable(db(orgId));
  if (!seat.allowed) {
    // Recorded even though the redeemer never sees why: an admin whose invite
    // link is quietly bouncing people needs this to be explicable afterwards.
    void emitSeatsBlockedEvent(orgId, existing?.id ?? null, seat.currentMembers, seat.requiredTier, seat.action ?? "checkout");
    return Response.json({ error: AT_CAPACITY_PUBLIC_MESSAGE }, { status: 402 });
  }

  // ── 7. Join by membership ─────────────────────────────────────────────────
  // A Google account maps to one Brother globally (authUserId @unique). If one
  // already exists, REUSE it — the identity is shared, and the roster spot this
  // person is about to get in this org is a separate row (step 8). Otherwise
  // create a fresh identity.
  //
  // Before Phase 2 the reuse branch was a dead end for the roster: the person got
  // access and a Membership, but the roster read scoped by Brother.organizationId,
  // so they never appeared on it. Now the Membership created below IS the roster
  // spot, which is what makes "one account, a roster place in several chapters"
  // actually work.
  //
  // The name is parsed HERE, before the reuse branch — the join form asks every
  // redeemer for one, and it's the name they want *in this org*.
  const name = String(body.name ?? "").trim();
  if (!name) return Response.json({ error: "Name is required" }, { status: 400 });

  // Guard against duplicating a roster row an officer already prepared.
  //
  // Officers can type someone onto the roster before that person ever signs in
  // (a Brother with authUserId: null plus a Membership). If the redeemer already
  // owns an account, they cannot be linked to that prepared row — Brother.authUserId
  // is globally unique and /api/auth/claim turns them away at step 4 — so joining
  // here would mint a SECOND roster spot and the chapter would show the same human
  // twice: once with their dues and GPA, once with zeros.
  //
  // Refusing is the honest outcome until the merge flow exists. The officer can
  // still let them in by deleting the prepared row first.
  if (existing) {
    const prepared = await db(orgId).member.search(name, { exact: true });
    const unclaimed = prepared.find(m => m.authUserId === null);
    if (unclaimed) {
      return Response.json({
        error: "Someone has already added you to this chapter's roster. Ask an officer to "
             + "link that entry to your account, or to remove it so you can join fresh.",
      }, { status: 409 });
    }
  }

  let brotherId: number;
  let reused: boolean;

  if (existing) {
    brotherId = existing.id;
    reused = true;
  } else {
    const { avatarUrl } = parseAvatarFromMetadata(user.user_metadata);
    try {
      const created = await db(orgId).identity.create({
        data: {
          name,
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

  // ── 8. The roster spot ────────────────────────────────────────────────────
  // The Membership IS this person's place on this org's roster, so it is created
  // with a full set of starting values — a fresh member owes nothing, has logged
  // nothing, and carries no custom field values yet. `name` lands here rather
  // than on the shared account row, so a member reusing an existing account keeps
  // whatever their other chapters call them.
  //
  // `update: { name }` is now unreachable for an existing member — step 4
  // returns before this — so it only ever fires on a genuine race where the
  // membership appeared between that check and this write. Keeping it means
  // such a race still records the name the person just typed.
  try {
    await prisma.membership.upsert({
      where:  { brotherId_organizationId: { brotherId, organizationId: orgId } },
      create: {
        brotherId, organizationId: orgId, isOrgAdmin: false, name,
        role: "Brother", attendance: 0, duesOwed: 0, gpa: 0, serviceHours: 0,
      },
      update: { name },
    });
  } catch (e) {
    logError(e, { route: "/api/auth/redeem-invite", method: "POST", userId: user.id, extra: { stage: "membership", orgId } });
    return Response.json({ error: "Failed to join. Please try again." }, { status: 500 });
  }

  // ── 9. Record the redemption (idempotent on re-click) ─────────────────────
  await prisma.inviteRedemption.upsert({
    where:  { inviteId_brotherId: { inviteId, brotherId } },
    create: { inviteId, brotherId },
    update: {},
  }).catch(e => logError(e, { route: "/api/auth/redeem-invite", method: "POST", userId: user.id, extra: { stage: "redemption", orgId } }));

  await logActivity({
    actorId: brotherId,
    type:    "success",
    message: `${user.email ?? "A new member"} joined via invite link`,
    orgId,
  });
  void emitRedeemEvent(orgId, inviteId, brotherId, mode, reused);

  // Seat sync. This route writes its OperationalEvent row directly rather than
  // through emit() (no ctx), which means no handler dispatch — so the recount
  // that lib/events/handlers/sync-seats.ts does for admin-side roster changes
  // has to be triggered explicitly here.
  //
  // AWAITED, not fire-and-forget. This used to be `void reconcileSeats(...)`,
  // which is the pattern the webhook route argues against in its own header: on
  // serverless the instance may freeze the moment the response is returned, so
  // the work simply never finishes. Here that loses the LOCAL write too, and the
  // local write is what sets seatSyncPendingAt — the durable flag the entire
  // self-healing design hangs off. Without it flushPendingSeatSync no-ops
  // forever and the only remaining net is next month's invoice.upcoming, so an
  // org that grows purely through invite links could be under-billed for a full
  // cycle with nothing anywhere recording that fact.
  //
  // Awaiting is cheap and cannot fail the join: reconcileSeats writes locally
  // before it touches the network and never throws for a Stripe-side failure.
  await reconcileSeats(db(orgId)).catch(e =>
    logError(e, { route: "/api/auth/redeem-invite", method: "POST", userId: user.id, extra: { stage: "seat_sync", orgId } }),
  );

  // Always "open" to the client: reaching here means they joined by Membership,
  // whichever mode the link carried. Only the /pending-access handoff in step 6
  // reports "claim", and the client keys its redirect off that. A claim link
  // that lands here belongs to someone the join screen already warned (its
  // "existing_account" state) that an officer must link their roster entry.
  return claimedResponse(orgId, { mode: "open", orgSlug });
}
