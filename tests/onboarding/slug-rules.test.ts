/**
 * Pure-function tests for the slug-rules module. No DB, no IO.
 * Uniqueness is the org-create service's responsibility and is covered by
 * service-level tests once Milestone 3 lands.
 */

import { describe, expect, it } from "vitest";
import { suggestSlug, validateSlugFormat, RESERVED_SLUGS, MAX_SLUG_LEN, containsProfanity, generateSlugVariants } from "@/lib/slug-rules";

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

describe("slug-rules: containsProfanity", () => {
  it("flags common profanity", () => {
    expect(containsProfanity("fuck")).toBe(true);
    expect(containsProfanity("shit")).toBe(true);
  });

  it("flags profanity embedded in a longer slug", () => {
    expect(containsProfanity("the-fuck-club")).toBe(true);
  });

  it("flags hyphen-split profanity (f-u-c-k)", () => {
    expect(containsProfanity("f-u-c-k")).toBe(true);
  });

  it("allows clean slugs", () => {
    expect(containsProfanity("lambda-phi-epsilon")).toBe(false);
    expect(containsProfanity("alpha")).toBe(false);
    expect(containsProfanity("chess-club")).toBe(false);
  });

  it("ignores empty input", () => {
    expect(containsProfanity("")).toBe(false);
    expect(containsProfanity("   ")).toBe(false);
  });
});

describe("slug-rules: validateSlugFormat blocks profanity", () => {
  it("returns issue=profane with a generic message", () => {
    const result = validateSlugFormat("fuck");
    expect(result.ok).toBe(false);
    expect(result.issue).toBe("profane");
    expect(result.message).not.toMatch(/fuck/);
  });

  it("blocks hyphen-split profanity", () => {
    expect(validateSlugFormat("f-u-c-k").issue).toBe("profane");
  });
});

describe("slug-rules: generateSlugVariants", () => {
  it("returns numeric, year, and suffix variants", () => {
    const variants = generateSlugVariants("lpe", { year: 2026, limit: 10 });
    expect(variants).toContain("lpe-2");
    expect(variants).toContain("lpe-3");
    expect(variants).toContain("lpe-2026");
    expect(variants).toContain("lpe-chapter");
  });

  it("respects the limit", () => {
    expect(generateSlugVariants("lpe", { year: 2026, limit: 3 }).length).toBe(3);
  });

  it("returns nothing for empty input", () => {
    expect(generateSlugVariants("")).toEqual([]);
    expect(generateSlugVariants("   ")).toEqual([]);
  });

  it("filters out variants exceeding MAX_SLUG_LEN that become bad-format", () => {
    // A 31-char base + "-chapter" exceeds 32 and gets truncated mid-suffix to
    // bad shape; the function must drop those, not return malformed slugs.
    const base = "a".repeat(31);
    const variants = generateSlugVariants(base, { limit: 10 });
    for (const v of variants) {
      expect(validateSlugFormat(v).ok).toBe(true);
    }
  });

  it("de-duplicates collisions between strategies", () => {
    const variants = generateSlugVariants("lpe", { year: 2026, limit: 10 });
    expect(new Set(variants).size).toBe(variants.length);
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
