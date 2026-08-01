/**
 * A fake Stripe, so the billing code can be tested at all.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * Before this file there was no Stripe mock anywhere in the repo, and as a
 * result every Stripe-facing line was untested: `handleStripeEvent`,
 * `applySubscription`, `mapStatus`, `resolveOrgId`, all of `sync.ts`, all of
 * `billing-service.ts`, and the `deleteOrg` cancel path. The only billing tests
 * that existed were the ones that happened not to need Stripe — the pure tier
 * maths, the headcount query, the seat gate and `claimEvent`.
 *
 * That is the wrong coverage shape for the one subsystem with money attached.
 * Every bug found in billing's first week was a state divergence between our row
 * and Stripe's, which is precisely the class of bug you cannot test without
 * being able to make Stripe say something specific.
 *
 * ── How to use it ────────────────────────────────────────────────────────────
 *
 *   vi.mock("@/lib/stripe", () => stripeMockModule());   // top level, hoisted
 *
 *   beforeEach(() => { resetStripeMock(); });
 *   stripeMock.subscriptions.retrieve.mockResolvedValue(fakeSubscription({ ... }));
 *   expect(stripeMock.subscriptionItems.update).toHaveBeenCalledWith("si_1", {
 *     quantity: 6, proration_behavior: "create_prorations",
 *   });
 *
 * `stripeEnabled()` and `stripeWebhooksEnabled()` return true by default —
 * otherwise every path under test would short-circuit before reaching Stripe.
 * Flip them with `setStripeEnabled(false)` to exercise the unconfigured
 * deployment.
 */

import { vi } from "vitest";
import type Stripe from "stripe";

export const stripeMock = {
  subscriptions: {
    retrieve: vi.fn(),
    list:     vi.fn(),
    cancel:   vi.fn(),
  },
  subscriptionItems: {
    update: vi.fn(),
  },
  checkout: {
    sessions: { create: vi.fn() },
  },
  billingPortal: {
    sessions: { create: vi.fn() },
  },
  customers: {
    create: vi.fn(),
  },
  charges: {
    retrieve: vi.fn(),
  },
};

let enabled = true;

export function setStripeEnabled(value: boolean): void {
  enabled = value;
}

/**
 * The module factory for `vi.mock("@/lib/stripe", ...)`.
 *
 * Must be a function rather than a plain object: vi.mock is hoisted above every
 * import, so the factory body is the only place allowed to touch module state.
 */
export function stripeMockModule() {
  return {
    stripe:                () => stripeMock as unknown as Stripe,
    stripeEnabled:         () => enabled,
    stripeWebhooksEnabled: () => enabled,
    stripePriceId:         () => "price_test",
  };
}

/** Clear every recorded call and queued result. Call in `beforeEach`. */
export function resetStripeMock(): void {
  enabled = true;
  for (const group of Object.values(stripeMock)) {
    for (const fn of Object.values(group)) {
      if (typeof fn === "function" && "mockReset" in fn) (fn as ReturnType<typeof vi.fn>).mockReset();
      else if (fn && typeof fn === "object") {
        for (const inner of Object.values(fn)) {
          (inner as ReturnType<typeof vi.fn>).mockReset();
        }
      }
    }
  }
  // Sensible defaults so a test only has to state what it cares about.
  stripeMock.subscriptions.list.mockResolvedValue({ data: [] });
  stripeMock.subscriptionItems.update.mockResolvedValue({});
  stripeMock.subscriptions.cancel.mockResolvedValue({});
  stripeMock.customers.create.mockResolvedValue({ id: "cus_test" });
  stripeMock.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.test/s" });
  stripeMock.billingPortal.sessions.create.mockResolvedValue({ url: "https://portal.stripe.test/s" });
}

/**
 * A Stripe.Subscription shaped the way the code actually reads it.
 *
 * Two field locations are load-bearing and easy to get wrong, because they moved
 * in Stripe 22.x and the old paths no longer exist on the types:
 *   · `current_period_end` lives on the ITEM, not the subscription
 *   · an invoice's subscription is at `parent.subscription_details.subscription`
 * Building fixtures through these helpers keeps every test honest about that.
 */
export function fakeSubscription(opts: {
  id?: string;
  customer?: string;
  status?: Stripe.Subscription.Status;
  itemId?: string;
  priceId?: string;
  quantity?: number;
  organizationId?: number;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
} = {}): Stripe.Subscription {
  return {
    id:       opts.id ?? "sub_test",
    customer: opts.customer ?? "cus_test",
    status:   opts.status ?? "active",
    cancel_at_period_end: opts.cancelAtPeriodEnd ?? false,
    metadata: opts.organizationId ? { organizationId: String(opts.organizationId) } : {},
    items: {
      data: [{
        id:       opts.itemId ?? "si_test",
        quantity: opts.quantity ?? 1,
        price:    { id: opts.priceId ?? "price_test" },
        current_period_end: opts.currentPeriodEnd ?? Math.floor(Date.now() / 1000) + 86_400,
      }],
    },
  } as unknown as Stripe.Subscription;
}

/** A Stripe.Invoice with the subscription in its Stripe 22.x location. */
export function fakeInvoice(opts: {
  id?: string;
  customer?: string;
  subscription?: string;
  amountDue?: number;
  organizationId?: number;
  hostedInvoiceUrl?: string;
} = {}): Stripe.Invoice {
  return {
    id:         opts.id ?? "in_test",
    customer:   opts.customer ?? "cus_test",
    amount_due: opts.amountDue ?? 2500,
    hosted_invoice_url: opts.hostedInvoiceUrl ?? null,
    parent: {
      subscription_details: {
        subscription: opts.subscription ?? "sub_test",
        metadata: opts.organizationId ? { organizationId: String(opts.organizationId) } : null,
      },
    },
  } as unknown as Stripe.Invoice;
}

/** Minimal Stripe.Event envelope. */
export function fakeEvent(type: string, object: unknown, id = `evt_${Math.random().toString(36).slice(2)}`): Stripe.Event {
  return { id, type, data: { object } } as unknown as Stripe.Event;
}
