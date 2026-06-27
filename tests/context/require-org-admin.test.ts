/**
 * Boundary test for buildContext({ requireOrgAdmin: true }).
 *
 * Three admin-only routes (orgs/config, orgs/setup-apply, activity POST) gate on
 * org-admin status rather than a single permission bit. The gate now lives at the
 * route boundary via this option — mirroring requirePerm — instead of (or in
 * addition to) an in-service check. This asserts the boundary behavior directly:
 * a non-admin member is 403'd, while org admins and platform admins pass.
 *
 * requireUser() is mocked so we exercise the gate without standing up Supabase /
 * cookies — the same seam other context tests use.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the auth seam buildContext depends on.
const requireUser = vi.fn();
vi.mock("@/lib/auth/require-user", () => ({ requireUser: () => requireUser() }));
// Keep rate limiting from interfering; we pass rateLimit:false anyway, but be safe.
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ ok: true }),
  tooManyRequests: () => Response.json({ error: "rate" }, { status: 429 }),
}));

import { buildContext } from "@/lib/context";

const ORG_ID = 42;

/** A user object shaped like requireUser()'s return, with a membership in ORG_ID. */
function userWith(over: { isOrgAdmin?: boolean; isPlatformAdmin?: boolean }) {
  return {
    id:              1,
    name:            "Tester",
    email:           "t@example.com",
    authUserId:      "auth-1",
    isAdmin:         false,
    isPlatformAdmin: over.isPlatformAdmin ?? false,
    orgId:           ORG_ID,
    cookieOrgId:     ORG_ID,
    memberships:     [{ id: 7, organizationId: ORG_ID, isOrgAdmin: over.isOrgAdmin ?? false, orgName: "Org", orgSlug: "org" }],
    roleRows:        [],
    userMetadata:    {},
  };
}

beforeEach(() => {
  requireUser.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("requireOrgAdmin gate", () => {
  it("403s a non-admin member", async () => {
    requireUser.mockResolvedValue(userWith({ isOrgAdmin: false }));
    const { ctx, error } = await buildContext({ requireOrgAdmin: true, rateLimit: false });
    expect(ctx).toBeUndefined();
    expect(error?.status).toBe(403);
  });

  it("admits an org admin", async () => {
    requireUser.mockResolvedValue(userWith({ isOrgAdmin: true }));
    const { ctx, error } = await buildContext({ requireOrgAdmin: true, rateLimit: false });
    expect(error).toBeUndefined();
    expect(ctx?.isOrgAdmin).toBe(true);
  });

  it("admits a platform admin even without org-admin membership", async () => {
    requireUser.mockResolvedValue(userWith({ isOrgAdmin: false, isPlatformAdmin: true }));
    const { ctx, error } = await buildContext({ requireOrgAdmin: true, rateLimit: false });
    expect(error).toBeUndefined();
    expect(ctx?.isPlatformAdmin).toBe(true);
  });

  it("does not gate when requireOrgAdmin is unset (a plain member passes)", async () => {
    requireUser.mockResolvedValue(userWith({ isOrgAdmin: false }));
    const { ctx, error } = await buildContext({ rateLimit: false });
    expect(error).toBeUndefined();
    expect(ctx?.isOrgAdmin).toBe(false);
  });

  it("401s when there is no user", async () => {
    requireUser.mockResolvedValue(null);
    const { error } = await buildContext({ requireOrgAdmin: true, rateLimit: false });
    expect(error?.status).toBe(401);
  });
});
