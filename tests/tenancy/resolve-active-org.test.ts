/**
 * Unit tests for resolveActiveOrg — the pure active-org resolution used by
 * requireUser(). Precedence: URL slug hint > active_org cookie > home org.
 *
 * Pure (no DB / no next/headers), so unlike the rest of tests/tenancy this needs
 * no resetDb or test DB connection.
 */

import { describe, expect, it } from "vitest";
import { resolveActiveOrg } from "@/lib/auth/require-user";

// Brother is a member of org 1 (alpha) and org 2 (beta); home org is 1.
const memberships = [
  { organizationId: 1, orgSlug: "alpha" },
  { organizationId: 2, orgSlug: "beta" },
];

describe("resolveActiveOrg", () => {
  it("slug hint wins over the cookie when the user is a member of it", () => {
    const { activeOrgId } = resolveActiveOrg({
      memberships,
      cookieValue: "1", // cookie says alpha
      homeOrgId: 1,
      orgSlug: "beta", // URL says beta
    });
    expect(activeOrgId).toBe(2);
  });

  it("ignores a slug for an org the user is NOT a member of, falling back to the cookie", () => {
    const { activeOrgId } = resolveActiveOrg({
      memberships,
      cookieValue: "2",
      homeOrgId: 1,
      orgSlug: "gamma", // not a membership
    });
    expect(activeOrgId).toBe(2); // cookie value honored
  });

  it("ignores a bogus slug and (with no valid cookie) falls back to home org", () => {
    const { activeOrgId } = resolveActiveOrg({
      memberships,
      cookieValue: undefined,
      homeOrgId: 1,
      orgSlug: "nope",
    });
    expect(activeOrgId).toBe(1);
  });

  it("uses the cookie when no slug hint is given", () => {
    const { activeOrgId } = resolveActiveOrg({
      memberships,
      cookieValue: "2",
      homeOrgId: 1,
    });
    expect(activeOrgId).toBe(2);
  });

  it("ignores a cookie pointing at a non-membership org, falling back to home", () => {
    const { activeOrgId, cookieOrgId } = resolveActiveOrg({
      memberships,
      cookieValue: "99", // not a membership
      homeOrgId: 1,
    });
    expect(activeOrgId).toBe(1);
    expect(cookieOrgId).toBeNull();
  });

  it("ignores a non-numeric cookie", () => {
    const { activeOrgId, cookieOrgId } = resolveActiveOrg({
      memberships,
      cookieValue: "abc",
      homeOrgId: 2,
    });
    expect(activeOrgId).toBe(2);
    expect(cookieOrgId).toBeNull();
  });

  it("reports cookieOrgId independently of the slug-driven activeOrgId (stale-cookie detection)", () => {
    // Cookie still points at alpha, but the URL drove us to beta. The layout
    // uses cookieOrgId !== membership.org to fire a background cookie sync.
    const { activeOrgId, cookieOrgId } = resolveActiveOrg({
      memberships,
      cookieValue: "1",
      homeOrgId: 1,
      orgSlug: "beta",
    });
    expect(activeOrgId).toBe(2);
    expect(cookieOrgId).toBe(1);
  });
});
