/**
 * The seat gate. One function, called on every path that can add a billable
 * person to an org.
 *
 * ── What this does and doesn't do ────────────────────────────────────────────
 *
 * Enforcement is deliberately narrow: an org that stops paying can no longer
 * GROW, but nothing it already has is taken away. Every member keeps their
 * account, every page keeps rendering, every export keeps working. That is a
 * product commitment, not an accident — the help centre promises exports aren't
 * gated on a subscription being current, and locking a chapter out of its own
 * attendance records over a failed card would be a far worse outcome than a
 * month of unpaid usage.
 *
 * So the only lever is: you cannot add the member that would cost more money.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 *
 *   would-be count      = current billable members + 1
 *   band it lands in    = tierForCount(...)
 *
 *   band is free (≤4)               → allow. Every org gets four seats.
 *   band is custom (>120)           → block, action "quote". Applies even to a
 *                                     paying org: past the ceiling we want a
 *                                     conversation, not a bigger invoice.
 *   subscription in good standing   → allow. The volume-tiered price reprices
 *                                     itself and proration settles the
 *                                     difference; crossing 50→51 is not an event
 *                                     that needs permission.
 *   otherwise                       → block, action "checkout".
 *
 * `past_due` is not good standing — that is the entire point of the gate.
 *
 * Not a service: it's called from brother-service and from the pre-auth
 * bootstrap routes, and services may not import services.
 */

import type { db } from "@/lib/db";
import { PaymentRequiredError } from "@/lib/errors";
import { isInGoodStanding } from "@/lib/state/subscription-status";
import { BillingTier } from "@/lib/state/billing-tier";
import { countBillableMembers } from "./seats";
import { SELF_SERVE_MAX, tierForCount } from "./tiers";

type ScopedDb = ReturnType<typeof db>;

/** Message shown to someone who isn't a member of the org yet (invite/claim). */
export const AT_CAPACITY_PUBLIC_MESSAGE =
  "This organization can't accept new members right now. Ask an admin to get in touch with us.";

export interface SeatCheck {
  allowed: boolean;
  currentMembers: number;
  limit: number;
  requiredTier: string;
  priceCents: number | null;
  action: "checkout" | "quote" | null;
}

/**
 * Evaluate whether one more member would be allowed, without throwing.
 *
 * Exposed separately from `assertSeatAvailable` so the billing summary can show
 * "3 of 4 seats used, next member needs a card" without provoking an error, and
 * so tests can assert the decision rather than catching.
 */
export async function checkSeatAvailable(scoped: ScopedDb): Promise<SeatCheck> {
  const [currentMembers, sub] = await Promise.all([
    countBillableMembers(scoped),
    scoped.subscription.findFirst({ select: { status: true } }),
  ]);

  const next = currentMembers + 1;
  const band = tierForCount(next);
  const status = sub?.status ?? "free";

  // Four seats are free for everyone, forever, regardless of billing state.
  if (band.id === BillingTier.Free) {
    return { allowed: true, currentMembers, limit: SELF_SERVE_MAX, requiredTier: band.id, priceCents: band.priceCents, action: null };
  }

  // Past the self-serve ceiling nobody self-serves — not even a paying org.
  if (band.id === BillingTier.Custom) {
    return {
      allowed: false, currentMembers, limit: SELF_SERVE_MAX,
      requiredTier: band.id, priceCents: null, action: "quote",
    };
  }

  // A working payment method covers any band change below the ceiling.
  if (isInGoodStanding(status)) {
    return { allowed: true, currentMembers, limit: SELF_SERVE_MAX, requiredTier: band.id, priceCents: band.priceCents, action: null };
  }

  return {
    allowed: false, currentMembers, limit: currentMembers,
    requiredTier: band.id, priceCents: band.priceCents, action: "checkout",
  };
}

/**
 * Throw PaymentRequiredError (402) if one more member isn't allowed.
 *
 * @param publicMessage pass true on pre-auth paths (invite redemption, claim) so
 *   the message stays generic. Someone who is not yet a member of the org must
 *   not learn its billing state from an error body.
 */
export async function assertSeatAvailable(scoped: ScopedDb, publicMessage = false): Promise<void> {
  const check = await checkSeatAvailable(scoped);
  if (check.allowed) return;

  const detail = check.action === "quote"
    ? `This organization is above ${SELF_SERVE_MAX} members, which is past self-serve. Request a quote to keep growing.`
    : `Adding another member puts this organization on the ${check.requiredTier} plan. Add a payment method to continue.`;

  throw new PaymentRequiredError(publicMessage ? AT_CAPACITY_PUBLIC_MESSAGE : detail, {
    currentMembers: check.currentMembers,
    limit:          check.limit,
    requiredTier:   check.requiredTier,
    priceCents:     check.priceCents,
    action:         check.action ?? "checkout",
  });
}
