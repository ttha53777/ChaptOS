import { NextRequest } from "next/server";
import { getJoinSession } from "@/lib/auth/join-session";
import { ownJoinStatus } from "@/lib/auth/own-join-status";
import { ownJoinStatusInput } from "@/lib/validation/join-request";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { toResponse } from "@/lib/errors";
import { logError, logTiming } from "@/lib/observability";

/** Bootstrap read: the applicant has an account but no member ctx yet. */
export async function GET(req: NextRequest) {
  const started = performance.now();
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const session = await getJoinSession();
    if (!session) return Response.json({ error: "Sign in again to check your request." }, { status: 401, headers });
    const limit = rateLimit(`own-join-status:${session.authUserId}`, 30, 60_000);
    if (!limit.ok) return tooManyRequests(limit);
    const { slug } = ownJoinStatusInput.parse({ slug: req.nextUrl.searchParams.get("slug") });
    const status = await ownJoinStatus(session.authUserId, slug);
    if (!status) return Response.json({ error: "No request found for this account." }, { status: 404, headers });
    return Response.json({ ...status, account: session.account }, { headers });
  } catch (e) {
    logError(e, { route: "/api/auth/join-status", method: "GET" });
    return toResponse(e);
  } finally {
    if (process.env.PERF_INSTRUMENT === "1") logTiming({ route: "/api/auth/join-status", method: "GET", extra: { durationMs: performance.now() - started } });
  }
}
