/**
 * The Ask Chapt file tools against real extracted fixtures. Pure — content is
 * built in memory with extractFile and handed to a FileToolContext; no DB.
 *
 * Spreadsheet expectations are hand-computed from BUDGET_SHEETS ("Events"):
 *   Formal venue  Social       1200.50
 *   DJ            Social        450.00
 *   Food bank van Service        85.25
 *   Rush BBQ      Recruitment   310.10
 *   Tabling       Recruitment    42.30
 *   Refund        Social       -100.00
 *   TBD           Social       "pending"   (not a number)
 */
import { describe, it, expect } from "vitest";
import { extractFile } from "@/lib/files";
import { createFileContext, type FileToolContext } from "@/lib/ai-files";
import { runFileTool } from "@/lib/ai-file-tools";
import { runTool, isReadTool } from "@/lib/ai-tools";
import type { AttachmentContent } from "@/lib/files/types";
import { pdf, docx, xlsx, BUDGET_SHEETS, CSV_TEXT } from "../setup/file-fixtures";

export async function ctxFrom(files: { name: string; bytes: Buffer; fresh?: boolean }[], budget?: number): Promise<FileToolContext> {
  const contents = new Map<number, AttachmentContent>();
  const metas = [];
  for (const [i, f] of files.entries()) {
    const x = await extractFile(f.bytes, f.name);
    contents.set(i + 1, x.content);
    const created = new Date("2026-11-01T00:00:00Z");
    metas.push({
      id: i + 1, publicId: `p${i + 1}`, filename: f.name, kind: x.kind, sizeBytes: f.bytes.length, unitCount: x.unitCount,
      charCount: x.charCount, truncated: x.truncated, createdAt: created, lastUsedAt: f.fresh === false ? new Date("2026-11-02T00:00:00Z") : created,
    });
  }
  return createFileContext(metas, async id => contents.get(id) ?? null, budget);
}

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const run = (name: string, args: Record<string, unknown>, fc: FileToolContext) => runFileTool(name, args, fc) as Promise<R>;

const budget = () => ({ name: "Budget.xlsx", bytes: xlsx(BUDGET_SHEETS) });
const constitution = () => ({
  name: "Constitution.pdf",
  bytes: pdf(["Article I\nThe chapter is named Alpha Beta.", "Article II\nOfficers are elected each April by secret ballot.", "Article III\nDues are $120 per semester, payable by October 1."]),
});

describe("query_attachment_table", () => {
  it("sums exactly, counting skipped non-numbers", async () => {
    const fc = await ctxFrom([budget()]);
    const r = await run("query_attachment_table", { file: "f1", op: "sum", column: "Amount" }, fc);
    expect(r.untrusted_file_content).toBe(true);
    expect(r.result).toBe(1988.15);
    expect(r.rowsMatched).toBe(7);
    expect(r.rowsSkippedNonNumeric).toBe(1);
    expect(r.range).toBe("C3:C9");
    expect(r.tag).toBe("f1:sh1!C3:C9");
  });

  it("avg, min, max and count", async () => {
    const fc = await ctxFrom([budget()]);
    expect((await run("query_attachment_table", { file: "f1", op: "avg", column: "amount" }, fc)).result).toBeCloseTo(331.358333, 5);
    expect((await run("query_attachment_table", { file: "f1", op: "max", column: "C" }, fc)).result).toBe(1200.5);
    expect((await run("query_attachment_table", { file: "f1", op: "min", column: "Amount" }, fc)).result).toBe(-100);
    expect((await run("query_attachment_table", { file: "f1", op: "count" }, fc)).result).toBe(7);
  });

  it("groups, ranked biggest first", async () => {
    const fc = await ctxFrom([budget()]);
    const r = await run("query_attachment_table", { file: "f1", op: "sum", column: "Amount", group_by: "Category" }, fc);
    expect(r.groups).toEqual([
      { group: "Social", result: 1550.5, rows: 4 },
      { group: "Recruitment", result: 352.4, rows: 2 },
      { group: "Service", result: 85.25, rows: 1 },
    ]);
  });

  it("filters with where", async () => {
    const fc = await ctxFrom([budget()]);
    const r = await run("query_attachment_table", {
      file: "f1", op: "sum", column: "Amount",
      where: [{ column: "Category", op: "eq", value: "social" }, { column: "Amount", op: "gt", value: "0" }],
    }, fc);
    expect(r.result).toBe(1650.5);
    expect(r.rowsMatched).toBe(2);
    const c = await run("query_attachment_table", { file: "f1", op: "count", where: [{ column: "Item", op: "contains", value: "rush" }] }, fc);
    expect(c.result).toBe(1);
  });

  it("parses currency and parentheses from CSV text", async () => {
    const fc = await ctxFrom([{ name: "dues.csv", bytes: Buffer.from(CSV_TEXT) }]);
    const r = await run("query_attachment_table", { file: "f1", op: "sum", column: "Amount", group_by: "Category" }, fc);
    expect(r.groups).toEqual([{ group: "Dues", result: 1155, rows: 2 }, { group: "Social", result: 0.12, rows: 2 }]);
    expect(r.rowsSkippedNonNumeric).toBe(1);
  });

  it("explains unknown files, columns and documents", async () => {
    const fc = await ctxFrom([budget(), constitution()]);
    expect((await run("query_attachment_table", { file: "f9", op: "sum", column: "Amount" }, fc)).error).toMatch(/No attached file/);
    expect((await run("query_attachment_table", { file: "f1", op: "sum", column: "Price" }, fc)).error).toMatch(/Columns: A "Item"/);
    expect((await run("query_attachment_table", { file: "f2", op: "sum", column: "x" }, fc)).error).toMatch(/document/);
  });
});

describe("read_attachment", () => {
  it("reads units in range with tags and next", async () => {
    const fc = await ctxFrom([constitution()]);
    const r = await run("read_attachment", { file: "f1", from: 2, to: 2 }, fc);
    expect(r.units).toEqual([{ tag: "f1:p2", label: "Page 2", text: expect.stringContaining("secret ballot") }]);
    expect(r.next).toBe(3);
    expect(fc.served.has("f1:p2")).toBe(true);
    expect(fc.tainted).toBe(true);
    const all = await run("read_attachment", { file: "F1" }, fc);
    expect(all.units).toHaveLength(3);
    expect(all.next).toBeUndefined();
  });

  it("reads Word sections by number", async () => {
    const fc = await ctxFrom([{ name: "Bylaws.docx", bytes: docx([{ h: 1, text: "Article I" }, { text: "Name." }, { h: 1, text: "Article IV — Elections" }, { text: "Each April." }]) }]);
    const r = await run("read_attachment", { file: "f1", from: 2 }, fc);
    expect(r.units[0]).toMatchObject({ tag: "f1:s2", label: "Article IV — Elections" });
  });

  it("reads a sheet's header and rows with row numbers, or an A1 range", async () => {
    const fc = await ctxFrom([budget()]);
    const r = await run("read_attachment", { file: "f1" }, fc);
    expect(r.sheet).toBe("Events");
    expect(r.headerRow).toBe(2);
    expect(r.columns).toEqual({ A: "Item", B: "Category", C: "Amount", D: "Date" });
    expect(r.rows[2]).toEqual([3, "Formal venue", "Social", 1200.5, "2026-03-14"]);
    const part = await run("read_attachment", { file: "f1", sheet: "Events", range: "B3:C4" }, fc);
    expect(part.rows).toEqual([[3, "Social", 1200.5], [4, "Social", 450]]);
    expect(part.tag).toBe("f1:sh1!B3:C4");
    expect((await run("read_attachment", { file: "f1", sheet: "Nope" }, fc)).error).toMatch(/sh1 "Events", sh2 "Notes"/);
    expect((await run("read_attachment", { file: "f1", range: "bad range" }, fc)).error).toMatch(/A1 notation/);
  });

  it("stops at the request's reading budget with a clear error", async () => {
    const long = Array.from({ length: 12 }, (_, i) => `Page ${i + 1} ` + "budget text ".repeat(150));
    const fc = await ctxFrom([{ name: "Long.pdf", bytes: pdf(long.map(t => t.match(/.{1,90}/g)!.join("\n"))) }], 5_000);
    const first = await run("read_attachment", { file: "f1" }, fc);
    expect(first.units.length).toBeGreaterThan(0);
    expect(fc.remaining()).toBeLessThan(400 + 1800);
    let r = first;
    for (let i = 0; i < 5 && !r.error; i++) r = await run("read_attachment", { file: "f1", from: r.next ?? 1 }, fc);
    expect(r.error).toMatch(/reading budget/);
  });
});

describe("search_attachments", () => {
  it("ranks passages by distinct terms matched, across files, with tags", async () => {
    const fc = await ctxFrom([constitution(), budget()]);
    const r = await run("search_attachments", { query: "officers elected ballot" }, fc);
    expect(r.passages[0]).toMatchObject({ tag: "f1:p2", file: "f1", name: "Constitution.pdf", matched: 3 });
    const rows = await run("search_attachments", { query: "rush", file: "f2" }, fc);
    expect(rows.passages).toEqual([expect.objectContaining({ tag: "f2:sh1!A6:D6", label: "Events row 6", text: expect.stringContaining("Item: Rush BBQ") })]);
    expect(fc.served.has("f2:sh1!A6:D6")).toBe(true);
  });

  it("returns no passages (and doesn't taint) when nothing matches", async () => {
    const fc = await ctxFrom([constitution()]);
    const r = await run("search_attachments", { query: "pizza" }, fc);
    expect(r.passages).toEqual([]);
    expect(fc.tainted).toBe(false);
    expect((await run("search_attachments", { query: "the" }, fc)).error).toBeTruthy();
  });
});

describe("dispatch through runTool", () => {
  it("file tools are read tools, validated, and refuse without a file context", async () => {
    expect(isReadTool("read_attachment")).toBe(true);
    const fake = {} as never;
    expect(await runTool("read_attachment", { file: "f1" }, fake, 1)).toEqual({ error: "No files are attached to this conversation." });
    expect(await runTool("read_attachment", {}, fake, 1)).toEqual({ error: 'read_attachment: missing required field "file".' });
    const fc = await ctxFrom([constitution()]);
    const r = await runTool("read_attachment", { file: "f1", to: 1 }, fake, 1, undefined, { actorId: 1, permissions: 0, isOrgAdmin: false, isPlatformAdmin: false, files: fc }) as R;
    expect(r.units[0].tag).toBe("f1:p1");
  });
});
