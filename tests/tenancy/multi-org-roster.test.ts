/**
 * One account, a roster spot in several orgs — and none of them can see or move
 * another's numbers.
 *
 * This is the guard for the Phase 2 model: `Brother` is one shared identity row
 * per human, `Membership` is one roster row per human PER ORG, and every value an
 * org assesses lives on the latter. The failure modes below are all the same
 * shape — an org-scoped write that loses its org filter and rewrites the same
 * person's row everywhere — but they cost different things, so each is pinned
 * separately.
 *
 * The dues cases matter most. `duesOwed` moved from a column with exactly one row
 * per person to a column with one row per person per org, so an `updateMany`
 * keyed on `brotherId` alone now silently decrements two chapters' balances from
 * one payment. That is why the ledger paths go through `member.onTx(tx)` rather
 * than a hand-written WHERE (lib/db/tenant.ts).
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import {
  createOrg, createBrother, joinOrg, createSemester, createCalendarEvent,
  rosterOf, accountOf,
} from "../setup/factories";
import { db } from "@/lib/db";
import { adjustDues } from "@/lib/services/dues-service";
import { createTransaction, softDeleteTransaction } from "@/lib/services/transaction-service";
import { deleteBrother, updateBrother } from "@/lib/services/brother-service";
import { recalcBrotherAttendance } from "@/lib/attendance";
import { PERMISSIONS, ALL_PERMISSIONS } from "@/lib/permissions";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

function ctxFor(orgId: number, actorId: number, over: Partial<RequestContext> = {}): RequestContext {
  return {
    requestId:       randomUUID(),
    orgId,
    actorId,
    actorName:       "Tester",
    actorEmail:      null,
    authUserId:      "auth-test",
    membershipId:    null,
    permissions:     ALL_PERMISSIONS,
    maxRank:         100,
    isOrgAdmin:      true,
    isPlatformAdmin: false,
    db:              db(orgId),
    ...over,
  };
}

/**
 * One person on two rosters, owing money to both.
 *
 * Equal opening balances on purpose: if a write leaks across orgs, an assertion
 * on the untouched org fails no matter which direction the leak ran.
 */
async function personInTwoOrgs(opts: { owedA?: number; owedB?: number } = {}) {
  const orgA = await createOrg("Alpha", "alpha");
  const orgB = await createOrg("Beta", "beta");
  const adminA = await createBrother({ orgId: orgA.id, isAdmin: true, isOrgAdmin: true });
  const adminB = await createBrother({ orgId: orgB.id, isAdmin: true, isOrgAdmin: true });

  const person = await createBrother({
    orgId: orgA.id, name: "Robert Chen", membershipName: "Rob",
    duesOwed: opts.owedA ?? 200,
  });
  await joinOrg({
    brotherId: person.id, orgId: orgB.id, membershipName: "Robert Chen",
    duesOwed: opts.owedB ?? 200,
  });

  return {
    orgA, orgB, person,
    ctxA: ctxFor(orgA.id, adminA.id),
    ctxB: ctxFor(orgB.id, adminB.id),
  };
}

describe("dues are owed to ONE chapter", () => {
  it("a payment recorded in org A leaves org B's balance alone", async () => {
    const { orgA, orgB, person, ctxA } = await personInTwoOrgs();
    await createSemester({ orgId: orgA.id, label: "SP26", isActive: true });

    await createTransaction(ctxA, {
      type:        "income",
      category:    "Dues",
      brotherId:   person.id,
      amount:      200,
      date:        "2026-05-01",
      description: "Dues in full",
      status:      "posted",
      calendarEventIds: [],
    });

    expect((await rosterOf(person.id, orgA.id))!.duesOwed).toBe(0);
    expect((await rosterOf(person.id, orgB.id))!.duesOwed).toBe(200);
  });

  it("voiding that payment restores the balance in org A only", async () => {
    const { orgA, orgB, person, ctxA } = await personInTwoOrgs();
    await createSemester({ orgId: orgA.id, label: "SP26", isActive: true });

    await createTransaction(ctxA, {
      type:        "income",
      category:    "Dues",
      brotherId:   person.id,
      amount:      200,
      date:        "2026-05-01",
      description: "Dues in full",
      status:      "posted",
      calendarEventIds: [],
    });
    // createTransaction's return is the mapped DTO union; re-read the row for its id.
    const row = await testPrisma.transaction.findFirstOrThrow({
      where: { organizationId: orgA.id, brotherId: person.id },
    });
    await softDeleteTransaction(ctxA, row.id);

    expect((await rosterOf(person.id, orgA.id))!.duesOwed).toBe(200);
    expect((await rosterOf(person.id, orgB.id))!.duesOwed).toBe(200);
  });

  it("an adjustment in org A does not waive anything in org B", async () => {
    const { orgA, orgB, person, ctxA } = await personInTwoOrgs();

    await adjustDues(ctxA, { brotherId: person.id, delta: -200, reason: "Hardship waiver" });

    expect((await rosterOf(person.id, orgA.id))!.duesOwed).toBe(0);
    expect((await rosterOf(person.id, orgB.id))!.duesOwed).toBe(200);
  });

  it("org B cannot adjust a member's dues through its own context reaching org A", async () => {
    // Same person, but the balance org B moves is org B's row. Asserted from the
    // other direction so a leak in either direction is caught.
    const { orgA, orgB, person, ctxB } = await personInTwoOrgs({ owedA: 200, owedB: 50 });

    await adjustDues(ctxB, { brotherId: person.id, delta: -50, reason: "Paid in cash" });

    expect((await rosterOf(person.id, orgB.id))!.duesOwed).toBe(0);
    expect((await rosterOf(person.id, orgA.id))!.duesOwed).toBe(200);
  });
});

describe("roster edits are org-local", () => {
  it("a GPA/role edit in org A leaves org B's row untouched", async () => {
    const { orgA, orgB, person, ctxA } = await personInTwoOrgs();

    await updateBrother(ctxA, person.id, { gpa: 3.9, role: "Treasurer", serviceHours: 12 });

    const inA = (await rosterOf(person.id, orgA.id))!;
    const inB = (await rosterOf(person.id, orgB.id))!;
    expect(inA).toMatchObject({ gpa: 3.9, role: "Treasurer", serviceHours: 12 });
    expect(inB).toMatchObject({ gpa: 0, role: "Brother", serviceHours: 0 });
  });

  it("archiving in one org leaves the member active in the other", async () => {
    const { orgA, orgB, person, ctxA } = await personInTwoOrgs();

    await updateBrother(ctxA, person.id, { archived: true });

    expect((await rosterOf(person.id, orgA.id))!.archivedAt).not.toBeNull();
    expect((await rosterOf(person.id, orgB.id))!.archivedAt).toBeNull();
  });

  it("custom field values do not collide between orgs that define the same field", async () => {
    // Definitions were always per-org; the VALUES used to share one JSON blob on
    // the account, so two chapters each defining "Major" wrote over each other.
    const { orgA, orgB, person, ctxA, ctxB } = await personInTwoOrgs();
    for (const [orgId, ctx] of [[orgA.id, ctxA], [orgB.id, ctxB]] as const) {
      await testPrisma.organizationConfig.upsert({
        where:  { organizationId: orgId },
        update: { customMemberFields: [{ id: "major", label: "Major", type: "text" }] },
        create: { organizationId: orgId, customMemberFields: [{ id: "major", label: "Major", type: "text" }] },
      });
      void ctx;
    }

    await updateBrother(ctxA, person.id, { customFields: { major: "Chemistry" } });
    await updateBrother(ctxB, person.id, { customFields: { major: "History" } });

    expect((await rosterOf(person.id, orgA.id))!.customFields).toMatchObject({ major: "Chemistry" });
    expect((await rosterOf(person.id, orgB.id))!.customFields).toMatchObject({ major: "History" });
  });
});

describe("attendance is computed and stored per org", () => {
  it("a recalc in org A writes org A's row only", async () => {
    const { orgA, orgB, person } = await personInTwoOrgs();
    const semA = await createSemester({ orgId: orgA.id, label: "SP26", isActive: true });
    const eventA = await createCalendarEvent({ orgId: orgA.id, mandatory: true });

    await testPrisma.attendanceRecord.create({
      data: { calendarEventId: eventA.id, brotherId: person.id, semesterId: semA.id, attended: true },
    });
    await testPrisma.membership.updateMany({
      where: { brotherId: person.id, organizationId: orgB.id },
      data:  { attendance: 42 },
    });

    await recalcBrotherAttendance(db(orgA.id), person.id, semA.id);

    expect((await rosterOf(person.id, orgA.id))!.attendance).toBe(100);
    expect((await rosterOf(person.id, orgB.id))!.attendance).toBe(42);
  });

  it("an excuse filed in a non-origin org counts toward THAT org's ratio", async () => {
    // The AttendanceExcuse delegate used to scope through Brother.organizationId,
    // so this person's excuse in org B was invisible to org B's own recalc — its
    // denominator kept the excused event and reported their attendance too low.
    const { orgB, person } = await personInTwoOrgs();
    const semB = await createSemester({ orgId: orgB.id, label: "SP26", isActive: true });
    const attended = await createCalendarEvent({ orgId: orgB.id, mandatory: true, title: "Chapter" });
    const missed   = await createCalendarEvent({ orgId: orgB.id, mandatory: true, title: "Retreat" });

    await testPrisma.attendanceRecord.createMany({
      data: [
        { calendarEventId: attended.id, brotherId: person.id, semesterId: semB.id, attended: true },
        { calendarEventId: missed.id,   brotherId: person.id, semesterId: semB.id, attended: false },
      ],
    });

    // Without the excuse: 1 of 2 mandatory events → 50%.
    expect(await recalcBrotherAttendance(db(orgB.id), person.id, semB.id)).toBe(50);

    await testPrisma.attendanceExcuse.create({
      data: {
        calendarEventId: missed.id, brotherId: person.id, semesterId: semB.id,
        reason: "Away", status: "approved",
      },
    });

    // The excused event leaves the denominator → 1 of 1 → 100%.
    expect(await recalcBrotherAttendance(db(orgB.id), person.id, semB.id)).toBe(100);
  });
});

describe("removing a member from one org does not erase them from another", () => {
  it("keeps the account, and every row belonging to the other org", async () => {
    // The FK cascades from 20260801000000_member_erasure_fks are keyed on
    // brotherId and carry no org filter, so deleting the shared account row to
    // tidy one roster would erase this person's history everywhere.
    const { orgA, orgB, person, ctxA } = await personInTwoOrgs();
    const semB = await createSemester({ orgId: orgB.id, label: "SP26", isActive: true });
    const eventB = await createCalendarEvent({ orgId: orgB.id, mandatory: true });
    await testPrisma.attendanceRecord.create({
      data: { calendarEventId: eventB.id, brotherId: person.id, semesterId: semB.id, attended: true },
    });

    const semA = await createSemester({ orgId: orgA.id, label: "SP26", isActive: true });
    const eventA = await createCalendarEvent({ orgId: orgA.id, mandatory: true });
    await testPrisma.attendanceRecord.create({
      data: { calendarEventId: eventA.id, brotherId: person.id, semesterId: semA.id, attended: true },
    });

    await deleteBrother(ctxA, person.id);

    // The account survives, because they are still a member somewhere.
    expect(await accountOf(person.id)).not.toBeNull();

    // Org A is wiped clean of them...
    expect(await rosterOf(person.id, orgA.id)).toBeNull();
    expect(await testPrisma.attendanceRecord.count({
      where: { brotherId: person.id, calendarEvent: { organizationId: orgA.id } },
    })).toBe(0);

    // ...and org B is untouched.
    expect(await rosterOf(person.id, orgB.id)).not.toBeNull();
    expect(await testPrisma.attendanceRecord.count({
      where: { brotherId: person.id, calendarEvent: { organizationId: orgB.id } },
    })).toBe(1);
  });

  it("deletes the account outright when this was their only org", async () => {
    const org = await createOrg("Only", "only-org");
    const admin = await createBrother({ orgId: org.id, isAdmin: true, isOrgAdmin: true });
    const member = await createBrother({ orgId: org.id, name: "Solo" });

    await deleteBrother(ctxFor(org.id, admin.id, { permissions: PERMISSIONS.MANAGE_BROTHERS }), member.id);

    expect(await accountOf(member.id)).toBeNull();
    expect(await rosterOf(member.id)).toBeNull();
  });
});
