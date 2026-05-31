/**
 * Pure-function tests for extractSlug — the input parser used by /welcome's
 * Join form to accept either a bare slug or a pasted URL.
 */

import { describe, expect, it } from "vitest";
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
    expect(extractSlug("https://figurints.com/welcome?org=lpe")).toBe("lpe");
  });

  it("plucks slug from middle of query string", () => {
    expect(extractSlug("https://figurints.com/?error=x&org=lpe&foo=bar")).toBe("lpe");
  });

  it("prefers ?org= over subdomain when both present", () => {
    // A user might paste a subdomain link that also carries ?org= for
    // localhost fallback — the explicit param wins.
    expect(extractSlug("https://alpha.figurints.com/?org=beta")).toBe("beta");
  });
});

describe("extractSlug: URL subdomain", () => {
  it("extracts subdomain from a full URL", () => {
    expect(extractSlug("https://alpha.figurints.com")).toBe("alpha");
    expect(extractSlug("https://alpha.figurints.com/dashboard")).toBe("alpha");
  });

  it("extracts subdomain from a scheme-less URL", () => {
    expect(extractSlug("alpha.figurints.com")).toBe("alpha");
  });

  it("ignores 'www' subdomain", () => {
    // www.figurints.com is the marketing page, not an org. The bare-input
    // fallback returns the lowercased string, which the server's reserved-slug
    // check will reject — fine, but importantly we don't accidentally claim
    // "www" is a slug.
    const result = extractSlug("https://www.figurints.com");
    expect(result).not.toBe("www");
  });

  it("ignores the apex host (figurints.com with no subdomain)", () => {
    const result = extractSlug("https://figurints.com");
    expect(result).not.toBe("figurints");
  });

  it("ignores localhost", () => {
    const result = extractSlug("http://localhost:3000/welcome");
    expect(result).not.toBe("localhost");
  });
});

describe("extractSlug: graceful failure", () => {
  it("falls back to bare input when URL parsing fails", () => {
    // Not a URL; just looks vaguely like one.
    expect(extractSlug("not a url")).toBe("not a url");
  });
});
