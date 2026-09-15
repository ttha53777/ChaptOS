import { NextRequest } from "next/server";
import { getJoinSession } from "@/lib/auth/join-session";
import { resolveJoinViewer } from "@/lib/auth/join-viewer";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { logError } from "@/lib/observability";
import { resolveInviteToken, deadReasonStatus, DEAD_REASON_MESSAGE } from "@/lib/auth/invite-lookup";

export type { JoinState } from "@/lib/auth/join-state";
const headers = { "Cache-Control": "private, no-store" };

/** Public link pre-flight. Waiting clients use the smaller own-request endpoint. */
export async function GET(req: NextRequest) {
  const limit = rateLimit(`invite-status-ip:${clientIp(req)}`, 120, 60_000);
  if (!limit.ok) return tooManyRequests(limit);
  const token = req.nextUrl.searchParams.get("token")?.trim() ?? "";
  try {
    const lookup = await resolveInviteToken(token);
    const session = await getJoinSession();
    const viewer = lookup.invite && session
      ? await resolveJoinViewer(lookup.invite.orgId, session.authUserId, lookup.invite.id)
      : null;
    const org = lookup.invite ? {
      name: lookup.invite.orgName, slug: lookup.invite.orgSlug, logoUrl: lookup.invite.orgLogoUrl,
    } : null;
    // Decisions and access survive dead links; a rejected request only blocks
    // its own link. A replacement must still be valid before showing the form.
    if (!lookup.ok && (!viewer || viewer.state === "ready")) {
      return Response.json({ valid: false, reason: lookup.reason, message: DEAD_REASON_MESSAGE[lookup.reason], org, account: session?.account ?? null }, { status: deadReasonStatus(lookup.reason), headers });
    }
    return Response.json({ valid: true, state: viewer?.state ?? "guest", submittedName: viewer?.submittedName ?? null, org, account: session?.account ?? null }, { headers });
  } catch (e) {
    logError(e, { route: "/api/auth/invite-status", method: "GET" });
    return Response.json({ error: "Couldn't check this invite." }, { status: 500, headers });
  }
}
