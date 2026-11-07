import { describe, it, expect } from "vitest";
import { extractFile } from "@/lib/files";
import { displayName } from "@/lib/files/filename";
import { utf16Text } from "../setup/file-fixtures";

describe("extractTxt", () => {
  it("blocks of 80 lines labelled by line range", async () => {
    const text = Array.from({ length: 170 }, (_, i) => `line ${i + 1}`).join("\r\n");
    const out = await extractFile(Buffer.from(text), "minutes.txt");
    if (out.content.type !== "text") throw new Error("expected text");
    expect(out.content.units.map(u => [u.ref, u.label])).toEqual([["l1", "Lines 1–80"], ["l2", "Lines 81–160"], ["l3", "Lines 161–170"]]);
    expect(out.content.units[0].text).not.toContain("\r");
  });

  it("splits one enormous line and reads UTF-16", async () => {
    const out = await extractFile(Buffer.from("x".repeat(9000)), "blob.txt");
    if (out.content.type !== "text") throw new Error("expected text");
    expect(out.content.units.map(u => u.label)).toEqual(["Line 1 (part 1)", "Line 1 (part 2)", "Line 1 (part 3)"]);
    const u16 = await extractFile(utf16Text("Rush week\nstarts Monday"), "u.txt");
    if (u16.content.type !== "text") throw new Error("expected text");
    expect(u16.content.units[0].text).toBe("Rush week\nstarts Monday");
  });

  it("rejects blank text", async () => {
    await expect(extractFile(Buffer.from(" \n\t\n"), "blank.txt")).rejects.toMatchObject({ code: "EMPTY" });
  });
});

describe("displayName", () => {
  it("keeps only a clean basename", () => {
    expect(displayName("../../etc/passwd")).toBe("passwd");
    expect(displayName("C:\\Users\\rob\\Budget.xlsx")).toBe("Budget.xlsx");
    expect(displayName("evil\u202Etxt.exe")).toBe("eviltxt.exe");
    expect(displayName("a\u0000b\nc.pdf")).toBe("abc.pdf");
    expect(displayName("   ")).toBe("Untitled");
    expect(displayName("x".repeat(300)).length).toBe(120);
  });
});
