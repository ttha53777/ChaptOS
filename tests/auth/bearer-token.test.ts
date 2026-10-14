import { beforeEach, describe, expect, it, vi } from "vitest";

// The native app has no cookie jar, so it authenticates with the Supabase
// access token in `Authorization: Bearer`. These pin how requireUser/hasSession
// pick between that header and the browser's session cookie.
const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(), getClaims: vi.fn(), headers: new Headers(),
}));
vi.mock("@/lib/prisma", () => { throw new Error("Auth bootstrap must not use an org-scoped connection"); });
vi.mock("@/lib/prisma-privileged", () => ({ prismaPrivileged: { brother: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/auth/dev-bypass", () => ({ devBypassEnabled: () => false, verifyImpersonation: () => null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [{ name: "sb-session", value: "cookie" }] }),
  headers: async () => mocks.headers,
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims: mocks.getClaims } }),
}));
import { requireUser, hasSession, sessionAuthUserId } from "@/lib/auth/require-user";
import { getJoinSession } from "@/lib/auth/join-session";

const cookieAccount = { id: "cookie-account", email: "web@example.com" };
const tokenAccount  = { id: "token-account",  email: "app@example.com" };
const claimsFor = (a: { id: string; email: string }, extra: Record<string, unknown> = {}) =>
  ({ data: { claims: { sub: a.id, email: a.email, role: "authenticated", user_metadata: {}, ...extra } }, error: null });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers = new Headers();
  // getClaims() with no argument reads the cookie session; getClaims(jwt) verifies the token.
  mocks.getClaims.mockImplementation(async (jwt?: string) => {
    if (jwt === undefined)   return claimsFor(cookieAccount);
    if (jwt === "valid-jwt") return claimsFor(tokenAccount);
    return { data: null, error: new Error("invalid JWT") };
  });
  mocks.findUnique.mockResolvedValue({ id: 1, name: "Member", organizationId: 2,
    memberships: [{ id: 12, organizationId: 2, isOrgAdmin: false, name: null, role: "Member",
      organization: { slug: "beta", name: "Beta", logoUrl: null } }],
    roles: [], isAdmin: false, platformAdmin: null });
});

describe("bearer-token auth", () => {
  it("falls back to the cookie session when no Authorization header is sent", async () => {
    await requireUser();
    expect(mocks.getClaims).toHaveBeenCalledWith();
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { authUserId: cookieAccount.id } }));
  });

  it("resolves the token's account when a Bearer token is sent", async () => {
    mocks.headers = new Headers({ authorization: "Bearer valid-jwt" });
    const user = await requireUser();
    expect(mocks.getClaims).toHaveBeenCalledWith("valid-jwt");
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { authUserId: tokenAccount.id } }));
    expect(user?.orgId).toBe(2);
    expect(await sessionAuthUserId()).toBe(tokenAccount.id);
  });

  it("rejects a bad token outright instead of falling back to the cookie", async () => {
    mocks.headers = new Headers({ authorization: "Bearer expired-jwt" });
    expect(await requireUser()).toBeNull();
    expect(await hasSession()).toBe(false);
    expect(await sessionAuthUserId()).toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.getClaims).not.toHaveBeenCalledWith();
  });

  it("ignores non-Bearer Authorization schemes", async () => {
    mocks.headers = new Headers({ authorization: "Basic dXNlcjpwYXNz" });
    await requireUser();
    expect(mocks.getClaims).toHaveBeenCalledWith();
  });

  it("resolves the join-flow session from a Bearer token too", async () => {
    // getJoinSession backs join-status / join-requests / invite-status — the
    // app's "not a member yet" screen reads these before any roster row exists.
    mocks.headers = new Headers({ authorization: "Bearer valid-jwt" });
    expect((await getJoinSession())?.authUserId).toBe(tokenAccount.id);
    mocks.headers = new Headers({ authorization: "Bearer expired-jwt" });
    expect(await getJoinSession()).toBeNull();
  });

  it("refuses tokens that verify but aren't a signed-in user's", async () => {
    // The anon key is a JWT from the same issuer; anonymous sign-ins carry a
    // subject. Neither is a member identity.
    mocks.headers = new Headers({ authorization: "Bearer other" });
    mocks.getClaims.mockResolvedValueOnce({ data: { claims: { role: "anon", iss: "supabase" } }, error: null });
    expect(await requireUser()).toBeNull();
    mocks.getClaims.mockResolvedValueOnce(claimsFor(tokenAccount, { is_anonymous: true }));
    expect(await requireUser()).toBeNull();
    mocks.getClaims.mockResolvedValueOnce(claimsFor(tokenAccount, { role: "service_role" }));
    expect(await requireUser()).toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("treats a verification crash as no account, not a 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.headers = new Headers({ authorization: "Bearer valid-jwt" });
    mocks.getClaims.mockRejectedValueOnce(new TypeError("bad JWK"));
    expect(await requireUser()).toBeNull();
    spy.mockRestore();
  });
});
