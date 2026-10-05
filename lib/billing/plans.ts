import { BillingMode, isSelectedPlan, type SelectedPlan } from "@/lib/state/billing-mode";
import { isInGoodStanding } from "@/lib/state/subscription-status";
import { BILLING_BANDS, SELF_SERVE_MAX, tierForCount } from "./tiers";

export function selectedBand(plan: SelectedPlan) {
  return BILLING_BANDS.find(b => b.id === plan)!;
}

/** Membership is usage; a selected plan's quantity represents purchased capacity. */
export function subscriptionBand(members: number, sub?: { billingMode?: string; selectedPlan?: string | null } | null) {
  return sub?.billingMode === BillingMode.Selected && isSelectedPlan(sub.selectedPlan)
    ? selectedBand(sub.selectedPlan) : tierForCount(members);
}

/**
 * How many members this org can hold before adding one more needs a billing
 * change. The same three outcomes as the seat gate (checkSeatAvailable in
 * ./guard.ts), stated as a number for "68 seats left" on the dashboard roster:
 *
 *   not in good standing (free, past_due, canceled…) → the four free seats
 *   selected plan in good standing                   → that plan's purchased capacity
 *   automatic in good standing                       → the self-serve ceiling; past it is a quote
 *
 * Not the guard's `limit` field: that reports the ceiling for a free org still
 * under four, which would advertise 116 seats nobody has paid for.
 */
export function seatCapacity(
  members: number,
  sub?: { status?: string | null; billingMode?: string; selectedPlan?: string | null } | null,
): number {
  const freeSeats = BILLING_BANDS[0].upTo ?? 4;
  if (!sub || !isInGoodStanding(sub.status ?? "")) return freeSeats;
  if (sub.billingMode === BillingMode.Selected) return subscriptionBand(members, sub).upTo ?? freeSeats;
  return SELF_SERVE_MAX;
}
