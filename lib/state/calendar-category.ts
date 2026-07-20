// The built-in event-type slugs. As of the per-org configurable event-types
// work, this is NOT the validation authority for CalendarEvent.category —
// valid categories are per-org rows in CalendarEventType (see lib/event-types.ts),
// and the old DB CHECK that pinned these was dropped. This constant is kept only
// for BEHAVIOR BRANCHING on the stable built-in slugs (e.g. the chapter-must-be-
// mandatory refine in lib/validation/calendar.ts, and the deadline/party
// synthesis in the timeline page). That is safe *because built-in slugs are
// immutable* — the event-type service rejects renaming a built-in's slug.
//
// social/fundy/program are gone from here: they were demoted to org-owned
// custom types (LPE vocabulary, not platform vocabulary), so nothing may
// branch on them anymore.
export const CalendarCategory = {
  Chapter:  "chapter",
  Party:    "party",
  Deadline: "deadline",
  Service:  "service",
} as const;

export type CalendarCategory = (typeof CalendarCategory)[keyof typeof CalendarCategory];

export const CALENDAR_CATEGORIES: readonly CalendarCategory[] = Object.values(CalendarCategory);

export function isCalendarCategory(value: unknown): value is CalendarCategory {
  return typeof value === "string" && (CALENDAR_CATEGORIES as readonly string[]).includes(value);
}
