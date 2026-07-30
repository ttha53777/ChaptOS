/**
 * Stripe client. Lazy, and deliberately inert when unconfigured.
 *
 * ── Why nothing throws at import time ────────────────────────────────────────
 * Billing is one feature among many. A contributor without Stripe keys, CI, and
 * the whole vitest suite must all be able to import anything under lib/billing
 * without exploding — so this module never touches process.env at module scope
 * and never constructs a client until someone actually calls Stripe.
 *
 * The contract for callers: check `stripeEnabled()` first and degrade to
 * "free tier, billing unavailable". Calling `stripe()` when disabled throws,
 * which is correct — that path is a bug, not a runtime condition.
 *
 * Configuration (see .env.example):
 *   STRIPE_SECRET_KEY      sk_test_… / sk_live_…
 *   STRIPE_WEBHOOK_SECRET  whsec_… — from `stripe listen` in dev, Dashboard in prod
 *   STRIPE_PRICE_ID        price_… — output of scripts/stripe-setup.ts
 */

import Stripe from "stripe";

declare global {
  // eslint-disable-next-line no-var
  var _stripe: Stripe | undefined;
}

/**
 * True when billing is configured well enough to talk to Stripe at all.
 *
 * The price id is part of the check on purpose: a secret key without a price
 * can create customers but cannot create a subscription, which is a half-working
 * state that would fail at checkout instead of failing at the feature flag.
 */
export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

/** True when webhook deliveries can be verified. Checked by the webhook route. */
export function stripeWebhooksEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

/** The configured recurring Price. Throws if unset — callers gate on stripeEnabled(). */
export function stripePriceId(): string {
  const id = process.env.STRIPE_PRICE_ID;
  if (!id) throw new Error("stripe: STRIPE_PRICE_ID is not set (run scripts/stripe-setup.ts)");
  return id;
}

/**
 * The shared client. Cached on globalThis in dev so next-dev's module reloading
 * doesn't leak a new HTTPS agent on every edit — same pattern as lib/prisma.ts.
 */
export function stripe(): Stripe {
  if (globalThis._stripe) return globalThis._stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "stripe: STRIPE_SECRET_KEY is not set. Guard billing paths with stripeEnabled().",
    );
  }

  // No explicit apiVersion: the SDK pins the version it was built against, which
  // is what its TypeScript types describe. Overriding with a string the types
  // don't know about is how you get responses that don't match their own types.
  const client = new Stripe(key, {
    // Surfaces this app in Stripe's request logs, which is worth the two lines
    // the first time a webhook misbehaves.
    appInfo: { name: "figurints", url: "https://figurints.com" },
    // Network calls sit inside request handlers; fail fast rather than holding a
    // route open. Stripe retries idempotent requests on its own.
    timeout: 10_000,
    maxNetworkRetries: 2,
  });

  if (process.env.NODE_ENV !== "production") globalThis._stripe = client;
  return client;
}
