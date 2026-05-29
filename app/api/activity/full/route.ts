import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { logError } from "@/lib/observability";

const TYPES = ["success", "warning", "info"] as const;

export async function GET(req: NextRequest) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  if (!ctx.isPlatformAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { searchParams } = new URL(req.url);
    const typeParam = searchParams.get("type");
    const where = typeParam && (TYPES as readonly string[]).includes(typeParam)
      ? { type: typeParam }
      : {};
    const logs = await ctx.db.activityLog.findMany({
      where, orderBy: { timestamp: "desc" }, take: 500,
    });
    return Response.json(logs);
  } catch (e) {
    logError(e, { route: "/api/activity/full", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
