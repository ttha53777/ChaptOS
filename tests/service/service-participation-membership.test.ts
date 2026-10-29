/**
 * Logging service hours only ever touches this org's roster.
 *
 * logParticipation used to write a row for any brotherId the FK accepted, and
 * the per-event list then named that person from their Brother row — so an
 * officer of any org (including one they just created) could log hours for
 * guessed ids and read back strangers' names and avatars. These pin the roster
 * check, the all-or-nothing write, and the list's filter on rows already written.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createServiceEvent, createServiceParticipation, rosterOf } from "../setup/factories";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import type { RequestContext } from "@/lib/context";
import { listParticipationForEvent, logMyParticipation, logParticipation } from "@/lib/services/service-participation-service";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await testPrisma.$disconnect(); });

function makeCtx(orgId: number, actorId: number): RequestContext {
  return {
    requestId: randomUUID(), orgId, actorId, actorName: "Officer", actorEmail: null,
    authUserId: "auth-officer", membershipId: null, permissions: 0, maxRank: 100,
    isOrgAdmin: true, db: db(orgId),
  } as unknown as RequestContext;
}

const rowsFor = (serviceEventId: number) => testPrisma.serviceParticipation.findMany({ where: { serviceEventId } });
const hoursOf = async (brotherId: number) => (await rosterOf(brotherId))!.serviceHours;

describe("logging service hours stays on the roster", () => {
  it("refuses a member of another org and writes nothing", async () => {
    const a = await createOrg("Alpha", "alpha");
    const b = await createOrg("Beta", "beta");
    const officer = await createBrother({ orgId: a.id });
    const outsider = await createBrother({ orgId: b.id });
    const ev = await createServiceEvent({ orgId: a.id });

    await expect(logParticipation(makeCtx(a.id, officer.id), ev.id, { entries: [{ brotherId: outsider.id, hours: 5 }] }))
      .rejects.toThrow(NotFoundError);
    expect(await rowsFor(ev.id)).toEqual([]);
  });

  it("writes nothing when one id in the batch is not a member", async () => {
    const org = await createOrg("Alpha", "alpha");
    const officer = await createBrother({ orgId: org.id });
    const member = await createBrother({ orgId: org.id });
    const ev = await createServiceEvent({ orgId: org.id });

    await expect(logParticipation(makeCtx(org.id, officer.id), ev.id, {
      entries: [{ brotherId: member.id, hours: 4 }, { brotherId: 999_999, hours: 1 }],
    })).rejects.toThrow(NotFoundError);
    expect(await rowsFor(ev.id)).toEqual([]);
    expect(await hoursOf(member.id)).toBe(0);
  });

  it("keeps the last entry for an id repeated in one payload", async () => {
    const org = await createOrg("Alpha", "alpha");
    const officer = await createBrother({ orgId: org.id });
    const member = await createBrother({ orgId: org.id });
    const ev = await createServiceEvent({ orgId: org.id });

    await logParticipation(makeCtx(org.id, officer.id), ev.id, {
      entries: [{ brotherId: member.id, hours: 2 }, { brotherId: member.id, hours: 3 }],
    });
    expect((await rowsFor(ev.id)).map(r => r.hours)).toEqual([3]);
    expect(await hoursOf(member.id)).toBe(3);
  });

  it("updates existing rows and adds new ones in the same save", async () => {
    const org = await createOrg("Alpha", "alpha");
    const officer = await createBrother({ orgId: org.id });
    const a = await createBrother({ orgId: org.id });
    const b = await createBrother({ orgId: org.id });
    const c = await createBrother({ orgId: org.id });
    const ev = await createServiceEvent({ orgId: org.id });
    await createServiceParticipation({ orgId: org.id, serviceEventId: ev.id, brotherId: a.id, hours: 1 });
    await createServiceParticipation({ orgId: org.id, serviceEventId: ev.id, brotherId: c.id, hours: 6 });

    await logParticipation(makeCtx(org.id, officer.id), ev.id, {
      entries: [{ brotherId: a.id, hours: 2 }, { brotherId: b.id, hours: 2 }],
    });
    const byBrother = new Map((await rowsFor(ev.id)).map(r => [r.brotherId, r.hours]));
    expect(byBrother).toEqual(new Map([[a.id, 2], [b.id, 2], [c.id, 6]])); // c, not listed, is untouched
    expect(await hoursOf(a.id)).toBe(2);
    expect(await hoursOf(b.id)).toBe(2);
  });

  it("lets two first-time logs for the same member both succeed", async () => {
    const org = await createOrg("Alpha", "alpha");
    const member = await createBrother({ orgId: org.id });
    const ev = await createServiceEvent({ orgId: org.id });

    const results = await Promise.allSettled([
      logMyParticipation(makeCtx(org.id, member.id), ev.id, { hours: 2 }),
      logMyParticipation(makeCtx(org.id, member.id), ev.id, { hours: 3 }),
    ]);
    expect(results.map(r => r.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(await rowsFor(ev.id)).toHaveLength(1);
  });

  it("leaves a row for someone off the roster out of the event's list", async () => {
    const a = await createOrg("Alpha", "alpha");
    const b = await createOrg("Beta", "beta");
    const officer = await createBrother({ orgId: a.id });
    const member = await createBrother({ orgId: a.id, name: "Ana Torres" });
    const outsider = await createBrother({ orgId: b.id, name: "Someone Else" });
    const ev = await createServiceEvent({ orgId: a.id });
    await createServiceParticipation({ orgId: a.id, serviceEventId: ev.id, brotherId: member.id, hours: 2 });
    // A row written before the roster check existed.
    await createServiceParticipation({ orgId: a.id, serviceEventId: ev.id, brotherId: outsider.id, hours: 5 });

    const list = await listParticipationForEvent(makeCtx(a.id, officer.id), ev.id);
    expect(list.map(r => r.brother.name)).toEqual(["Ana Torres"]);
  });
});
