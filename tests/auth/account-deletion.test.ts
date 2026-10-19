/**
 * Self-serve account deletion (lib/auth/account-deletion.ts).
 *
 * The difference from member-erasure.test.ts is reach. deleteBrother is an
 * officer tidying ONE roster and must never touch another org. Here the person
 * is erasing themselves, so the deletion is meant to cross every org they
 * belong to, and to take the login with it. The test DB has no Supabase auth
 * schema, so a minimal auth.users stands in for it: the point is proving the
 * row goes in the same transaction as the roster data.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester, createCalendarEvent, joinOrg } from "../setup/factories";
import { deleteOwnAccount, previewAccountDeletion } from "@/lib/auth/account-deletion";
import { ConflictError } from "@/lib/errors";

beforeAll(async () => {
  await testPrisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS auth`);
  await testPrisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY)`);
});

beforeEach(async () => {
  await resetDb();
  await testPrisma.$executeRawUnsafe(`DELETE FROM auth.users`);
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function loginCount(authUserId: string): Promise<number> {
  const rows = await testPrisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM auth.users WHERE id = ${authUserId}::uuid`;
  return Number(rows[0].n);
}

/** A signed-in person on two rosters, with history in both, plus a co-admin in each. */
async function seedTwoOrgMember() {
  const a = await createOrg("Alpha Chapter", "alpha-chapter");
  const b = await createOrg("Beta Chapter", "beta-chapter");
  await createBrother({ orgId: a.id, isOrgAdmin: true });
  await createBrother({ orgId: b.id, isOrgAdmin: true });

  const authUserId = randomUUID();
  const me = await createBrother({ orgId: a.id, name: "Leaving For Good" });
  await testPrisma.brother.update({ where: { id: me.id }, data: { authUserId, email: "leaving@example.com" } });
  await joinOrg({ brotherId: me.id, orgId: b.id });
  await testPrisma.$executeRaw`INSERT INTO auth.users (id) VALUES (${authUserId}::uuid)`;

  for (const org of [a, b]) {
    const semester = await createSemester({ orgId: org.id });
    const event = await createCalendarEvent({ orgId: org.id });
    await testPrisma.attendanceRecord.create({
      data: { calendarEventId: event.id, brotherId: me.id, semesterId: semester.id, attended: true },
    });
  }

  const tx = await testPrisma.transaction.create({
    data: {
      organizationId: b.id, brotherId: me.id, type: "income", category: "Dues",
      amount: 120, amountCents: BigInt(12_000), date: "2026-09-01", description: "Dues payment",
    },
  });

  return { a, b, me, authUserId, tx };
}

describe("deleteOwnAccount", () => {
  it("erases the person from every org and deletes the login", async () => {
    const { a, b, me, authUserId } = await seedTwoOrgMember();

    await expect(deleteOwnAccount(authUserId)).resolves.toEqual({ orgIds: [a.id, b.id] });

    expect(await testPrisma.brother.findUnique({ where: { id: me.id } })).toBeNull();
    expect(await testPrisma.membership.count({ where: { brotherId: me.id } })).toBe(0);
    expect(await testPrisma.attendanceRecord.count({ where: { brotherId: me.id } })).toBe(0);
    expect(await loginCount(authUserId)).toBe(0);
  });

  it("keeps the ledger row with the name taken off it", async () => {
    const { authUserId, tx } = await seedTwoOrgMember();
    await deleteOwnAccount(authUserId);

    const surviving = await testPrisma.transaction.findUnique({ where: { id: tx.id } });
    expect(surviving).not.toBeNull();
    expect(surviving!.brotherId).toBeNull();
  });

  it("leaves a nameless audit row in each org", async () => {
    const { a, b, authUserId } = await seedTwoOrgMember();
    await deleteOwnAccount(authUserId);

    const rows = await testPrisma.operationalEvent.findMany({
      where:   { action: "membership.account_deleted" },
      orderBy: { organizationId: "asc" },
    });
    expect(rows.map(r => r.organizationId)).toEqual([a.id, b.id]);
    expect(rows.every(r => r.actorId === null && JSON.stringify(r.metadata) === "{}")).toBe(true);
  });

  it("deletes the person's join requests — they carry name and email themselves", async () => {
    const { authUserId } = await seedTwoOrgMember();
    const c = await createOrg("Gamma Chapter", "gamma-chapter");
    const invite = await testPrisma.orgInvite.create({ data: { organizationId: c.id, token: randomUUID() } });
    await testPrisma.joinRequest.create({
      data: { organizationId: c.id, inviteId: invite.id, authUserId, email: "leaving@example.com", name: "Leaving For Good" },
    });

    await deleteOwnAccount(authUserId);
    expect(await testPrisma.joinRequest.count({ where: { authUserId } })).toBe(0);
  });

  it("works for someone with no roster row at all", async () => {
    const authUserId = randomUUID();
    await testPrisma.$executeRaw`INSERT INTO auth.users (id) VALUES (${authUserId}::uuid)`;

    await expect(deleteOwnAccount(authUserId)).resolves.toEqual({ orgIds: [] });
    expect(await loginCount(authUserId)).toBe(0);
  });

  it("is idempotent — a retry after a lost response succeeds", async () => {
    const { authUserId } = await seedTwoOrgMember();
    await deleteOwnAccount(authUserId);
    await expect(deleteOwnAccount(authUserId)).resolves.toEqual({ orgIds: [] });
  });

  it("refuses the last admin of an org, and deletes nothing", async () => {
    const solo = await createOrg("Solo Chapter", "solo-chapter");
    const authUserId = randomUUID();
    const me = await createBrother({ orgId: solo.id, isOrgAdmin: true });
    await testPrisma.brother.update({ where: { id: me.id }, data: { authUserId } });
    await createBrother({ orgId: solo.id }); // a plain member, not an admin
    await testPrisma.$executeRaw`INSERT INTO auth.users (id) VALUES (${authUserId}::uuid)`;

    const preview = await previewAccountDeletion(authUserId);
    expect(preview.canDelete).toBe(false);
    expect(preview.orgs).toEqual([{ name: "Solo Chapter", slug: "solo-chapter", blocker: "last_admin", soleMember: false }]);

    await expect(deleteOwnAccount(authUserId)).rejects.toThrow(ConflictError);
    expect(await testPrisma.brother.findUnique({ where: { id: me.id } })).not.toBeNull();
    expect(await loginCount(authUserId)).toBe(1);
  });

  it("refuses a platform admin", async () => {
    const { me, authUserId } = await seedTwoOrgMember();
    await testPrisma.platformAdmin.create({ data: { brotherId: me.id } });

    await expect(deleteOwnAccount(authUserId)).rejects.toThrow(/platform-admin grant/i);
    expect(await loginCount(authUserId)).toBe(1);
  });
});
