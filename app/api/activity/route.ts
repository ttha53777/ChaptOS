import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { checkMutationRate } from "@/lib/rate-limit";

const TYPES = ["success", "warning", "info"] as const;

function relativeTime(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60)  return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const logs = await prisma.activityLog.findMany({
      orderBy: { timestamp: "desc" },
      take: 20,
    });
    return Response.json(logs.map(l => ({ ...l, timestamp: relativeTime(l.timestamp) })));
  } catch (e) {
    console.error("GET /api/activity failed:", e);
    return Response.json({ error: "Failed to fetch activity" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const limited = checkMutationRate(user.id);
  if (limited) return limited;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const type = typeof body.type === "string" ? body.type : "";

  if (!message) return Response.json({ error: "message is required" }, { status: 400 });
  if (message.length > 500) return Response.json({ error: "message too long" }, { status: 400 });
  if (!(TYPES as readonly string[]).includes(type)) {
    return Response.json({ error: "type must be success, warning, or info" }, { status: 400 });
  }

  try {
    const log = await prisma.activityLog.create({
      data: { message, type, actorId: user.id },
    });
    return Response.json(
      { id: log.id, message: log.message, type: log.type, timestamp: relativeTime(log.timestamp) },
      { status: 201 },
    );
  } catch (e) {
    console.error("POST /api/activity failed:", e);
    return Response.json({ error: "Failed to create activity log" }, { status: 500 });
  }
}
