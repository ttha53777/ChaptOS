import { db } from "@/lib/db";
import { logError } from "@/lib/observability";

export type ActivityType = "success" | "warning" | "info";

interface LogActivityArgs {
  actorId: number | null;
  type: ActivityType;
  message: string;
  orgId: number;
}

export async function logActivity({ actorId, type, message, orgId }: LogActivityArgs): Promise<void> {
  try {
    await db(orgId).activityLog.create({
      data: { actorId: actorId ?? undefined, type, message },
    });
  } catch (e) {
    // Best-effort: activity logging must never fail the caller. Route through the
    // structured pipeline (so it lands in the same logs/Sentry as everything else)
    // instead of a bare console.error.
    logError(e, { route: "lib/activity", extra: { fn: "logActivity", orgId } });
  }
}
