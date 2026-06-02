/**
 * Pure-function tests for extractSlug — the input parser used by the login org
 * picker to accept either a bare slug or a pasted URL.
 *
 * The platform domain is config-driven (lib/domains.ts, NEXT_PUBLIC_ROOT_DOMAIN)
 * so there's no real domain baked in. These tests cover the domain-agnostic
 * behavior that holds for ANY configured domain, plus a block that stubs a
 * concrete domain to prove apex detection works once one is set.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractSlug } from "@/lib/slug-extract";

describe("extractSlug: bare input", () => {
  it("returns lowercase trimmed bare slug", () => {
    expect(extractSlug("alpha")).toBe("alpha");
    expect(extractSlug("  Alpha  ")).toBe("alpha");
    expect(extractSlug("Kappa-Beta")).toBe("kappa-beta");
  });

  it("returns empty for empty / whitespace input", () => {
    expect(extractSlug("")).toBe("");
    expect(extractSlug("   ")).toBe("");
  });
});

describe("extractSlug: ?org= query param", () => {
  it("plucks slug from ?org=", () => {
    expect(extractSlug("https://example.com/welcome?org=lpe")).toBe("lpe");
  });

  it("plucks slug from middle of query string", () => {
    expect(extractSlug("https://example.com/?error=x&org=lpe&foo=bar")).toBe("lpe");
  });

  it("prefers ?org= over subdomain when both present", () => {
    // A user might paste a subdomain link that also carries ?org= — the
    // explicit param wins.
    expect(extractSlug("https://alpha.example.com/?org=beta")).toBe("beta");
  });
});

describe("extractSlug: URL subdomain (domain-agnostic)", () => {
  it("extracts the subdomain from any 3+ label host", () => {
    // Holds regardless of which root domain is configured — a leading label on
    // a multi-label host is treated as the org slug.
    expect(extractSlug("https://alpha.example.com")).toBe("alpha");
    expect(extractSlug("https://alpha.example.com/dashboard")).toBe("alpha");
    expect(extractSlug("alpha.some-saas.app")).toBe("alpha");
  });

  it("ignores the reserved 'www' subdomain", () => {
    // www.<domain> is the marketing page, not an org. We don't claim "www" is a
    // slug; the bare-input fallback returns the full host, which the server's
    // reserved-slug check rejects anyway.
    expect(extractSlug("https://www.example.com")).not.toBe("www");
  });

  it("ignores a bare apex / 2-label host (no subdomain)", () => {
    expect(extractSlug("https://example.com")).not.toBe("example");
  });

  it("ignores localhost", () => {
    expect(extractSlug("http://localhost:3000/welcome")).not.toBe("localhost");
  });
});

describe("extractSlug: configured root domain", () => {
  // lib/domains.ts reads env at module load, so stub the env and re-import a
  // fresh module graph to exercise a concrete configured domain + alias.
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "example.com");
    vi.stubEnv("NEXT_PUBLIC_DOMAIN_ALIASES", "legacy.org");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("treats the configured root + alias apexes as non-slugs", async () => {
    const { extractSlug: extract } = await import("@/lib/slug-extract");
    // Apex of the configured domain and its alias resolve to NO slug.
    expect(extract("https://example.com")).not.toBe("example");
    expect(extract("https://www.example.com")).not.toBe("www");
    expect(extract("https://legacy.org")).not.toBe("legacy");
    // But a real subdomain under either still resolves.
    expect(extract("https://alpha.example.com")).toBe("alpha");
    expect(extract("https://alpha.legacy.org")).toBe("alpha");
  });
});

describe("extractSlug: graceful failure", () => {
  it("falls back to bare input when URL parsing fails", () => {
    expect(extractSlug("not a url")).toBe("not a url");
  });
});
