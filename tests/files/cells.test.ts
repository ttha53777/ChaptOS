import { describe, it, expect } from "vitest";
import { parseNumber, typeCell, detectHeaderRow, colLetter, colIndex, parseRange, formatRange, buildSheet } from "@/lib/files/cells";

describe("cells", () => {
  it("parses money, negatives and percents", () => {
    expect(parseNumber("1,234.50")).toBe(1234.5);
    expect(parseNumber("$1,234.50")).toBe(1234.5);
    expect(parseNumber("(45.00)")).toBe(-45);
    expect(parseNumber("-$3")).toBe(-3);
    expect(parseNumber("12%")).toBe(0.12);
    expect(parseNumber(".5")).toBe(0.5);
    for (const s of ["", "abc", "1,23", "2026-11-09", "555-1234", "$", "1.2.3"]) expect(parseNumber(s)).toBeNull();
  });

  it("types CSV cells", () => {
    expect(typeCell(" 42 ")).toBe(42);
    expect(typeCell("")).toBeNull();
    expect(typeCell("Social")).toBe("Social");
  });

  it("finds the header row below a title row", () => {
    expect(detectHeaderRow([["Spring budget", null], ["Item", "Amount"], ["DJ", 450]])).toBe(1);
    expect(detectHeaderRow([[1, 2], [3, 4]])).toBeNull();
  });

  it("converts A1 addresses both ways", () => {
    expect([0, 25, 26, 27, 701, 702].map(colLetter)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
    expect(colIndex("AB")).toBe(27);
    expect(parseRange("B2:D9")).toEqual({ c0: 1, r0: 1, c1: 3, r1: 8 });
    expect(parseRange("d9:b2")).toEqual({ c0: 1, r0: 1, c1: 3, r1: 8 });
    expect(parseRange("C3")).toEqual({ c0: 2, r0: 2, c1: 2, r1: 2 });
    expect(parseRange("nope")).toBeNull();
    expect(formatRange({ c0: 1, r0: 1, c1: 3, r1: 8 })).toBe("B2:D9");
  });

  it("builds a padded, trimmed sheet within a cell budget", () => {
    const raw = [["Item", "Amount", null], ["DJ", 450], ["Van", 85, null], [null, null], []];
    const { sheet, truncated } = buildSheet("sh1", "S", raw, 100);
    expect(sheet).toMatchObject({ rowCount: 3, colCount: 2, headerRow: 0, columns: ["Item", "Amount"] });
    expect(sheet.rows[1]).toEqual(["DJ", 450]);
    expect(truncated).toBe(false);
    const cut = buildSheet("sh1", "S", raw, 4);
    expect(cut.sheet.rowCount).toBe(2);
    expect(cut.truncated).toBe(true);
  });
});
