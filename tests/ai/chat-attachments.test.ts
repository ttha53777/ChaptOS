/**
 * Ask Chapt attachments: upload, isolation, removal, expiry, quotas and the
 * deletion paths. Drives the service directly (routes are thin controllers).
 *
 * The isolation rule under test: a file is reachable only by its uploader, in
 * the org it was uploaded to. Another member of the same org — org admins
 * included — gets 404, exactly like a file that doesn't exist.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, joinOrg } from "../setup/factories";
import { pdf, xlsx, BUDGET_SHEETS, randomBinary } from "../setup/file-fixtures";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import type { RequestContext } from "@/lib/context";
import {
  uploadAttachment, listAttachments, removeAttachment, removeThreadAttachments,
  getAttachmentUnit, listActiveByPublicIds, loadAttachmentContent, touchAttachments,
} from "@/lib/services/chat-attachment-service";
import { deleteBrother } from "@/lib/services/brother-service";
import { deleteOrg } from "@/lib/services/org-service";
import { deleteOwnAccount } from "@/lib/auth/account-deletion";
import { FILES_PER_THREAD, UPLOADS_PER_DAY, RETENTION_MAX_MS } from "@/lib/files/limits";

beforeAll(async () => {
  // deleteOwnAccount also deletes the Supabase login row.
  await testPrisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS auth`);
  await testPrisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY)`);
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

function ctxFor(orgId: number, actorId: number, over: Partial<RequestContext> = {}): RequestContext {
  return {
    requestId: randomUUID(), orgId, actorId, actorName: "Tester", actorEmail: null, authUserId: "auth-test",
    membershipId: null, permissions: 0, maxRank: 0, isOrgAdmin: false, isPlatformAdmin: false, db: db(orgId),
    ...over,
  };
}

const file = (bytes: Buffer, name: string) => new File([new Uint8Array(bytes)], name);
const constitution = () => file(pdf(["Article I\nName: Alpha.", "Article II\nElections each April."]), "Constitution.pdf");

async function codeOf(p: Promise<unknown>): Promise<{ status: number; code: unknown } | null> {
  try { await p; return null; }
  catch (e) {
    if (e instanceof DomainError) return { status: e.status, code: (e.details as { code?: unknown } | undefined)?.code ?? e.code };
    throw e;
  }
}

async function seed() {
  const org = await createOrg("Alpha", "alpha");
  const a = await createBrother({ orgId: org.id, name: "Ann" });
  const b = await createBrother({ orgId: org.id, name: "Bo", isOrgAdmin: true });
  return { org, a, b, ctxA: ctxFor(org.id, a.id), ctxB: ctxFor(org.id, b.id, { isOrgAdmin: true }) };
}

describe("uploadAttachment", () => {
  it("stores extracted content only, and returns the tray info", async () => {
    const { ctxA } = await seed();
    const thread = randomUUID();
    const info = await uploadAttachment(ctxA, constitution(), thread);
    expect(info).toMatchObject({ name: "Constitution.pdf", kind: "pdf", unitCount: 2, unitNoun: "page", truncated: false });
    const row = await testPrisma.chatAttachment.findUniqueOrThrow({ where: { publicId: info.id } });
    expect(row.threadId).toBe(thread);
    expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
    const content = row.content as { type: string; units: { ref: string }[] };
    expect(content.type).toBe("text");
    expect(content.units.map(u => u.ref)).toEqual(["p1", "p2"]);
    // Expiry: the 7-day idle window, well inside the 30-day cap.
    const days = (row.expiresAt.getTime() - row.createdAt.getTime()) / 86_400_000;
    expect(days).toBeCloseTo(7, 1);
  });

  it("maps every rejection to a 400 carrying details.code", async () => {
    const { ctxA } = await seed();
    const t = randomUUID();
    expect(await codeOf(uploadAttachment(ctxA, file(randomBinary(), "x.txt"), t))).toEqual({ status: 400, code: "UNSUPPORTED_TYPE" });
    expect(await codeOf(uploadAttachment(ctxA, file(Buffer.alloc(0), "e.txt"), t))).toEqual({ status: 400, code: "EMPTY" });
    expect(await codeOf(uploadAttachment(ctxA, file(Buffer.alloc(4 * 1024 * 1024 + 1, 0x61), "big.txt"), t))).toEqual({ status: 400, code: "FILE_TOO_LARGE" });
    expect(await testPrisma.chatAttachment.count()).toBe(0);
  });

  it("returns the existing row for identical bytes in the same thread", async () => {
    const { ctxA } = await seed();
    const t = randomUUID();
    const bytes = pdf(["The same file uploaded twice."]);
    const first = await uploadAttachment(ctxA, file(bytes, "a.pdf"), t);
    const again = await uploadAttachment(ctxA, file(bytes, "renamed.pdf"), t);
    expect(again.id).toBe(first.id);
    expect(await testPrisma.chatAttachment.count()).toBe(1);
  });

  it("caps a thread at five files, even under six parallel uploads", async () => {
    const { ctxA } = await seed();
    const t = randomUUID();
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => uploadAttachment(ctxA, file(Buffer.from(`note number ${i}`), `n${i}.txt`), t)),
    );
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(FILES_PER_THREAD);
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(failed).toHaveLength(1);
    expect((failed[0].reason as DomainError).details).toEqual({ code: "TOO_MANY_FILES" });
    expect(await testPrisma.chatAttachment.count({ where: { threadId: t } })).toBe(FILES_PER_THREAD);
  });

  it("refuses the 31st upload in 24 hours, counting removed files", async () => {
    const { org, a, ctxA } = await seed();
    await testPrisma.chatAttachment.createMany({
      data: Array.from({ length: UPLOADS_PER_DAY }, (_, i) => ({
        publicId: randomUUID(), organizationId: org.id, ownerId: a.id, threadId: randomUUID(), filename: "", kind: "txt",
        sizeBytes: 1, sha256: `s${i}`, unitCount: 1, charCount: 1, content: undefined,
        expiresAt: new Date(Date.now() + 86_400_000), removedAt: new Date(),
      })),
    });
    expect(await codeOf(uploadAttachment(ctxA, constitution(), randomUUID()))).toEqual({ status: 429, code: "QUOTA" });
  });
});

describe("isolation", () => {
  it("another member of the same org — even an org admin — can't list, read, use or remove the file", async () => {
    const { ctxA, ctxB } = await seed();
    const t = randomUUID();
    const info = await uploadAttachment(ctxA, constitution(), t);

    expect(await listAttachments(ctxB, t)).toEqual([]);
    expect(await listActiveByPublicIds(ctxB, [info.id])).toEqual([]);
    expect(await codeOf(getAttachmentUnit(ctxB, info.id, "p1"))).toMatchObject({ status: 404 });
    expect(await codeOf(removeAttachment(ctxB, info.id))).toMatchObject({ status: 404 });
    expect((await removeThreadAttachments(ctxB, t)).removed).toBe(0);

    // Still intact for the owner.
    expect((await listAttachments(ctxA, t)).map(f => f.id)).toEqual([info.id]);
    expect((await getAttachmentUnit(ctxA, info.id, "p2")).text).toContain("Elections each April.");
  });

  it("the same person in another org sees nothing of it", async () => {
    const { a, ctxA } = await seed();
    const other = await createOrg("Beta", "beta");
    await joinOrg({ brotherId: a.id, orgId: other.id });
    const t = randomUUID();
    const info = await uploadAttachment(ctxA, constitution(), t);
    const inBeta = ctxFor(other.id, a.id);
    expect(await listAttachments(inBeta, t)).toEqual([]);
    expect(await listActiveByPublicIds(inBeta, [info.id])).toEqual([]);
    expect(await codeOf(getAttachmentUnit(inBeta, info.id, "p1"))).toMatchObject({ status: 404 });
  });
});

describe("removal and expiry", () => {
  it("removal wipes content and the name at once, and the file is gone everywhere", async () => {
    const { ctxA } = await seed();
    const t = randomUUID();
    const info = await uploadAttachment(ctxA, constitution(), t);
    await removeAttachment(ctxA, info.id);
    const row = await testPrisma.chatAttachment.findUniqueOrThrow({ where: { publicId: info.id } });
    expect(row.content).toBeNull();
    expect(row.filename).toBe("");
    expect(row.removedAt).not.toBeNull();
    expect(await listAttachments(ctxA, t)).toEqual([]);
    expect(await listActiveByPublicIds(ctxA, [info.id])).toEqual([]);
    expect(await codeOf(removeAttachment(ctxA, info.id))).toMatchObject({ status: 404 });
  });

  it("removeThread clears only that thread", async () => {
    const { ctxA } = await seed();
    const t1 = randomUUID(), t2 = randomUUID();
    await uploadAttachment(ctxA, constitution(), t1);
    await uploadAttachment(ctxA, file(Buffer.from("other"), "o.txt"), t2);
    expect((await removeThreadAttachments(ctxA, t1)).removed).toBe(1);
    expect(await listAttachments(ctxA, t1)).toEqual([]);
    expect(await listAttachments(ctxA, t2)).toHaveLength(1);
  });

  it("an expired file is invisible at once and purged later", async () => {
    const { ctxA } = await seed();
    const t = randomUUID();
    const info = await uploadAttachment(ctxA, constitution(), t);
    await testPrisma.chatAttachment.update({ where: { publicId: info.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await listAttachments(ctxA, t)).toEqual([]);
    expect(await listActiveByPublicIds(ctxA, [info.id])).toEqual([]);
    expect(await codeOf(getAttachmentUnit(ctxA, info.id, "p1"))).toMatchObject({ status: 404 });
    expect(await ctxA.db.chatAttachment.purgeExpired()).toBe(1);
    expect(await testPrisma.chatAttachment.count()).toBe(0);
  });

  it("touch pushes expiry out but never past 30 days from upload", async () => {
    const { ctxA } = await seed();
    const info = await uploadAttachment(ctxA, constitution(), randomUUID());
    const longAgo = new Date(Date.now() - 29 * 86_400_000);
    await testPrisma.chatAttachment.update({ where: { publicId: info.id }, data: { createdAt: longAgo } });
    const [meta] = await listActiveByPublicIds(ctxA, [info.id]);
    await touchAttachments(ctxA, [meta.id]);
    const row = await testPrisma.chatAttachment.findUniqueOrThrow({ where: { publicId: info.id } });
    expect(Math.abs(row.expiresAt.getTime() - (longAgo.getTime() + RETENTION_MAX_MS))).toBeLessThan(5000);
    expect(row.lastUsedAt.getTime()).toBeGreaterThan(longAgo.getTime());
  });
});

describe("reading back", () => {
  it("serves a sheet range with its header row, and the content for the chat", async () => {
    const { ctxA } = await seed();
    const info = await uploadAttachment(ctxA, file(xlsx(BUDGET_SHEETS), "Budget.xlsx"), randomUUID());
    expect(info).toMatchObject({ kind: "xlsx", unitCount: 2, unitNoun: "sheet" });
    const unit = await getAttachmentUnit(ctxA, info.id, "sh1!B3:C4");
    expect(unit.label).toBe("Events!B3:C4");
    expect(unit.grid).toEqual([["Category", "Amount"], ["Social", 1200.5], ["Social", 450]]);
    expect(await codeOf(getAttachmentUnit(ctxA, info.id, "sh9"))).toMatchObject({ status: 404 });
    const [meta] = await listActiveByPublicIds(ctxA, [info.id]);
    const content = await loadAttachmentContent(ctxA, meta.id);
    expect(content?.type).toBe("sheets");
  });
});

describe("deletion paths", () => {
  it("removing a multi-org member erases only this org's files", async () => {
    const { org, a, ctxA, ctxB } = await seed();
    const beta = await createOrg("Beta", "beta");
    await createBrother({ orgId: beta.id, isOrgAdmin: true });
    await joinOrg({ brotherId: a.id, orgId: beta.id });
    await uploadAttachment(ctxA, constitution(), randomUUID());
    await uploadAttachment(ctxFor(beta.id, a.id), constitution(), randomUUID());

    await deleteBrother(ctxB, a.id);
    expect(await testPrisma.chatAttachment.count({ where: { organizationId: org.id } })).toBe(0);
    expect(await testPrisma.chatAttachment.count({ where: { organizationId: beta.id, ownerId: a.id } })).toBe(1);
  });

  it("deleting the account removes the member's files in every org", async () => {
    const { a, ctxA } = await seed();
    const beta = await createOrg("Beta", "beta");
    await createBrother({ orgId: beta.id, isOrgAdmin: true });
    await joinOrg({ brotherId: a.id, orgId: beta.id });
    const authUserId = randomUUID();
    await testPrisma.brother.update({ where: { id: a.id }, data: { authUserId } });
    await testPrisma.$executeRaw`INSERT INTO auth.users (id) VALUES (${authUserId}::uuid)`;
    await uploadAttachment(ctxA, constitution(), randomUUID());
    await uploadAttachment(ctxFor(beta.id, a.id), constitution(), randomUUID());

    await deleteOwnAccount(authUserId);
    expect(await testPrisma.chatAttachment.count({ where: { ownerId: a.id } })).toBe(0);
  });

  it("deleting the org removes its files", async () => {
    const { org, ctxA, ctxB } = await seed();
    await uploadAttachment(ctxA, constitution(), randomUUID());
    await deleteOrg(ctxB, "alpha");
    expect(await testPrisma.chatAttachment.count({ where: { organizationId: org.id } })).toBe(0);
  });
});
