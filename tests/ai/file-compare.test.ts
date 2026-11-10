/**
 * Cross-document reasoning: compare_attachments on versions of a document and
 * on two exports of a list, search that doesn't let one file crowd out the
 * others, and date-aware spreadsheet queries. Pure — in-memory files, no DB.
 */
import { describe, it, expect } from "vitest";
import { extractFile } from "@/lib/files";
import { createFileContext, resolveCites, shouldBlockProposal, type FileToolContext } from "@/lib/ai-files";
import { runFileTool } from "@/lib/ai-file-tools";
import { diffSequences, compareTexts } from "@/lib/files/compare";
import type { AttachmentContent } from "@/lib/files/types";
import { pdf, docx, xlsx, BUDGET_SHEETS } from "../setup/file-fixtures";

async function ctxFrom(files: { name: string; bytes: Buffer }[]): Promise<FileToolContext> {
  const contents = new Map<number, AttachmentContent>();
  const created = new Date("2026-11-01T00:00:00Z");
  const metas = [];
  for (const [i, f] of files.entries()) {
    const x = await extractFile(f.bytes, f.name);
    contents.set(i + 1, x.content);
    metas.push({ id: i + 1, publicId: `p${i + 1}`, filename: f.name, kind: x.kind, sizeBytes: f.bytes.length, unitCount: x.unitCount, charCount: x.charCount, truncated: x.truncated, createdAt: created, lastUsedAt: created });
  }
  return createFileContext(metas, async id => contents.get(id) ?? null);
}

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const run = (name: string, args: Record<string, unknown>, fc: FileToolContext) => runFileTool(name, args, fc) as Promise<R>;

/** Two versions of the bylaws: dues and quorum change, elections move, a hazing article is added. */
const bylaws = (v: 2024 | 2026) => docx([
  { h: 1, text: "Article I — Name" },
  { text: "The chapter is the Alpha Beta Chapter. Its colors are navy and gold." },
  { h: 1, text: "Article II — Dues" },
  { text: v === 2024 ? "Dues are $100 per semester, payable by October 1." : "Dues are $120 per semester, payable by October 1." },
  { text: "The Treasurer may approve a payment plan of up to three installments." },
  { h: 1, text: "Article III — Meetings" },
  { text: v === 2024 ? "Quorum is one half of active members." : "Quorum is two-thirds of active members." },
  { text: "The Secretary circulates minutes within three days." },
  ...(v === 2026 ? [{ h: 1 as const, text: "Article IV — Hazing" }, { text: "Hazing in any form is prohibited and is grounds for expulsion." }] : []),
  { h: 1, text: v === 2024 ? "Article IV — Officers" : "Article V — Officers" },
  { table: [["Office", "Term", "Elected"], ["President", "1 year", v === 2024 ? "March" : "April"], ["Treasurer", "1 year", v === 2024 ? "March" : "April"]] },
]);

describe("compare_attachments — documents", () => {
  it("reports each change with both sides, its section, the changed figures, and nothing unchanged", async () => {
    const fc = await ctxFrom([{ name: "Bylaws 2024.docx", bytes: bylaws(2024) }, { name: "Bylaws 2026.docx", bytes: bylaws(2026) }]);
    const r = await run("compare_attachments", { a: "f1", b: "f2" }, fc);
    expect(r.untrusted_file_content).toBe(true);
    expect(r.identical).toBe(false);
    const all = JSON.stringify(r.changes);
    expect(all).not.toContain("navy and gold");
    expect(all).not.toContain("payment plan");
    expect(all).not.toContain("circulates minutes");

    const dues = r.changes.find((c: R) => c.section === "Article II — Dues");
    expect(dues.kind).toBe("differs");
    expect(dues.f1[0].text).toContain("$100");
    expect(dues.f2[0].text).toContain("$120");
    expect(dues.figures).toEqual({ f1: ["$100"], f2: ["$120"] });
    expect(dues.f1[0].tag).toMatch(/^f1:s\d+$/);
    expect(dues.f2[0].tag).toMatch(/^f2:s\d+$/);

    const quorum = r.changes.find((c: R) => c.section === "Article III — Meetings");
    expect(quorum.f1[0].text).toContain("one half");
    expect(quorum.f2[0].text).toContain("two-thirds");

    const hazing = r.changes.find((c: R) => JSON.stringify(c).includes("Hazing in any form"));
    expect(hazing.kind).toBe("only_in_f2");
    expect(hazing.f1).toEqual([]);

    // Table rows compare cell by cell as rows: March → April on both offices.
    expect(all).toContain("| President | 1 year | March |");
    expect(all).toContain("| President | 1 year | April |");
    const president = r.changes.find((c: R) => JSON.stringify(c).includes("| President |"));
    expect(president).toMatchObject({ kind: "differs", columns: "| Office | Term | Elected |" });

    // A renumbered heading next to the new article reads as an edit, not part of the addition.
    const officers = r.changes.find((c: R) => c.f2.some((s: R) => s.text === "# Article V — Officers"));
    expect(officers).toMatchObject({ kind: "differs", f1: [{ text: "# Article IV — Officers" }] });

    // Every tag the comparison showed is citable afterwards; the request is now file-tainted.
    const cites = await resolveCites(fc, [dues.f1[0].tag, dues.f2[0].tag]);
    expect(cites.map(c => c.name)).toEqual(["Bylaws 2024.docx", "Bylaws 2026.docx"]);
    expect(fc.tainted).toBe(true);
    expect(shouldBlockProposal(fc, [])).toBe(true);
  });

  it("reports identical for the same text exported two ways (PDF wrapped lines vs one Word paragraph)", async () => {
    const prose = "Dues are $120 per semester, payable by October 1 in the fall and February 1 in the spring. A late fee of $15 applies to dues paid after the deadline.";
    const wrapped = prose.match(/.{1,60}(\s|$)/g)!.map(l => l.trim()).join("\n");
    const fc = await ctxFrom([
      { name: "Dues policy.pdf", bytes: pdf(["## Dues\n" + wrapped]) },
      { name: "Dues policy.docx", bytes: docx([{ h: 2, text: "Dues" }, { text: prose }]) },
    ]);
    const r = await run("compare_attachments", { a: "f1", b: "f2" }, fc);
    expect(r.identical).toBe(true);
    expect(r.changes).toEqual([]);
  });

  it("calls a reordered passage moved, not changed", () => {
    const u = (ref: string, text: string) => ({ ref, label: ref, text });
    const cmp = compareTexts(
      [u("s1", "# Rules\nGuests sign in at the door. Quiet hours start at 11pm. No glass on the patio.")],
      [u("s1", "# Rules\nQuiet hours start at 11pm. No glass on the patio. Guests sign in at the door.")],
    )!;
    expect(cmp.hunks).toEqual([]);
    expect(cmp.moved.map(m => m.text)).toEqual(["Guests sign in at the door."]);
  });

  it("refuses a document against a spreadsheet, and a file against itself", async () => {
    const fc = await ctxFrom([{ name: "Bylaws 2024.docx", bytes: bylaws(2024) }, { name: "Budget.xlsx", bytes: xlsx(BUDGET_SHEETS) }]);
    expect((await run("compare_attachments", { a: "f1", b: "f2" }, fc)).error).toMatch(/document and f2 a spreadsheet/);
    expect((await run("compare_attachments", { a: "f1", b: "f1" }, fc)).error).toMatch(/two different files/);
    expect((await run("compare_attachments", { a: "f1", b: "f9" }, fc)).error).toMatch(/No attached file "f9"/);
    expect(fc.tainted).toBe(false);
  });
});

describe("diffSequences", () => {
  it("produces an edit script that rebuilds b from a", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let t = 0; t < 200; t++) {
      const a = Array.from({ length: Math.floor(rand() * 30) }, () => Math.floor(rand() * 6));
      const b = Array.from({ length: Math.floor(rand() * 30) }, () => Math.floor(rand() * 6));
      const edits = diffSequences(a, b, 1000)!;
      const rebuilt: number[] = [];
      const fromA: number[] = [];
      for (const e of edits) {
        if (e.op === "eq") { expect(a[e.i]).toBe(b[e.j]); rebuilt.push(a[e.i]); fromA.push(e.i); }
        else if (e.op === "ins") rebuilt.push(b[e.j]);
        else fromA.push(e.i);
      }
      expect(rebuilt).toEqual(b);
      expect(fromA).toEqual(a.map((_, i) => i));
    }
  });

  it("gives up past the edit limit instead of grinding", () => {
    expect(diffSequences([1, 2, 3, 4], [5, 6, 7, 8], 3)).toBeNull();
  });
});

describe("compare_attachments — spreadsheets", () => {
  const v1 = "Name,Role,Dues owed,Joined\nRob Chen,Treasurer,$0.00,2024-09-01\nAna Ruiz,Secretary,$120.00,2024-09-01\nSam Ortiz,Member,$45.50,2025-01-15\nLee Park,Member,$0.00,2025-01-15\n";
  const v2 = "Name,Role,Dues owed,Joined\nRob Chen,Treasurer,$0.00,2024-09-01\nAna Ruiz,President,$60.00,2024-09-01\nSam Ortiz,Member,$45.50,2025-01-15\nMia Wong,Member,$120.00,2026-01-20\n";

  it("matches rows on the name column, reporting changed cells (with exact differences), added and removed rows, and totals", async () => {
    const fc = await ctxFrom([{ name: "Roster Oct.csv", bytes: Buffer.from(v1) }, { name: "Roster Feb.csv", bytes: Buffer.from(v2) }]);
    const r = await run("compare_attachments", { a: "f1", b: "f2" }, fc);
    expect(r.key).toBe("Name");
    expect(r.summary).toMatchObject({ rows: { f1: 4, f2: 4 }, inBoth: 3, unchanged: 2, changed: 1, only_in_f1: 1, only_in_f2: 1 });
    expect(r.changed).toEqual([{
      key: "Ana Ruiz", rows: { f1: 3, f2: 3 },
      changes: [
        { column: "Role", f1: "Secretary", f2: "President" },
        { column: "Dues owed", f1: 120, f2: 60, change: -60 },
      ],
    }]);
    expect(r.only_in_f1).toEqual([{ row: 5, values: "Name: Lee Park; Role: Member; Dues owed: 0; Joined: 2025-01-15" }]);
    expect(r.only_in_f2[0].values).toContain("Mia Wong");
    expect(r.totals).toEqual([{ column: "Dues owed", f1: 165.5, f2: 225.5, change: 60 }]);
    expect(r.inBoth).toEqual(["Rob Chen", "Ana Ruiz", "Sam Ortiz"]);
    expect(r.tags).toEqual({ f1: "f1:sh1", f2: "f2:sh1" });
    expect((await resolveCites(fc, ["f1:sh1!A3:D3", "f2:sh1"])).length).toBe(2);
  });

  it("treats the same date written two ways as unchanged, and honours an explicit key", async () => {
    const a = "ID,Event,Due\n1,Formal deposit,2026-03-01\n2,Van booking,2026-02-28\n";
    const b = "ID,Event,Due\n1,Formal deposit,3/1/2026\n2,Van booking,3/7/2026\n";
    const fc = await ctxFrom([{ name: "Deadlines v1.csv", bytes: Buffer.from(a) }, { name: "Deadlines v2.csv", bytes: Buffer.from(b) }]);
    const r = await run("compare_attachments", { a: "f1", b: "f2", key: "event" }, fc);
    expect(r.key).toBe("Event");
    expect(r.changed).toEqual([{ key: "Van booking", rows: { f1: 3, f2: 3 }, changes: [{ column: "Due", f1: "2026-02-28", f2: "3/7/2026" }] }]);
    expect((await run("compare_attachments", { a: "f1", b: "f2", key: "Owner" }, fc)).error).toMatch(/No key column "Owner"/);
  });
});

describe("search across several files", () => {
  it("gives every matching file its best passage before any file gets a second, and counts matches per file", async () => {
    const pages = Array.from({ length: 12 }, (_, i) => `Page ${i + 1}\nThe formal is a chapter tradition and the formal committee meets weekly.`);
    const fc = await ctxFrom([
      { name: "Handbook.pdf", bytes: pdf(pages) },
      { name: "Minutes.docx", bytes: docx([{ h: 1, text: "March 3" }, { text: "Motion to fund the formal passed 24-3." }]) },
      { name: "Bylaws 2024.docx", bytes: bylaws(2024) },
    ]);
    const r = await run("search_attachments", { query: "formal" }, fc);
    expect(r.passages).toHaveLength(8);
    expect(r.passages.map((p: R) => p.file)).toContain("f2");
    expect(r.passages[1].text).toContain("24-3");
    expect(r.matchesByFile).toEqual({ f1: 12, f2: 1, f3: 0 });
    // Scoped to one file, there's nothing to compare against, so no per-file counts.
    expect((await run("search_attachments", { query: "formal", file: "f2" }, fc)).matchesByFile).toBeUndefined();
  });
});

describe("query_attachment_table with dates", () => {
  it("filters on dates and answers the earliest and latest date", async () => {
    const fc = await ctxFrom([{ name: "Budget.xlsx", bytes: xlsx(BUDGET_SHEETS) }]);
    const before = await run("query_attachment_table", { file: "f1", op: "count", where: [{ column: "Date", op: "lt", value: "3/1/2026" }] }, fc);
    expect(before.result).toBe(3);
    const feb = await run("query_attachment_table", { file: "f1", op: "sum", column: "Amount", where: [{ column: "Date", op: "gte", value: "2026-02-01" }, { column: "Date", op: "lte", value: "February 28, 2026" }] }, fc);
    expect(feb.result).toBe(85.25);
    expect((await run("query_attachment_table", { file: "f1", op: "min", column: "Date" }, fc)).result).toBe("2026-01-18");
    const last = await run("query_attachment_table", { file: "f1", op: "max", column: "Date", group_by: "Category" }, fc);
    expect(last.result).toBe("2026-03-20");
    expect(last.groups[0]).toEqual({ group: "Social", result: "2026-03-20", rows: 4 });
  });
});

describe("list_attachments outline", () => {
  it("lists a PDF's recovered headings with the page tag they sit on", async () => {
    const fc = await ctxFrom([{ name: "Report.pdf", bytes: pdf(["# Treasurer Report\nSummary text for the term.", "## Expenses\nItem\tAmount\nDJ\t>$450.00\nVan\t>$85.25"]) }]);
    const r = await run("list_attachments", {}, fc);
    expect(r.files[0].headings).toEqual(["f1:p1 Treasurer Report", "f1:p2   Expenses"]);
    expect(fc.tainted).toBe(false);
  });
});
