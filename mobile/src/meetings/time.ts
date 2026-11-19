/**
 * What @/lib/meetings/book takes as inputs because it needs a time zone: the web reads
 * these with Temporal (lib/event-time), the app with the ports in ~/dash/UpNextCard.
 */
import type { CalendarEvent } from "@/lib/api-types";
import { byStart, isOver, startAt, timeText } from "~/dash/UpNextCard";

export { byStart };

/** Has the meeting ended (its schedule's end, else start + an hour; untimed: the day passing). */
export const overAt = (today: string, now: number) => (e: CalendarEvent) => isOver(e, today, now);

/** "7:00 PM", the start of the meeting's time (the web's startTimeOf). */
export const startClock = (e: CalendarEvent): string | null => timeText(e)?.split(/\s*[–-]\s*/)[0] ?? null;

/** The start and end instants a timed meeting runs between (end: start + an hour when unset). */
export function spanOf(e: CalendarEvent): { start: Date | null; end: Date | null } {
  const s = e.schedule as { kind: string; start?: string; end?: string } | null | undefined;
  if (!s || s.kind !== "timed" || !s.start) return { start: null, end: null };
  const start = startAt(e);
  return { start, end: s.end ? new Date(s.end) : start ? new Date(start.getTime() + 3_600_000) : null };
}
