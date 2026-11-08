/**
 * Citations are server-attested: the model names unit tags in compose_answer,
 * and only tags for units actually served to it this request survive, resolved
 * to a file and a human locator. Pure — in-memory file context.
 */
import { describe, it, expect } from "vitest";
import { resolveCites } from "@/lib/ai-files";
import { runFileTool } from "@/lib/ai-file-tools";
import { parseComposeAnswer, chatToolsFor, TOOLS } from "@/lib/ai-tools";
import { pdf, docx, xlsx, BUDGET_SHEETS } from "../setup/file-fixtures";
import { ctxFrom } from "./file-tools.test";

const files = () => ctxFrom([
  { name: "Constitution.pdf", bytes: pdf(["Article I\nThe chapter is named Alpha Beta.", "Article II\nOfficers are elected each April.", "Article III\nDues are $120 per semester."]), fresh: false },
  { name: "Budget.xlsx", bytes: xlsx(BUDGET_SHEETS), fresh: false },
  { name: "Bylaws.docx", bytes: docx([{ h: 1, text: "Article IV — Elections" }, { text: "Each April." }]), fresh: false },
]);

describe("resolveCites", () => {
  it("keeps only tags for units served this request", async () => {
    const fc = await files();
    await runFileTool("read_attachment", { file: "f1", from: 2, to: 2 }, fc);
    const out = await resolveCites(fc, ["f1:p2", "f1:p3", "f9:p1", "f2:sh1!B2:C3", "garbage"]);
    expect(out).toEqual([{ attachmentId: "p1", name: "Constitution.pdf", kind: "pdf", unit: "p2", locator: "p. 2" }]);
  });

  it("resolves sheet ranges and Word sections to readable locators", async () => {
    const fc = await files();
    await runFileTool("query_attachment_table", { file: "f2", op: "sum", column: "Amount" }, fc);
    await runFileTool("read_attachment", { file: "f3" }, fc);
    const out = await resolveCites(fc, ["f2:sh1!B2:D9", "f2:sh1", "f3:s1", "f2:sh2"]);
    expect(out.map(c => [c.unit, c.locator])).toEqual([
      ["sh1!B2:D9", "Events!B2:D9"],
      ["sh1", "Events"],
      ["s1", "§ Article IV — Elections"],
    ]);
  });

  it("dedupes and caps", async () => {
    const fc = await files();
    await runFileTool("read_attachment", { file: "f1" }, fc);
    const out = await resolveCites(fc, ["f1:p1", "f1:p1", "f1:p2"], 1);
    expect(out.map(c => c.unit)).toEqual(["p1"]);
  });

  it("serves a search hit's row range for citing", async () => {
    const fc = await files();
    await runFileTool("search_attachments", { query: "rush", file: "f2" }, fc);
    expect((await resolveCites(fc, ["f2:sh1!A6:D6"]))[0]).toMatchObject({ locator: "Events!A6:D6" });
  });
});

describe("compose_answer citations", () => {
  it("keeps well-formed cite tags, drops the rest, and widens a cited row's subtitle", () => {
    const long = "x".repeat(300);
    const parsed = parseComposeAnswer({
      verdict: "Officers are elected each *April*.",
      cites: ["f1:p2", "nope", "f1:p2!A1"],
      rows: [
        { kind: "generic", title: "Elections", subtitle: long, cite: ["f1:p2", "f2:sh1!B2:D9", "<script>", "f1:p9", "f1:p8"] },
        { kind: "generic", title: "Uncited", subtitle: long },
      ],
    });
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.cites).toEqual(["f1:p2"]);
    expect(parsed.rows[0].cite).toEqual(["f1:p2", "f2:sh1!B2:D9", "f1:p9"]);
    expect(parsed.rows[0].subtitle).toHaveLength(240);
    expect(parsed.rows[1].subtitle).toHaveLength(120);
    expect(parsed.rows[1].cite).toBeUndefined();
  });

  it("only file-mode compose_answer offers cite fields", () => {
    const schemaOf = (tools: typeof TOOLS) => {
      const t = tools.find(x => x.type === "function" && x.function.name === "compose_answer");
      return JSON.stringify(t && t.type === "function" ? t.function.parameters : null);
    };
    expect(schemaOf(chatToolsFor(false))).not.toContain("cite");
    expect(schemaOf(chatToolsFor(true))).toContain("\"cites\"");
    expect(schemaOf(chatToolsFor(true))).toContain("\"cite\"");
  });
});
