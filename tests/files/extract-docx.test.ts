import { describe, it, expect } from "vitest";
import { extractFile } from "@/lib/files";
import { docx } from "../setup/file-fixtures";
import { htmlToSections } from "@/lib/files/html-sections";

describe("extractDocx", () => {
  it("splits at headings, labels sections by heading text, keeps tables as pipe rows", async () => {
    const out = await extractFile(docx([
      { text: "Preamble text before any heading." },
      { h: 1, text: "Article I — Name" },
      { text: "The chapter is called Alpha." },
      { h: 1, text: "Article IV — Elections" },
      { text: "Officers are elected each April." },
      { h: 2, text: "Section 2 — Ballots" },
      { text: "Ballots are secret." },
      { table: [["Office", "Term"], ["President", "1 year"]] },
    ]), "Bylaws.docx");
    expect(out.kind).toBe("docx");
    if (out.content.type !== "text") throw new Error("expected text");
    const units = out.content.units;
    expect(units.map(u => u.label)).toEqual(["Start", "Article I — Name", "Article IV — Elections", "Section 2 — Ballots"]);
    expect(units.map(u => u.ref)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(units[3].text).toContain("Office | Term");
    expect(units[3].text).toContain("President | 1 year");
  });

  it("falls back to Part n blocks without headings", () => {
    const units = htmlToSections(`<p>${"word ".repeat(1000)}</p><p>${"more ".repeat(1000)}</p>`);
    expect(units[0].label).toBe("Part 1");
    expect(units.length).toBeGreaterThan(1);
    expect(units.every(u => u.text.length <= 3000)).toBe(true);
  });

  it("decodes entities and rejects an empty document", async () => {
    expect(htmlToSections("<p>Tom &amp; Jerry &#8212; &lt;b&gt;</p>")[0].text).toBe("Tom & Jerry — <b>");
    await expect(extractFile(docx([{ text: "   " }]), "blank.docx")).rejects.toMatchObject({ code: "EMPTY" });
  });
});
