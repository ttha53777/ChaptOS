import { timingSafeEqual } from "node:crypto";
import { flushPush } from "@/lib/push/sender";
import { logError } from "@/lib/observability";

// GET /api/cron/push — the push outbox sweep (vercel.json, daily on the Hobby
// plan). Normal sends go out right after the request that queued them; this
// retries leftovers, drops expired ones, and checks Expo receipts so dead
// tokens get pruned. Vercel sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret ?? ""}`;
  if (!secret || given.length !== want.length || !timingSafeEqual(Buffer.from(given), Buffer.from(want))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return Response.json(await flushPush(2000));
  } catch (e) {
    logError(e, { route: "/api/cron/push", method: "GET" });
    return Response.json({ error: "Push sweep failed" }, { status: 500 });
  }
}
