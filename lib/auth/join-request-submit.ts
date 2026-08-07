/**
 * Filing a join request — the pre-auth half of the invite flow.
 *
 * Sits beside lib/auth/invite-lookup.ts and shares its premise: the person doing
 * this has a Supabase session but no membership anywhere, so there is no
 * RequestContext to build and the TOKEN is the org resolution. Same posture as
 * the other bootstrap paths (/api/orgs provisioning).
 *
 * Uses prismaPrivileged throughout, and that is not optional. JoinRequest ships
 * with an enforcing `org_isolation` policy and no permissive fallback (Phase 4),
 * so a plain app-role read with no `app.org_id` set returns [] SILENTLY rather
 * than erroring. Here that empty result would read as "this person has no
 * existing request" and mint a duplicate on every page reload — or worse, hand a
 * rejected person a fresh pending row by reloading the same dead link.
 *
 * The order of the checks below is load-bearing; see submitJoinRequest.
 */

import { prismaPrivileged } from "@/lib/prisma-privileged";
import { randomUUID } from "node:crypto";
import { resolveInviteToken, DEAD_REASON_MESSAGE, type InviteDeadReason } from "@/lib/auth/invite-lookup";
import { JoinRequestStatus } from "@/lib/state";
import { logError } from "@/lib/observability";

/** What the join screen should show after a submit attempt. */
export type SubmitOutcome =
  /** Request filed (or an existing pending one left alone). Show the waiting screen. */
  | { ok: true; state: "pending"; orgSlug: string }
  /** They already belong here. Show the door, not the form. */
  | { ok: true; state: "already_member"; orgSlug: string }
  /** Previously declined, and this is the same link. Dead end. */
  | { ok: false; state: "rejected"; orgSlug: string }
  /** Link is revoked / expired / exhausted / unknown. */
  | { ok: false; state: "dead"; reason: InviteDeadReason; message: string; orgSlug: string | null }
  /** The link's use cap is already spoken for. */
  | { ok: false; state: "full"; message: string; orgSlug: string };

export interface Submitter {
  authUserId: string;
  email:      string | null;
  avatarUrl:  string | null;
}

const FULL_MESSAGE =
  "This invite link has reached the number of people it was set to admit. "
  + "Ask an organizer to send you your own.";

/**
 * File (or revive) a request to join the org this token names.
 *
 * Check order mirrors the reasoning redeem-invite used to carry, because the
 * same traps are still here:
 *
 *   1. Already a member  — answered FIRST, before the dead-link gate. Someone who
 *      already has access should be told so and sent to the org, not handed
 *      "this link expired" for a link that has nothing left to do for them.
 *   2. Existing request  — a pending one is returned untouched. NOT updated with
 *      the name they retyped: that is exactly the silent-rename bug redeem-invite
 *      had, where resubmitting a form you shouldn't have been shown overwrote
 *      your display name.
 *   3. Dead-link gate    — only now, once we know this link still has a job to do.
 *   4. Cap               — redemptions + people already queued.
 */
export async function submitJoinRequest(
  token: string,
  name: string,
  who: Submitter,
): Promise<SubmitOutcome> {
  const lookup = await resolveInviteToken(token);
  if (!lookup.invite) {
    return {
      ok: false, state: "dead", reason: "not_found",
      message: DEAD_REASON_MESSAGE.not_found, orgSlug: null,
    };
  }

  const { id: inviteId, orgId, orgSlug } = lookup.invite;

  // ── 1. Already on this roster? ────────────────────────────────────────────
  const brother = await prismaPrivileged.brother.findUnique({ // lint-direct-prisma:ignore pre-auth; no org context exists yet
    where:  { authUserId: who.authUserId },
    select: { id: true },
  });
  if (brother) {
    const membership = await prismaPrivileged.membership.findUnique({ // lint-direct-prisma:ignore pre-auth bootstrap
      where:  { brotherId_organizationId: { brotherId: brother.id, organizationId: orgId } },
      select: { id: true },
    });
    if (membership) return { ok: true, state: "already_member", orgSlug };
  }

  // ── 2. Do they already have a request here? ───────────────────────────────
  const existing = await prismaPrivileged.joinRequest.findUnique({ // lint-direct-prisma:ignore pre-auth; RLS-enforcing table, no app.org_id
    where:  { organizationId_authUserId: { organizationId: orgId, authUserId: who.authUserId } },
    select: { id: true, status: true, inviteId: true },
  });

  if (existing?.status === JoinRequestStatus.Pending) {
    // Idempotent. Their name is NOT rewritten — see the header.
    return { ok: true, state: "pending", orgSlug };
  }

  if (existing?.status === JoinRequestStatus.Rejected && existing.inviteId === inviteId) {
    // Declined, and they came back through the very same link. This is the whole
    // point of keeping the row: reloading a dead link can't re-queue them.
    return { ok: false, state: "rejected", orgSlug };
  }

  // Falling through here means one of:
  //   * no request yet
  //   * rejected, but through a DIFFERENT link — an officer chose to send them a
  //     new one, which is precisely how someone gets a second chance
  //   * approved, but the membership check above found nothing, so they were
  //     removed from the roster since. Treat as a fresh ask.

  // ── 3. Dead-link gate ─────────────────────────────────────────────────────
  if (!lookup.ok) {
    return {
      ok: false, state: "dead", reason: lookup.reason,
      message: DEAD_REASON_MESSAGE[lookup.reason], orgSlug,
    };
  }

  // ── 4. Cap ────────────────────────────────────────────────────────────────
  // Counts people already admitted PLUS people already queued, so a link capped
  // at 25 can't accumulate 200 pending rows for an officer to wade through.
  // Still deliberately SOFT — the count is read here and the write happens below,
  // so simultaneous submissions can both pass. Hardening it needs a serializable
  // transaction, and the officer reviewing the queue is the real gate anyway.
  const invite = await prismaPrivileged.orgInvite.findUnique({ // lint-direct-prisma:ignore pre-auth; token IS the org resolution
    where:  { id: inviteId },
    select: { maxUses: true },
  });
  if (invite?.maxUses != null) {
    const [redeemed, queued] = await Promise.all([
      prismaPrivileged.inviteRedemption.count({ where: { inviteId } }), // lint-direct-prisma:ignore pre-auth
      prismaPrivileged.joinRequest.count({ where: { inviteId, status: JoinRequestStatus.Pending } }), // lint-direct-prisma:ignore pre-auth
    ]);
    if (redeemed + queued >= invite.maxUses) {
      return { ok: false, state: "full", message: FULL_MESSAGE, orgSlug };
    }
  }

  // ── 5. File it ────────────────────────────────────────────────────────────
  // Upsert on (organizationId, authUserId): the unique key is what makes the
  // rejected-then-new-link case a revival rather than a second row, and what
  // makes a double-submit race land on one row instead of a 500.
  await prismaPrivileged.joinRequest.upsert({ // lint-direct-prisma:ignore pre-auth; RLS-enforcing table, no app.org_id
    where:  { organizationId_authUserId: { organizationId: orgId, authUserId: who.authUserId } },
    create: {
      organizationId: orgId,
      inviteId,
      authUserId:     who.authUserId,
      email:          who.email,
      avatarUrl:      who.avatarUrl,
      name,
      status:         JoinRequestStatus.Pending,
    },
    update: {
      // Reviving a rejected (or orphaned-approved) row. Everything the officer
      // reads is refreshed, including createdAt — the queue sorts oldest-first,
      // and a months-old rejected row must not jump the line on revival.
      inviteId,
      email:     who.email,
      avatarUrl: who.avatarUrl,
      name,
      status:    JoinRequestStatus.Pending,
      createdAt: new Date(),
      decidedAt:   null,
      decidedById: null,
      brotherId:   null,
    },
  });

  await recordSubmitted(orgId, inviteId, name);
  return { ok: true, state: "pending", orgSlug };
}

/**
 * Structured event for the submission. Written directly rather than through
 * emit(): there is no ctx here, so there is no handler dispatch to hook — same
 * as the claim/redeem routes did.
 *
 * AWAITED, not fire-and-forget, for the reason the old redeem-invite route gave
 * about its own seat sync: on serverless the instance may freeze the moment the
 * response is returned, so `void`-ed work simply never finishes and the event is
 * silently lost. It also can't be allowed to outlive the request — an unawaited
 * INSERT racing whatever runs next is exactly how this destabilized the test
 * suite, failing unrelated files with foreign-key errors.
 *
 * Swallowing the error keeps the original guarantee: telemetry must never break
 * a join.
 */
async function recordSubmitted(orgId: number, inviteId: number, name: string): Promise<void> {
  try {
    await prismaPrivileged.operationalEvent.create({ // lint-direct-prisma:ignore pre-auth telemetry
      data: {
        organizationId: orgId,
        requestId:      randomUUID(),
        // No actorId: the submitter has no Brother row, which is the point.
        actorId:        null,
        action:         "join_request.submitted",
        subjectType:    "OrgInvite",
        subjectId:      inviteId,
        metadata:       { name, inviteId, orgId },
      },
    });
  } catch (e) {
    logError(e, { route: "lib/auth/join-request-submit", method: "POST", extra: { stage: "telemetry", orgId } });
  }
}
