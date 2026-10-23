import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { dateSchema } from "@/lib/calendar-feed/schedule";

/**
 * A repeating event, as simple as it gets: the same weekday as the first one,
 * every week or every other week, through a last day (usually the term's end).
 * There is no series row: each meeting is its own CalendarEvent, so roll,
 * minutes and details stay per meeting, and editing one never touches the rest.
 * Pure and client-safe — the form previews with it and the server creates with it.
 */
export const REPEAT_MAX = 52;

export const repeatSchema = z.object({
  every: z.union([z.literal(1), z.literal(2)]),
  until: dateSchema,
}).strict();
export type Repeat = z.infer<typeof repeatSchema>;

/** Every date from `start` stepping `every` weeks, up to and including `until`, capped at REPEAT_MAX. */
export function repeatDates(start: string, repeat: Repeat): string[] {
  const out: string[] = [];
  let d = Temporal.PlainDate.from(start);
  const last = Temporal.PlainDate.from(repeat.until);
  while (Temporal.PlainDate.compare(d, last) <= 0 && out.length < REPEAT_MAX) {
    out.push(d.toString());
    d = d.add({ weeks: repeat.every });
  }
  return out;
}
