// The 7 built-in event-type slugs. As of the per-org configurable event-types
// work, this is NO LONGER the validation authority for CalendarEvent.category —
// valid categories are per-org rows in CalendarEventType (see lib/event-types.ts),
// and the old DB CHECK that pinned these was dropped. This constant is kept only
// for BEHAVIOR BRANCHING on the stable built-in slugs (e.g. the chapter-must-be-
// mandatory refine in lib/validation/calendar.ts, and the deadline/party
// synthesis in the timeline page). That is safe *because built-in slugs are
// immutable* — the event-type service rejects renaming a built-in's slug.
export const CalendarCategory = {
  Chapter:  "chapter",
  Social:   "social",
  Fundy:    "fundy",
  Program:  "program",
  Party:    "party",
  Deadline: "deadline",
  Service:  "service",
} as const;

export type CalendarCategory = (typeof CalendarCategory)[keyof typeof CalendarCategory];

export const CALENDAR_CATEGORIES: readonly CalendarCategory[] = Object.values(CalendarCategory);

export function isCalendarCategory(value: unknown): value is CalendarCategory {
  return typeof value === "string" && (CALENDAR_CATEGORIES as readonly string[]).includes(value);
}
