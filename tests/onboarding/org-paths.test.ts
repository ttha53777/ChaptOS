import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { fromLegacyOrgPath, isInsideOrg, orgHref, orgSlugFromPath, orgSubpath } from "@/lib/org-paths";
import { isDashboardRoute } from "@/app/lib/routes";
import { GET as legacyRedirect } from "@/app/[legacy]/[[...rest]]/route";

describe("org paths", () => {
  it("builds workspace URLs under /org", () => {
    expect(orgHref("lpe")).toBe("/org/lpe");
    expect(orgHref("lpe", "/")).toBe("/org/lpe");
    expect(orgHref("lpe", "/treasury")).toBe("/org/lpe/treasury");
    expect(orgHref("lpe", "treasury?tab=Dues")).toBe("/org/lpe/treasury?tab=Dues");
    expect(orgHref("lpe", "?toast=welcome")).toBe("/org/lpe?toast=welcome");
  });

  it("reads the slug back out of a pathname, and nothing else", () => {
    expect(orgSlugFromPath("/org/lpe")).toBe("lpe");
    expect(orgSlugFromPath("/org/lpe/treasury")).toBe("lpe");
    expect(orgSlugFromPath("/org")).toBeNull();
    expect(orgSlugFromPath("/org/")).toBeNull();
    expect(orgSlugFromPath("/lpe/treasury")).toBeNull();
    expect(orgSlugFromPath("/organic/x")).toBeNull();
    expect(orgSlugFromPath("/")).toBeNull();
    expect(orgSlugFromPath(null)).toBeNull();
  });

  it("splits off the path within the org", () => {
    expect(orgSubpath("/org/lpe")).toBe("/");
    expect(orgSubpath("/org/lpe/")).toBe("/");
    expect(orgSubpath("/org/lpe/treasury/dues")).toBe("/treasury/dues");
    expect(orgSubpath("/login")).toBe("/");
  });

  it("only counts the org itself as inside it, not a longer slug", () => {
    expect(isInsideOrg("/org/lpe", "lpe")).toBe(true);
    expect(isInsideOrg("/org/lpe/treasury?x=1", "lpe")).toBe(true);
    expect(isInsideOrg("/org/lpe?toast=welcome", "lpe")).toBe(true);
    expect(isInsideOrg("/org/lpex", "lpe")).toBe(false);
    expect(isInsideOrg("/lpe", "lpe")).toBe(false);
  });

  it("translates a pre-/org link into the org, and only that org", () => {
    expect(fromLegacyOrgPath("/lpe", "lpe")).toBe("/org/lpe");
    expect(fromLegacyOrgPath("/lpe/treasury?tab=Dues", "lpe")).toBe("/org/lpe/treasury?tab=Dues");
    expect(fromLegacyOrgPath("/lpe?toast=welcome", "lpe")).toBe("/org/lpe?toast=welcome");
    expect(fromLegacyOrgPath("/lpex/treasury", "lpe")).toBeNull();
    expect(fromLegacyOrgPath("/other/treasury", "lpe")).toBeNull();
    expect(fromLegacyOrgPath("/org/lpe", "lpe")).toBeNull();
  });

  it("treats only /org/<slug> as a dashboard route", () => {
    expect(isDashboardRoute("/org/lpe/timeline")).toBe(true);
    expect(isDashboardRoute("/pricing")).toBe(false);
    expect(isDashboardRoute("/lpe")).toBe(false);
    expect(isDashboardRoute("/")).toBe(false);
  });
});

describe("legacy root links", () => {
  const hit = (path: string, legacy: string, rest?: string[]) =>
    legacyRedirect(new NextRequest(`https://chaptos.com${path}`), { params: Promise.resolve({ legacy, rest }) });

  it("permanently redirects /<slug>/… to /org/<slug>/…, keeping the query", async () => {
    const res = await hit("/lpe/treasury?tab=Dues", "lpe", ["treasury"]);
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://chaptos.com/org/lpe/treasury?tab=Dues");
  });

  it("redirects the bare org root", async () => {
    const res = await hit("/lpe", "lpe");
    expect(res.headers.get("location")).toBe("https://chaptos.com/org/lpe");
  });

  it("404s anything that could never have been a slug", async () => {
    expect((await hit("/apple-touch-icon.png", "apple-touch-icon.png")).status).toBe(404);
    expect((await hit("/Foo", "Foo")).status).toBe(404);
  });
});
