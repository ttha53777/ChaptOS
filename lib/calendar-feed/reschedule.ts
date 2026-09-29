import { ValidationError } from "@/lib/errors";
import { moveSchedule, scheduleSchema, scheduleTime, type Schedule } from "./schedule";

/**
 * A writer changed only the date (party/service editors, date pickers, AI
 * proposals). Without this the `calendar_schedule_invalidate` trigger nulls the
 * structured schedule and a 7pm event silently publishes as all-day. Keep the
 * local start/end times on the new date instead. Undefined when there is no
 * structured schedule to carry; server-only (imports lib/errors).
 */
export function followDateChange(saved: unknown, date: string): { schedule: Schedule; time: string | null } | undefined {
  const parsed = scheduleSchema.safeParse(saved);
  if (!parsed.success) return undefined;
  const moved = moveSchedule(parsed.data, date);
  if (!moved) throw new ValidationError(`This event's time doesn't exist on ${date} (a daylight-saving change). Set its start and end times for the new date.`);
  return { schedule: moved, time: scheduleTime(moved) };
}
