import { getJoinSession } from "@/lib/auth/join-session";
import { listOwnJoinRequests } from "@/lib/auth/own-join-status";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { toResponse } from "@/lib/errors";

export async function GET() {
  try {
    const session = await getJoinSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const limit = rateLimit(`own-join-requests:${session.authUserId}`, 20, 60_000);
    if (!limit.ok) return tooManyRequests(limit);
    return Response.json(await listOwnJoinRequests(session.authUserId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return toResponse(e); }
}
