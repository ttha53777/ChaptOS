import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logError } from "@/lib/observability";

const TYPES = ["success", "warning", "info"] as const;
type ActivityType = typeof TYPES[number];

export async function GET(req: NextRequest) {
  const { user, error } = await requireAdmin();
  if (error) return error;
  try {
    const { searchParams } = new URL(req.url);
    const typeParam = searchParams.get("type");
    const where = typeParam && (TYPES as readonly string[]).includes(typeParam)
      ? { type: typeParam as ActivityType }
      : {};
    const logs = await db(user.orgId).activityLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: 500,
    });
    return Response.json(logs);
  } catch (e) {
    logError(e, { route: "/api/activity/full", method: "GET", userId: user.id });
    return Response.json({ error: "Failed to fetch activity log" }, { status: 500 });
  }
}
