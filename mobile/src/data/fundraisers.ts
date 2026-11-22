/**
 * Fundraisers over the wire (GET /api/fundraisers, writes MANAGE_FUNDRAISING):
 *
 *   useFundraiser(id)   GET /api/fundraisers/[id]   one fundraiser (the list's useFundraisers
 *                                                    lives in ~/data/more)
 *   createFundraiser    POST   /api/fundraisers
 *   patchFundraiser     PATCH  /api/fundraisers/[id]
 *   deleteFundraiser    DELETE /api/fundraisers/[id]
 *   addSupply           POST   /api/fundraisers/[id]/supplies
 *   patchSupply         PATCH  /api/fundraisers/[id]/supplies/[supplyId]
 *   removeSupply        DELETE /api/fundraisers/[id]/supplies/[supplyId]
 *   wrapFundraiser      POST   /api/fundraisers/[id]/wrap     { cameIn }
 *   reopenFundraiser    DELETE /api/fundraisers/[id]/wrap
 *
 * Every write answers with the fundraiser as it now stands (delete: 204), which replaces
 * it in the list and its own page at once. A fundraiser is a Timeline entry too, so writes
 * refresh the calendar and home. Bodies are written out here (lib/validation/fundraiser
 * pulls the schedule schema, which needs Temporal).
 */
import type { Fundraiser } from "@/lib/api-types";
import { useQuery } from "@tanstack/react-query";
import { api } from "~/api/client";
import { activeOrg, useActiveOrg } from "~/state/org";
import { calKeys } from "./calendar";
import { moreKeys } from "./more";
import { queryClient } from "./query";

export const fundraiserKey = (slug: string | null, id: number) => ["fundraiser", slug, id] as const;
const slugNow = () => activeOrg.get().slug;

export function useFundraiser(id: number) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: fundraiserKey(slug, id),
    queryFn: () => api<Fundraiser>(`/api/fundraisers/${id}`, { org: slug }),
    // The list already has it: show that copy while the page's own read lands.
    initialData: () => queryClient.getQueryData<Fundraiser[]>(moreKeys.fundraisers(slug))?.find(f => f.id === id),
    enabled: Number.isFinite(id),
  });
}

export interface FundraiserBody {
  name: string; date: string; place: string | null; goal: number | null;
  startTime: string | null; endTime: string | null; timeZone: string;
}

function put(saved: Fundraiser) {
  const slug = slugNow();
  queryClient.setQueryData(fundraiserKey(slug, saved.id), saved);
  queryClient.setQueryData<Fundraiser[]>(moreKeys.fundraisers(slug), l => {
    if (!l) return [saved];
    return l.some(f => f.id === saved.id) ? l.map(f => (f.id === saved.id ? saved : f)) : [...l, saved];
  });
}

function elsewhere() {
  const slug = slugNow();
  void queryClient.invalidateQueries({ queryKey: calKeys.events(slug) });
  void queryClient.invalidateQueries({ queryKey: ["home", slug] });
}

async function write(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown, timeline = false): Promise<Fundraiser> {
  const saved = await api<Fundraiser>(path, { method, body, org: slugNow() });
  put(saved);
  if (timeline) elsewhere();
  else void queryClient.invalidateQueries({ queryKey: ["home", slugNow()] });
  return saved;
}

export const createFundraiser = (body: FundraiserBody) => write("/api/fundraisers", "POST", body, true);
export const patchFundraiser = (id: number, body: FundraiserBody) => write(`/api/fundraisers/${id}`, "PATCH", body, true);
export const addSupply = (id: number, name: string, cost: number) => write(`/api/fundraisers/${id}/supplies`, "POST", { name, cost });
export const patchSupply = (id: number, supplyId: number, name: string, cost: number) => write(`/api/fundraisers/${id}/supplies/${supplyId}`, "PATCH", { name, cost });
export const removeSupply = (id: number, supplyId: number) => write(`/api/fundraisers/${id}/supplies/${supplyId}`, "DELETE");
export const wrapFundraiser = (id: number, cameIn: number) => write(`/api/fundraisers/${id}/wrap`, "POST", { cameIn });
export const reopenFundraiser = (id: number) => write(`/api/fundraisers/${id}/wrap`, "DELETE");

export async function deleteFundraiser(id: number): Promise<void> {
  const slug = slugNow();
  await api<null>(`/api/fundraisers/${id}`, { method: "DELETE", org: slug });
  queryClient.setQueryData<Fundraiser[]>(moreKeys.fundraisers(slug), l => (l ?? []).filter(f => f.id !== id));
  queryClient.removeQueries({ queryKey: fundraiserKey(slug, id) });
  elsewhere();
}
