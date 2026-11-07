import { describe, it, expect } from "vitest";
import { extractFile } from "@/lib/files";
import { xlsx, BUDGET_SHEETS } from "../setup/file-fixtures";

describe("extractXlsx", () => {
  it("reads every sheet as typed cells with a detected header", async () => {
    const out = await extractFile(xlsx(BUDGET_SHEETS), "Budget.xlsx");
    expect(out.kind).toBe("xlsx");
    expect(out.unitCount).toBe(2);
    if (out.content.type !== "sheets") throw new Error("expected sheets");
    const [events, notes] = out.content.sheets;
    expect(events).toMatchObject({ ref: "sh1", name: "Events", headerRow: 1, columns: ["Item", "Category", "Amount", "Date"], colCount: 4, rowCount: 9 });
    expect(events.rows[2]).toEqual(["Formal venue", "Social", 1200.5, "2026-03-14"]);
    expect(events.rows[7][2]).toBe(-100);
    expect(notes).toMatchObject({ ref: "sh2", name: "Notes" });
  });

  it("rejects an all-blank workbook", async () => {
    await expect(extractFile(xlsx([{ name: "S", rows: [[null]] }]), "e.xlsx")).rejects.toMatchObject({ code: "EMPTY" });
  });
});
