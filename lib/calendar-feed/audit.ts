import type { db } from "@/lib/db";
import { legacySchedule, scheduleSchema, validDate } from "./schedule";
export type ScheduleIssueKind = "legacy-deadline" | "invalid-date" | "time-unconfirmed" | "unlinked-service" | "unlinked-party" | "invalid-due-date";
export interface ScheduleIssue {
  source: "calendar" | "service" | "party" | "task"; id: number; title: string; issue: string; blocking: boolean;
  kind: ScheduleIssueKind;
  /** Calendar rows only: what an inline "set the time" editor prefills from. */
  date?: string; time?: string | null;
}
export async function auditCalendarFeed(scoped: ReturnType<typeof db>): Promise<ScheduleIssue[]> {
  const [calendar, services, parties, tasks, org] = await Promise.all([
    scoped.calendarEvent.findMany({ select: { id: true, title: true, date: true, time: true, schedule: true, category: true } }),
    scoped.serviceEvent.findMany({ select: { id: true, title: true, calendarEventId: true } }),
    scoped.partyEvent.findMany({ select: { id: true, name: true, attendanceEventId: true } }),
    scoped.task.findMany({ where: { dueDate: { not: null } }, select: { id: true, title: true, dueDate: true } }),
    scoped.organization.findFirst({ select: { timeZone: true } }),
  ]);
  const issues: ScheduleIssue[] = [];
  for (const row of calendar) {
    if (row.category === "deadline") issues.push({ kind: "legacy-deadline", source: "calendar", id: row.id, title: row.title, issue: "Legacy deadline: review against tasks, then remove or recategorize this calendar row", blocking: true });
    else if (!validDate(row.date)) issues.push({ kind: "invalid-date", source: "calendar", id: row.id, title: row.title, issue: "Invalid date; excluded from subscription", blocking: false });
    // Only a typed time nothing can read; a readable one publishes at that time.
    else if (!scheduleSchema.safeParse(row.schedule).success && legacySchedule(row.date, row.time, org?.timeZone).issue) issues.push({ kind: "time-unconfirmed", source: "calendar", id: row.id, title: row.title, issue: "Time to be confirmed in ChaptOS; publishes all-day", blocking: false, date: row.date, time: row.time });
  }
  const calendarIds = new Set(calendar.map(row => row.id));
  for (const row of services) if (row.calendarEventId === null || !calendarIds.has(row.calendarEventId)) issues.push({ kind: "unlinked-service", source: "service", id: row.id, title: row.title, issue: "Unlinked service project; review/backfill canonical calendar event", blocking: true });
  for (const row of parties) if (row.attendanceEventId === null || !calendarIds.has(row.attendanceEventId)) issues.push({ kind: "unlinked-party", source: "party", id: row.id, title: row.name, issue: "Unlinked party; review and attach existing attendance event", blocking: true });
  for (const row of tasks) if (!validDate(row.dueDate!)) issues.push({ kind: "invalid-due-date", source: "task", id: row.id, title: row.title, issue: "Invalid due date; excluded from subscription", blocking: false });
  return issues;
}
