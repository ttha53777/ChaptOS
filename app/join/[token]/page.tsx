import { resolveInviteToken } from "@/lib/auth/invite-lookup";
import { JoinClient } from "./JoinClient";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lookup = await resolveInviteToken(token);
  return <JoinClient token={token} valid={lookup.ok} reason={lookup.ok ? null : lookup.reason}
    orgName={lookup.invite?.orgName ?? null} orgLogoUrl={lookup.invite?.orgLogoUrl ?? null} />;
}
