/**
 * Which price band an org sits in, derived from its billable headcount.
 *
 * Stored on Subscription.tier so the platform-admin list can filter and sort
 * without recomputing a headcount per org. The derivation itself lives in
 * lib/billing/tiers.ts, which owns the boundaries and the prices.
 */
export const BillingTier = {
  /** 1–4 members. */
  Free: "free",
  /** 5–50 members. */
  Standard: "standard",
  /** 51–120 members. */
  Pro: "pro",
  /** 121+ members, or a multi-org group plan. Not self-serve. */
  Custom: "custom",
} as const;

export type BillingTier = (typeof BillingTier)[keyof typeof BillingTier];

export const BILLING_TIER_IDS: readonly BillingTier[] = Object.values(BillingTier);

export function isBillingTier(value: unknown): value is BillingTier {
  return typeof value === "string" && (BILLING_TIER_IDS as readonly string[]).includes(value);
}
