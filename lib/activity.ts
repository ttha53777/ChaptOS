import { prisma } from "@/lib/prisma";

export type ActivityType = "success" | "warning" | "info";

interface LogActivityArgs {
  actorId: number | null;
  type: ActivityType;
  message: string;
}

export async function logActivity({ actorId, type, message }: LogActivityArgs): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: { actorId: actorId ?? undefined, type, message, organizationId: 1 },
    });
  } catch (e) {
    console.error("logActivity failed:", e);
  }
}
