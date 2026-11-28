import { describe, expect, it } from "vitest";

import { draftVerdict } from "@/lib/ai-verdict-draft";

const FULL = JSON.stringify({
  verdict: "Three brothers still owe *$360* in dues.",
  rows: [{ kind: "member", title: "Rob Chen", value: "$120" }],
  follows: [{ label: "Remind them", ask: "Draft a reminder" }],
});

describe("draftVerdict", () => {
  it("returns nothing until the verdict string closes", () => {
    const cut = FULL.indexOf("dues.");
    for (let n = 0; n < cut; n++) expect(draftVerdict(FULL.slice(0, n))).toBeNull();
  });

  it("returns the verdict the moment it closes, before the rows arrive", () => {
    const close = FULL.indexOf('",') + 1;
    expect(draftVerdict(FULL.slice(0, close))).toBe("Three brothers still owe *$360* in dues.");
    expect(draftVerdict(FULL)).toBe("Three brothers still owe *$360* in dues.");
  });

  it("finds a verdict that isn't the first key", () => {
    const buf = JSON.stringify({ rows: [{ title: "x" }], verdict: "Late one." });
    expect(draftVerdict(buf)).toBe("Late one.");
    expect(draftVerdict(buf.slice(0, buf.indexOf("Late")))).toBeNull();
  });

  it("ignores a nested key named verdict", () => {
    const buf = '{"rows":[{"verdict":"not me","title":"x"}],"verdict":"me"}';
    expect(draftVerdict(buf)).toBe("me");
    expect(draftVerdict(buf.slice(0, buf.lastIndexOf('"verdict"')))).toBeNull();
  });

  it("ignores a string VALUE that reads \"verdict\"", () => {
    expect(draftVerdict('{"tone":"verdict","verdict":"real"}')).toBe("real");
  });

  it("decodes escapes, including escaped quotes", () => {
    const buf = JSON.stringify({ verdict: 'The "Spring Formal" is — sold out.\n' });
    expect(draftVerdict(buf)).toBe('The "Spring Formal" is — sold out.');
    const raw = '{"verdict":"Rob said \\"no\\"';
    expect(draftVerdict(raw)).toBeNull();
    expect(draftVerdict(raw + '"')).toBe('Rob said "no"');
  });

  it("tolerates whitespace around the colon", () => {
    expect(draftVerdict('{ "verdict" :  "Spaced."')).toBe("Spaced.");
  });

  it("returns null for an empty or non-string verdict", () => {
    expect(draftVerdict('{"verdict":"   "}')).toBeNull();
    expect(draftVerdict('{"verdict":42}')).toBeNull();
    expect(draftVerdict("")).toBeNull();
  });
});
