/**
 * app/create/_components/flow-state.ts pure-function tests.
 *
 * slugify() backs the Blueprint step's editable URL field — every keystroke
 * runs through it, and its output is what gets submitted as CreateOrgInput.slug
 * if the founder never touches the field again. Regression test for the bug
 * where a slug longer than MAX_SLUG_LEN passed the client's only length guard
 * (a `< 3` check) and reached POST /api/orgs, which 400'd with a raw ZodError
 * ("Validation failed") instead of the friendly slug-length message.
 */

import { describe, expect, it } from "vitest";
import { slugify } from "@/app/create/_components/flow-state";
import { MAX_SLUG_LEN } from "@/lib/slug-rules";
import { createOrgInput } from "@/lib/validation/org";

describe("flow-state: slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Lambda Phi Epsilon")).toBe("lambda-phi-epsilon");
  });

  it("strips leading/trailing separators", () => {
    expect(slugify("  Foo!! Bar  ")).toBe("foo-bar");
  });

  it("truncates to MAX_SLUG_LEN so it always parses under createOrgInput", () => {
    const long = "x".repeat(MAX_SLUG_LEN + 40);
    const result = slugify(long);
    expect(result.length).toBeLessThanOrEqual(MAX_SLUG_LEN);
    expect(
      createOrgInput.safeParse({
        name: "Test Org",
        slug: result,
        orgType: "fraternity",
        founderName: "Alex",
      }).success,
    ).toBe(true);
  });
});
