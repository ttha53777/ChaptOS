/**
 * Route tests for POST /api/auth/redeem-invite.
 *
 * This route had no coverage at all, which is where three real bugs lived:
 * a claim link dead-ending anyone with an existing account, a re-redeem
 * silently renaming an existing member, and no use cap. Each is asserted here.
 *
 * The route runs pre-auth, so there is no RequestContext to stub the way
 * invite-service.test.ts does. Instead we mock the two seams it uses to identify
 * the caller — @supabase/ssr and next/headers — and let everything below them
 * (Prisma, db(), the tenancy wrappers) run for real against the test DB.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// ── Auth seams ───────────────────────────────────────────────────────────────
// One mutable "current user"; each test sets it before calling POST.
let currentUser: { id: string; email: string; user_metadata?: Record<string, unknown> } | null = null;

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: currentUser }, error: null }) },
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], setAll: () => {} }),
}));
// Rate limits are in-memory and per-process; several tests redeem in a row as
// the same synthetic user, which would trip the 5/min cap.
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ ok: true }),
  clientIp: () => "127.0.0.1",
  tooManyRequests: () => Response.json({ error: "rate" }, { status: 429 }),
}));

import { NextRequest } from "next/server";
import { testPrisma, resetDb } from "../setup/prisma";
import { db } from "@/lib/db";
import { createOrg, createBrother, rosterOf, setRoster, accountOf } from "../setup/factories";
import { POST } from "@/app/api/auth/redeem-invite/route";

beforeEach(async () => {
  await resetDb();
  currentUser = null;
});
afterAll(async () => { await testPrisma.$disconnect(); });

/** Call the route with a JSON body, as the given auth user. */
async function redeem(
  body: Record<string, unknown>,
  user: { id: string; email: string } | null,
): Promise<{ status: number; json: Record<string, unknown> }> {
  currentUser = user ? { ...user, user_metadata: {} } : null;
  const req = new NextRequest("http://localhost/api/auth/redeem-invite", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  const res = await POST(req);
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function seedInvite(opts: {
  orgId: number;
  createdBy: number;
  mode?: string;
  token?: string;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  maxUses?: number | null;
}) {
  return testPrisma.orgInvite.create({
    data: {
      organizationId:     opts.orgId,
      token:              opts.token ?? `tok-${Math.random().toString(36).slice(2)}`,
      mode:               opts.mode ?? "open",
      createdByBrotherId: opts.createdBy,
      expiresAt:          opts.expiresAt ?? null,
      revokedAt:          opts.revokedAt ?? null,
      maxUses:            opts.maxUses ?? null,
    },
  });
}

describe("redeem-invite — gates", () => {
  it("401s without a session", async () => {
    const { status } = await redeem({ token: "anything" }, null);
    expect(status).toBe(401);
  });

  it("404s an unknown token", async () => {
    const { status } = await redeem({ token: "nope" }, { id: "auth-1", email: "a@x.com" });
    expect(status).toBe(404);
  });

  it("410s a revoked link", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const inv = await seedInvite({ orgId: org.id, createdBy: admin.id, revokedAt: new Date() });

    const { status, json } = await redeem({ token: inv.token, name: "New Person" }, { id: "auth-1", email: "a@x.com" });
    expect(status).toBe(410);
    expect(json.reason).toBe("revoked");
  });

  it("410s an expired link", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const inv = await seedInvite({ orgId: org.id, createdBy: admin.id, expiresAt: new Date(Date.now() - 1000) });

    const { status, json } = await redeem({ token: inv.token, name: "New Person" }, { id: "auth-1", email: "a@x.com" });
    expect(status).toBe(410);
    expect(json.reason).toBe("expired");
  });

  it("requires a name for a genuine join", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const inv = await seedInvite({ orgId: org.id, createdBy: admin.id });

    const { status } = await redeem({ token: inv.token }, { id: "auth-1", email: "a@x.com" });
    expect(status).toBe(400);
  });
});

describe("redeem-invite — open mode", () => {
  it("creates a Brother, a Membership, and a redemption for a new account", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const inv = await seedInvite({ orgId: org.id, createdBy: admin.id });

    const { status, json } = await redeem(
      { token: inv.token, name: "Jordan Lee" },
      { id: "auth-new", email: "jordan@x.com" },
    );
    expect(status).toBe(200);
    expect(json).toMatchObject({ ok: true, mode: "open", orgSlug: "alpha" });

    const brother = await testPrisma.brother.findUnique({ where: { authUserId: "auth-new" } });
    expect(brother).not.toBeNull();
    expect(brother!.organizationId).toBe(org.id);
    expect(brother!.isAdmin).toBe(false);

    const membership = await testPrisma.membership.findUnique({
      where: { brotherId_organizationId: { brotherId: brother!.id, organizationId: org.id } },
    });
    expect(membership!.name).toBe("Jordan Lee");
    expect(membership!.isOrgAdmin).toBe(false);

    expect(await testPrisma.inviteRedemption.count({ where: { inviteId: inv.id } })).toBe(1);
  });

  it("reuses the existing account and gives them a REAL roster spot in the new org", async () => {
    // The heart of Phase 2. This person's account originated in org B. Joining
    // org A must not mint a second account — and must not leave them with access
    // and no roster row, which is what it used to do.
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const adminA = await createBrother({ orgId: orgA.id, isOrgAdmin: true });
    const inv = await seedInvite({ orgId: orgA.id, createdBy: adminA.id });

    const visitor = await createBrother({ orgId: orgB.id, name: "Casey Wu" });
    await testPrisma.brother.update({ where: { id: visitor.id }, data: { authUserId: "auth-visitor" } });

    const { status } = await redeem(
      { token: inv.token, name: "Casey" },
      { id: "auth-visitor", email: "casey@x.com" },
    );
    expect(status).toBe(200);

    // One identity, shared. authUserId is unique globally.
    expect(await testPrisma.brother.count({ where: { authUserId: "auth-visitor" } })).toBe(1);
    // The origin-org pointer is untouched — it is a hint, not a membership.
    expect((await accountOf(visitor.id))!.organizationId).toBe(orgB.id);

    // Two roster spots, one per org, each with its own starting values and name.
    const inA = await rosterOf(visitor.id, orgA.id);
    const inB = await rosterOf(visitor.id, orgB.id);
    expect(inA!.name).toBe("Casey");
    expect(inA!.role).toBe("Brother");
    expect(inA!.duesOwed).toBe(0);
    expect(inB).not.toBeNull();

    // And org A's roster actually lists them.
    expect((await db(orgA.id).member.listRoster()).map(m => m.id)).toContain(visitor.id);
  });
});

describe("redeem-invite — a roster row an officer already prepared", () => {
  it("refuses rather than minting a second, blank roster row for the same person", async () => {
    // An officer typed this person onto org A's roster before they ever signed
    // in — an unclaimed Brother (authUserId null) plus a Membership carrying
    // their dues. That row cannot be handed to them: Brother.authUserId is
    // globally unique and they already own an account in org B, so the claim
    // flow turns them away.
    //
    // Letting the join proceed would leave org A showing this human twice — once
    // with their $150 balance, once with zeros — so it is refused instead, with
    // the officer named as the way out. Folding the two together is the merge
    // flow, which is deliberately not built yet.
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const adminA = await createBrother({ orgId: orgA.id, isOrgAdmin: true });
    const inv = await seedInvite({ orgId: orgA.id, createdBy: adminA.id });

    await createBrother({ orgId: orgA.id, name: "Casey Wu", duesOwed: 150 });

    const visitor = await createBrother({ orgId: orgB.id, name: "Casey Wu" });
    await testPrisma.brother.update({ where: { id: visitor.id }, data: { authUserId: "auth-visitor" } });

    const { status, json } = await redeem(
      { token: inv.token, name: "Casey Wu" },
      { id: "auth-visitor", email: "casey@x.com" },
    );

    expect(status).toBe(409);
    expect(String(json.error)).toMatch(/already added you/i);

    // No membership was created for them in org A, and the prepared row is intact.
    expect(await rosterOf(visitor.id, orgA.id)).toBeNull();
    const prepared = await db(orgA.id).member.search("Casey Wu", { exact: true });
    expect(prepared).toHaveLength(1);
    expect(prepared[0].duesOwed).toBe(150);
  });

  it("still lets them join when no prepared row matches their name", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const adminA = await createBrother({ orgId: orgA.id, isOrgAdmin: true });
    const inv = await seedInvite({ orgId: orgA.id, createdBy: adminA.id });

    await createBrother({ orgId: orgA.id, name: "Someone Else" });

    const visitor = await createBrother({ orgId: orgB.id, name: "Casey Wu" });
    await testPrisma.brother.update({ where: { id: visitor.id }, data: { authUserId: "auth-visitor" } });

    const { status } = await redeem(
      { token: inv.token, name: "Casey Wu" },
      { id: "auth-visitor", email: "casey@x.com" },
    );

    expect(status).toBe(200);
    expect(await rosterOf(visitor.id, orgA.id)).not.toBeNull();
  });
});

describe("redeem-invite — already a member", () => {
  it("does not rename an existing member who reopens the link", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const inv = await seedInvite({ orgId: org.id, createdBy: admin.id });

    const member = await createBrother({ orgId: org.id, name: "Jordan Lee", membershipName: "Jordan" });
    await testPrisma.brother.update({ where: { id: member.id }, data: { authUserId: "auth-member" } });

    const { status, json } = await redeem(
      { token: inv.token, name: "TOTALLY DIFFERENT" },
      { id: "auth-member", email: "jordan@x.com" },
    );

    expect(status).toBe(200);
    expect(json.alreadyMember).toBe(true);

    // The rename this route used to perform silently.
    const membership = await testPrisma.membership.findUnique({
      where: { brotherId_organizationId: { brotherId: member.id, organizationId: org.id } },
    });
    expect(membership!.name).toBe("Jordan");
    // And nothing was recorded as a fresh redemption.
    expect(await testPrisma.inviteRedemption.count({ where: { inviteId: inv.id } })).toBe(0);
  });

  it("answers 'already in' even when the link itself has expired", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const inv = await seedInvite({ orgId: org.id, createdBy: admin.id, expiresAt: new Date(Date.now() - 1000) });

    const member = await createBrother({ orgId: org.id, name: "Jordan Lee" });
    await testPrisma.brother.update({ where: { id: member.id }, data: { authUserId: "auth-member" } });

    const { status, json } = await redeem({ token: inv.token }, { id: "auth-member", email: "j@x.com" });
    expect(status).toBe(200);
    expect(json.alreadyMember).toBe(true);
  });
});

describe("redeem-invite — claim mode", () => {
  it("hands a brand-new account off to the name-match claim flow", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const inv = await seedInvite({ orgId: org.id, createdBy: admin.id, mode: "claim" });

    const { status, json } = await redeem({ token: inv.token }, { id: "auth-new", email: "n@x.com" });
    expect(status).toBe(200);
    expect(json).toMatchObject({ mode: "claim", orgSlug: "alpha" });

    // The handoff writes nothing.
    expect(await testPrisma.brother.count({ where: { authUserId: "auth-new" } })).toBe(0);
  });

  it("joins an existing account by Membership instead of dead-ending it", async () => {
    // /api/auth/claim answers this user 409 forever (authUserId is globally
    // unique, so they can never be linked to a second Brother row), and
    // /pending-access offers only a Sign out button. This is the fix.
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const adminA = await createBrother({ orgId: orgA.id, isOrgAdmin: true });
    const inv = await seedInvite({ orgId: orgA.id, createdBy: adminA.id, mode: "claim" });

    const visitor = await createBrother({ orgId: orgB.id, name: "Casey Wu" });
    await testPrisma.brother.update({ where: { id: visitor.id }, data: { authUserId: "auth-visitor" } });

    const { status, json } = await redeem(
      { token: inv.token, name: "Casey" },
      { id: "auth-visitor", email: "casey@x.com" },
    );

    expect(status).toBe(200);
    // Reported as "open" so the client lands them in the org rather than
    // bouncing to /pending-access.
    expect(json.mode).toBe("open");

    const membership = await testPrisma.membership.findUnique({
      where: { brotherId_organizationId: { brotherId: visitor.id, organizationId: orgA.id } },
    });
    expect(membership).not.toBeNull();
    expect(await testPrisma.inviteRedemption.count({ where: { inviteId: inv.id } })).toBe(1);
  });
});

describe("redeem-invite — maxUses", () => {
  it("admits up to the cap, then 410s with reason 'exhausted'", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const inv = await seedInvite({ orgId: org.id, createdBy: admin.id, maxUses: 2 });

    for (const n of [1, 2]) {
      const { status } = await redeem(
        { token: inv.token, name: `Joiner ${n}` },
        { id: `auth-${n}`, email: `j${n}@x.com` },
      );
      expect(status).toBe(200);
    }

    const third = await redeem({ token: inv.token, name: "Joiner 3" }, { id: "auth-3", email: "j3@x.com" });
    expect(third.status).toBe(410);
    expect(third.json.reason).toBe("exhausted");

    expect(await testPrisma.inviteRedemption.count({ where: { inviteId: inv.id } })).toBe(2);
  });

  it("still lets someone who already joined through it back in", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const inv = await seedInvite({ orgId: org.id, createdBy: admin.id, maxUses: 1 });

    const first = await redeem({ token: inv.token, name: "Jordan" }, { id: "auth-1", email: "j@x.com" });
    expect(first.status).toBe(200);

    // The link is now full, but re-clicking must not lock out the person who
    // filled it — they're a member, so they're told so.
    const again = await redeem({ token: inv.token, name: "Jordan" }, { id: "auth-1", email: "j@x.com" });
    expect(again.status).toBe(200);
    expect(again.json.alreadyMember).toBe(true);

    expect(await testPrisma.inviteRedemption.count({ where: { inviteId: inv.id } })).toBe(1);
  });
});
