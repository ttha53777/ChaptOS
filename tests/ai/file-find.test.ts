/**
 * find_in_attachments: whole-file scans for amounts, dates, percentages,
 * contacts, names and exact text, on documents shaped like real chapter files.
 * Pure — in-memory files, no DB.
 */
import { describe, it, expect } from "vitest";
import { extractFile } from "@/lib/files";
import { createFileContext, resolveCites, shouldBlockProposal, type FileToolContext } from "@/lib/ai-files";
import { runFileTool, FILE_TOOL_UI } from "@/lib/ai-file-tools";
import { findInUnits } from "@/lib/files/find";
import type { AttachmentContent } from "@/lib/files/types";
import { pdf, docx, xlsx, BUDGET_SHEETS } from "../setup/file-fixtures";

async function ctxFrom(files: { name: string; bytes: Buffer }[], budget?: number): Promise<FileToolContext> {
  const contents = new Map<number, AttachmentContent>();
  const created = new Date("2026-11-01T00:00:00Z");
  const metas = [];
  for (const [i, f] of files.entries()) {
    const x = await extractFile(f.bytes, f.name);
    contents.set(i + 1, x.content);
    metas.push({ id: i + 1, publicId: `p${i + 1}`, filename: f.name, kind: x.kind, sizeBytes: f.bytes.length, unitCount: x.unitCount, charCount: x.charCount, truncated: x.truncated, createdAt: created, lastUsedAt: created });
  }
  return createFileContext(metas, async id => contents.get(id) ?? null, budget);
}

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const run = (args: Record<string, unknown>, fc: FileToolContext) => runFileTool("find_in_attachments", args, fc) as Promise<R>;

/** A 30-page handbook with figures and dates scattered across pages, one in a table. */
function handbook(): Buffer {
  const filler = (n: number) => `Section ${n}. The officers report to the membership at each regular meeting.`;
  const pages = Array.from({ length: 30 }, (_, i) => `HANDBOOK Page ${i + 1}\n${filler(i + 1)}`);
  pages[3] = "HANDBOOK Page 4\nDues are $120 per semester, due by October 1. A late fee of $15 applies.";
  pages[11] = "HANDBOOK Page 12\nThe social budget is capped at $2.5k per event.\nRefunds are shown as ($45.00) in the ledger.";
  pages[19] = "## Formal costs\nItem\tAmount\tDue\nVenue deposit\t>$750.00\t3/1/2026\nCatering\t>$1,200.50\t3/10/2026";
  pages[26] = "HANDBOOK Page 27\nQuorum is 66% of active members. Questions: treasurer@alphabeta.org or (555) 123-4567.";
  pages[28] = "HANDBOOK Page 29\nElections are held on Mon, Apr 6, and results are posted by 14 April 2026.";
  return pdf(pages);
}

describe("find_in_attachments — amounts", () => {
  it("finds every dollar figure in a long file in one call, with page tags, values and table columns", async () => {
    const fc = await ctxFrom([{ name: "Handbook.pdf", bytes: handbook() }]);
    const r = await run({ kind: "amounts" }, fc);
    expect(r.untrusted_file_content).toBe(true);
    expect(r.matches.map((m: R) => [m.value, m.tag])).toEqual([
      ["$120", "f1:p4"], ["$15", "f1:p4"], ["$2.5k", "f1:p12"], ["($45.00)", "f1:p12"], ["$750.00", "f1:p20"], ["$1,200.50", "f1:p20"],
    ]);
    expect(r.matches.find((m: R) => m.value === "$2.5k").number).toBe(2500);
    expect(r.matches.find((m: R) => m.value === "($45.00)").number).toBe(-45);
    const venue = r.matches.find((m: R) => m.value === "$750.00");
    expect(venue.context).toBe("| Venue deposit | $750.00 | 3/1/2026 |");
    expect(venue.columns).toBe("| Item | Amount | Due |");
    // Every hit is citable afterwards, and the request is now file-tainted.
    expect((await resolveCites(fc, ["f1:p20", "f1:p12"])).map(c => c.locator)).toEqual(["p. 20", "p. 12"]);
    expect(shouldBlockProposal(fc, [])).toBe(true);
  });

  it("sorts by size and narrows with near", async () => {
    const fc = await ctxFrom([{ name: "Handbook.pdf", bytes: handbook() }]);
    const top = await run({ kind: "amounts", order: "descending" }, fc);
    expect(top.matches.slice(0, 2).map((m: R) => m.value)).toEqual(["$2.5k", "$1,200.50"]);
    const deposit = await run({ kind: "amounts", near: "deposit" }, fc);
    expect(deposit.found).toBe(1);
    expect(deposit.matches[0].value).toBe("$750.00");
  });
});

describe("find_in_attachments — dates", () => {
  it("finds dates in every written form and orders them as a timeline", async () => {
    const fc = await ctxFrom([{ name: "Handbook.pdf", bytes: handbook() }]);
    const r = await run({ kind: "dates", order: "ascending" }, fc);
    const full = r.matches.filter((m: R) => m.iso).map((m: R) => [m.value, m.iso]);
    expect(full).toEqual([["3/1/2026", "2026-03-01"], ["3/10/2026", "2026-03-10"], ["14 April 2026", "2026-04-14"]]);
    const values = r.matches.map((m: R) => m.value);
    expect(values).toEqual(expect.arrayContaining(["October 1", "Mon, Apr 6"]));
  });

  it("reads month-day dates without a year as dates, and orders them within the year", () => {
    const hits = findInUnits([{ ref: "s1", label: "s1", text: "Rush starts Sept 3. Bid day is Sep. 12th. Formal on Mar 14." }], "dates");
    expect(hits.map(h => h.value)).toEqual(["Sept 3", "Sep. 12th", "Mar 14"]);
    expect(hits.every(h => h.sortKey !== null && !h.iso)).toBe(true);
    expect(hits[2].sortKey! < hits[0].sortKey!).toBe(true);
  });
});

describe("find_in_attachments — other kinds", () => {
  it("finds percentages, emails and phone numbers", async () => {
    const fc = await ctxFrom([{ name: "Handbook.pdf", bytes: handbook() }]);
    expect((await run({ kind: "percentages" }, fc)).matches.map((m: R) => m.value)).toEqual(["66%"]);
    expect((await run({ kind: "emails" }, fc)).matches.map((m: R) => m.value)).toEqual(["treasurer@alphabeta.org"]);
    expect((await run({ kind: "phones" }, fc)).matches.map((m: R) => m.value)).toEqual(["(555) 123-4567"]);
  });

  it("lists each name once with its count and where it appears, without heading noise", async () => {
    const fc = await ctxFrom([{ name: "Minutes.docx", bytes: docx([
      { h: 1, text: "Officer Meeting — March 3" },
      { text: "Present: Rob Chen, Ana Ruiz, Sam Ortiz. The Alpha Beta Chapter met at the Student Union." },
      { h: 2, text: "Article IV Amendments" },
      { text: "Rob Chen moved to adopt the amendment; Ana Ruiz seconded. Rob Chen will file it." },
    ]) }]);
    const r = await run({ kind: "names" }, fc);
    const names = Object.fromEntries(r.names.map((n: R) => [n.name, n.count]));
    expect(names).toMatchObject({ "Rob Chen": 3, "Ana Ruiz": 2, "Sam Ortiz": 1, "Alpha Beta Chapter": 1, "Student Union": 1 });
    expect(Object.keys(names)).not.toContain("Article IV Amendments");
    expect(r.names.find((n: R) => n.name === "Rob Chen").tags).toEqual(["f1:s1", "f1:s2"]);
  });

  it("finds exact text keyword search drops, like a bare $ or a clause number", async () => {
    const fc = await ctxFrom([{ name: "Bylaws.docx", bytes: docx([{ text: "Under 4.2(b), fines are set by the board." }, { text: "Fines are $25." }]) }]);
    expect((await run({ kind: "text", text: "4.2(b)" }, fc)).found).toBe(1);
    expect((await run({ kind: "text", text: "$" }, fc)).matches[0].context).toBe("Fines are $25.");
    expect((await run({ kind: "text" }, fc)).error).toMatch(/Give the `text`/);
  });
});

describe("find_in_attachments — spreadsheets and several files", () => {
  it("reads typed cells: numbers in money columns, date cells, with cell tags that cite", async () => {
    const fc = await ctxFrom([{ name: "Budget.xlsx", bytes: xlsx(BUDGET_SHEETS) }]);
    const amounts = await run({ kind: "amounts", order: "descending" }, fc);
    expect(amounts.found).toBe(6);
    expect(amounts.matches[0]).toMatchObject({ tag: "f1:sh1!C3", value: "1200.5" });
    expect(amounts.matches[0].context).toContain("Events row 3: Item: Formal venue; Category: Social; Amount: 1200.5");
    const dates = await run({ kind: "dates", order: "ascending" }, fc);
    expect(dates.matches[0]).toMatchObject({ tag: "f1:sh1!D7", iso: "2026-01-18" });
    expect((await resolveCites(fc, ["f1:sh1!C3"])).length).toBe(1);
  });

  it("scans every file and counts hits per file", async () => {
    const fc = await ctxFrom([{ name: "Handbook.pdf", bytes: handbook() }, { name: "Budget.xlsx", bytes: xlsx(BUDGET_SHEETS) }, { name: "Note.txt", bytes: Buffer.from("No figures here.") }]);
    const r = await run({ kind: "amounts" }, fc);
    expect(r.matchesByFile).toEqual({ f1: 6, f2: 6, f3: 0 });
    expect((await run({ kind: "amounts", file: "f3" }, fc)).found).toBe(0);
    expect(fc.tainted).toBe(true);
  });

  it("stays within the reading budget and says how many it left out", async () => {
    const many = Array.from({ length: 400 }, (_, i) => `Line item ${i + 1} costs $${i + 10}.00 and is due 3/${(i % 28) + 1}/2026.`).join("\n");
    const fc = await ctxFrom([{ name: "Ledger.txt", bytes: Buffer.from(many) }]);
    const r = await run({ kind: "amounts" }, fc);
    expect(r.found).toBe(400);
    expect(r.matches.length).toBeLessThan(400);
    expect(r.more).toMatch(/more not shown/);
    expect(JSON.stringify(r).length).toBeLessThan(26_000);
    expect(FILE_TOOL_UI.find_in_attachments.finding?.(r, {})).toBe("400 matches");
  });
});

describe("file answers can list more rows", () => {
  it("keeps up to 12 rows on a file turn and 6 elsewhere, and tells the model so", async () => {
    const { parseComposeAnswer, FILE_MODE_TOOLS, TOOLS } = await import("@/lib/ai-tools");
    const args = { verdict: "Deadlines run from *Feb 28* to March 17.", rows: Array.from({ length: 14 }, (_, i) => ({ title: `Item ${i + 1}` })) };
    const file = parseComposeAnswer(args, { maxRows: 12 });
    const plain = parseComposeAnswer(args);
    if ("error" in file || "error" in plain) throw new Error("unexpected error");
    expect(file.rows).toHaveLength(12);
    expect(plain.rows).toHaveLength(6);
    const desc = (list: typeof TOOLS) => {
      const t = list.find(x => x.type === "function" && x.function.name === "compose_answer");
      return t?.type === "function" ? t.function.description ?? "" : "";
    };
    expect(desc(FILE_MODE_TOOLS)).toContain("rows: up to 12 records");
    expect(desc(TOOLS)).toContain("rows: up to 6 records");
  });
});
