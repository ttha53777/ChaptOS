/**
 * Turning a 402 into something a person can act on.
 *
 * The seat guard (lib/billing/guard.ts) is the only thing in the app that raises
 * PaymentRequiredError, and it raises it on *growth* paths only — adding a
 * member, or un-archiving one. Nothing an org already has is ever taken away by
 * this error, and the copy built on top of it should never imply otherwise.
 *
 * Three call sites share this so they can't drift:
 *   - the roster's add-member handler        (admin: show the price, link to billing)
 *   - the roster's un-archive path           (same)
 *   - the public join screen                 (deliberately vague — see below)
 *
 * The join screen must NOT use the details. The server already sends a
 * deliberately generic message to pre-auth callers (AT_CAPACITY_PUBLIC_MESSAGE)
 * so that someone who is not a member can't read an org's billing state out of
 * an error body. Rendering `currentMembers` or `priceLabel` there would undo
 * that on the client. `seatWallFrom` exposes the fields; it's the caller's job
 * not to print them in public.
 */

import { formatPrice } from "@/lib/billing/tiers";
import { ApiError } from "./api";

export interface SeatWall {
  /** The server's own message — already written for a human, so prefer it. */
  message: string;
  /** "checkout" means a card fixes it; "quote" means it needs a conversation. */
  action: "checkout" | "quote" | null;
  currentMembers: number | null;
  requiredTier: string | null;
  /** "$25" / "Custom", via the single pricing source of truth. */
  priceLabel: string | null;
}

/**
 * A SeatWall when the failure was the seat guard, otherwise null.
 *
 * Keyed on the HTTP status rather than the error code: 402 is only ever raised
 * by PaymentRequiredError, and the status survives even if a future route hand-
 * builds the body (redeem-invite already does exactly that).
 */
export function seatWallFrom(err: unknown): SeatWall | null {
  if (!(err instanceof ApiError) || err.status !== 402) return null;

  const body = err.body as { error?: unknown; details?: unknown } | null;
  const details = body?.details as Record<string, unknown> | null | undefined;

  const serverMessage = typeof body?.error === "string" && body.error.trim() ? body.error : null;
  const action = details?.action;
  const currentMembers = details?.currentMembers;
  const requiredTier = details?.requiredTier;
  const priceCents = details?.priceCents;

  return {
    message: serverMessage ?? "This organization is at its member limit.",
    action: action === "checkout" || action === "quote" ? action : null,
    currentMembers: typeof currentMembers === "number" ? currentMembers : null,
    requiredTier: typeof requiredTier === "string" ? requiredTier : null,
    // priceCents is legitimately null above the self-serve ceiling, which
    // formatPrice renders as "Custom". Absent (undefined) is the different case
    // where the server sent no details at all, and gets no label.
    priceLabel:
      priceCents === null || typeof priceCents === "number" ? formatPrice(priceCents) : null,
  };
}
