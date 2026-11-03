/**
 * Terms of Service acceptance — where it gets recorded, and that it goes away
 * with the account.
 *
 *   provisionOrg       the founder's /create checkbox, inside the org's own tx
 *   submitJoinRequest  "By continuing…" on /join, inside the request's own tx
 *   recordTermsAcceptance / latestAcceptedTermsVersion
 *                      the in-app prompt and what /api/auth/me reads back
 *   deleteOwnAccount   erases the rows (they're keyed by the Google account, so
 *                      no Brother cascade reaches them)
 *
 * Routes aren't exercised here: their only job beyond the service is requiring
 * the version, which termsVersionInput covers below without a Supabase session.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother } from "../setup/factories";
import { provisionOrg } from "@/lib/services/org-service";
import { submitJoinRequest } from "@/lib/auth/join-request-submit";
import { deleteOwnAccount } from "@/lib/auth/account-deletion";
import {
  latestAcceptedTermsVersion, recordTermsAcceptance, termsStatus,
} from "@/lib/auth/terms-acceptance";
import { TermsAcceptanceContext } from "@/lib/state";
import { TERMS_ACCEPT_BY, TERMS_VERSION, isKnownTermsVersion } from "@/lib/terms";
import { acceptTermsInput, createOrgTermsInput } from "@/lib/validation/terms";
import { submitJoinRequestInput } from "@/lib/validation/join-request";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await testPrisma.$disconnect(); });

const ORG = { name: "Terms Org", slug: "terms-org", orgType: "fraternity" as const, founderName: "Jordan Lee" };

async function seedInvite(orgId: number, createdBy: number) {
  return testPrisma.orgInvite.create({
    data: { organizationId: orgId, token: `tok-${randomUUID()}`, createdByBrotherId: createdBy },
  });
}

describe("provisionOrg", () => {
  it("records the founder's acceptance against the new org", async () => {
    const out = await provisionOrg(ORG, "auth-founder", null, { version: TERMS_VERSION });

    const rows = await testPrisma.termsAcceptance.findMany({ where: { authUserId: "auth-founder" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      version: TERMS_VERSION, context: TermsAcceptanceContext.Create, organizationId: out.organizationId,
    });
  });

  it("records nothing when no acceptance is passed (internal callers)", async () => {
    await provisionOrg(ORG, "auth-founder", null);
    expect(await testPrisma.termsAcceptance.count()).toBe(0);
  });

  it("rolls the acceptance back with the org when creation fails", async () => {
    await provisionOrg(ORG, "auth-first", null, { version: TERMS_VERSION });
    // Same slug: the second create loses, and its acceptance must not survive.
    await expect(provisionOrg(ORG, "auth-second", null, { version: TERMS_VERSION })).rejects.toThrow();
    expect(await testPrisma.termsAcceptance.count({ where: { authUserId: "auth-second" } })).toBe(0);
  });
});

describe("submitJoinRequest", () => {
  it("records the asker's acceptance when it files a request", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const inv = await seedInvite(org.id, admin.id);

    const out = await submitJoinRequest(inv.token, "Jordan Lee", { authUserId: "g-1", email: null, avatarUrl: null }, TERMS_VERSION);
    expect(out).toMatchObject({ ok: true, state: "pending" });

    const rows = await testPrisma.termsAcceptance.findMany({ where: { authUserId: "g-1" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ version: TERMS_VERSION, context: TermsAcceptanceContext.Join, organizationId: null });
  });

  it("records nothing for a dead link", async () => {
    const out = await submitJoinRequest("no-such-token", "X", { authUserId: "g-2", email: null, avatarUrl: null }, TERMS_VERSION);
    expect(out).toMatchObject({ ok: false, state: "dead" });
    expect(await testPrisma.termsAcceptance.count()).toBe(0);
  });
});

describe("recordTermsAcceptance / latestAcceptedTermsVersion", () => {
  it("is null for an account that never agreed", async () => {
    expect(await latestAcceptedTermsVersion("nobody")).toBeNull();
  });

  it("reads back the most recent acceptance and keeps the history", async () => {
    await testPrisma.termsAcceptance.create({
      data: { authUserId: "g-3", version: "2020-01-01", context: "prompt", acceptedAt: new Date("2020-01-02") },
    });
    await recordTermsAcceptance({ authUserId: "g-3", version: TERMS_VERSION, context: TermsAcceptanceContext.Prompt });

    expect(await latestAcceptedTermsVersion("g-3")).toBe(TERMS_VERSION);
    expect(await testPrisma.termsAcceptance.count({ where: { authUserId: "g-3" } })).toBe(2);
  });

  it("reports the status /api/auth/me sends", () => {
    expect(termsStatus(null)).toEqual({ version: TERMS_VERSION, acceptedVersion: null, acceptBy: TERMS_ACCEPT_BY });
  });
});

describe("deleteOwnAccount", () => {
  it("erases the account's acceptance records", async () => {
    // A join request is the one acceptance that exists before any Brother does.
    const org = await createOrg("Beta", "beta");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const inv = await seedInvite(org.id, admin.id);
    const authUserId = randomUUID();
    await submitJoinRequest(inv.token, "Sam", { authUserId, email: null, avatarUrl: null }, TERMS_VERSION);

    await deleteOwnAccount(authUserId);

    expect(await testPrisma.termsAcceptance.count({ where: { authUserId } })).toBe(0);
  });
});

describe("validation", () => {
  it("accepts only versions that were ever live", () => {
    expect(isKnownTermsVersion(TERMS_VERSION)).toBe(true);
    expect(acceptTermsInput.safeParse({ version: TERMS_VERSION }).success).toBe(true);
    expect(acceptTermsInput.safeParse({ version: "1999-01-01" }).success).toBe(false);
    expect(acceptTermsInput.safeParse({}).success).toBe(false);
  });

  it("makes org creation and join requests carry an acceptance", () => {
    expect(createOrgTermsInput.safeParse({ ...ORG }).success).toBe(false);
    expect(createOrgTermsInput.safeParse({ ...ORG, termsVersion: TERMS_VERSION }).success).toBe(true);
    expect(submitJoinRequestInput.safeParse({ token: "t", name: "N" }).success).toBe(false);
    expect(submitJoinRequestInput.safeParse({ token: "t", name: "N", termsVersion: TERMS_VERSION }).success).toBe(true);
  });
});
