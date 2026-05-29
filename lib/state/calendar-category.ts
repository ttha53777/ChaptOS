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
