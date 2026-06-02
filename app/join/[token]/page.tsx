import { prisma } from "@/lib/prisma"; // lint-modules:ignore (public pre-auth page; no ctx — redeemer may not be a member)
import { JoinClient } from "./JoinClient";

// Public invite landing page. A server component resolves the token to its org
// (name + mode + validity) so we can render "Join <Org>" before any auth, then
// hands off to the client child which drives Google OAuth + redemption. The
// token never leaves the URL; redemption happens via POST /api/auth/redeem-invite.

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const invite = await prisma.orgInvite.findUnique({
    where: { token },
    select: {
      mode: true,
      expiresAt: true,
      revokedAt: true,
      organization: { select: { name: true } },
    },
  });

  const valid =
    !!invite &&
    !invite.revokedAt &&
    (!invite.expiresAt || invite.expiresAt > new Date());

  return (
    <JoinClient
      token={token}
      valid={valid}
      orgName={invite?.organization.name ?? null}
      mode={invite?.mode === "claim" ? "claim" : "open"}
    />
  );
}
