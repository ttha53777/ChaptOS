/**
 * Platform subscription status — what an org's billing relationship with US is.
 * Nothing to do with DuesPaymentStatus, which is about money inside an org.
 *
 * The middle five are Stripe's own subscription statuses, spelled exactly as
 * Stripe spells them so the webhook can persist what it receives without a
 * translation table. `free` and `quote_pending` are ours; Stripe has no
 * equivalent because in both cases there is no Stripe subscription at all.
 *
 * Stripe's `incomplete` / `incomplete_expired` are intentionally absent. They
 * describe a subscription whose first payment never landed, which for us is
 * indistinguishable from never having converted — those orgs stay `free` until
 * a checkout actually completes.
 */
export const SubscriptionStatus = {
  /** Never converted. No Stripe subscription exists. Free-tier rules apply. */
  Free: "free",
  Trialing: "trialing",
  Active: "active",
  /** Payment failed; Stripe Smart Retries are still running. */
  PastDue: "past_due",
  /** Retries exhausted. */
  Unpaid: "unpaid",
  Canceled: "canceled",
  /** Past the self-serve ceiling; a sales conversation is open. */
  QuotePending: "quote_pending",
} as const;

export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = Object.values(SubscriptionStatus);

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === "string" && (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

/**
 * Statuses that mean "there is a working payment method behind this org".
 *
 * This is the single question the seat guard asks: an org in good standing may
 * grow across a price band freely (the volume-tiered price reprices itself and
 * proration handles the difference), while an org that has never paid or whose
 * card is failing cannot add members until billing is sorted out.
 *
 * `past_due` is deliberately NOT in good standing — that is the whole point of
 * the gate. Access to existing data is never affected either way.
 */
const IN_GOOD_STANDING: readonly SubscriptionStatus[] = [
  SubscriptionStatus.Active,
  SubscriptionStatus.Trialing,
];

export function isInGoodStanding(status: string): boolean {
  return (IN_GOOD_STANDING as readonly string[]).includes(status);
}
