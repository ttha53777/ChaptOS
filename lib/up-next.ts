/**
 * What the dashboard's Up next card shows, worked out from the calendar list
 * the page already holds: the next event, the few after it, how far off it is,
 * the facts worth knowing before you go, and the agenda it was seeded with.
 *
 * Nothing here is invented: facts come from the event's More details (already
 * stripped to the member copy server-side), the agenda from `notesSeed`, and
 * there is no RSVP count because the app keeps none. Pure and client-safe.
 *
 * The rules that need no time zone live in lib/dashboard/up-next (the native app
 * runs them too); this file adds the ones that read a schedule through Temporal.
 */
import type { CalendarEvent } from "@/lib/api-types";
import { countdownFrom, daysBetween, type Countdown } from "@/lib/dashboard/up-next";
import { compareEvents, isEventOver, startInstant } from "@/lib/event-time";

export {
  AGENDA_PREVIEW, MAX_FACTS, MAX_STRIP_DAYS, agendaPreview, daysBetween, factsOf, untilLabel, whenLabel,
  type Countdown, type Fact,
} from "@/lib/dashboard/up-next";

/**
 * Events still to come, soonest first. The event with a check-in window open
 * is left out: the live band at the top of the dashboard carries it, so Up next
 * moves on to the one after.
 */
export function upcoming(events: CalendarEvent[], today: string, now: Date, liveEventId?: number | null): CalendarEvent[] {
  return events
    .filter(e => e.date >= today && !isEventOver(e, now) && e.id !== liveEventId)
    .sort(compareEvents);
}

/** The most recent event that has finished, and how many days ago it was. */
export function lastPast(events: CalendarEvent[], today: string, now: Date): { event: CalendarEvent; daysAgo: number } | null {
  const past = events.filter(e => e.date <= today && isEventOver(e, now)).sort(compareEvents);
  const event = past[past.length - 1];
  return event ? { event, daysAgo: Math.max(0, daysBetween(event.date, today)) } : null;
}

export function countdown(event: CalendarEvent, today: string, now: Date): Countdown {
  return countdownFrom(event.date, daysBetween(today, event.date) <= 0 ? startInstant(event) : null, today, now);
}
