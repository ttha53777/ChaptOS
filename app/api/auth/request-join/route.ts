import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { parseAvatarFromMetadata } from "@/lib/avatar";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { logError } from "@/lib/observability";
import { deadReasonStatus } from "@/lib/auth/invite-lookup";
import { submitJoinRequest } from "@/lib/auth/join-request-submit";
import { submitJoinRequestInput } from "@/lib/validation/join-request";

/**
 * Ask to join an org. Replaces POST /api/auth/redeem-invite.
 *
 * Still pre-auth — the caller has a Supabase session but no membership anywhere,
 * so there is no RequestContext to build and the token is the org resolution.
 * What changed is what it WRITES: a JoinRequest that an officer reviews, not a
 * Membership. Holding the link is no longer access.
 *
 * That also means this route no longer touches billing. The seat check moved to
 * approval (lib/services/join-request-service.ts), where a real ctx exists — so
 * the awaited reconcileSeats dance the old route needed, and its long comment
 * about serverless instances freezing before fire-and-forget work finished, are
 * both gone.
 */
export async function POST(req: NextRequest) {
  // ── Session ───────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // ── Rate limit (per-user + per-IP) ────────────────────────────────────────
  const perUser = rateLimit(`join-req:${user.id}`, 5, 60_000);
  if (!perUser.ok) return tooManyRequests(perUser);
  const perIp = rateLimit(`join-req-ip:${clientIp(req)}`, 20, 60_000);
  if (!perIp.ok) return tooManyRequests(perIp);

  const body = await req.json().catch(() => ({}));
  const parsed = submitJoinRequestInput.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    const { avatarUrl } = parseAvatarFromMetadata(user.user_metadata);
    const outcome = await submitJoinRequest(parsed.data.token, parsed.data.name, {
      authUserId: user.id,
      email:      user.email ?? null,
      avatarUrl,
    });

    switch (outcome.state) {
      case "pending":
      case "already_member":
        return Response.json({ ok: true, state: outcome.state, orgSlug: outcome.orgSlug });

      case "rejected":
        // 403, not 410: the LINK is fine, this person specifically was declined.
        return Response.json({
          error: "Your request to join wasn't approved. Ask an organizer for a new invite link.",
          state: "rejected",
        }, { status: 403 });

      case "full":
        return Response.json({ error: outcome.message, state: "full" }, { status: 410 });

      case "dead":
        return Response.json(
          { error: outcome.message, reason: outcome.reason },
          { status: deadReasonStatus(outcome.reason) },
        );
    }
  } catch (e) {
    logError(e, {
      route: "/api/auth/request-join", method: "POST", userId: user.id,
    });
    return Response.json({ error: "Couldn't send your request. Please try again." }, { status: 500 });
  }
}
