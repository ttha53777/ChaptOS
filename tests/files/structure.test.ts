/**
 * Structure survives extraction: headings, tables (with their columns lined
 * up), lists, and dates — in the shapes real chapter documents arrive in.
 */
import { describe, it, expect } from "vitest";
import { extractFile } from "@/lib/files";
import { htmlToSections } from "@/lib/files/html-sections";
import { carryTableHeaders } from "@/lib/files/units";
import { detectHeaderRow, dateValue, isoDate } from "@/lib/files/cells";
import { noteExcerpts } from "@/lib/ai-text";
import type { TextUnit } from "@/lib/files/types";
import { pdf, docx } from "../setup/file-fixtures";

const textOf = async (bytes: Buffer, name: string): Promise<TextUnit[]> => {
  const out = await extractFile(bytes, name);
  if (out.content.type !== "text") throw new Error("expected text");
  return out.content.units;
};

/** A treasurer's report the way a PDF export lays it out: title, headings, a money table, prose. */
const TREASURER_REPORT = [
  "# Treasurer Report: Spring 2026\n" +
  "Prepared by Rob Chen, Treasurer, for the chapter meeting of March 3.\n" +
  "\n" +
  "## Expenses\n" +
  "Item\tCategory\tAmount\tDate\n" +
  "Formal venue deposit\tSocial\t>$1,200.50\t3/14/2026\n" +
  "DJ\t\t>$450.00\t3/14/2026\n" +
  "Food bank van\tService\t>$85.25\t2/2/2026\n" +
  "\n" +
  "The formal deposit is non-refundable after March 1.",
  "ACTION ITEMS AND DEADLINES\n" +
  "Owner\tTask\tDue\n" +
  "Ana Ruiz\tCollect late dues\tMarch 10\n" +
  "Sam Ortiz\tBook the van\tFeb 28",
];

describe("PDF layout", () => {
  it("keeps headings, table columns (even with an empty cell) and paragraphs", async () => {
    const [p1, p2] = await textOf(pdf(TREASURER_REPORT), "Treasurer report.pdf");
    const lines = p1.text.split("\n");
    expect(lines[0]).toBe("# Treasurer Report: Spring 2026");
    expect(lines).toContain("## Expenses");
    expect(lines).toContain("| Item | Category | Amount | Date |");
    expect(lines).toContain("| --- | --- | --- | --- |");
    expect(lines).toContain("| Formal venue deposit | Social | $1,200.50 | 3/14/2026 |");
    // The DJ row has no category: the amount must stay under Amount, not slide left.
    expect(lines).toContain("| DJ | (blank) | $450.00 | 3/14/2026 |");
    expect(p1.text).toContain("The formal deposit is non-refundable after March 1.");
    // The prose after the table is a paragraph of its own.
    expect(p1.text).toMatch(/\| Food bank van \| Service \| \$85\.25 \| 2\/2\/2026 \|\n\nThe formal deposit/);

    expect(p2.text.split("\n")[0]).toBe("### ACTION ITEMS AND DEADLINES");
    expect(p2.text).toContain("| Owner | Task | Due |\n| --- | --- | --- |\n| Ana Ruiz | Collect late dues | March 10 |\n| Sam Ortiz | Book the van | Feb 28 |");
  });

  it("leaves ordinary single-size prose as it was", async () => {
    const [p] = await textOf(pdf(["Article II\nOfficers are elected each April by secret ballot."]), "c.pdf");
    expect(p.text).toBe("Article II\nOfficers are elected each April by secret ballot.");
  });
});

describe("Word structure", () => {
  it("marks headings by level and lays tables out as markdown under their section", async () => {
    const units = await textOf(docx([
      { h: 1, text: "Officer Meeting — March 3" },
      { text: "Present: Rob Chen, Ana Ruiz, Sam Ortiz." },
      { h: 2, text: "Decisions" },
      { text: "The chapter approved the formal budget of $2,000." },
      { h: 3, text: "Budget detail" },
      { table: [["Line", "Owner", "Amount"], ["Venue", "Rob Chen", "$1,200"], ["DJ", "Sam Ortiz", "$450"]] },
    ]), "Minutes.docx");
    expect(units.map(u => u.label)).toEqual(["Officer Meeting — March 3", "Decisions"]);
    expect(units[0].text.split("\n")[0]).toBe("# Officer Meeting — March 3");
    expect(units[1].text).toContain("## Decisions");
    expect(units[1].text).toContain("### Budget detail");
    expect(units[1].text).toContain("| Line | Owner | Amount |\n| --- | --- | --- |\n| Venue | Rob Chen | $1,200 |\n| DJ | Sam Ortiz | $450 |");
  });

  it("numbers ordered lists and nests sub-items under their parent", () => {
    const [u] = htmlToSections(
      "<h1>Action items</h1><ol><li>Rob to book the venue by March 1<ol><li>Get two quotes</li></ol></li><li>Ana to collect dues by March 10</li></ol><ul><li>Next meeting: March 17</li></ul>",
    );
    expect(u.text).toBe("# Action items\n1. Rob to book the venue by March 1\n  1. Get two quotes\n2. Ana to collect dues by March 10\n• Next meeting: March 17");
  });

  it("keeps merged cells in their columns: colspan pads, rowspan repeats down", () => {
    const [u] = htmlToSections(
      "<table>" +
      "<tr><td>Category</td><td>Item</td><td colspan=\"2\">Fall / Spring</td></tr>" +
      "<tr><td rowspan=\"2\">Social</td><td>Formal</td><td>$900</td><td>$1,200</td></tr>" +
      "<tr><td>DJ</td><td>$300</td><td>$450</td></tr>" +
      "<tr><td>Service</td><td>Van</td><td>$80</td><td>$85</td></tr>" +
      "</table>",
    );
    expect(u.text.split("\n")).toEqual([
      "| Category | Item | Fall / Spring |  |",
      "| --- | --- | --- | --- |",
      "| Social | Formal | $900 | $1,200 |",
      "| Social | DJ | $300 | $450 |",
      "| Service | Van | $80 | $85 |",
    ]);
  });

  it("writes a genuinely empty cell as (blank), so a value can't be read into the wrong column", () => {
    const [u] = htmlToSections("<table><tr><td>Name</td><td>Fall paid</td><td>Spring paid</td></tr><tr><td>Sam Ortiz</td><td>$120</td><td></td></tr><tr><td>Ana Ruiz</td><td></td><td>$120</td></tr></table>");
    expect(u.text).toContain("| Sam Ortiz | $120 | (blank) |\n| Ana Ruiz | (blank) | $120 |");
  });

  it("repeats a long table's header in the section that continues it", () => {
    const rows = Array.from({ length: 300 }, (_, i) => `<tr><td>Member ${i + 1}</td><td>Paid</td><td>$${100 + i}</td></tr>`).join("");
    const units = htmlToSections(`<h1>Dues ledger</h1><table><tr><td>Name</td><td>Status</td><td>Amount</td></tr>${rows}</table>`);
    expect(units.length).toBeGreaterThan(1);
    for (const u of units.slice(1)) expect(u.text.startsWith("| Name | Status | Amount |\n| --- | --- | --- |\n| Member")).toBe(true);
    expect(units[1].label).toBe("Dues ledger (cont.)");
  });
});

describe("text files", () => {
  it("carries a markdown table's header into the next block of lines", async () => {
    const md = "# Sign-ups\n| Name | Shift |\n| --- | --- |\n" + Array.from({ length: 120 }, (_, i) => `| Person ${i + 1} | ${i % 2 ? "AM" : "PM"} |`).join("\n");
    const units = await textOf(Buffer.from(md), "signups.md");
    expect(units.length).toBeGreaterThan(1);
    expect(units[1].text.startsWith("| Name | Shift |\n| --- | --- |\n| Person")).toBe(true);
  });

  it("carryTableHeaders leaves a piece alone when its table doesn't continue", () => {
    expect(carryTableHeaders(["| A | B |\n| --- | --- |\n| 1 | 2 |\n\nProse.", "| C | D |\n| --- | --- |"])).toEqual(
      ["| A | B |\n| --- | --- |\n| 1 | 2 |\n\nProse.", "| C | D |\n| --- | --- |"],
    );
  });
});

describe("spreadsheet headers and dates", () => {
  it("finds the header of an all-text sheet (a roster), past a one-cell title", () => {
    expect(detectHeaderRow([["Name", "Role"], ["Rob Chen", "Treasurer"], ["Ana Ruiz", "Secretary"]])).toBe(0);
    expect(detectHeaderRow([["Spring roster", null, null], ["Name", "Role", "Email"], ["Rob Chen", "Treasurer", "rob@x.edu"], ["Ana Ruiz", "Member", "ana@x.edu"]])).toBe(1);
  });

  it("doesn't mistake the first person of a headerless roster for a header", () => {
    expect(detectHeaderRow([["Rob Chen", "Member"], ["Ana Ruiz", "Member"], ["Sam Ortiz", "Treasurer"]])).toBeNull();
  });

  it("reads the date shapes chapter files use", () => {
    const d = (s: string) => { const t = dateValue(s); return t === null ? null : isoDate(t); };
    expect(d("2026-03-14")).toBe("2026-03-14");
    expect(d("2026-03-14T00:00:00.000Z")).toBe("2026-03-14");
    expect(d("3/14/2026")).toBe("2026-03-14");
    expect(d("3/14/26")).toBe("2026-03-14");
    expect(d("March 14, 2026")).toBe("2026-03-14");
    expect(d("Mar 14 2026")).toBe("2026-03-14");
    expect(d("14 March 2026")).toBe("2026-03-14");
    expect(d("2/30/2026")).toBeNull();
    expect(d("Treasurer")).toBeNull();
    expect(dateValue(46095)).toBeNull();
  });
});

describe("search excerpts", () => {
  it("brings a matched table row's header along", () => {
    const text = "## Expenses\n| Item | Category | Amount |\n| --- | --- | --- |\n| Venue | Social | $1,200 |\n| Van | Service | $85 |\n| Flyers | Recruitment | $42 |\n| DJ | Social | $450 |";
    expect(noteExcerpts(text, ["dj"], 1000)).toBe("## Expenses\n| Item | Category | Amount |\n| --- | --- | --- |\n…\n| Flyers | Recruitment | $42 |\n| DJ | Social | $450 |");
  });
});
