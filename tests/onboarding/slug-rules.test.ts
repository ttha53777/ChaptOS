/**
 * Pure-function tests for the slug-rules module. No DB, no IO.
 * Uniqueness is the org-create service's responsibility and is covered by
 * service-level tests once Milestone 3 lands.
 */

import { describe, expect, it } from "vitest";
import { suggestSlug, validateSlugFormat, RESERVED_SLUGS, MAX_SLUG_LEN } from "@/lib/slug-rules";

describe("slug-rules: validateSlugFormat", () => {
  it("accepts a basic well-formed slug", () => {
    expect(validateSlugFormat("alpha").ok).toBe(true);
    expect(validateSlugFormat("kappa-beta").ok).toBe(true);
    expect(validateSlugFormat("chapter-12").ok).toBe(true);
  });

  it("rejects empty / whitespace", () => {
    expect(validateSlugFormat("").issue).toBe("empty");
    expect(validateSlugFormat("   ").issue).toBe("empty");
  });

  it("rejects too short", () => {
    expect(validateSlugFormat("ab").issue).toBe("too-short");
  });

  it("rejects too long", () => {
    expect(validateSlugFormat("a".repeat(MAX_SLUG_LEN + 1)).issue).toBe("too-long");
  });

  it("rejects uppercase, underscore, spaces", () => {
    expect(validateSlugFormat("Alpha").issue).toBe("bad-format");
    expect(validateSlugFormat("alpha_beta").issue).toBe("bad-format");
    expect(validateSlugFormat("alpha beta").issue).toBe("bad-format");
  });

  it("rejects leading / trailing / consecutive hyphens", () => {
    expect(validateSlugFormat("-alpha").issue).toBe("bad-format");
    expect(validateSlugFormat("alpha-").issue).toBe("bad-format");
    expect(validateSlugFormat("alpha--beta").issue).toBe("bad-format");
  });

  it("rejects reserved slugs", () => {
    expect(validateSlugFormat("admin").issue).toBe("reserved");
    expect(validateSlugFormat("api").issue).toBe("reserved");
    expect(validateSlugFormat("login").issue).toBe("reserved");
    expect(validateSlugFormat("www").issue).toBe("reserved");
    expect(validateSlugFormat("settings").issue).toBe("reserved");
  });

  it("RESERVED_SLUGS contains the system-route baseline", () => {
    for (const s of ["admin", "api", "login", "welcome", "settings"]) {
      expect(RESERVED_SLUGS.has(s)).toBe(true);
    }
  });
});

describe("slug-rules: suggestSlug", () => {
  it("slugifies a plain name", () => {
    expect(suggestSlug("Lambda Phi Epsilon")).toBe("lambda-phi-epsilon");
  });

  it("trims surrounding whitespace and punctuation", () => {
    expect(suggestSlug("  Foo!! Bar  ")).toBe("foo-bar");
  });

  it("collapses runs of non-alphanumerics", () => {
    expect(suggestSlug("A  & B")).toBe("a-b");
  });

  it("truncates to MAX_SLUG_LEN", () => {
    const long = "x".repeat(MAX_SLUG_LEN + 20);
    expect(suggestSlug(long).length).toBe(MAX_SLUG_LEN);
  });

  it("strips diacritics", () => {
    expect(suggestSlug("Café")).toBe("cafe");
  });
});
