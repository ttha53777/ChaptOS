import { beforeEach, describe, expect, it, vi } from "vitest";

// Avatar upload/removal needs a live session. The browser has a cookie one; the
// app sends only a bearer token, which must be verified live (getUser(token))
// and must never fall back to a cookie riding along.
const mocks = vi.hoisted(() => ({
  headers: new Headers(),
  cookieGetUser: vi.fn(), cookieUpdateUser: vi.fn(),
  bearerGetUser: vi.fn(), createClient: vi.fn(), adminUpdate: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers, cookies: async () => ({ getAll: () => [] }) }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: mocks.cookieGetUser, updateUser: mocks.cookieUpdateUser }, storage: "cookie-storage" }),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ auth: { admin: { updateUserById: mocks.adminUpdate } } }) }));
import { liveSession } from "@/lib/auth/live-session";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers = new Headers();
  mocks.cookieGetUser.mockResolvedValue({ data: { user: { id: "cookie-user" } } });
  mocks.cookieUpdateUser.mockResolvedValue({ error: null });
  mocks.createClient.mockImplementation(() => ({ auth: { getUser: mocks.bearerGetUser }, storage: "bearer-storage" }));
  mocks.bearerGetUser.mockImplementation(async (jwt: string) =>
    jwt === "good" ? { data: { user: { id: "token-user" } }, error: null } : { data: { user: null }, error: new Error("bad jwt") });
  mocks.adminUpdate.mockResolvedValue({ error: null });
});

describe("liveSession", () => {
  it("uses the cookie session when there's no bearer", async () => {
    const s = await liveSession();
    expect(s?.user.id).toBe("cookie-user");
    expect(s?.storage).toBe("cookie-storage");
    await s?.updateMetadata({ custom_avatar: true });
    expect(mocks.cookieUpdateUser).toHaveBeenCalledWith({ data: { custom_avatar: true } });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("verifies a bearer live, scopes storage to it, and writes metadata for that user", async () => {
    mocks.headers = new Headers({ authorization: "Bearer good" });
    const s = await liveSession();
    expect(mocks.bearerGetUser).toHaveBeenCalledWith("good");
    expect(mocks.createClient.mock.calls[0]?.[2]).toMatchObject({ global: { headers: { Authorization: "Bearer good" } } });
    expect(s?.storage).toBe("bearer-storage");
    await s?.updateMetadata({ avatar_url: "x" });
    expect(mocks.adminUpdate).toHaveBeenCalledWith("token-user", { user_metadata: { avatar_url: "x" } });
    expect(mocks.cookieGetUser).not.toHaveBeenCalled();
  });

  it("refuses a bad bearer instead of falling back to the cookie", async () => {
    mocks.headers = new Headers({ authorization: "Bearer stale" });
    expect(await liveSession()).toBeNull();
    expect(mocks.cookieGetUser).not.toHaveBeenCalled();
  });
});
