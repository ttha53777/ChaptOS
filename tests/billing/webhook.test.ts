/**
 * Stripe webhook invariants.
 *
 * Two things are pinned here that would fail silently in production:
 *
 *   1. Idempotency, including the subtle half — a delivery that FAILED must be
 *      allowed to retry. Treating "row exists" as "already handled" would turn
 *      every transient error into a permanently dropped billing event.
 *
 *   2. The CSRF gate. This endpoint is unauthenticated and relies on
 *      isSameOrigin() allowing a request with no Origin and no Sec-Fetch-Site.
 *      If that guard is ever made to fail closed, Stripe silently receives 403s
 *      and retries for three days before giving up — no error, no log, no
 *      billing. The assertion below is the tripwire.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { claimEvent, markProcessed } from "@/lib/billing/webhook";
import { isSameOrigin } from "@/lib/auth/same-origin";
import { resetDb, testPrisma } from "../setup/prisma";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("claimEvent — idempotency", () => {
  it("admits an event the first time", async () => {
    expect(await claimEvent("evt_first", "invoice.paid")).toBe(true);

    const row = await testPrisma.stripeEvent.findUnique({ where: { id: "evt_first" } });
    expect(row?.type).toBe("invoice.paid");
    expect(row?.processedAt).toBeNull();
  });

  it("refuses a replay of a delivery that already succeeded", async () => {
    await claimEvent("evt_done", "invoice.paid");
    await markProcessed("evt_done");

    expect(await claimEvent("evt_done", "invoice.paid")).toBe(false);
  });

  it("ADMITS a retry when the previous delivery errored", async () => {
    // The case that makes this more than a unique index. Stripe redelivers after
    // our 500; if we refused here the event would be lost forever.
    await claimEvent("evt_failed", "customer.subscription.updated");
    await markProcessed("evt_failed", "database was unreachable");

    expect(await claimEvent("evt_failed", "customer.subscription.updated")).toBe(true);
  });

  it("ADMITS a retry when a previous delivery never finished", async () => {
    // Claimed but never marked — the process died mid-handler. Stripe retries.
    await claimEvent("evt_orphan", "invoice.paid");

    expect(await claimEvent("evt_orphan", "invoice.paid")).toBe(true);
  });

  it("keeps exactly one row per event id no matter how many deliveries arrive", async () => {
    await claimEvent("evt_multi", "invoice.paid");
    await claimEvent("evt_multi", "invoice.paid");
    await claimEvent("evt_multi", "invoice.paid");

    expect(await testPrisma.stripeEvent.count({ where: { id: "evt_multi" } })).toBe(1);
  });

  it("clears a recorded error once a later delivery succeeds", async () => {
    await claimEvent("evt_recover", "invoice.paid");
    await markProcessed("evt_recover", "transient failure");
    await claimEvent("evt_recover", "invoice.paid");
    await markProcessed("evt_recover");

    const row = await testPrisma.stripeEvent.findUnique({ where: { id: "evt_recover" } });
    expect(row?.error).toBeNull();
    expect(row?.processedAt).not.toBeNull();
    // And it is now a genuine replay.
    expect(await claimEvent("evt_recover", "invoice.paid")).toBe(false);
  });
});

describe("CSRF gate — the webhook's unauthenticated path", () => {
  /** A POST shaped like Stripe's: no Origin, no Sec-Fetch-Site, no cookies. */
  function stripeStylePost(): Request {
    return new Request("https://app.example.com/api/billing/webhook", {
      method:  "POST",
      headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=deadbeef" },
      body:    "{}",
    });
  }

  it("lets a server-to-server POST with no Origin through", async () => {
    // If this ever fails, /api/billing/webhook is returning 403 to Stripe and
    // billing has silently stopped. proxy.ts routes every mutating /api/* call
    // through this guard.
    expect(isSameOrigin(stripeStylePost())).toBe(true);
  });

  it("still rejects a genuine cross-site browser POST", async () => {
    const forged = new Request("https://app.example.com/api/billing/webhook", {
      method:  "POST",
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
      body:    "{}",
    });
    expect(isSameOrigin(forged)).toBe(false);
  });
});
