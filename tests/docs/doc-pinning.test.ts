/**
 * Tests for pinning docs and folders. A pin is stored as Doc.pinnedAt /
 * DocFolder.pinnedAt (null = not pinned); the service sets it to now() on pin
 * and back to null on unpin, and emits doc.pinned / docFolder.pinned.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother } from "../setup/factories";
import { db } from "@/lib/db";
import { createDoc, setDocPinned } from "@/lib/services/doc-service";
import {
  createFolder,
  setFolderPinned,
} from "@/lib/services/doc-folder-service";
import { NotFoundError } from "@/lib/errors";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

function ctxFor(orgId: number, actorId: number): RequestContext {
  return {
    requestId:       randomUUID(),
    orgId,
    actorId,
    actorName:       "Tester",
    actorEmail:      null,
    authUserId:      "auth-test",
    membershipId:    null,
    permissions:     0,
    maxRank:         0,
    isOrgAdmin:      true,
    isPlatformAdmin: false,
    db:              db(orgId),
  };
}

async function seedOrg() {
  const org = await createOrg("Docs Org", "docs-org");
  const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
  return { org, admin, ctx: ctxFor(org.id, admin.id) };
}

describe("doc pinning", () => {
  it("pins and unpins a doc, toggling pinnedAt", async () => {
    const { ctx } = await seedOrg();
    const doc = await createDoc(ctx, { title: "Bylaws", url: "https://example.com/bylaws" });
    expect(doc.pinnedAt).toBeNull();

    const pinned = await setDocPinned(ctx, doc.id, true);
    expect(pinned.pinnedAt).toBeInstanceOf(Date);

    const unpinned = await setDocPinned(ctx, doc.id, false);
    expect(unpinned.pinnedAt).toBeNull();
  });

  it("throws NotFoundError for a doc that doesn't exist", async () => {
    const { ctx } = await seedOrg();
    await expect(setDocPinned(ctx, 999999, true)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("pins and unpins a folder", async () => {
    const { ctx } = await seedOrg();
    const folder = await createFolder(ctx, { name: "Recruitment" });
    expect(folder.pinnedAt).toBeNull();

    const pinned = await setFolderPinned(ctx, folder.id, true);
    expect(pinned.pinnedAt).toBeInstanceOf(Date);

    const unpinned = await setFolderPinned(ctx, folder.id, false);
    expect(unpinned.pinnedAt).toBeNull();
  });

  it("throws NotFoundError for a folder that doesn't exist", async () => {
    const { ctx } = await seedOrg();
    await expect(setFolderPinned(ctx, 999999, true)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("does not let one org pin another org's doc", async () => {
    const a = await seedOrg();
    const bOrg = await createOrg("Other Org", "other-org");
    const bAdmin = await createBrother({ orgId: bOrg.id, isOrgAdmin: true });
    const bCtx = ctxFor(bOrg.id, bAdmin.id);
    const bDoc = await createDoc(bCtx, { title: "Theirs", url: "https://example.com/theirs" });

    // Org A can't see org B's doc, so pinning it reads as not-found.
    await expect(setDocPinned(a.ctx, bDoc.id, true)).rejects.toBeInstanceOf(NotFoundError);
  });
});
