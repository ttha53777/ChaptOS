import { db } from "@/lib/db";

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
    console.error("logActivity failed:", e);
  }
}
