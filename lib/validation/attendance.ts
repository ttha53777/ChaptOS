import { z } from "zod";

export const recordAttendanceInput = z.object({
  calendarEventId: z.number().int().positive(),
  attendedIds:     z.array(z.number().int().positive()),
});
export type RecordAttendanceInput = z.infer<typeof recordAttendanceInput>;
