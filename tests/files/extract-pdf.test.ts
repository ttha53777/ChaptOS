import { describe, it, expect } from "vitest";
import { extractFile } from "@/lib/files";
import { FILE_MAX_CHARS } from "@/lib/files/limits";
import { pdf } from "../setup/file-fixtures";

describe("extractPdf", () => {
  it("yields one unit per page with p<n> refs", async () => {
    const out = await extractFile(pdf(["Article I\nThe name of this chapter is Alpha.", "Article II\nElections are held each April.", "Article III\nDues are $120."]), "Constitution.pdf");
    expect(out.kind).toBe("pdf");
    expect(out.unitCount).toBe(3);
    expect(out.truncated).toBe(false);
    if (out.content.type !== "text") throw new Error("expected text");
    expect(out.content.units.map(u => [u.ref, u.label])).toEqual([["p1", "Page 1"], ["p2", "Page 2"], ["p3", "Page 3"]]);
    expect(out.content.units[1].text).toContain("Elections are held each April.");
    expect(out.charCount).toBe(out.content.units.reduce((n, u) => n + u.text.length, 0));
  });

  it("rejects scanned (image-only) and password-protected PDFs", async () => {
    await expect(extractFile(pdf(["", ""], { draw: true }), "scan.pdf")).rejects.toMatchObject({ code: "NO_TEXT_LAYER" });
    await expect(extractFile(pdf(["secret"], { encrypt: true }), "locked.pdf")).rejects.toMatchObject({ code: "ENCRYPTED" });
  });

  it("stops at the stored-character cap and says so", async () => {
    const page = ("Lorem ipsum dolor sit amet consectetur. ".repeat(2) + "\n").repeat(60);
    const pages = Array.from({ length: Math.ceil(FILE_MAX_CHARS / 4000) + 5 }, () => page);
    const t0 = performance.now();
    const out = await extractFile(pdf(pages), "long.pdf");
    expect(out.truncated).toBe(true);
    expect(out.charCount).toBeLessThanOrEqual(FILE_MAX_CHARS);
    expect(out.unitCount).toBeLessThan(pages.length);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
