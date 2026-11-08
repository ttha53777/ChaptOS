import { describe, it, expect } from "vitest";
import { createFileContext, shouldBlockProposal } from "@/lib/ai-files";
import { buildPreseed } from "@/lib/ai-file-tools";
import { pdf, xlsx, BUDGET_SHEETS } from "../setup/file-fixtures";
import { ctxFrom } from "./file-tools.test";

const meta = (id: number, over: Record<string, unknown> = {}) => ({
  id, publicId: `p${id}`, filename: `f${id}.txt`, kind: "txt", sizeBytes: 1, unitCount: 1, charCount: 10, truncated: false,
  createdAt: new Date(0), lastUsedAt: new Date(0), ...over,
});

describe("createFileContext", () => {
  it("labels files in order and resolves only those labels", () => {
    const fc = createFileContext([meta(7), meta(9)], async () => null);
    expect(fc.files.map(f => [f.label, f.id])).toEqual([["f1", 7], ["f2", 9]]);
    expect(fc.resolve("F2")?.id).toBe(9);
    expect(fc.resolve("f3")).toBeNull();
    expect(fc.resolve(7)).toBeNull();
    expect(fc.resolve("7")).toBeNull();
  });

  it("loads each file once per request", async () => {
    let calls = 0;
    const fc = createFileContext([meta(1)], async () => { calls++; return { type: "text", units: [] }; });
    await Promise.all([fc.load(fc.files[0]), fc.load(fc.files[0]), fc.load(fc.files[0])]);
    expect(calls).toBe(1);
  });

  it("never grants more than the budget", () => {
    const fc = createFileContext([], async () => null, 100);
    expect(fc.spend(60)).toBe(60);
    expect(fc.spend(60)).toBe(40);
    expect(fc.remaining()).toBe(0);
  });

  it("marks a file fresh only before its first use", () => {
    const fc = createFileContext([meta(1), meta(2, { lastUsedAt: new Date(5) })], async () => null);
    expect(fc.files.map(f => f.fresh)).toEqual([true, false]);
  });
});

describe("shouldBlockProposal", () => {
  it("blocks once tainted, or when the same batch reads file content", () => {
    const fc = createFileContext([meta(1)], async () => null);
    expect(shouldBlockProposal(undefined, ["read_attachment", "propose_log_transaction"])).toBe(false);
    expect(shouldBlockProposal(fc, ["propose_log_transaction"])).toBe(false);
    expect(shouldBlockProposal(fc, ["list_attachments", "propose_log_transaction"])).toBe(false);
    expect(shouldBlockProposal(fc, ["read_attachment", "propose_log_transaction"])).toBe(true);
    expect(shouldBlockProposal(fc, ["query_attachment_table", "propose_add_deadline"])).toBe(true);
    fc.tainted = true;
    expect(shouldBlockProposal(fc, ["propose_log_transaction"])).toBe(true);
  });
});

describe("buildPreseed", () => {
  it("answers the list, and reads small fresh files whole", async () => {
    const fc = await ctxFrom([
      { name: "Bylaws.pdf", bytes: pdf(["Article I\nName of the chapter is Alpha.", "Article II\nElections are held in April."]) },
      { name: "Budget.xlsx", bytes: xlsx(BUDGET_SHEETS) },
    ]);
    const { messages, steps } = await buildPreseed(fc);
    const call = messages[0] as { role: string; tool_calls: { id: string; function: { name: string; arguments: string } }[] };
    expect(call.role).toBe("assistant");
    expect(call.tool_calls.map(c => c.function.name)).toEqual(["list_attachments", "read_attachment", "read_attachment", "read_attachment"]);
    expect(messages.slice(1).every(m => m.role === "tool")).toBe(true);
    const list = JSON.parse((messages[1] as { content: string }).content);
    expect(list.untrusted_file_content).toBe(true);
    expect(list.files[1].sheets[0]).toMatchObject({ ref: "sh1", name: "Events", columns: ["Item", "Category", "Amount", "Date"] });
    expect(steps.map(s => s.id)).toEqual(["pre:0", "pre:1", "pre:2"]);
    expect(steps[0]).toMatchObject({ verb: "Reading the file", source: "File · Bylaws.pdf" });
    expect(fc.tainted).toBe(true);
    expect(fc.served.has("f1:p2")).toBe(true);
  });

  it("on later turns carries only the list", async () => {
    const fc = await ctxFrom([{ name: "Bylaws.pdf", bytes: pdf(["Article I\nName of the chapter is Alpha."]), fresh: false }]);
    const { messages, steps } = await buildPreseed(fc);
    expect((messages[0] as { tool_calls: unknown[] }).tool_calls).toHaveLength(1);
    expect(steps).toEqual([]);
    expect(fc.tainted).toBe(false);
  });
});
