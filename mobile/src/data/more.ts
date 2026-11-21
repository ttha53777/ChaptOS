/**
 * More data: the pages behind the index cards, plus leaving a chapter and deleting the
 * account. All reads are what any member may see.
 *
 *   GET    /api/service-events                        ServiceEvent[]
 *   GET    /api/service-participation                 ServiceParticipationRow[] (whole org; mine filtered here)
 *   POST   /api/service-events/[id]/participation/me  log my hours (body logMyParticipationInput; DELETE undoes)
 *   POST   /api/service-events                        ServiceEvent (MANAGE_SERVICE; body createServiceEventInput)
 *   PATCH  /api/service-events/[id]                   ServiceEvent (MANAGE_SERVICE; body updateServiceEventInput)
 *   DELETE /api/service-events/[id]                   204 (MANAGE_SERVICE)
 *   POST   /api/service-events/[id]/participation     the event's rows after (MANAGE_SERVICE; body logParticipationInput)
 *   DELETE /api/service-participation/[id]            204 (MANAGE_SERVICE)
 *   GET    /api/docs, /api/docs/folders               Doc[], DocFolder[]
 *   GET    /api/fundraisers                           Fundraiser[]
 *   GET    /api/dues/members/[brotherId]              MemberDuesBook (my tab)
 *   POST   /api/orgs/leave                            LeaveOrgResponse (body leaveOrgInput)
 *   GET    /api/auth/account                          AccountDeletionPreview
 *   DELETE /api/auth/account                          { ok: true } (body deleteAccountInput)
 */
import type {
  AccountDeletionPreview, Doc, DocFolder, Fundraiser, LeaveOrgResponse, MemberDuesBook, ServiceEvent, ServiceParticipationRow,
} from "@/lib/api-types";
import type { deleteAccountInput } from "@/lib/validation/account";
import type { leaveOrgInput } from "@/lib/validation/org-leave";
import type { createServiceEventInput, updateServiceEventInput } from "@/lib/validation/service-event";
import type { logMyParticipationInput, logParticipationInput } from "@/lib/validation/service-participation";
import { useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { api } from "~/api/client";
import { activeOrg, useActiveOrg } from "~/state/org";
import { queryClient } from "./query";

export const moreKeys = {
  serviceEvents: (slug: string | null) => ["serviceEvents", slug] as const,
  participation: (slug: string | null) => ["serviceParticipation", slug] as const,
  docs: (slug: string | null) => ["docs", slug] as const,
  folders: (slug: string | null) => ["docFolders", slug] as const,
  fundraisers: (slug: string | null) => ["fundraisers", slug] as const,
  dues: (slug: string | null, id: number) => ["myDues", slug, id] as const,
  account: ["accountPreview"] as const,
};

const useSlug = () => useActiveOrg().slug;

export function useServiceEvents(enabled = true) {
  const slug = useSlug();
  return useQuery({ queryKey: moreKeys.serviceEvents(slug), queryFn: () => api<ServiceEvent[]>("/api/service-events", { org: slug }), enabled });
}

export function useParticipation(enabled = true) {
  const slug = useSlug();
  return useQuery({ queryKey: moreKeys.participation(slug), queryFn: () => api<ServiceParticipationRow[]>("/api/service-participation", { org: slug }), enabled });
}

export function useDocs(enabled = true) {
  const slug = useSlug();
  return useQuery({ queryKey: moreKeys.docs(slug), queryFn: () => api<Doc[]>("/api/docs", { org: slug }), enabled });
}

export function useDocFolders(enabled = true) {
  const slug = useSlug();
  return useQuery({ queryKey: moreKeys.folders(slug), queryFn: () => api<DocFolder[]>("/api/docs/folders", { org: slug }), enabled });
}

export function useFundraisers(enabled = true) {
  const slug = useSlug();
  return useQuery({ queryKey: moreKeys.fundraisers(slug), queryFn: () => api<Fundraiser[]>("/api/fundraisers", { org: slug }), enabled });
}

export function useMyDues(meId: number, enabled = true) {
  const slug = useSlug();
  return useQuery({ queryKey: moreKeys.dues(slug, meId), queryFn: () => api<MemberDuesBook>(`/api/dues/members/${meId}`, { org: slug }), enabled });
}

export function useAccountPreview(enabled: boolean) {
  return useQuery({ queryKey: moreKeys.account, queryFn: () => api<AccountDeletionPreview>("/api/auth/account"), enabled, staleTime: 0, gcTime: 0 });
}

/* ── writes ───────────────────────────────────────────────────────────────────── */

type LogBody = z.input<typeof logMyParticipationInput>;
type LeaveBody = z.input<typeof leaveOrgInput>;
type DeleteBody = z.input<typeof deleteAccountInput>;

export function logMyHours(eventId: number, hours: number): Promise<ServiceParticipationRow[]> {
  const body: LogBody = { hours };
  return api<ServiceParticipationRow[]>(`/api/service-events/${eventId}/participation/me`, { method: "POST", body });
}

export type NewServiceEventBody = z.input<typeof createServiceEventInput>;
export type ServiceEventPatch = z.input<typeof updateServiceEventInput>;
type LogHoursBody = z.input<typeof logParticipationInput>;

export const createServiceEvent = (body: NewServiceEventBody) => api<ServiceEvent>("/api/service-events", { method: "POST", body });
export const patchServiceEvent = (id: number, body: ServiceEventPatch) => api<ServiceEvent>(`/api/service-events/${id}`, { method: "PATCH", body });
export const deleteServiceEvent = (id: number) => api<void>(`/api/service-events/${id}`, { method: "DELETE" });
export function logHours(eventId: number, entries: LogHoursBody["entries"]): Promise<ServiceParticipationRow[]> {
  const body: LogHoursBody = { entries };
  return api<ServiceParticipationRow[]>(`/api/service-events/${eventId}/participation`, { method: "POST", body });
}
export const removeParticipation = (id: number) => api<void>(`/api/service-participation/${id}`, { method: "DELETE" });

export function leaveOrg(confirmSlug: string): Promise<LeaveOrgResponse> {
  const body: LeaveBody = { confirmSlug };
  return api<LeaveOrgResponse>("/api/orgs/leave", { method: "POST", body });
}

export function deleteAccount(): Promise<{ ok: true }> {
  const body: DeleteBody = { confirm: "DELETE" };
  return api<{ ok: true }>("/api/auth/account", { method: "DELETE", body });
}

/* ── cache edits ──────────────────────────────────────────────────────────────── */

const slugNow = () => activeOrg.get().slug;

/** The event's roster as the server answered it replaces that event's rows. */
export function putEventRows(eventId: number, rows: ServiceParticipationRow[]) {
  queryClient.setQueryData<ServiceParticipationRow[]>(moreKeys.participation(slugNow()), all => [
    ...(all ?? []).filter(r => r.serviceEventId !== eventId), ...rows,
  ]);
}

/** Edit the cached service events; returns the undo. */
export function editServiceEvents(fn: (list: ServiceEvent[]) => ServiceEvent[]): () => void {
  const k = moreKeys.serviceEvents(slugNow());
  const before = queryClient.getQueryData<ServiceEvent[]>(k);
  queryClient.setQueryData<ServiceEvent[]>(k, list => fn(list ?? []));
  return () => queryClient.setQueryData(k, before);
}

/** Drop one participation row from the cached org list; returns the undo. */
export function dropRow(id: number): () => void {
  const k = moreKeys.participation(slugNow());
  const before = queryClient.getQueryData<ServiceParticipationRow[]>(k);
  queryClient.setQueryData<ServiceParticipationRow[]>(k, rows => (rows ?? []).filter(r => r.id !== id));
  return () => queryClient.setQueryData(k, before);
}

/** An event's rows leave with it. */
export function dropEventRows(eventId: number) {
  queryClient.setQueryData<ServiceParticipationRow[]>(moreKeys.participation(slugNow()), rows => (rows ?? []).filter(r => r.serviceEventId !== eventId));
}

