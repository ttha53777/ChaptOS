import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(), getUser: vi.fn(), exchange: vi.fn(),
}));
vi.mock("@/lib/prisma", () => { throw new Error("Auth bootstrap must not use an org-scoped connection"); });
vi.mock("@/lib/prisma-privileged", () => ({ prismaPrivileged: { brother: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/auth/dev-bypass", () => ({ devBypassEnabled: () => false, verifyImpersonation: () => null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
  headers: async () => new Headers(),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, opts: { cookies: { setAll: (list: unknown[]) => void } }) => ({ auth: {
    getUser: mocks.getUser,
    exchangeCodeForSession: async (code: string) => {
      opts.cookies.setAll([{ name: "session", value: "verified", options: { path: "/", httpOnly: true } }]);
      return mocks.exchange(code);
    },
  } }),
}));
import { GET } from "@/app/auth/callback/route";
import { requireUser } from "@/lib/auth/require-user";

const account = { id: "verified-account", email: "member@example.com" };
const membership = { id: 12, organizationId: 2, isOrgAdmin: false, name: "Member", role: "Member", organization: { slug: "beta", name: "Beta" } };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: account } });
  mocks.exchange.mockResolvedValue({ data: { user: account }, error: null });
  mocks.findUnique.mockResolvedValue({ id: 1, name: "Member", organizationId: 1,
    organization: { id: 1, slug: "former-org" }, memberships: [membership], roles: [], isAdmin: false, platformAdmin: null });
});

describe("sign-in bootstrap", () => {
  it("resolves the verified account before org context exists and keeps session cookies", async () => {
    const res = await GET(new NextRequest("https://chaptos.com/auth/callback?code=valid"));
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { authUserId: account.id } }));
    expect(res.headers.get("location")).toBe("https://chaptos.com/beta?toast=welcome");
    expect(res.cookies.get("session")?.value).toBe("verified");
    expect(res.cookies.get("active_org_id")?.value).toBe("2");
  });
  it("resolves subsequent requests through the same authenticated lookup", async () => {
    const user = await requireUser();
    expect(user).toMatchObject({ authUserId: account.id, orgId: 2, memberships: [{ organizationId: 2 }] });
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { authUserId: account.id } }));
  });
  it("does not query identities without a verified session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await requireUser()).toBeNull();
    mocks.exchange.mockResolvedValue({ data: { user: null }, error: new Error("invalid") });
    const res = await GET(new NextRequest("https://chaptos.com/auth/callback?code=invalid"));
    expect(res.headers.get("location")).toBe("https://chaptos.com/login?error=auth");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it("turns bootstrap database failures into a recoverable redirect", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.findUnique.mockRejectedValueOnce(new Error("database unavailable"));

    const res = await GET(new NextRequest("https://chaptos.com/auth/callback?code=valid"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://chaptos.com/login?error=server");
    expect(res.cookies.get("session")?.value).toBe("verified");
    expect(spy).toHaveBeenCalledWith("auth callback identity lookup failed", expect.any(Error));
    spy.mockRestore();
  });
  it("keeps an account with no identity on welcome without creating membership", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const res = await GET(new NextRequest("https://chaptos.com/auth/callback?code=valid"));
    expect(res.headers.get("location")).toBe("https://chaptos.com/welcome");
    expect(res.cookies.get("session")?.value).toBe("verified");
  });
  it("never falls back to an origin org without membership", async () => {
    const row = await mocks.findUnique();
    mocks.findUnique.mockResolvedValue({ ...row, memberships: [] });
    const res = await GET(new NextRequest("https://chaptos.com/auth/callback?code=valid"));
    expect(res.headers.get("location")).toBe("https://chaptos.com/welcome");
    expect(res.cookies.get("active_org_id")).toBeUndefined();
  });
});
