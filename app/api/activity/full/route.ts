import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";

const TYPES = ["success", "warning", "info"] as const;
type ActivityType = typeof TYPES[number];

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const { searchParams } = new URL(req.url);
    const typeParam = searchParams.get("type");
    const where = typeParam && (TYPES as readonly string[]).includes(typeParam)
      ? { type: typeParam as ActivityType }
      : {};
    const logs = await prisma.activityLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: 500,
    });
    return Response.json(logs);
  } catch (e) {
    console.error("GET /api/activity/full failed:", e);
    return Response.json({ error: "Failed to fetch activity log" }, { status: 500 });
  }
}
