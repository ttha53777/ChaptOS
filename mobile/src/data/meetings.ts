/**
 * Meetings data. Meetings are the calendar's "chapter" events, read from the same
 * GET /api/calendar the Timeline uses (one cache: a meeting added here shows on the
 * Timeline at once). Plus:
 *   GET /api/attendance/summary?category=chapter   how each meeting's roll stands
 *   GET /api/excuses?status=pending                excuses waiting (MANAGE_ATTENDANCE)
 *   GET /api/calendar/agenda-templates             agendas a new meeting starts from (MANAGE_EVENTS)
 *   GET /api/calendar/[id]/delete-preview          what deleting takes with it (MANAGE_EVENTS)
 *
 * Officer writes (requests + cache refreshes; the choreography is in ~/meetings/*):
 *   add / edit / delete an event     POST /api/calendar, PATCH|DELETE /api/calendar/[id]
 *   the check-in window              POST /api/attendance/[eventId]/window
 *   take attendance                  POST /api/attendance { calendarEventId, changes }
 *   decide an excuse                 PATCH /api/excuses/[id]
 *   excuse someone else              POST /api/excuses { brotherId } (approved on the spot)
 *   summarize the minutes            POST /api/ai/summarize-meeting
 *   write the minutes (unshared)     PATCH /api/calendar/[id] { description } → MinutesSaved
 */
import type {
  AgendaTemplate, AttendanceSummaryRow, CalendarEvent, EventDeletePreview, ExcuseDecided, ExcuseListItem, LiveCheckIn, MeetingSummarized, MinutesSaved,
} from "@/lib/api-types";
import type { recordAttendanceInput, checkInWindowInput } from "@/lib/validation/attendance";
import type { decideExcuseInput, submitExcuseInput } from "@/lib/validation/excuse";
import { useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { api } from "~/api/client";
import { activeOrg, useActiveOrg } from "~/state/org";
import { calKeys } from "./calendar";
import { homeKeys } from "./home";
import { queryClient } from "./query";

export const meetKeys = {
  summary: (slug: string | null) => ["attendanceSummary", slug] as const,
  pending: (slug: string | null) => ["pendingExcuses", slug] as const,
  templates: (slug: string | null) => ["agendaTemplates", slug] as const,
  preview: (slug: string | null, id: number) => ["deletePreview", slug, id] as const,
};

const slugNow = () => activeOrg.get().slug;

export function useAttendanceSummary() {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: meetKeys.summary(slug),
    queryFn: () => api<AttendanceSummaryRow[]>("/api/attendance/summary", { org: slug, query: { category: "chapter" } }),
  });
}

export function usePendingExcuses(enabled: boolean) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: meetKeys.pending(slug),
    queryFn: () => api<ExcuseListItem[]>("/api/excuses", { org: slug, query: { status: "pending" } }),
    enabled,
  });
}

export function useAgendaTemplates(enabled: boolean) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: meetKeys.templates(slug),
    queryFn: () => api<AgendaTemplate[]>("/api/calendar/agenda-templates", { org: slug }),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useDeletePreview(id: number | null) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: meetKeys.preview(slug, id ?? 0),
    queryFn: () => api<EventDeletePreview>(`/api/calendar/${id}/delete-preview`, { org: slug }),
    enabled: id != null,
    staleTime: 0,
    gcTime: 0,
  });
}

/* ── events ───────────────────────────────────────────────────────────────────── */

/** What the phone sends for an event. A structured schedule decides date and time on the
 *  server (lib/calendar-feed/schedule); it's hand-written here because the validation
 *  module pulls Temporal, which the app doesn't carry. */
export type TimedSchedule = { kind: "timed"; start: string; end?: string; timeZone: string };
export type AllDaySchedule = { kind: "allDay"; start: string; end: string };
export interface EventBody {
  title: string;
  date: string;
  time: string | null;
  schedule: TimedSchedule | AllDaySchedule | null;
  location: string | null;
  mandatory: boolean;
}
export interface NewEventBody extends EventBody {
  category: string;
  description?: string;
  agendaTemplateId?: number | null;
  repeat?: { every: 1 | 2; until: string };
}

/** Refresh everything an event write can move. */
export function refreshAfterEventWrite() {
  const slug = slugNow();
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: calKeys.events(slug) }),
    queryClient.invalidateQueries({ queryKey: meetKeys.summary(slug) }),
    queryClient.invalidateQueries({ queryKey: ["home", slug] }),
  ]);
}

/** The created event (and, with `repeat`, the rest of the series). The phone re-reads the calendar. */
export async function createEvent(body: NewEventBody): Promise<{ id: number; date: string; series: { id: number; date: string }[] }> {
  const r = await api<{ id: number; date: string; series?: { id: number; date: string }[] }>("/api/calendar", { method: "POST", body });
  void refreshAfterEventWrite();
  return { id: r.id, date: r.date, series: r.series ?? [] };
}

export async function updateEvent(id: number, body: Partial<EventBody>): Promise<void> {
  await api<unknown>(`/api/calendar/${id}`, { method: "PATCH", body });
  void refreshAfterEventWrite();
}

export async function deleteEvent(id: number): Promise<void> {
  await api<unknown>(`/api/calendar/${id}`, { method: "DELETE" });
  void refreshAfterEventWrite();
}

/* ── attendance ───────────────────────────────────────────────────────────────── */

type WindowAction = z.input<typeof checkInWindowInput>["action"];

/** Open / close / reopen / cancel / restore the live check-in; the answer goes straight
 *  into the live cache, so Today's band and the ticket follow at once. */
export async function setWindow(eventId: number, action: WindowAction): Promise<LiveCheckIn | null> {
  const slug = slugNow();
  const body: z.input<typeof checkInWindowInput> = { action };
  const live = await api<LiveCheckIn | null>(`/api/attendance/${eventId}/window`, { method: "POST", body, org: slug });
  queryClient.setQueryData(homeKeys.live(slug), live);
  void queryClient.invalidateQueries({ queryKey: meetKeys.summary(slug) });
  void queryClient.invalidateQueries({ queryKey: calKeys.attendance(slug, eventId) });
  return live;
}

export async function recordAttendance(eventId: number, changes: { brotherId: number; attended: boolean }[]): Promise<void> {
  const slug = slugNow();
  const body: z.input<typeof recordAttendanceInput> = { calendarEventId: eventId, changes };
  await api<unknown>("/api/attendance", { method: "POST", body, org: slug });
  void queryClient.invalidateQueries({ queryKey: meetKeys.summary(slug) });
  void queryClient.invalidateQueries({ queryKey: calKeys.attendance(slug, eventId) });
  void queryClient.invalidateQueries({ queryKey: calKeys.mine(slug) });
  void queryClient.invalidateQueries({ queryKey: ["roster", slug] });
}

/* ── excuses ──────────────────────────────────────────────────────────────────── */

export async function decideExcuse(id: number, action: "approve" | "reject", rejectionNote?: string): Promise<ExcuseDecided> {
  const slug = slugNow();
  const body: z.input<typeof decideExcuseInput> = { action, ...(rejectionNote?.trim() ? { rejectionNote: rejectionNote.trim() } : {}) };
  const r = await api<ExcuseDecided>(`/api/excuses/${id}`, { method: "PATCH", body, org: slug });
  void queryClient.invalidateQueries({ queryKey: meetKeys.summary(slug) });
  return r;
}

/** Put the pending list's cache through a change (optimistic decide); returns the undo. */
export function setPending(next: (list: ExcuseListItem[]) => ExcuseListItem[]): () => void {
  const key = meetKeys.pending(slugNow());
  const prev = queryClient.getQueryData<ExcuseListItem[]>(key);
  if (prev) queryClient.setQueryData(key, next(prev));
  return () => queryClient.setQueryData(key, prev);
}

export const refreshPending = () => queryClient.invalidateQueries({ queryKey: meetKeys.pending(slugNow()) });

/** An officer excusing someone else: the server approves it on the spot (MANAGE_ATTENDANCE). */
export async function excuseFor(calendarEventId: number, brotherId: number, reason: string): Promise<void> {
  const slug = slugNow();
  const body: z.input<typeof submitExcuseInput> = { calendarEventId, brotherId, reason };
  await api<unknown>("/api/excuses", { method: "POST", body, org: slug });
  void queryClient.invalidateQueries({ queryKey: meetKeys.summary(slug) });
  void queryClient.invalidateQueries({ queryKey: calKeys.attendance(slug, calendarEventId) });
  void queryClient.invalidateQueries({ queryKey: meetKeys.pending(slug) });
}

/* ── minutes ──────────────────────────────────────────────────────────────────── */

export async function summarizeMeeting(id: number): Promise<MeetingSummarized> {
  const slug = slugNow();
  const r = await api<MeetingSummarized>("/api/ai/summarize-meeting", { method: "POST", body: { id }, org: slug });
  void queryClient.invalidateQueries({ queryKey: calKeys.summary(slug, id) });
  void queryClient.invalidateQueries({ queryKey: calKeys.events(slug) });
  return r;
}

/**
 * Saves minutes typed on the phone (only for a meeting whose notes aren't shared: the
 * web's collaborative editor owns those, and the server answers 409 once they are).
 * Patches the calendar cache from the answer instead of re-reading the calendar on
 * every pause in typing.
 */
export async function saveMinutes(id: number, description: string): Promise<MinutesSaved> {
  const slug = slugNow();
  const r = await api<MinutesSaved>(`/api/calendar/${id}`, { method: "PATCH", body: { description }, org: slug });
  queryClient.setQueryData<CalendarEvent[]>(calKeys.events(slug), list => list?.map(e => (e.id === id ? {
    ...e, description: r.description, notesUpdatedAt: r.notesUpdatedAt, notesContentRevision: r.notesContentRevision, notesInitialized: r.notesInitialized,
  } : e)));
  return r;
}

