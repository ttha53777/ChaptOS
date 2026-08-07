import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma"; // lint-modules:ignore (pre-auth invite pre-flight; viewer has no ctx yet)
import { prismaPrivileged } from "@/lib/prisma-privileged";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { parseAvatarFromMetadata } from "@/lib/avatar";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { logError } from "@/lib/observability";
import { JoinRequestStatus } from "@/lib/state";
import {
  resolveInviteToken, deadReasonStatus, DEAD_REASON_MESSAGE,
  type InviteDeadReason,
} from "@/lib/auth/invite-lookup";

/**
 * Read-only pre-flight for the join screen. Never writes.
 *
 * /join used to know exactly two things: whether the token resolved, and
 * whether *a* session existed. That left three bad outcomes it couldn't
 * prevent:
 *
 *   1. Someone signed in as the wrong Google account joined as that account
 *      with no indication of which one — the flow never showed an identity.
 *   2. An existing member reopening a link got the full "Join <Org>" form, and
 *      submitting it silently renamed them.
 *   3. A claim-mode link sent anyone who already had a Brother row to
 *      /pending-access, where /api/auth/claim answered 409 forever.
 *
 * All three are decidable BEFORE the user does anything, so this endpoint
 * decides them and hands the screen a single `state` to render. Anything it
 * reports here, /api/auth/request-join must agree with — hence the shared
 * resolveInviteToken().
 *
 * It is also the POLLING endpoint for the waiting screen: someone sitting on
 * `pending` re-hits this until an officer's decision flips them to
 * `already_member` (approved) or `rejected`.
 */

export type JoinState =
  /** No session. Show the Google button. */
  | "guest"
  /** Signed in, no request yet: show the name form. */
  | "ready"
  /** Request filed, waiting on an officer. The locked screen. */
  | "pending"
  /** An officer declined them. Needs a fresh link to ask again. */
  | "rejected"
  /** Signed in and already in this org. Offer the door, not the form. */
  | "already_member";

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token")?.trim() ?? "";

  // Unauthenticated and token-guessable, so rate-limit by IP. Looser than the
  // submit limits: the join screen legitimately calls this on every mount, a
  // user bouncing through OAuth hits it two or three times in a minute, and the
  // waiting screen polls it every few seconds while it's open.
  const perIp = rateLimit(`invite-status-ip:${clientIp(req)}`, 120, 60_000);
  if (!perIp.ok) return tooManyRequests(perIp);

  try {
    const lookup = await resolveInviteToken(token);

    // A dead link must NOT hide a live decision. Someone who filed a request and
    // is waiting — or who was declined — still needs to see that, even if the
    // link has expired in the meantime. So resolve their state first whenever we
    // know the org, and only fall through to the dead-link screen for people who
    // have nothing pending here. Same reasoning that puts the already-member
    // check ahead of the gate in join-request-submit.
    if (!lookup.ok && lookup.invite) {
      const viewer = await resolveViewer(lookup.invite.orgId);
      if (viewer && (viewer.state === "pending" || viewer.state === "rejected" || viewer.state === "already_member")) {
        const memberCount = await countMembers(lookup.invite.orgId);
        return Response.json({
          valid: true, state: viewer.state,
          org: publicOrg(lookup.invite, memberCount), account: viewer.account,
        });
      }
    }

    if (!lookup.ok) {
      const reason: InviteDeadReason = lookup.reason;
      return Response.json({
        valid:   false,
        reason,
        message: DEAD_REASON_MESSAGE[reason],
        org:     lookup.invite ? publicOrg(lookup.invite, null) : null,
      }, { status: deadReasonStatus(reason) });
    }

    const { invite } = lookup;
    const memberCount = await countMembers(invite.orgId);
    const viewer = await resolveViewer(invite.orgId);

    if (!viewer) {
      return Response.json({
        valid: true, state: "guest" satisfies JoinState,
        org: publicOrg(invite, memberCount), account: null,
      });
    }

    return Response.json({
      valid: true, state: viewer.state,
      org: publicOrg(invite, memberCount), account: viewer.account,
    });
  } catch (e) {
    logError(e, { route: "/api/auth/invite-status", method: "GET" });
    // Fail soft: the screen falls back to its plain sign-in path rather than
    // showing a dead end for what may be a perfectly good link.
    return Response.json({ error: "Couldn't check this invite." }, { status: 500 });
  }
}

interface Viewer {
  state:   JoinState;
  account: { email: string | null; name: string | null; avatarUrl: string | null };
}

/**
 * Who is looking, and where they stand with this org. Null when signed out.
 *
 * Precedence: membership beats request. Someone approved has both a Membership
 * and an `approved` JoinRequest, and the membership is the one that matters —
 * it's also what the waiting screen polls for.
 */
async function resolveViewer(orgId: number): Promise<Viewer | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { avatarUrl } = parseAvatarFromMetadata(user.user_metadata);
  const account = {
    email:     user.email ?? null,
    name:      typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null,
    avatarUrl,
  };

  // One Google account → at most one Brother, globally (authUserId @unique).
  const brother = await prisma.brother.findUnique({
    where:  { authUserId: user.id },
    select: { id: true },
  });

  if (brother) {
    const membership = await prisma.membership.findUnique({
      where:  { brotherId_organizationId: { brotherId: brother.id, organizationId: orgId } },
      select: { id: true },
    });
    if (membership) return { state: "already_member", account };
  }

  // Privileged: JoinRequest is RLS-enforcing with no permissive policy, and this
  // viewer has no membership here, so there is no app.org_id to SET LOCAL. The
  // app role would return null silently — which would show a waiting requester
  // the join form again and let them re-submit.
  const request = await prismaPrivileged.joinRequest.findUnique({
    where:  { organizationId_authUserId: { organizationId: orgId, authUserId: user.id } },
    select: { status: true },
  });

  if (request?.status === JoinRequestStatus.Pending)  return { state: "pending",  account };
  if (request?.status === JoinRequestStatus.Rejected) return { state: "rejected", account };

  return { state: "ready", account };
}

/**
 * Roster headcount — a trust signal on a page shown before sign-in, so keep it
 * to the count and nothing more identifying.
 *
 * Counts Memberships, not Brothers. Scoping this by Brother.organizationId (as
 * it once did) undercounts every org that has multi-org members, since their
 * identity row points at whichever chapter they joined first.
 */
async function countMembers(orgId: number): Promise<number> {
  return prisma.membership.count({
    where: { organizationId: orgId, brother: { is: { isGhost: false } } },
  });
}

function publicOrg(
  invite: { orgName: string; orgSlug: string; orgLogoUrl: string | null },
  memberCount: number | null,
) {
  return {
    name: invite.orgName, slug: invite.orgSlug,
    logoUrl: invite.orgLogoUrl, memberCount,
  };
}
