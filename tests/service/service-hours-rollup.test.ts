/**
 * Service-hours rollup tests — the core behavior of the Service Log redesign.
 *
 * Brother.serviceHours must always equal SUM(ServiceParticipation.hours) for
 * that member. These tests exercise the recalc helpers directly (lib/service-
 * hours.ts) and the cascade path (deleting an event drops its rows), since those
 * are what the event handlers call.
 *
 * recalc* uses lib/prisma (the app client). Global setup points DATABASE_URL at
 * the test DB, so it hits the same database testPrisma seeds into.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createServiceEvent, createServiceParticipation } from "../setup/factories";
import {
  recalcBrotherServiceHours,
  recalcBrothersServiceHours,
  recalcAllBrothersServiceHours,
} from "@/lib/service-hours";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function hoursOf(brotherId: number): Promise<number> {
  const b = await testPrisma.brother.findUniqueOrThrow({ where: { id: brotherId } });
  return b.serviceHours;
}

describe("service-hours rollup", () => {
  it("sums a member's participation across two events", async () => {
    const org = await createOrg("Alpha", "alpha");
    const member = await createBrother({ orgId: org.id });
    const ev1 = await createServiceEvent({ orgId: org.id, title: "Beach Cleanup" });
    const ev2 = await createServiceEvent({ orgId: org.id, title: "Food Bank" });
    await createServiceParticipation({ orgId: org.id, serviceEventId: ev1.id, brotherId: member.id, hours: 3 });
    await createServiceParticipation({ orgId: org.id, serviceEventId: ev2.id, brotherId: member.id, hours: 2.5 });

    const total = await recalcBrotherServiceHours(member.id, org.id);
    expect(total).toBe(5.5);
    expect(await hoursOf(member.id)).toBe(5.5);
  });

  it("decreases the total when one participation is removed", async () => {
    const org = await createOrg("Alpha", "alpha");
    const member = await createBrother({ orgId: org.id });
    const ev1 = await createServiceEvent({ orgId: org.id });
    const ev2 = await createServiceEvent({ orgId: org.id });
    const p1 = await createServiceParticipation({ orgId: org.id, serviceEventId: ev1.id, brotherId: member.id, hours: 3 });
    await createServiceParticipation({ orgId: org.id, serviceEventId: ev2.id, brotherId: member.id, hours: 4 });

    await recalcBrotherServiceHours(member.id, org.id);
    expect(await hoursOf(member.id)).toBe(7);

    await testPrisma.serviceParticipation.delete({ where: { id: p1.id } });
    await recalcBrotherServiceHours(member.id, org.id);
    expect(await hoursOf(member.id)).toBe(4);
  });

  it("zeroes a member whose only participation was removed", async () => {
    const org = await createOrg("Alpha", "alpha");
    const member = await createBrother({ orgId: org.id, serviceHours: 9 });
    // No participation rows exist → recalc must reset the stale manual value to 0.
    await recalcBrotherServiceHours(member.id, org.id);
    expect(await hoursOf(member.id)).toBe(0);
  });

  it("recalcBrothersServiceHours updates a batch and zeroes the untouched", async () => {
    const org = await createOrg("Alpha", "alpha");
    const a = await createBrother({ orgId: org.id, serviceHours: 5 });
    const b = await createBrother({ orgId: org.id, serviceHours: 5 });
    const ev = await createServiceEvent({ orgId: org.id });
    await createServiceParticipation({ orgId: org.id, serviceEventId: ev.id, brotherId: a.id, hours: 6 });
    // b has no rows.

    await recalcBrothersServiceHours([a.id, b.id], org.id);
    expect(await hoursOf(a.id)).toBe(6);
    expect(await hoursOf(b.id)).toBe(0);
  });

  it("deleting a service event cascades its participations and recalcAll corrects totals", async () => {
    const org = await createOrg("Alpha", "alpha");
    const a = await createBrother({ orgId: org.id });
    const b = await createBrother({ orgId: org.id });
    const ev1 = await createServiceEvent({ orgId: org.id });
    const ev2 = await createServiceEvent({ orgId: org.id });
    await createServiceParticipation({ orgId: org.id, serviceEventId: ev1.id, brotherId: a.id, hours: 3 });
    await createServiceParticipation({ orgId: org.id, serviceEventId: ev2.id, brotherId: a.id, hours: 2 });
    await createServiceParticipation({ orgId: org.id, serviceEventId: ev1.id, brotherId: b.id, hours: 4 });

    await recalcAllBrothersServiceHours(org.id);
    expect(await hoursOf(a.id)).toBe(5);
    expect(await hoursOf(b.id)).toBe(4);

    // Delete ev1 → cascade removes a's 3h row and b's 4h row.
    await testPrisma.serviceEvent.delete({ where: { id: ev1.id } });
    await recalcAllBrothersServiceHours(org.id);
    expect(await hoursOf(a.id)).toBe(2); // only ev2's 2h remains
    expect(await hoursOf(b.id)).toBe(0);
  });

  it("ignores ghost members in the org-wide recompute", async () => {
    const org = await createOrg("Alpha", "alpha");
    const ghost = await createBrother({ orgId: org.id, isGhost: true, serviceHours: 0 });
    const ev = await createServiceEvent({ orgId: org.id });
    await createServiceParticipation({ orgId: org.id, serviceEventId: ev.id, brotherId: ghost.id, hours: 7 });

    // recalcAll only iterates non-ghost members, so the ghost's row is not summed
    // into anyone and its own serviceHours is left untouched (stays 0).
    await recalcAllBrothersServiceHours(org.id);
    expect(await hoursOf(ghost.id)).toBe(0);
  });

  it("does not leak across orgs", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const a = await createBrother({ orgId: orgA.id });
    const b = await createBrother({ orgId: orgB.id });
    const evA = await createServiceEvent({ orgId: orgA.id });
    const evB = await createServiceEvent({ orgId: orgB.id });
    await createServiceParticipation({ orgId: orgA.id, serviceEventId: evA.id, brotherId: a.id, hours: 3 });
    await createServiceParticipation({ orgId: orgB.id, serviceEventId: evB.id, brotherId: b.id, hours: 8 });

    await recalcAllBrothersServiceHours(orgA.id);
    expect(await hoursOf(a.id)).toBe(3);
    expect(await hoursOf(b.id)).toBe(0); // org B untouched by org A's recompute
  });
});
