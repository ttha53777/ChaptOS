/**
 * What the dashboard's Up next card shows, worked out from the calendar list
 * the page already holds: the next event, the few after it, how far off it is,
 * the facts worth knowing before you go, and the agenda it was seeded with.
 *
 * Nothing here is invented: facts come from the event's More details (already
 * stripped to the member copy server-side), the agenda from `notesSeed`, and
 * there is no RSVP count because the app keeps none. Pure and client-safe.
 */
import type { CalendarEvent } from "@/lib/api-types";
import { agendaSections, bulletOf, checkOf } from "@/lib/agenda-template";
import { GUEST_LABEL, collabText, parseEventDetails, type DetailType, type EventDetail } from "@/lib/event-details";
import { compareEvents, isEventOver, startInstant } from "@/lib/event-time";

/** Whole calendar days from `from` to `to` ("YYYY-MM-DD"). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

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

/** The longest run the day strip draws (today plus six); further off is just a number. */
export const MAX_STRIP_DAYS = 6;

export type Countdown =
  /** Another day. `strip` is every date from today to the event, when it's close enough to draw. */
  | { kind: "days"; days: number; strip: string[] | null }
  /** Today. `minutes` until it starts; null when it has no start time; ≤ 0 once it has begun. */
  | { kind: "today"; minutes: number | null };

export function countdown(event: CalendarEvent, today: string, now: Date): Countdown {
  const days = daysBetween(today, event.date);
  if (days <= 0) {
    const start = startInstant(event);
    return { kind: "today", minutes: start ? Math.ceil((start.getTime() - now.getTime()) / 60_000) : null };
  }
  if (days > MAX_STRIP_DAYS) return { kind: "days", days, strip: null };
  const base = Date.parse(`${today}T00:00:00Z`);
  const strip = Array.from({ length: days + 1 }, (_, i) => new Date(base + i * 86_400_000).toISOString().slice(0, 10));
  return { kind: "days", days, strip };
}

/** "3h 40m", "45m", "2h": the time until a start, never below a minute. */
export function untilLabel(minutes: number): string {
  const m = Math.max(1, minutes);
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
}

export interface Fact {
  kind: DetailType;
  label: string;
  value: string;
  /** Something a member can still act on (an unclaimed supply). */
  open?: boolean;
}

/** The kinds worth a chip before you go, in the order they read. Planning and
 *  contact details live in the event's own rail, not on the dashboard. */
const FACT_ORDER: DetailType[] = ["dress", "theme", "guests", "capacity", "collabs", "supplies", "directions"];
export const MAX_FACTS = 4;

function factOf(d: EventDetail): Fact | null {
  switch (d.type) {
    case "dress": {
      if (!d.pick) return null;
      const value = d.pick === "Theme" && d.note.trim() ? `Theme · ${d.note.trim()}` : d.pick;
      return { kind: d.type, label: "Wear", value };
    }
    case "theme":    return d.text.trim() ? { kind: d.type, label: "Theme", value: d.text.trim() } : null;
    case "guests":   return { kind: d.type, label: "Guests", value: d.mode === "plus" ? `+${d.plus} each` : d.mode === "members" ? "Members only" : GUEST_LABEL[d.mode].b };
    case "capacity": return { kind: d.type, label: "Capacity", value: String(d.cap) };
    case "collabs":  { const t = collabText(d); return t ? { kind: d.type, label: "With", value: t } : null; }
    case "supplies": {
      const n = d.items.length;
      if (!n) return null;
      const open = d.items.filter(i => i.who == null).length;
      return open
        ? { kind: d.type, label: "Bring", value: `${open} of ${n} unclaimed`, open: true }
        : { kind: d.type, label: "Bring", value: `all ${n} claimed` };
    }
    case "directions":
      return d.code.trim() || d.text.trim() ? { kind: d.type, label: "Getting there", value: d.code.trim() ? "door code set" : "see directions" } : null;
    default:
      return null;
  }
}

/** Up to four facts from an event's More details, filled ones only. */
export function factsOf(details: unknown): Fact[] {
  const list = parseEventDetails(details);
  const out: Fact[] = [];
  for (const kind of FACT_ORDER) {
    const d = list.find(x => x.type === kind);
    const f = d ? factOf(d) : null;
    if (f) out.push(f);
    if (out.length === MAX_FACTS) break;
  }
  return out;
}

export const AGENDA_PREVIEW = 3;

/**
 * The first few agenda items of the notes a meeting was seeded with: its
 * section headings, or its checklist / bullet lines when it has none.
 */
export function agendaPreview(notesSeed: string | null | undefined): { items: string[]; more: number } | null {
  const body = notesSeed?.trim();
  if (!body) return null;
  let items = agendaSections(body);
  if (!items.length) {
    items = body.split("\n").map(l => (checkOf(l)?.text ?? bulletOf(l)?.text ?? "").trim()).filter(Boolean);
  }
  if (!items.length) return null;
  return { items: items.slice(0, AGENDA_PREVIEW), more: Math.max(0, items.length - AGENDA_PREVIEW) };
}
