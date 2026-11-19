/**
 * Ask Chapt reads that aren't the stream itself.
 *
 *   GET /api/ai/chat                               ChatAvailability (is it on; may files be attached; limits)
 *   GET /api/ai/peek?type=&id=                     PeekCard (a row's record sheet)
 *   GET /api/ai/attachments/[id]/units/[ref]       AttachmentUnit (a citation's passage)
 */
import type { AttachmentUnit, ChatAvailability, EntityRef, PeekCard } from "@/lib/api-types";
import { useQuery } from "@tanstack/react-query";
import { api } from "~/api/client";
import { useActiveOrg } from "~/state/org";

export function useChatAvailability() {
  const slug = useActiveOrg().slug;
  return useQuery({ queryKey: ["chatAvailability", slug], queryFn: () => api<ChatAvailability>("/api/ai/chat"), staleTime: 5 * 60_000 });
}

export function usePeek(ref: EntityRef | null) {
  const slug = useActiveOrg().slug;
  return useQuery({
    queryKey: ["peek", slug, ref?.type, ref?.id],
    queryFn: () => api<PeekCard>("/api/ai/peek", { query: { type: ref!.type, id: ref!.id } }),
    enabled: !!ref,
    staleTime: 60_000,
  });
}

export function useUnit(attachmentId: string | null, unit: string | null) {
  const slug = useActiveOrg().slug;
  return useQuery({
    queryKey: ["unit", slug, attachmentId, unit],
    queryFn: () => api<AttachmentUnit>(`/api/ai/attachments/${encodeURIComponent(attachmentId!)}/units/${encodeURIComponent(unit!)}`),
    enabled: !!attachmentId && !!unit,
    staleTime: 5 * 60_000,
  });
}
