import { describe, expect, it } from "vitest";
import { isUploadedAvatarUrl } from "@/lib/avatar";

// /api/auth/me decides "is this photo custom?" from the persisted URL, because
// the session's metadata can be up to a token-lifetime stale.
describe("isUploadedAvatarUrl", () => {
  it("recognises an upload to the avatars bucket, cache-buster and all", () => {
    expect(isUploadedAvatarUrl("https://abc.supabase.co/storage/v1/object/public/avatars/uid/avatar.png?v=1791965465704")).toBe(true);
  });
  it("does not mistake a provider picture or another bucket for an upload", () => {
    expect(isUploadedAvatarUrl("https://lh3.googleusercontent.com/a/ACg8ocL=s96-c")).toBe(false);
    expect(isUploadedAvatarUrl("https://abc.supabase.co/storage/v1/object/public/org-logos/1/logo.png")).toBe(false);
  });
});
