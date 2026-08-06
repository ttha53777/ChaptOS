/**
 * The seat gate.
 *
 * The rule under test, in one line: you may not add the member that would cost
 * more money — and nothing else is ever restricted. These tests pin both halves,
 * because the second half is a product commitment (an org that stops paying
 * keeps every member, every page and every export it already had) and is much
 * easier to erode by accident than the first.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { assertSeatAvailable, checkSeatAvailable, AT_CAPACITY_PUBLIC_MESSAGE } from "@/lib/billing/guard";
import { PaymentRequiredError } from "@/lib/errors";
import { createOrg, createBrother } from "../setup/factories";
import { resetDb, testPrisma } from "../setup/prisma";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

/** Seed `n` billable members into an org, cheaply. */
async function seedMembers(orgId: number, n: number) {
  if (n === 0) return;
  for (let i = 0; i < n; i++) {
    await createBrother({ orgId, name: `Member ${i}` });
  }
}

async function setStatus(orgId: number, status: string) {
  await testPrisma.subscription.upsert({
    where:  { organizationId: orgId },
    update: { status },
    create: { organizationId: orgId, status },
  });
}

describe("checkSeatAvailable — the free allowance", () => {
  it("allows growth up to the fourth member with no subscription at all", async () => {
    const org = await createOrg("Free", "free-org");
    await seedMembers(org.id, 3);

    const check = await checkSeatAvailable(db(org.id));
    expect(check.allowed).toBe(true);
    expect(check.currentMembers).toBe(3);
  });

  it("blocks the fifth member when nobody has ever paid", async () => {
    const org = await createOrg("Fifth", "fifth-org");
    await seedMembers(org.id, 4);

    const check = await checkSeatAvailable(db(org.id));
    expect(check.allowed).toBe(false);
    expect(check.action).toBe("checkout");
    expect(check.requiredTier).toBe("standard");
    expect(check.priceCents).toBe(2500);
  });
});

describe("checkSeatAvailable — paying orgs", () => {
  it("lets an active org cross a price band without asking permission", async () => {
    // 50 -> 51 moves them from $25 to $65. They have a working card, the
    // volume-tiered price reprices itself, proration settles the difference.
    // Interrupting that with a 402 would be user-hostile and pointless.
    const org = await createOrg("Growing", "growing-org");
    await seedMembers(org.id, 50);
    await setStatus(org.id, "active");

    const check = await checkSeatAvailable(db(org.id));
    expect(check.allowed).toBe(true);
  });

  it("treats trialing as good standing", async () => {
    const org = await createOrg("Trial", "trial-org");
    await seedMembers(org.id, 10);
    await setStatus(org.id, "trialing");

    expect((await checkSeatAvailable(db(org.id))).allowed).toBe(true);
  });

  it.each(["past_due", "unpaid", "canceled"])(
    "blocks growth when the subscription is %s",
    async (status) => {
      const org = await createOrg(`S ${status}`, `s-${status.replace("_", "-")}`);
      await seedMembers(org.id, 10);
      await setStatus(org.id, status);

      const check = await checkSeatAvailable(db(org.id));
      expect(check.allowed).toBe(false);
      expect(check.action).toBe("checkout");
    },
  );

  it("still gives a past_due org its first four seats", async () => {
    // The gate is about crossing a paid band, not about punishment. An org whose
    // card failed and then shrank below five people owes nothing and is unblocked.
    const org = await createOrg("Shrunk", "shrunk-org");
    await seedMembers(org.id, 2);
    await setStatus(org.id, "past_due");

    expect((await checkSeatAvailable(db(org.id))).allowed).toBe(true);
  });
});

describe("checkSeatAvailable — the self-serve ceiling", () => {
  it("routes past 120 to a quote even for a paying org", async () => {
    const org = await createOrg("Huge", "huge-org");
    await seedMembers(org.id, 120);
    await setStatus(org.id, "active");

    const check = await checkSeatAvailable(db(org.id));
    expect(check.allowed).toBe(false);
    expect(check.action).toBe("quote");
    expect(check.priceCents).toBeNull();
  });

  it("allows the 120th member itself", async () => {
    const org = await createOrg("AtLimit", "at-limit-org");
    await seedMembers(org.id, 119);
    await setStatus(org.id, "active");

    expect((await checkSeatAvailable(db(org.id))).allowed).toBe(true);
  });
});

describe("assertSeatAvailable", () => {
  it("throws a 402 carrying what the client needs to act", async () => {
    const org = await createOrg("Throws", "throws-org");
    await seedMembers(org.id, 4);

    await expect(assertSeatAvailable(db(org.id))).rejects.toThrow(PaymentRequiredError);

    const err = await assertSeatAvailable(db(org.id)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaymentRequiredError);
    const domain = err as PaymentRequiredError;
    expect(domain.status).toBe(402);
    expect(domain.code).toBe("PAYMENT_REQUIRED");
    expect(domain.details).toMatchObject({
      currentMembers: 4,
      requiredTier:   "standard",
      action:         "checkout",
    });
  });

  it("does not leak billing state to a non-member", async () => {
    // Invite redemption runs this on behalf of someone who is not in the org
    // yet. They must not be able to read its plan or headcount out of an error.
    const org = await createOrg("Private", "private-org");
    await seedMembers(org.id, 4);

    const err = await assertSeatAvailable(db(org.id), true).catch((e: unknown) => e);
    expect((err as Error).message).toBe(AT_CAPACITY_PUBLIC_MESSAGE);
    expect((err as Error).message).not.toMatch(/standard|25|\$/);
  });

  it("resolves silently when there is room", async () => {
    const org = await createOrg("Room", "room-org");
    await seedMembers(org.id, 1);
    await expect(assertSeatAvailable(db(org.id))).resolves.toBeUndefined();
  });
});
