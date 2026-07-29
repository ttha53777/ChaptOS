import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma"; // lint-modules:ignore (pre-auth invite pre-flight; viewer has no ctx yet)
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { parseAvatarFromMetadata } from "@/lib/avatar";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { logError } from "@/lib/observability";
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
 *   1. Someone signed in as the wrong Google account redeemed as that account
 *      with no indication of which one — the flow never showed an identity.
 *   2. An existing member reopening a link got the full "Join <Org>" form, and
 *      submitting it silently renamed them.
 *   3. A claim-mode link sent anyone who already had a Brother row to
 *      /pending-access, where /api/auth/claim answers 409 forever.
 *
 * All three are decidable BEFORE the user does anything, so this endpoint
 * decides them and hands the screen a single `state` to render. Anything it
 * reports here, redeem-invite must agree with — hence the shared
 * resolveInviteToken().
 */

export type JoinState =
  /** No session. Show the Google button. */
  | "guest"
  /** Signed in, not a member: the normal join. */
  | "ready"
  /** Signed in and already in this org. Offer the door, not the form. */
  | "already_member"
  /**
   * Claim-mode link, but this account already owns a Brother row (they belong
   * to another org). Brother.authUserId is globally unique, so they can never
   * be linked to a second roster row — the claim flow is structurally closed to
   * them. They join by Membership instead, which redeem-invite now handles.
   */
  | "existing_account";

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token")?.trim() ?? "";

  // Unauthenticated and token-guessable, so rate-limit by IP. Looser than the
  // redeem limits: the join screen legitimately calls this on every mount, and
  // a user bouncing through OAuth hits it two or three times in a minute.
  const perIp = rateLimit(`invite-status-ip:${clientIp(req)}`, 60, 60_000);
  if (!perIp.ok) return tooManyRequests(perIp);

  try {
    const lookup = await resolveInviteToken(token);

    // Dead link: report WHICH kind, and still name the org when we know it, so
    // the screen can say "this link to Sigma Chi expired" instead of the old
    // catch-all "invite unavailable".
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

    // Member count is a trust signal on a page shown before sign-in, so keep it
    // to the roster headcount and nothing more identifying.
    const memberCount = await prisma.brother.count({
      where: { organizationId: invite.orgId, isGhost: false },
    });

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({
        valid: true, mode: invite.mode, state: "guest" satisfies JoinState,
        org: publicOrg(invite, memberCount), account: null,
      });
    }

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

    let state: JoinState = "ready";
    if (brother) {
      const membership = await prisma.membership.findUnique({
        where:  { brotherId_organizationId: { brotherId: brother.id, organizationId: invite.orgId } },
        select: { id: true },
      });
      if (membership) state = "already_member";
      else if (invite.mode === "claim") state = "existing_account";
    }

    return Response.json({
      valid: true, mode: invite.mode, state,
      org: publicOrg(invite, memberCount), account,
    });
  } catch (e) {
    logError(e, { route: "/api/auth/invite-status", method: "GET" });
    // Fail soft: the screen falls back to its plain sign-in path rather than
    // showing a dead end for what may be a perfectly good link.
    return Response.json({ error: "Couldn't check this invite." }, { status: 500 });
  }
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
