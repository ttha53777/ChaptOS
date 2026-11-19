/**
 * Money data (U9): reimbursements for everyone, the treasury for members whose role
 * grants it. The dues book itself is ~/data/more useMyDues.
 *
 *   GET    /api/reimbursements                 Reimbursement[] (the whole org's; the phone shows mine)
 *   POST   /api/reimbursements                 Reimbursement   (body createReimbursementInput, brotherId = me)
 *   POST   /api/reimbursements/[id]/receipt    Reimbursement   (multipart `file`; mine while pending)
 *   GET    /api/reimbursements/[id]/receipt    { url }         (Accept: application/json; a 60s signed link)
 *   GET    /api/treasury/categories            TransactionCategory[] (the request's budget line)
 *   GET    /api/treasury                       TreasuryData
 *   GET    /api/transactions                   Transaction[]
 *   POST   /api/transactions                   Transaction     (MANAGE_TREASURY; Log expense / Log revenue)
 *   PATCH  /api/transactions/[id]              Transaction     (MANAGE_TREASURY; edit, Mark paid = status "posted")
 *   DELETE /api/transactions/[id]              204             (MANAGE_TREASURY; a soft delete)
 *
 * A receipt photo is shrunk on the phone first (long edge 1600px, JPEG): the server takes
 * up to 4 MB and sniffs the bytes (JPEG, PNG, WebP, HEIC or PDF).
 */
import type { MeResponse, Reimbursement, Transaction, TransactionCategory, TreasuryData } from "@/lib/api-types";
import type { createReimbursementInput } from "@/lib/validation/reimbursement";
import type { createTransactionInput, updateTransactionInput } from "@/lib/validation/transaction";
import { useQuery } from "@tanstack/react-query";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { z } from "zod";
import { api } from "~/api/client";
import { activeOrg, useActiveOrg } from "~/state/org";
import { queryClient } from "./query";

export const moneyKeys = {
  reimbursements: (slug: string | null) => ["reimbursements", slug] as const,
  categories: (slug: string | null) => ["txCategories", slug] as const,
  treasury: (slug: string | null) => ["treasury", slug] as const,
  transactions: (slug: string | null) => ["transactions", slug] as const,
};

const TREASURY_BIT = 1 << 1; // MANAGE_TREASURY

/** The treasury page is for the books' keepers: their role grants treasury, or they run the chapter. */
export const seesTreasury = (me: MeResponse) => me.isAdmin || (me.permissions & TREASURY_BIT) !== 0;
/** Who may record, edit and delete ledger lines: the same MANAGE_TREASURY the routes check. */
export const keepsBooks = seesTreasury;

/** app/data.ts PAYMENT_METHODS (runtime constants can't be imported into the app). */
export const PAYMENT_METHODS = ["venmo", "zelle", "cash", "card", "check", "invoice"] as const;

const useSlug = () => useActiveOrg().slug;

export function useReimbursements(enabled = true) {
  const slug = useSlug();
  return useQuery({ queryKey: moneyKeys.reimbursements(slug), queryFn: () => api<Reimbursement[]>("/api/reimbursements", { org: slug }), enabled });
}

export function useCategories(enabled = true) {
  const slug = useSlug();
  return useQuery({
    queryKey: moneyKeys.categories(slug),
    queryFn: () => api<TransactionCategory[]>("/api/treasury/categories", { org: slug }),
    enabled,
    staleTime: 10 * 60_000,
  });
}

export const visibleExpense = (list: TransactionCategory[] | undefined) =>
  (list ?? []).filter(c => c.kind === "expense" && !c.hidden).sort((a, b) => a.displayOrder - b.displayOrder);

export function useTreasury(enabled = true) {
  const slug = useSlug();
  return useQuery({ queryKey: moneyKeys.treasury(slug), queryFn: () => api<TreasuryData>("/api/treasury", { org: slug }), enabled });
}

export function useTransactions(enabled = true) {
  const slug = useSlug();
  return useQuery({ queryKey: moneyKeys.transactions(slug), queryFn: () => api<Transaction[]>("/api/transactions", { org: slug }), enabled });
}

/* ── writes ───────────────────────────────────────────────────────────────────── */

type CreateBody = z.input<typeof createReimbursementInput>;
export type NewTxBody = z.input<typeof createTransactionInput>;
export type TxPatch = z.input<typeof updateTransactionInput>;

/** A ledger line moves the balance, the trend, the budget lines and (dues) home. */
function ledgerWritten() {
  const slug = activeOrg.get().slug;
  void queryClient.invalidateQueries({ queryKey: moneyKeys.transactions(slug) });
  void queryClient.invalidateQueries({ queryKey: moneyKeys.treasury(slug) });
  void queryClient.invalidateQueries({ queryKey: ["home", slug] });
}

const putTx = (t: Transaction) => queryClient.setQueryData<Transaction[]>(moneyKeys.transactions(activeOrg.get().slug), list => {
  if (!list) return list;
  return list.some(x => x.id === t.id) ? list.map(x => (x.id === t.id ? t : x)) : [t, ...list];
});

export async function createTransaction(body: NewTxBody): Promise<Transaction> {
  const t = await api<Transaction>("/api/transactions", { method: "POST", body });
  putTx(t);
  ledgerWritten();
  return t;
}

export async function patchTransaction(id: number, body: TxPatch): Promise<Transaction> {
  const t = await api<Transaction>(`/api/transactions/${id}`, { method: "PATCH", body });
  putTx(t);
  ledgerWritten();
  return t;
}

export async function deleteTransaction(id: number): Promise<void> {
  await api<void>(`/api/transactions/${id}`, { method: "DELETE" });
  queryClient.setQueryData<Transaction[]>(moneyKeys.transactions(activeOrg.get().slug), list => list?.filter(x => x.id !== id));
  ledgerWritten();
}

export interface ReceiptFile { uri: string; name: string; type: string }

/** A photo becomes a ≤1600px JPEG; a PDF goes as it is. */
export async function prepareReceipt(asset: { uri: string; width?: number; height?: number; mimeType?: string | null; name?: string | null }): Promise<ReceiptFile> {
  if (asset.mimeType === "application/pdf" || asset.name?.toLowerCase().endsWith(".pdf")) {
    return { uri: asset.uri, name: asset.name ?? "receipt.pdf", type: "application/pdf" };
  }
  const w = asset.width ?? 0, h = asset.height ?? 0;
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (Math.max(w, h) > 1600) ctx.resize(w >= h ? { width: 1600 } : { height: 1600 });
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ compress: 0.75, format: SaveFormat.JPEG });
  return { uri: out.uri, name: "receipt.jpg", type: "image/jpeg" };
}

export function createReimbursement(body: CreateBody): Promise<Reimbursement> {
  return api<Reimbursement>("/api/reimbursements", { method: "POST", body });
}

export function attachReceipt(id: number, file: ReceiptFile): Promise<Reimbursement> {
  const form = new FormData();
  // React Native's FormData takes a file as { uri, name, type }.
  form.append("file", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  return api<Reimbursement>(`/api/reimbursements/${id}/receipt`, { method: "POST", body: form });
}

export async function receiptUrl(id: number): Promise<string> {
  return (await api<{ url: string }>(`/api/reimbursements/${id}/receipt`)).url;
}

/* ── cache edits ──────────────────────────────────────────────────────────────── */

/** The server's row replaces (or joins, newest first) the cached list. */
export function putReimbursement(r: Reimbursement) {
  queryClient.setQueryData<Reimbursement[]>(moneyKeys.reimbursements(activeOrg.get().slug), list => {
    const rest = (list ?? []).filter(x => x.id !== r.id);
    return list?.some(x => x.id === r.id) ? (list ?? []).map(x => (x.id === r.id ? r : x)) : [r, ...rest];
  });
}
