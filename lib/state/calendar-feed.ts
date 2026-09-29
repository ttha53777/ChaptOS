export const CalendarFeedSource = { Calendar: "calendar", Task: "task" } as const;
export type CalendarFeedSource = typeof CalendarFeedSource[keyof typeof CalendarFeedSource];
export const isCalendarFeedSource = (value: string): value is CalendarFeedSource => value === "calendar" || value === "task";
