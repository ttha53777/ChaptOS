import { z } from "zod";
import { SALES_LEAD_KINDS } from "@/lib/state/sales-lead";

/**
 * Platform billing inputs. Nothing here touches the dues/treasury books — see
 * lib/validation/dues.ts for money moving inside an org.
 *
 * Note there is no "amount" or "tier" anywhere in this file. Price is never a
 * client input: it is derived server-side from the org's headcount by
 * lib/billing/tiers.ts, so a caller cannot ask to be put on a cheaper plan.
 */

// Control characters and backslashes, the usual tricks for smuggling an
// authority component past a naive "starts with /" check — some URL parsers
// treat "/\evil.com" as protocol-relative.
function hasForbiddenChars(s: string): boolean {
  // Backslash, or any C0 control character.
  return [...s].some(ch => ch === "\\" || ch.codePointAt(0)! < 0x20);
}

/**
 * Where Stripe should send the browser back to. Accepted as a PATH, never a
 * full URL — the origin is filled in server-side. Taking a full URL here would
 * make this an open redirect wearing a billing costume: Stripe bounces the user
 * to whatever return_url it is handed.
 */
const returnPath = z.string()
  .max(300)
  .refine(s => s.startsWith("/") && !s.startsWith("//"), "must be a same-origin path")
  .refine(s => !hasForbiddenChars(s), "invalid characters in path");

export const startCheckoutInput = z.object({
  returnPath: returnPath.optional(),
});
export type StartCheckoutInput = z.infer<typeof startCheckoutInput>;

export const openPortalInput = z.object({
  returnPath: returnPath.optional(),
});
export type OpenPortalInput = z.infer<typeof openPortalInput>;

export const requestQuoteInput = z.object({
  kind: z.enum(SALES_LEAD_KINDS as readonly [string, ...string[]]),
  // Both default from the actor server-side when omitted, so the common case is
  // a request with nothing but a kind.
  name:    z.string().trim().min(1).max(120).optional(),
  email:   z.email().max(200).optional(),
  message: z.string().trim().max(2000).optional(),
});
export type RequestQuoteInput = z.infer<typeof requestQuoteInput>;
