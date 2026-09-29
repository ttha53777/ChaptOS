import { z } from "zod";
import { zoneSchema } from "@/lib/calendar-feed/schedule";
export const feedCredentialsInput = z.object({ publicId: z.uuid(), secret: z.string().regex(/^[A-Za-z0-9_-]{43}\.ics$/).transform(s => s.slice(0, -4)) });
export const manageCalendarFeedInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enable") }),
  z.object({ action: z.literal("disable") }),
  z.object({ action: z.literal("rotate") }),
  z.object({ action: z.literal("timeZone"), timeZone: zoneSchema }),
]);
