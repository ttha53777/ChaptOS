/**
 * Reimbursement receipts.
 *
 * The receipts bucket is private with no storage policies, so these service checks
 * are the ONLY gate: the requester may attach while pending, treasury at any time,
 * and only those two may open one. Storage itself is mocked; the file validation
 * (magic-byte sniffing, size cap) runs for real.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

vi.mock("@/lib/supabase/receipts", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/supabase/receipts")>();
  return {
    ...real,
    putReceiptObject:     vi.fn(async () => undefined),
    signReceiptUrl:       vi.fn(async (path: string) => `https://signed.example/${path}`),
    removeReceiptObjects: vi.fn(async () => undefined),
  };
});

import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother } from "../setup/factories";
import { db } from "@/lib/db";
import { attachReceipt, createReimbursement, getReceiptUrl, listReimbursements } from "@/lib/services/reimbursement-service";
import { putReceiptObject, removeReceiptObjects } from "@/lib/supabase/receipts";
import { PERMISSIONS } from "@/lib/permissions";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

function ctxFor(orgId: number, actorId: number, opts?: { permissions?: number }): RequestContext {
  return {
    requestId:       randomUUID(),
    orgId,
    actorId,
    actorName:       "Tester",
    actorEmail:      null,
    authUserId:      "auth-test",
    membershipId:    null,
    permissions:     opts?.permissions ?? 0,
    maxRank:         0,
    isOrgAdmin:      false,
    isPlatformAdmin: false,
    db:              db(orgId),
  };
}

const PNG  = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], "r.png", { type: "image/png" });
const PDF  = () => new File(["%PDF-1.7\n..."], "r.pdf", { type: "application/pdf" });
const HTML = () => new File(["<script>alert(1)</script>"], "r.jpg", { type: "image/jpeg" });

async function setup() {
  const org = await createOrg("Alpha", "alpha");
  const requester = await createBrother({ orgId: org.id, name: "Requester" });
  const other     = await createBrother({ orgId: org.id, name: "Other" });
  const treasurer = await createBrother({ orgId: org.id, name: "Treasurer" });
  const asRequester = ctxFor(org.id, requester.id);
  const asOther     = ctxFor(org.id, other.id);
  const asTreasurer = ctxFor(org.id, treasurer.id, { permissions: PERMISSIONS.MANAGE_TREASURY });
  const r = await createReimbursement(asRequester, {
    brotherId: requester.id, amount: 42, date: "2026-10-01", description: "Formal decorations",
  });
  return { org, r, asRequester, asOther, asTreasurer };
}

describe("attachReceipt — who may attach", () => {
  it("the requester can attach while pending; the row reports hasReceipt, never the path", async () => {
    const { org, r, asRequester } = await setup();
    const saved = await attachReceipt(asRequester, r.id, PNG());

    expect(saved.hasReceipt).toBe(true);
    expect(saved).not.toHaveProperty("receiptPath");
    const row = await testPrisma.reimbursement.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.receiptPath).toMatch(new RegExp(`^org-${org.id}/${r.id}-[0-9a-f-]{36}\\.png$`));
    expect(putReceiptObject).toHaveBeenCalledWith(row.receiptPath, expect.any(Buffer), "image/png");
  });

  it("another member cannot attach to someone else's request", async () => {
    const { r, asOther } = await setup();
    await expect(attachReceipt(asOther, r.id, PNG())).rejects.toBeInstanceOf(ForbiddenError);
    expect(putReceiptObject).not.toHaveBeenCalled();
  });

  it("the requester cannot change it once decided; treasury still can", async () => {
    const { r, asRequester, asTreasurer } = await setup();
    await testPrisma.reimbursement.update({ where: { id: r.id }, data: { status: "rejected" } });

    await expect(attachReceipt(asRequester, r.id, PNG())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(attachReceipt(asTreasurer, r.id, PDF())).resolves.toMatchObject({ hasReceipt: true });
  });

  it("a request from another org is a 404, not a 403", async () => {
    const { r } = await setup();
    const elsewhere = await createOrg("Beta", "beta");
    const stranger  = await createBrother({ orgId: elsewhere.id, name: "Stranger" });
    const asStrangerTreasurer = ctxFor(elsewhere.id, stranger.id, { permissions: PERMISSIONS.MANAGE_TREASURY });

    await expect(attachReceipt(asStrangerTreasurer, r.id, PNG())).rejects.toBeInstanceOf(NotFoundError);
    await expect(getReceiptUrl(asStrangerTreasurer, r.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("attachReceipt — what may be attached", () => {
  it("refuses a file whose bytes aren't an image or PDF, whatever it claims to be", async () => {
    const { r, asRequester } = await setup();
    await expect(attachReceipt(asRequester, r.id, HTML())).rejects.toBeInstanceOf(ValidationError);
    expect(putReceiptObject).not.toHaveBeenCalled();
  });

  it("refuses a file over 4 MB before reading it", async () => {
    const { r, asRequester } = await setup();
    const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" });
    await expect(attachReceipt(asRequester, r.id, big)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("attachReceipt — storage bookkeeping", () => {
  it("replacing a receipt removes the old object once the row points at the new one", async () => {
    const { r, asRequester } = await setup();
    await attachReceipt(asRequester, r.id, PNG());
    const first = (await testPrisma.reimbursement.findUniqueOrThrow({ where: { id: r.id } })).receiptPath;

    await attachReceipt(asRequester, r.id, PDF());
    const second = (await testPrisma.reimbursement.findUniqueOrThrow({ where: { id: r.id } })).receiptPath;

    expect(second).not.toBe(first);
    expect(removeReceiptObjects).toHaveBeenLastCalledWith([first]);
  });

  it("list carries hasReceipt for everyone and leaks no path", async () => {
    const { r, asRequester, asOther } = await setup();
    await attachReceipt(asRequester, r.id, PNG());
    const [row] = await listReimbursements(asOther);
    expect(row.hasReceipt).toBe(true);
    expect(row).not.toHaveProperty("receiptPath");
  });
});

describe("getReceiptUrl — who may open it", () => {
  it("the requester and treasury get a signed link; another member does not", async () => {
    const { r, asRequester, asOther, asTreasurer } = await setup();
    await attachReceipt(asRequester, r.id, PNG());

    await expect(getReceiptUrl(asRequester, r.id)).resolves.toMatch(/^https:\/\/signed\.example\/org-/);
    await expect(getReceiptUrl(asTreasurer, r.id)).resolves.toMatch(/^https:\/\/signed\.example\/org-/);
    await expect(getReceiptUrl(asOther, r.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a request with no receipt is a 404", async () => {
    const { r, asRequester } = await setup();
    await expect(getReceiptUrl(asRequester, r.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
