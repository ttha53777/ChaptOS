/**
 * Members data. The roster itself is `useRoster()` in ./tasks (GET /api/brothers, shared
 * with Tasks and Timeline for names). Here: the card's extra read and my own two writes.
 *
 *   GET    /api/brothers/[id]/profile   MemberProfile (email + joined date; any member)
 *   PATCH  /api/brothers/[id]           MemberUpdated (my own row; the app sends { name })
 *   POST   /api/auth/avatar             AvatarResponse (multipart `file`, image ≤ 2 MB)
 *   DELETE /api/auth/avatar             AvatarResponse (back to the Google picture, or none)
 *
 * The photo is cropped square by the picker and shrunk here to 512px JPEG so it's always
 * far under the 2 MB limit, whatever the camera shot.
 */
import type { AvatarResponse, Brother, DuesBoard, InviteLink, JoinRequestApproved, JoinRequestPage, MeResponse, MemberProfile, MemberUpdated, Transaction } from "@/lib/api-types";
import type { updateBrotherInput } from "@/lib/validation/brother";
import type { approveJoinRequestInput } from "@/lib/validation/join-request";
import type { createTransactionInput } from "@/lib/validation/transaction";
import type { createInviteInput } from "@/lib/validation/invite";
import { config } from "~/config";
import { useQuery } from "@tanstack/react-query";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { z } from "zod";
import { api } from "~/api/client";
import { activeOrg, useActiveOrg } from "~/state/org";
import { keys } from "./hooks";
import { queryClient } from "./query";
import { taskKeys } from "./tasks";

export const memberKeys = {
  profile: (slug: string | null, id: number) => ["memberProfile", slug, id] as const,
};

export function useMemberProfile(id: number | null) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: memberKeys.profile(slug, id ?? 0),
    queryFn: () => api<MemberProfile>(`/api/brothers/${id}/profile`, { org: slug }),
    enabled: id != null,
    staleTime: 10 * 60_000,
  });
}

/* ── requests ─────────────────────────────────────────────────────────────────── */

type UpdateBody = z.input<typeof updateBrotherInput>;

export function renameMe(id: number, name: string): Promise<MemberUpdated> {
  const body: UpdateBody = { name };
  return api<MemberUpdated>(`/api/brothers/${id}`, { method: "PATCH", body });
}

/** Square-cropped picker output → 512px JPEG on disk. */
export async function shrinkPhoto(uri: string): Promise<string> {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: 512, height: 512 }).renderAsync();
  const out = await ref.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
  return out.uri;
}

export async function uploadAvatar(localUri: string): Promise<string | null> {
  const form = new FormData();
  // React Native's FormData takes a file as { uri, name, type }.
  form.append("file", { uri: localUri, name: "avatar.jpg", type: "image/jpeg" } as unknown as Blob);
  return (await api<AvatarResponse>("/api/auth/avatar", { method: "POST", body: form })).avatarUrl;
}

export async function removeAvatar(): Promise<string | null> {
  return (await api<AvatarResponse>("/api/auth/avatar", { method: "DELETE" })).avatarUrl;
}

/* ── cache edits ──────────────────────────────────────────────────────────────── */

const slugNow = () => activeOrg.get().slug;

/** Set my roster row and my `me` together; returns the undo. */
export function patchMe(meId: number, patch: { name?: string; avatarUrl?: string | null; hasCustomAvatar?: boolean }): () => void {
  const rk = taskKeys.roster(slugNow());
  const mk = keys.me(slugNow());
  const roster = queryClient.getQueryData<Brother[]>(rk);
  const me = queryClient.getQueryData<MeResponse | null>(mk);
  const { hasCustomAvatar, ...row } = patch;
  queryClient.setQueryData<Brother[]>(rk, list => list?.map(b => (b.id === meId ? { ...b, ...row } : b)));
  queryClient.setQueryData<MeResponse | null>(mk, m => m && {
    ...m,
    ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
    ...(hasCustomAvatar !== undefined ? { hasCustomAvatar } : {}),
    memberships: patch.name ? m.memberships.map(x => (x.organizationId === m.orgId ? { ...x, name: patch.name! } : x)) : m.memberships,
  });
  return () => { queryClient.setQueryData(rk, roster); queryClient.setQueryData(mk, me); };
}

export const refreshRoster = () => queryClient.invalidateQueries({ queryKey: taskKeys.roster(slugNow()) });
export const refreshMe = () => queryClient.invalidateQueries({ queryKey: keys.me(slugNow()) });

/* ── Members page (Phase 4): officer edits, dues lateness, join requests, payments ── */

/** An officer's edit (MANAGE_BROTHERS) or your own: one field at a time, as the web card saves. */
export function updateMember(id: number, patch: Pick<UpdateBody, "name" | "gpa" | "serviceHours">): Promise<MemberUpdated> {
  const body: UpdateBody = patch;
  return api<MemberUpdated>(`/api/brothers/${id}`, { method: "PATCH", body });
}

/** GET /api/dues: each member's standing, for "11d late" on the roster. Readable by everyone. */
export function useDuesBoard(enabled: boolean) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: ["dues-board", slug] as const,
    queryFn: () => api<DuesBoard>("/api/dues", { org: slug }),
    enabled,
  });
}
export const refreshDuesBoard = () => queryClient.invalidateQueries({ queryKey: ["dues-board", slugNow()] });

/** GET /api/join-requests?page=1 (MANAGE_BROTHERS): the first page of the queue. */
export function useJoinRequests(enabled: boolean) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: ["join-requests", slug] as const,
    queryFn: () => api<JoinRequestPage>("/api/join-requests", { org: slug, query: { page: "1" } }),
    enabled,
  });
}

/** After a decision: the queue, the roster (approve adds a row) and /me (the tab badge). */
export function refreshJoinRequests(approved: boolean) {
  const slug = slugNow();
  void queryClient.invalidateQueries({ queryKey: ["join-requests", slug] });
  void refreshMe();
  if (approved) void refreshRoster();
}

export function approveJoinRequest(id: number, roleId: number | null): Promise<JoinRequestApproved> {
  const body: z.input<typeof approveJoinRequestInput> = { roleId };
  return api<JoinRequestApproved>(`/api/join-requests/${id}/approve`, { method: "POST", body });
}

export function rejectJoinRequest(id: number): Promise<void> {
  return api<void>(`/api/join-requests/${id}/reject`, { method: "POST" });
}

/** A dues payment (MANAGE_TREASURY): an income line in "Dues" carrying brotherId, the one
 *  transaction that also brings down what they owe (createTransaction). */
export function recordDuesPayment(b: Pick<Brother, "id" | "name">, amount: number, date: string, paymentMethod: string | null): Promise<Transaction> {
  const body: z.input<typeof createTransactionInput> = {
    type: "income", category: "Dues", amount, date, description: `Dues payment — ${b.name}`, paymentMethod, brotherId: b.id,
  };
  return api<Transaction>("/api/transactions", { method: "POST", body });
}

/* ── invite links (MANAGE_SETTINGS) ───────────────────────────────────────────── */

/** GET /api/invites: the org's links; the sheet shows the usable ones, newest first. */
export function useInvites(enabled: boolean) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: ["invites", slug] as const,
    queryFn: () => api<InviteLink[]>("/api/invites", { org: slug }),
    select: rows => rows.filter(r => r.status === "active"),
    enabled,
  });
}

/** Mints a 7-day link, only ever on an explicit press (a link is a credential), as the web. */
export async function createInvite(): Promise<InviteLink> {
  const body: z.input<typeof createInviteInput> = { expiry: "7d" };
  const made = await api<InviteLink>("/api/invites", { method: "POST", body });
  queryClient.setQueryData<InviteLink[]>(["invites", slugNow()], prev => [made, ...(prev ?? [])]);
  return made;
}

/** The link to hand out: the web origin the app talks to (the preview proxies, so its own). */
export function joinUrl(token: string): string {
  const base = config.apiUrl || (typeof window !== "undefined" && window.location ? window.location.origin : "https://chaptos.com");
  return `${base}/join/${token}`;
}
