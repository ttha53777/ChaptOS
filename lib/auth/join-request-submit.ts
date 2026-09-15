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
import { recordJoinSubmission } from "@/lib/events/bootstrap";
import { resolveInviteToken, DEAD_REASON_MESSAGE, type InviteDeadReason } from "@/lib/auth/invite-lookup";
import { JoinRequestStatus } from "@/lib/state";
import { lockAdmissions, ADMISSION_TX_OPTIONS } from "@/lib/db/admission-lock";
import { resolveJoinViewer } from "./join-viewer";

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
  // Resolve only the boundary before locking. Re-read validity and capacity
  // under the lock: revoke or another submission may have won meanwhile.
  const boundary = await resolveInviteToken(token);
  if (!boundary.invite) return {
    ok: false, state: "dead", reason: "not_found",
    message: DEAD_REASON_MESSAGE.not_found, orgSlug: null,
  };
  const { orgId, orgSlug } = boundary.invite;
  return prismaPrivileged.$transaction(async tx => {
    await lockAdmissions(tx, orgId);
    const lookup = await resolveInviteToken(token, tx);
    if (!lookup.invite) return {
      ok: false, state: "dead", reason: "not_found",
      message: DEAD_REASON_MESSAGE.not_found, orgSlug: null,
    };
    const inviteId = lookup.invite.id;
    const viewer = await resolveJoinViewer(orgId, who.authUserId, inviteId, tx);
    if (viewer.state === "already_member" || viewer.state === "pending") {
      return { ok: true, state: viewer.state, orgSlug };
    }
    if (viewer.state === "rejected") return { ok: false, state: "rejected", orgSlug };
    if (!lookup.ok) {
      if (lookup.reason === "reserved") return { ok: false, state: "full", message: DEAD_REASON_MESSAGE.reserved, orgSlug };
      return { ok: false, state: "dead", reason: lookup.reason, message: DEAD_REASON_MESSAGE[lookup.reason], orgSlug };
    }
    const request = await tx.joinRequest.upsert({
      where: { organizationId_authUserId: { organizationId: orgId, authUserId: who.authUserId } },
      create: { organizationId: orgId, inviteId, ...who, name, status: JoinRequestStatus.Pending },
      update: {
        organizationId: orgId, inviteId, email: who.email, avatarUrl: who.avatarUrl,
        name, status: JoinRequestStatus.Pending, createdAt: new Date(),
        decidedAt: null, decidedById: null, brotherId: null,
      },
    });
    // The transition and its fact commit together. Duplicate submits return
    // above without rewriting a name, a decision, or a second event.
    await recordJoinSubmission(tx, request);
    return { ok: true, state: "pending", orgSlug };
  }, ADMISSION_TX_OPTIONS);
}
