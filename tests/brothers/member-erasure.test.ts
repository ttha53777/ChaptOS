/**
 * Member-level erasure — the deletion path the trust page promises.
 *
 * `deleteBrother()` is a single `DELETE FROM "Brother"`, so what actually happens
 * to a member's history is decided entirely by referential actions on the twelve
 * tables that reference Brother. Three of them were `ON DELETE RESTRICT`, which
 * meant deletion failed outright for anyone with any history at all — on the dev
 * database that was 26 of 34 members. 20260801000000_member_erasure_fks changed
 * them; this suite is what keeps them changed.
 *
 * The two halves are deliberately different and both matter:
 *
 *   CASCADE  — attendance records and excuses are *about* the person and are
 *              meaningless without them, so erasure must actually erase them.
 *   SET NULL — the ledger, the audit log, and invite links outlive the person.
 *              Erasure anonymises them; it must not delete them. A test that only
 *              checked "the delete succeeded" would pass just as happily if the
 *              FKs had been made CASCADE across the board and someone's financial
 *              history vanished with them.
 *
 * `PlatformAdmin.brotherId` stays RESTRICT on purpose, so the last case asserts a
 * *named* ConflictError rather than the opaque FK error the bare constraint gives.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester, createCalendarEvent, rosterOf } from "../setup/factories";
import { db } from "@/lib/db";
import { deleteBrother } from "@/lib/services/brother-service";
import { ConflictError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions";
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
    permissions:     PERMISSIONS.MANAGE_BROTHERS,
    maxRank:         0,
    isOrgAdmin:      true,
    isPlatformAdmin: false,
    db:              db(orgId),
    ...over,
  };
}

/**
 * A member with one of everything: the exact shape that used to be undeletable.
 * Returns the ids needed to prove what survived and what didn't.
 */
async function seedMemberWithHistory() {
  const org = await createOrg("Erasure Org", "erasure-org");
  // A second admin so the last-admin guard never masks what we're testing.
  const admin = await createBrother({ orgId: org.id, isAdmin: true, isOrgAdmin: true });
  const target = await createBrother({ orgId: org.id, name: "Departing Member" });

  const semester = await createSemester({ orgId: org.id });
  const event = await createCalendarEvent({ orgId: org.id });

  await testPrisma.attendanceRecord.create({
    data: {
      calendarEventId: event.id,
      brotherId:       target.id,
      semesterId:      semester.id,
      attended:        true,
    },
  });
  const otherEvent = await createCalendarEvent({ orgId: org.id, title: "Missed Event" });
  await testPrisma.attendanceExcuse.create({
    data: {
      calendarEventId: otherEvent.id,
      brotherId:       target.id,
      semesterId:      semester.id,
      reason:          "Family emergency",
    },
  });

  const invite = await testPrisma.orgInvite.create({
    data: {
      organizationId:     org.id,
      token:              randomUUID(),
      mode:               "open",
      createdByBrotherId: target.id,
    },
  });

  const tx = await testPrisma.transaction.create({
    data: {
      organizationId: org.id,
      brotherId:      target.id,
      type:           "income",
      category:       "Dues",
      amount:         250,
      amountCents:    BigInt(25_000),
      date:           "2026-05-01",
      description:    "Dues payment",
    },
  });

  const log = await testPrisma.activityLog.create({
    data: {
      organizationId: org.id,
      type:           "info",
      message:        "Did something worth auditing",
      actorId:        target.id,
    },
  });

  return { org, admin, target, invite, tx, log, ctx: ctxFor(org.id, admin.id) };
}

describe("deleteBrother: a member with history can actually be erased", () => {
  it("succeeds for a member with attendance records and excuses", async () => {
    const { target, ctx } = await seedMemberWithHistory();

    // Before the migration this threw a foreign-key violation.
    await expect(deleteBrother(ctx, target.id)).resolves.toBeUndefined();

    const gone = await rosterOf(target.id);
    expect(gone).toBeNull();
  });

  it("cascades the records that are ABOUT the member", async () => {
    const { target, ctx } = await seedMemberWithHistory();
    await deleteBrother(ctx, target.id);

    expect(await testPrisma.attendanceRecord.count({ where: { brotherId: target.id } })).toBe(0);
    expect(await testPrisma.attendanceExcuse.count({ where: { brotherId: target.id } })).toBe(0);
    expect(await testPrisma.membership.count({ where: { brotherId: target.id } })).toBe(0);
  });

  it("preserves the ledger, anonymised — the money does not leave with the person", async () => {
    const { target, tx, ctx } = await seedMemberWithHistory();
    await deleteBrother(ctx, target.id);

    const surviving = await testPrisma.transaction.findUnique({ where: { id: tx.id } });
    expect(surviving).not.toBeNull();
    expect(surviving!.brotherId).toBeNull();
    expect(Number(surviving!.amount)).toBe(250);
  });

  it("preserves the audit trail, anonymised", async () => {
    const { target, log, ctx } = await seedMemberWithHistory();
    await deleteBrother(ctx, target.id);

    const surviving = await testPrisma.activityLog.findUnique({ where: { id: log.id } });
    expect(surviving).not.toBeNull();
    expect(surviving!.actorId).toBeNull();
    expect(surviving!.message).toBe("Did something worth auditing");
  });

  it("keeps invite links alive — they are org property, not the officer's", async () => {
    // Revoking every outstanding invite because the officer who created them left
    // would be a bug, not cleanup.
    const { target, invite, ctx } = await seedMemberWithHistory();
    await deleteBrother(ctx, target.id);

    const surviving = await testPrisma.orgInvite.findUnique({ where: { id: invite.id } });
    expect(surviving).not.toBeNull();
    expect(surviving!.createdByBrotherId).toBeNull();
    expect(surviving!.revokedAt).toBeNull();
  });
});

describe("deleteBrother: PlatformAdmin stays RESTRICT, with a reason", () => {
  it("refuses with a named ConflictError instead of a raw FK error", async () => {
    const { target, ctx } = await seedMemberWithHistory();
    await testPrisma.platformAdmin.create({ data: { brotherId: target.id } });

    await expect(deleteBrother(ctx, target.id)).rejects.toThrow(ConflictError);
    await expect(deleteBrother(ctx, target.id)).rejects.toThrow(/platform-admin grant/i);

    // And the refusal is real — the member is still there.
    expect(await rosterOf(target.id)).not.toBeNull();
  });
});
