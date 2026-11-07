import { describe, it, expect } from "vitest";
import { preflightZip } from "@/lib/files/zip-preflight";
import { extractFile } from "@/lib/files";
import { FileRejected } from "@/lib/files/types";
import { docx, zip, zipBomb, traversalZip, encryptedEntryZip } from "../setup/file-fixtures";

function codeOf(fn: () => unknown): string | null {
  try { fn(); return null; } catch (e) { return e instanceof FileRejected ? e.code : String(e); }
}

describe("preflightZip", () => {
  it("returns entries with their real inflated sizes", () => {
    const entries = preflightZip(zip([{ name: "a.txt", data: "x".repeat(5000) }, { name: "b.txt", data: "yy", method: 0 }]));
    expect(entries).toEqual([{ name: "a.txt", size: 5000 }, { name: "b.txt", size: 2 }]);
  });

  it("refuses a zip bomb quickly, whatever the declared size", async () => {
    const bomb = zipBomb(80);
    expect(bomb.length).toBeLessThan(1024 * 1024);
    const t0 = performance.now();
    expect(codeOf(() => preflightZip(bomb))).toBe("MALFORMED");
    expect(performance.now() - t0).toBeLessThan(2000);
    await expect(extractFile(bomb, "bomb.docx")).rejects.toMatchObject({ code: "MALFORMED" });
  });

  it("refuses many small entries that add up past the total cap", () => {
    const chunk = Buffer.alloc(25 * 1024 * 1024);
    const entries = [0, 1, 2].map(i => ({ name: `x${i}.bin`, data: chunk }));
    expect(codeOf(() => preflightZip(zip(entries)))).toBe("MALFORMED");
  });

  it("refuses traversal names and encrypted entries", () => {
    expect(codeOf(() => preflightZip(traversalZip()))).toBe("MALFORMED");
    expect(codeOf(() => preflightZip(zip([{ name: "/etc/passwd", data: "x" }])))).toBe("MALFORMED");
    expect(codeOf(() => preflightZip(encryptedEntryZip()))).toBe("ENCRYPTED");
  });

  it("refuses too many entries and truncated archives", () => {
    const many = Array.from({ length: 2001 }, (_, i) => ({ name: `f${i}`, data: "", method: 0 as const }));
    expect(codeOf(() => preflightZip(zip(many)))).toBe("MALFORMED");
    const good = docx([{ text: "hello" }]);
    expect(codeOf(() => preflightZip(good.subarray(0, good.length - 30)))).toBe("MALFORMED");
  });
});
