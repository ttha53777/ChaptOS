/**
 * The Up next card's rules that need no time zone: how far off an event is, the
 * facts worth knowing before you go, the agenda it was seeded with, and the words
 * for "when". Shared by the web card (via lib/up-next, which adds the Temporal-backed
 * ordering) and the native app (mobile/src/dash/UpNextCard), so both show the same
 * countdown, the same chips and the same "in 5 days · 9:30 AM".
 *
 * Pure: no Node, Prisma, Temporal or React (scripts/lint-mobile-imports.py, SHARED).
 */
import { agendaSections, bulletOf, checkOf } from "@/lib/agenda-template";
import { GUEST_LABEL, collabText, parseEventDetails, type DetailType, type EventDetail } from "@/lib/event-details";

/** Whole calendar days from `from` to `to` ("YYYY-MM-DD"). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Today", "Tomorrow", "in 5 days", or "Nov 28" a week or more out. */
export function whenLabel(date: string, today: string): string {
  const days = daysBetween(today, date);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `in ${days} days`;
  const d = new Date(`${date}T00:00:00Z`);
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** The longest run the day strip draws (today plus six); further off is just a number. */
export const MAX_STRIP_DAYS = 6;

export type Countdown =
  /** Another day. `strip` is every date from today to the event, when it's close enough to draw. */
  | { kind: "days"; days: number; strip: string[] | null }
  /** Today. `minutes` until it starts; null when it has no start time; ≤ 0 once it has begun. */
  | { kind: "today"; minutes: number | null };

/** The countdown for an event on `date` that starts at `start` (null: no clock time). */
export function countdownFrom(date: string, start: Date | null, today: string, now: Date): Countdown {
  const days = daysBetween(today, date);
  if (days <= 0) return { kind: "today", minutes: start ? Math.ceil((start.getTime() - now.getTime()) / 60_000) : null };
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
/** A phone (or the rail) shows the first two only. */
export const PHONE_FACTS = 2;

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
