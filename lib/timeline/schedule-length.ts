/**
 * How long a start/end pair runs, as the calendar-event form says it (shared by the
 * web's ScheduleFields and the app's event form). Times are "HH:MM" wall clocks; an
 * end at or before the start is on the next day.
 */
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
/** Minutes from start to end; an end at or before the start is on the next day. */
function lengthMinutes(startTime: string, endTime: string): number {
  return (mins(endTime) - mins(startTime) + 1440) % 1440 || 1440;
}

/** An overnight span over 12 hours is almost always an AM/PM slip (7pm–9am
 *  meant 7–9pm). `suggest` is the other-meridiem end when that lands later the
 *  same day. Null when the pair looks deliberate. */
export function suspectLength(startTime: string, endTime: string): { hours: number; suggest: string | null } | null {
  if (!startTime || !endTime || endTime > startTime) return null; // same-day spans are fine
  const length = lengthMinutes(startTime, endTime);
  if (length <= 12 * 60 || length === 1440) return null;
  const flipped = hhmm((mins(endTime) + 720) % 1440);
  return { hours: Math.round(length / 60), suggest: flipped > startTime ? flipped : null };
}

/** "2 hr", "1 hr 30 min", "45 min": the length of a start/end pair, overnight included. */
export function durationLabel(startTime: string, endTime: string): string {
  const total = lengthMinutes(startTime, endTime);
  const h = Math.floor(total / 60), m = total % 60;
  return [h && `${h} hr`, m && `${m} min`].filter(Boolean).join(" ");
}
