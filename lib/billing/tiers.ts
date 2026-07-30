/**
 * The price bands. Single source of truth — the app derives an org's tier from
 * this table, and scripts/stripe-setup.ts builds the Stripe Price from the same
 * array, so the two can never disagree about where a boundary sits.
 *
 * Pure module: no DB, no env, no Stripe import. Safe on the client (a pricing
 * page will want it).
 *
 *   1 – 4     free
 *   5 – 50    $25/mo
 *   51 – 120  $65/mo
 *   121 +     custom quote — not self-serve
 *
 * ── How this maps onto ONE Stripe Price ──────────────────────────────────────
 *
 * The Price is `billing_scheme=tiered`, `tiers_mode=volume`. In volume mode
 * Stripe finds the single tier the quantity falls into and charges
 * `(quantity × unit_amount) + flat_amount`. Setting `unit_amount: 0` and putting
 * the band price in `flat_amount` therefore yields exactly a flat fee per band.
 *
 * The consequence worth internalising: a band change is only a *quantity* update
 * on the subscription item. There is no plan switching, no price swapping, and
 * no second Product anywhere in this codebase.
 */

import { BillingTier } from "@/lib/state/billing-tier";

export interface BillingBand {
  id: BillingTier;
  /** Inclusive upper bound on member count; null means unbounded. */
  upTo: number | null;
  /** Monthly price in cents, or null when the band has no self-serve price. */
  priceCents: number | null;
  /** Inclusive lower bound, derived — handy for rendering "5–50 members". */
  from: number;
  label: string;
}

/** Ordered by ascending bound. `tierForCount` relies on that ordering. */
export const BILLING_BANDS: readonly BillingBand[] = [
  { id: BillingTier.Free,     from: 1,   upTo: 4,    priceCents: 0,    label: "Free" },
  { id: BillingTier.Standard, from: 5,   upTo: 50,   priceCents: 2500, label: "Standard" },
  { id: BillingTier.Pro,      from: 51,  upTo: 120,  priceCents: 6500, label: "Pro" },
  { id: BillingTier.Custom,   from: 121, upTo: null, priceCents: null, label: "Custom" },
] as const;

/**
 * Largest member count an org can reach without talking to a human. Above this
 * the app stops offering checkout and offers a quote instead.
 */
export const SELF_SERVE_MAX = 120;

/** The band a given headcount falls into. Counts below 1 are treated as 1. */
export function tierForCount(count: number): BillingBand {
  const n = Math.max(1, Math.floor(count));
  for (const band of BILLING_BANDS) {
    if (band.upTo === null || n <= band.upTo) return band;
  }
  // Unreachable — the last band is unbounded — but a total function is cheaper
  // to reason about than a non-null assertion at every call site.
  return BILLING_BANDS[BILLING_BANDS.length - 1];
}

/** Monthly price in cents for a headcount, or null above the self-serve ceiling. */
export function priceForCount(count: number): number | null {
  return tierForCount(count).priceCents;
}

/** True when this headcount is past what checkout can handle on its own. */
export function needsQuote(count: number): boolean {
  return count > SELF_SERVE_MAX;
}

/** "$25" / "$0" / "Custom" — for banners, emails and the platform-admin table. */
export function formatPrice(priceCents: number | null): string {
  if (priceCents === null) return "Custom";
  if (priceCents === 0) return "$0";
  return priceCents % 100 === 0
    ? `$${priceCents / 100}`
    : `$${(priceCents / 100).toFixed(2)}`;
}

/** "1–4 members" / "121+ members" — band copy without hardcoding numbers twice. */
export function formatRange(band: BillingBand): string {
  return band.upTo === null ? `${band.from}+ members` : `${band.from}–${band.upTo} members`;
}

/**
 * The `tiers` array for the Stripe Price, derived from BILLING_BANDS.
 *
 * Two things here are load-bearing:
 *
 *  1. `unit_amount: 0` on every tier. The band price rides entirely in
 *     `flat_amount`, which is what turns volume tiering into flat-fee-per-band.
 *     The free tier omits flat_amount so it bills nothing at all.
 *
 *  2. The final `up_to: "inf"` tier, priced the same as Pro. Stripe documents
 *     `inf` as a fallback tier and does NOT document what happens when a
 *     quantity exceeds the last bound — so without it, an org growing from 120
 *     to 121 could make every subsequent seat-sync call start failing. With it,
 *     the true quantity is always accepted and anything past the ceiling simply
 *     bills at the Pro rate while sales negotiates. The app separately refuses
 *     to grow past SELF_SERVE_MAX without a quote, so this tier should never be
 *     the thing that decides an org's bill — it exists so that a growing chapter
 *     degrades into a sales conversation rather than an API error.
 */
export function stripeTiers(): Array<{ up_to: number | "inf"; unit_amount: number; flat_amount?: number }> {
  const priced = BILLING_BANDS.filter(b => b.priceCents !== null);
  const tiers = priced.map(b => ({
    up_to: b.upTo as number,
    unit_amount: 0,
    ...(b.priceCents ? { flat_amount: b.priceCents } : {}),
  }));
  const top = priced[priced.length - 1];
  return [...tiers, { up_to: "inf" as const, unit_amount: 0, flat_amount: top.priceCents ?? 0 }];
}
