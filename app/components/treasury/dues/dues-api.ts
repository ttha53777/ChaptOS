// The Dues tab's writes. Thin wrappers over /api/dues/* and /api/transactions so
// the sheet, the drawer and the stub menu all speak to the server the same way.
// Every amount is dollars on the wire; the server re-derives cents and lines.
import type { DuesChargeIssued, DuesWaived } from "@/lib/api-types/dues";
import type { PaymentMethod } from "@/lib/api-types";
import { requestJson } from "../../../lib/api";

const JSON_HEADERS = { "Content-Type": "application/json" };

// lib/dues.ts DUES_CATEGORY — not imported, because that module pulls in the db client.
const DUES_CATEGORY = "Dues";

export type DuesAudienceBody =
  | { kind: "all";  exclude: number[];    amount: { mode: "each"; amount: number } | { mode: "split"; total: number } }
  | { kind: "pick"; brotherIds: number[]; amount: { mode: "each"; amount: number } | { mode: "split"; total: number } }
  | { kind: "role"; rates: { key: number | "base" | "none"; amount: number }[] };

export interface IssueChargeBody {
  name: string;
  dueDate: string | null;
  note: string | null;
  audience: DuesAudienceBody;
  onDuplicate: "skip" | "bill";
  semester?: string;
}

export function issueCharge(body: IssueChargeBody) {
  return requestJson<DuesChargeIssued>("/api/dues/charges", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
}

export function updateCharge(id: number, body: { name?: string; dueDate?: string | null; note?: string | null }) {
  return requestJson<void>(`/api/dues/charges/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(body) });
}

/** "Take back": voids the charge and every live line on it. 409 once someone has paid toward it. */
export function voidCharge(id: number) {
  return requestJson<void>(`/api/dues/charges/${id}`, { method: "DELETE" });
}

/** Take one person off a charge. */
export function voidLine(chargeId: number, brotherId: number) {
  return requestJson<void>(`/api/dues/charges/${chargeId}/lines/${brotherId}`, { method: "DELETE" });
}

export function waive(body: { brotherId: number; amount: number; reason: string | null; chargeId?: number | null }) {
  return requestJson<DuesWaived>("/api/dues/waivers", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
}

export function voidWaiver(id: number) {
  return requestJson<void>(`/api/dues/waivers/${id}`, { method: "DELETE" });
}

/**
 * A dues payment is an ordinary income transaction in the Dues category with a
 * brotherId — createTransaction posts the ledger row and lowers the balance in
 * one DB transaction, and refuses an overpayment with a 409.
 */
export function recordPayment(p: { brotherId: number; name: string; amount: number; method: PaymentMethod; date: string }) {
  return requestJson<{ id: number }>("/api/transactions", {
    method: "POST", headers: JSON_HEADERS,
    body: JSON.stringify({
      type: "income", category: DUES_CATEGORY, amount: p.amount, date: p.date,
      description: `Dues payment — ${p.name}`, paymentMethod: p.method, brotherId: p.brotherId,
    }),
  });
}

/** "12.5" → 12.5; anything that isn't a positive amount → 0. Rounded to the cent. */
export function parseDollars(s: string): number {
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}
