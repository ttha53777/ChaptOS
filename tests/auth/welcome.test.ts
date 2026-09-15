import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), getJoinSession: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/auth/join-session", () => ({ getJoinSession: mocks.getJoinSession }));
vi.mock("@/app/welcome/WelcomeClient", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import WelcomePage from "@/app/welcome/page";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(null);
  mocks.getJoinSession.mockResolvedValue({ account: { email: "signed-in@example.com" } });
});
it("shows the signed-in email when there is no linked membership", async () => {
  const result = await WelcomePage({ searchParams: Promise.resolve({}) });
  expect(result.props.email).toBe("signed-in@example.com");
});
it("routes a member to their organization before rendering", async () => {
  mocks.requireUser.mockResolvedValue({ orgId: 2, memberships: [{ organizationId: 2, orgSlug: "beta" }] });
  await expect(WelcomePage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/beta");
});
it.each([{ new: "1" }, { requests: "1" }])("preserves an intentional welcome visit: %j", async params => {
  mocks.requireUser.mockResolvedValue({ email: "member@example.com", orgId: 2, memberships: [{ organizationId: 2, orgSlug: "beta" }] });
  expect((await WelcomePage({ searchParams: Promise.resolve(params) })).props.email).toBe("member@example.com");
});
it("routes an expired session to login", async () => {
  mocks.getJoinSession.mockResolvedValue(null);
  await expect(WelcomePage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/login");
});
