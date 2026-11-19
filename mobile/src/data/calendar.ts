/**
 * Timeline data: GET /api/calendar, /api/calendar/event-types, /api/attendance/mine,
 * /api/excuses/mine, and per event /api/attendance/[eventId] and
 * /api/calendar/[id]/summary; the "Add to Calendar" sheet reads
 * /api/calendar/subscription?view=member.
 *
 * Writes (requests + cache edits only; the choreography is in ~/timeline/*):
 *   claim / unclaim a "who's bringing what" item   PATCH /api/calendar/[id]/details
 *   file an excuse                                 POST  /api/excuses
 *   tick an action item from the minutes           PATCH /api/calendar/[id]/action-items
 */
import type {
  CalEventType, CalendarEvent, CalendarSubscriptionView, EventAttendance, EventDetail, EventDetailsUpdated,
  MeetingSummary, MeetingSummaryBody, MyAttendance, MyExcuseItem,
} from "@/lib/api-types";
import type { detailActionInput } from "@/lib/validation/event-detail-action";
import type { submitExcuseInput } from "@/lib/validation/excuse";
import type { toggleActionItemInput } from "@/lib/validation/meeting-notes";
import { useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { api } from "~/api/client";
import { activeOrg, useActiveOrg } from "~/state/org";
import { queryClient } from "./query";

export const calKeys = {
  events: (slug: string | null) => ["calendar", slug] as const,
  types: (slug: string | null) => ["eventTypes", slug] as const,
  mine: (slug: string | null) => ["myAttendance", slug] as const,
  excuses: (slug: string | null) => ["myExcuses", slug] as const,
  attendance: (slug: string | null, id: number) => ["eventAttendance", slug, id] as const,
  summary: (slug: string | null, id: number) => ["meetingSummary", slug, id] as const,
  feed: (slug: string | null) => ["calendarFeed", slug] as const,
};

export function useCalendar() {
  const { slug } = useActiveOrg();
  return useQuery({ queryKey: calKeys.events(slug), queryFn: () => api<CalendarEvent[]>("/api/calendar", { org: slug }) });
}

export function useEventTypes() {
  const { slug } = useActiveOrg();
  return useQuery({ queryKey: calKeys.types(slug), queryFn: () => api<CalEventType[]>("/api/calendar/event-types", { org: slug }), staleTime: 10 * 60_000 });
}

export function useMyAttendance() {
  const { slug } = useActiveOrg();
  return useQuery({ queryKey: calKeys.mine(slug), queryFn: () => api<MyAttendance>("/api/attendance/mine", { org: slug }) });
}

export function useMyExcuses() {
  const { slug } = useActiveOrg();
  return useQuery({ queryKey: calKeys.excuses(slug), queryFn: () => api<MyExcuseItem[]>("/api/excuses/mine", { org: slug }) });
}

export function useEventAttendance(id: number | null) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: calKeys.attendance(slug, id ?? 0),
    queryFn: () => api<EventAttendance>(`/api/attendance/${id}`, { org: slug }),
    enabled: id != null,
  });
}

export function useMeetingSummary(id: number | null) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: calKeys.summary(slug, id ?? 0),
    queryFn: () => api<MeetingSummary>(`/api/calendar/${id}/summary`, { org: slug }),
    enabled: id != null,
  });
}

export function useCalendarFeed(enabled: boolean) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: calKeys.feed(slug),
    queryFn: () => api<CalendarSubscriptionView>("/api/calendar/subscription", { org: slug, query: { view: "member" } }),
    enabled,
    // The URL is a secret: keep it out of the persisted cache's long tail.
    gcTime: 5 * 60_000,
  });
}

/* ── requests ─────────────────────────────────────────────────────────────────── */

type DetailAction = z.input<typeof detailActionInput>;
type ExcuseBody = z.input<typeof submitExcuseInput>;
type ActionToggle = z.input<typeof toggleActionItemInput>;

export async function claimItem(eventId: number, detailId: string, itemId: string, claim: boolean): Promise<EventDetail[]> {
  const body: DetailAction = { op: "claim", detailId, itemId, claim };
  return (await api<EventDetailsUpdated>(`/api/calendar/${eventId}/details`, { method: "PATCH", body })).details;
}

/** The answer is a legacy roster-row shape; the app re-reads its excuses instead. */
export async function postExcuse(calendarEventId: number, reason: string): Promise<void> {
  const body: ExcuseBody = { calendarEventId, reason };
  await api<unknown>("/api/excuses", { method: "POST", body });
}

export function patchActionItem(eventId: number, itemId: string, done: boolean): Promise<MeetingSummaryBody> {
  const body: ActionToggle = { itemId, done };
  return api<MeetingSummaryBody>(`/api/calendar/${eventId}/action-items`, { method: "PATCH", body });
}

/* ── cache edits ──────────────────────────────────────────────────────────────── */

const slugNow = () => activeOrg.get().slug;

/** Replace one event's details in the cached list; returns the undo. */
export function setEventDetails(eventId: number, next: (d: EventDetail[]) => EventDetail[]): () => void {
  const k = calKeys.events(slugNow());
  const before = queryClient.getQueryData<CalendarEvent[]>(k)?.find(e => e.id === eventId)?.details;
  queryClient.setQueryData<CalendarEvent[]>(k, list => list?.map(e => (e.id === eventId ? { ...e, details: next(e.details ?? []) } : e)));
  return () => queryClient.setQueryData<CalendarEvent[]>(k, list => list?.map(e => (e.id === eventId ? { ...e, details: before } : e)));
}

/** Put (or replace) my excuse for an event in the cache; returns the undo. */
export function setMyExcuse(item: MyExcuseItem): () => void {
  const k = calKeys.excuses(slugNow());
  const before = queryClient.getQueryData<MyExcuseItem[]>(k);
  queryClient.setQueryData<MyExcuseItem[]>(k, list => [item, ...(list ?? []).filter(x => x.calendarEventId !== item.calendarEventId)]);
  return () => queryClient.setQueryData(k, before);
}

export function setSummaryItem(eventId: number, itemId: string, done: boolean): () => void {
  const k = calKeys.summary(slugNow(), eventId);
  const before = queryClient.getQueryData<MeetingSummary>(k);
  queryClient.setQueryData<MeetingSummary>(k, s => s && s.summary ? { ...s, summary: { ...s.summary, actions: s.summary.actions.map(a => (a.id === itemId ? { ...a, done } : a)) } } : s);
  return () => queryClient.setQueryData(k, before);
}

export function putSummaryBody(eventId: number, body: MeetingSummaryBody) {
  queryClient.setQueryData<MeetingSummary>(calKeys.summary(slugNow(), eventId), s => s && { ...s, summary: body });
}

export const refreshExcuses = () => queryClient.invalidateQueries({ queryKey: calKeys.excuses(slugNow()) });
export const refreshCalendar = () => queryClient.invalidateQueries({ queryKey: calKeys.events(slugNow()) });
export const refreshAttendance = (id: number) => queryClient.invalidateQueries({ queryKey: calKeys.attendance(slugNow(), id) });
export const refreshSummary = (id: number) => queryClient.invalidateQueries({ queryKey: calKeys.summary(slugNow(), id) });
