/**
 * Treasury → Dues writes (MANAGE_TREASURY), the web's app/components/treasury/dues/dues-api.ts:
 *
 *   POST   /api/dues/charges                       hand out a charge     DuesChargeIssued
 *   PATCH  /api/dues/charges/[id]                  rename / due / note
 *   DELETE /api/dues/charges/[id]                  take it back (409 once someone paid)
 *   DELETE /api/dues/charges/[id]/lines/[brother]  take one person off
 *   POST   /api/dues/waivers                       waive some            DuesWaived
 *   DELETE /api/dues/waivers/[id]                  undo a waiver
 *   POST   /api/transactions                       a dues payment (income · Dues · brotherId)
 *
 * and GET /api/dues/members/[id] for anyone's tab (the drawer; members read only their own).
 * Every write refreshes the boards (everything under "dues-board"), the roster, the open
 * tabs and, for a payment, the books.
 */
import type { DuesChargeIssued, DuesWaived, MemberDuesBook, PaymentMethod } from "@/lib/api-types";
import type { issueDuesChargeInput, updateDuesChargeInput, waiveDuesInput } from "@/lib/validation/dues";
import { useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { api } from "~/api/client";
import { activeOrg, useActiveOrg } from "~/state/org";
import { refreshDuesBoard, refreshRoster, recordDuesPayment } from "./members";
import { moneyKeys } from "./money";
import { moreKeys } from "./more";
import { queryClient } from "./query";

export type IssueChargeBody = z.input<typeof issueDuesChargeInput>;
type ChargePatch = z.input<typeof updateDuesChargeInput>;
type WaiveBody = z.input<typeof waiveDuesInput>;

export function useMemberBook(id: number | null) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: moreKeys.dues(slug, id ?? 0),
    queryFn: () => api<MemberDuesBook>(`/api/dues/members/${id}`, { org: slug }),
    enabled: id != null,
  });
}

/** After any dues write. */
export async function duesWritten(tx = false) {
  const slug = activeOrg.get().slug;
  const jobs = [refreshDuesBoard(), refreshRoster(), queryClient.invalidateQueries({ queryKey: ["myDues", slug] })];
  if (tx) {
    jobs.push(
      queryClient.invalidateQueries({ queryKey: moneyKeys.transactions(slug) }),
      queryClient.invalidateQueries({ queryKey: moneyKeys.treasury(slug) }),
      queryClient.invalidateQueries({ queryKey: ["home", slug] }),
    );
  }
  await Promise.all(jobs);
}

export const issueCharge = (body: IssueChargeBody) => api<DuesChargeIssued>("/api/dues/charges", { method: "POST", body });
export const updateCharge = (id: number, body: ChargePatch) => api<void>(`/api/dues/charges/${id}`, { method: "PATCH", body });
export const voidCharge = (id: number) => api<void>(`/api/dues/charges/${id}`, { method: "DELETE" });
export const voidLine = (chargeId: number, brotherId: number) => api<void>(`/api/dues/charges/${chargeId}/lines/${brotherId}`, { method: "DELETE" });
export const waive = (body: WaiveBody) => api<DuesWaived>("/api/dues/waivers", { method: "POST", body });
export const voidWaiver = (id: number) => api<void>(`/api/dues/waivers/${id}`, { method: "DELETE" });
export const recordPayment = (p: { brotherId: number; name: string; amount: number; method: PaymentMethod; date: string }) =>
  recordDuesPayment({ id: p.brotherId, name: p.name }, p.amount, p.date, p.method);
