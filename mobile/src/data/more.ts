/**
 * More data: the pages behind the index cards, plus leaving a chapter and deleting the
 * account. All reads are what any member may see.
 *
 *   GET    /api/service-events                        ServiceEvent[]
 *   GET    /api/service-participation                 ServiceParticipationRow[] (whole org; mine filtered here)
 *   POST   /api/service-events/[id]/participation/me  log my hours (body logMyParticipationInput; DELETE undoes)
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
import type { logMyParticipationInput } from "@/lib/validation/service-participation";
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

export function unlogMyHours(eventId: number): Promise<ServiceParticipationRow[]> {
  return api<ServiceParticipationRow[]>(`/api/service-events/${eventId}/participation/me`, { method: "DELETE" });
}

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

/** Put my row for one event in the cached org list (hours null = remove); returns the undo. */
export function setMyHours(meId: number, eventId: number, hours: number | null, me: { name: string; avatarUrl: string | null }): () => void {
  const k = moreKeys.participation(slugNow());
  const before = queryClient.getQueryData<ServiceParticipationRow[]>(k);
  queryClient.setQueryData<ServiceParticipationRow[]>(k, rows => {
    const rest = (rows ?? []).filter(r => !(r.serviceEventId === eventId && r.brotherId === meId));
    if (hours == null) return rest;
    const now = new Date().toISOString();
    const old = rows?.find(r => r.serviceEventId === eventId && r.brotherId === meId);
    return [...rest, old ? { ...old, hours, updatedAt: now } : {
      id: -eventId, organizationId: 0, serviceEventId: eventId, brotherId: meId, hours, createdAt: now, updatedAt: now,
      brother: { id: meId, name: me.name, avatarUrl: me.avatarUrl },
    }];
  });
  return () => queryClient.setQueryData(k, before);
}

/** The event's roster as the server answered it replaces that event's rows. */
export function putEventRows(eventId: number, rows: ServiceParticipationRow[]) {
  queryClient.setQueryData<ServiceParticipationRow[]>(moreKeys.participation(slugNow()), all => [
    ...(all ?? []).filter(r => r.serviceEventId !== eventId), ...rows,
  ]);
}
