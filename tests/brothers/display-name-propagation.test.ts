/**
 * Regression coverage for org-local display names (Membership.name).
 *
 * updateBrother lands a rename on Membership.name for the active org (see
 * brother-service.ts), not on the account-level Brother row. Every read path
 * that shows another member's name — attendance, excuses, roles, tasks — has
 * to resolve through ctx.db.membership.resolveNames (lib/db/tenant.ts) instead
 * of reading brother.name directly, or a rename in one org silently fails to
 * show up anywhere except the roster. This file exercises a representative
 * sample of those consumers.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother } from "../setup/factories";
import { db } from "@/lib/db";

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("org-local display name propagation", () => {
  it("ctx.db.membership.resolveNames prefers the org-local name and falls back to Brother.name", async () => {
    const org = await createOrg("Name Org", "name-org");
    const renamed = await createBrother({ orgId: org.id, name: "Robert Chen", membershipName: "Rob" });
    const untouched = await createBrother({ orgId: org.id, name: "Sam Lee" });

    const names = await db(org.id).membership.resolveNames([
      { id: renamed.id, name: renamed.name },
      { id: untouched.id, name: untouched.name },
    ]);

    expect(names.get(renamed.id)).toBe("Rob");
    expect(names.get(untouched.id)).toBe("Sam Lee");
  });
});
