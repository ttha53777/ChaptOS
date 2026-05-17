import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

function relativeTime(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60)  return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export async function GET() {
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
  try {
    const body = await req.json();
    const { message, type } = body;

    if (!message || !type) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const log = await prisma.activityLog.create({
      data: { message: String(message), type: String(type) },
    });

    return Response.json(log, { status: 201 });
  } catch (e) {
    console.error("POST /api/activity failed:", e);
    return Response.json({ error: "Failed to create activity log" }, { status: 500 });
  }
}
