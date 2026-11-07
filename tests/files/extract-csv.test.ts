import { describe, it, expect } from "vitest";
import { extractFile } from "@/lib/files";
import { CSV_TEXT } from "../setup/file-fixtures";

describe("extractCsv", () => {
  it("handles quoted commas, currency, parentheses and percents", async () => {
    const out = await extractFile(Buffer.from(CSV_TEXT), "Dues export.csv");
    expect(out.kind).toBe("csv");
    if (out.content.type !== "sheets") throw new Error("expected sheets");
    const s = out.content.sheets[0];
    expect(s.name).toBe("Dues export");
    expect(s.headerRow).toBe(0);
    expect(s.rows[1]).toEqual(["Chen, Rob", "Dues", 1200]);
    expect(s.rows[2][2]).toBe(-45);
    expect(s.rows[3][2]).toBe(0.12);
    expect(s.rows[4]).toEqual(["Lee Park", "Social", null]);
  });

  it("pads ragged rows", async () => {
    const out = await extractFile(Buffer.from("a,b,c\n1\n2,3,4,5\n"), "r.csv");
    if (out.content.type !== "sheets") throw new Error("expected sheets");
    expect(out.content.sheets[0].colCount).toBe(4);
    expect(out.content.sheets[0].rows[1]).toEqual([1, null, null, null]);
  });
});
