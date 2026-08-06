import { resolveInviteToken } from "@/lib/auth/invite-lookup";
import { prisma } from "@/lib/prisma"; // lint-modules:ignore (public pre-auth page; no ctx — redeemer may not be a member)
import { JoinClient } from "./JoinClient";

// Public invite landing page. The server resolves the token to its org (name,
// logo, headcount, validity) so "Join <Org>" and the org's badge paint before
// any auth — an invitee's first frame should say whose door this is.
//
// The client child then calls GET /api/auth/invite-status to layer on the parts
// that depend on the browser's session (which Google account is signed in,
// whether they're already a member) and drives OAuth + redemption from there.
// The token never leaves the URL; redemption is POST /api/auth/redeem-invite.
//
// Token resolution is shared with both API routes via resolveInviteToken, so a
// link this page calls dead can't be one redeem-invite would have accepted.

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const lookup = await resolveInviteToken(token);

  // Headcount is a trust signal ("this is a real chapter"), so it's only worth
  // the query when there's a live invite to show it on.
  //
  // Counted over Memberships — the roster rows — not over Brothers homed here.
  // The old form scoped by Brother.organizationId, so it silently omitted every
  // member whose account had originated in another chapter, and disagreed with
  // the billable headcount (lib/billing/seats.ts) for the same org.
  const memberCount = lookup.ok
    ? await prisma.membership.count({
        where: { organizationId: lookup.invite.orgId, brother: { is: { isGhost: false } } },
      })
    : null;

  return (
    <JoinClient
      token={token}
      valid={lookup.ok}
      reason={lookup.ok ? null : lookup.reason}
      orgName={lookup.invite?.orgName ?? null}
      orgLogoUrl={lookup.invite?.orgLogoUrl ?? null}
      memberCount={memberCount}
      mode={lookup.invite?.mode ?? "open"}
    />
  );
}
