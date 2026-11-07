import { describe, it, expect } from "vitest";
import { sniff, classifyZip } from "@/lib/files/sniff";
import { preflightZip } from "@/lib/files/zip-preflight";
import { extractFile } from "@/lib/files";
import { FileRejected } from "@/lib/files/types";
import { pdf, docx, xlsx, macroWorkbook, plainZip, oleLegacy, oleEncrypted, pngBytes, utf16Text, randomBinary } from "../setup/file-fixtures";

async function code(p: Promise<unknown> | (() => unknown)): Promise<string | null> {
  try { await (typeof p === "function" ? p() : p); return null; }
  catch (e) { return e instanceof FileRejected ? e.code : `not FileRejected: ${String(e)}`; }
}

describe("sniff", () => {
  it("identifies by bytes, not the name", () => {
    expect(sniff(pdf(["x"]), "notes.txt").kind).toBe("pdf");
    expect(sniff(docx([{ text: "x" }]), "budget.pdf").kind).toBe("zip");
    expect(sniff(Buffer.from("a,b\n1,2"), "data.csv").kind).toBe("csv");
    expect(sniff(Buffer.from("a,b\n1,2"), "data.bin").kind).toBe("txt");
    expect(sniff(Buffer.from("# Heading"), "README.md").kind).toBe("txt");
  });

  it("decodes UTF-8 with a BOM and UTF-16", () => {
    const s = sniff(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("héllo")]), "a.txt");
    expect(s).toEqual({ kind: "txt", text: "héllo" });
    expect(sniff(utf16Text("Bylaws ✓"), "a.txt")).toEqual({ kind: "txt", text: "Bylaws ✓" });
  });

  it("rejects legacy, encrypted-office, image and binary input", async () => {
    expect(await code(() => sniff(oleLegacy(), "old.doc"))).toBe("LEGACY_FORMAT");
    expect(await code(() => sniff(oleEncrypted(), "locked.docx"))).toBe("ENCRYPTED");
    expect(await code(() => sniff(pngBytes(), "scan.png"))).toBe("UNSUPPORTED_TYPE");
    expect(await code(() => sniff(randomBinary(), "notes.txt"))).toBe("UNSUPPORTED_TYPE");
  });

  it("classifies zips by their entries", async () => {
    expect(classifyZip(preflightZip(docx([{ text: "x" }])))).toBe("docx");
    expect(classifyZip(preflightZip(xlsx([{ name: "S", rows: [["a"]] }])))).toBe("xlsx");
    expect(await code(() => classifyZip(preflightZip(macroWorkbook())))).toBe("UNSUPPORTED_TYPE");
    expect(await code(() => classifyZip(preflightZip(plainZip())))).toBe("UNSUPPORTED_TYPE");
  });

  it("extractFile maps empty and unknown input to codes", async () => {
    expect(await code(extractFile(Buffer.alloc(0), "a.txt"))).toBe("EMPTY");
    expect(await code(extractFile(randomBinary(), "a.txt"))).toBe("UNSUPPORTED_TYPE");
    expect(await code(extractFile(Buffer.from("PK\x03\x04garbage"), "a.docx"))).toBe("MALFORMED");
    expect(await code(extractFile(Buffer.from("%PDF-1.4 nonsense"), "a.pdf"))).toBe("MALFORMED");
  });
});
