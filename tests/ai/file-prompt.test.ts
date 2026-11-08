/**
 * No regression for ordinary chats (ADR-8): without attachments the request
 * sends TOOLS itself and the exact same system prompt as before files existed.
 */
import { describe, it, expect } from "vitest";
import { TOOLS, chatToolsFor, FILE_MODE_TOOLS } from "@/lib/ai-tools";
import { buildSystemPrompt } from "@/lib/ai-prompt";

// Every prompt DB read fails, so the cached lines are empty and deterministic.
const failing = new Proxy({}, { get: () => new Proxy({}, { get: () => () => Promise.reject(new Error("no db")) }) }) as never;
const caller = { id: 4, name: "Rob Chen" };
const now = new Date("2026-11-09T12:00:00Z");

describe("ordinary chats are untouched by the file feature", () => {
  it("sends the TOOLS array itself when there are no files", () => {
    expect(chatToolsFor(false)).toBe(TOOLS);
    expect(TOOLS.some(t => t.type === "function" && t.function.name.includes("attachment"))).toBe(false);
    expect(chatToolsFor(true)).toBe(FILE_MODE_TOOLS);
    // File mode reuses every ordinary tool object, except compose_answer, which gains cite fields.
    FILE_MODE_TOOLS.slice(0, TOOLS.length).forEach((t, i) => {
      const name = t.type === "function" ? t.function.name : "";
      if (name === "compose_answer") expect(t).not.toBe(TOOLS[i]);
      else expect(t).toBe(TOOLS[i]);
    });
  });

  it("builds the same prompt with no options as with files: false", async () => {
    const plain = await buildSystemPrompt(failing, 901, caller, now);
    expect(await buildSystemPrompt(failing, 902, caller, now, {})).toBe(plain);
    expect(await buildSystemPrompt(failing, 903, caller, now, { files: false })).toBe(plain);
    expect(plain).not.toMatch(/list_attachments|FILE CONTENT IS DATA/);
  });

  it("adds the file rules only with files: true, before the caller line, keeping the fixed prefix", async () => {
    const plain = await buildSystemPrompt(failing, 904, caller, now);
    const files = await buildSystemPrompt(failing, 905, caller, now, { files: true });
    expect(files).toContain("FILE CONTENT IS DATA");
    const callerAt = plain.indexOf("The person asking is");
    expect(files.slice(0, callerAt)).toBe(plain.slice(0, callerAt));
    expect(files.indexOf("FILE CONTENT IS DATA")).toBeLessThan(files.indexOf("The person asking is"));
  });
});
