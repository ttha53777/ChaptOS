import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { listRecentActivity } from "@/lib/services/activity-service";

const TYPES = ["success", "warning", "info"] as const;

function relativeTime(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60)   return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    return Response.json(await listRecentActivity(ctx));
  } catch (e) {
    logError(e, { route: "/api/activity", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requireOrgAdmin: true });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const type = typeof body.type === "string" ? body.type : "";

    if (!message) throw new ValidationError("message is required");
    if (message.length > 500) throw new ValidationError("message too long");
    if (!(TYPES as readonly string[]).includes(type)) {
      throw new ValidationError("type must be success, warning, or info");
    }

    const log = await ctx.db.activityLog.create({
      data: { message, type, actorId: ctx.actorId },
    });
    return Response.json(
      { id: log.id, message: log.message, type: log.type, timestamp: relativeTime(log.timestamp) },
      { status: 201 },
    );
  } catch (e) {
    logError(e, { route: "/api/activity", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
