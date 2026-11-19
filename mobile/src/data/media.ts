/**
 * Media over the wire (GET /api/instagram, writes MANAGE_INSTAGRAM):
 *
 *   useMedia     every planned and posted post
 *
 * Writes return the saved post, which replaces its row at once. Like the web they
 * aren't optimistic: a refused save leaves the form open with the server's words.
 * Linked events come from GET /api/calendar (~/data/calendar useCalendar).
 *
 * Request bodies are written out here (lib/validation/instagram, as the app sends them).
 */
import type { InstagramPost } from "@/lib/api-types";
import { useQuery } from "@tanstack/react-query";
import { api } from "~/api/client";
import { activeOrg, useActiveOrg } from "~/state/org";
import { queryClient } from "./query";

export const mediaKeys = { list: (slug: string | null) => ["media", slug] as const };

const slugNow = () => activeOrg.get().slug;

export function useMedia(enabled = true) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: mediaKeys.list(slug),
    queryFn: () => api<InstagramPost[]>("/api/instagram", { org: slug }),
    enabled,
  });
}

export interface NewPostBody { title: string; dueDate: string; type: string; calendarEventId: number | null }
export interface PostPatch {
  title?: string;
  dueDate?: string;
  postedDate?: string | null;
  status?: "open" | "posted";
  type?: string;
  calendarEventId?: number | null;
}

function put(saved: InstagramPost) {
  queryClient.setQueryData<InstagramPost[]>(mediaKeys.list(slugNow()), l => {
    if (!l) return [saved];
    return l.some(p => p.id === saved.id) ? l.map(p => (p.id === saved.id ? saved : p)) : [...l, saved];
  });
}

export async function createPost(body: NewPostBody): Promise<InstagramPost> {
  const saved = await api<InstagramPost>("/api/instagram", { method: "POST", body, org: slugNow() });
  put(saved);
  return saved;
}

export async function patchPost(id: number, patch: PostPatch): Promise<InstagramPost> {
  const saved = await api<InstagramPost>(`/api/instagram/${id}`, { method: "PATCH", body: patch, org: slugNow() });
  put(saved);
  return saved;
}

export async function deletePost(id: number): Promise<void> {
  await api<null>(`/api/instagram/${id}`, { method: "DELETE", org: slugNow() });
  queryClient.setQueryData<InstagramPost[]>(mediaKeys.list(slugNow()), l => (l ?? []).filter(p => p.id !== id));
}
