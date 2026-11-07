/**
 * Bytes in, Extracted out — or a FileRejected with a code. Server-only and pure:
 * no DB, no Storage, nothing written anywhere. The original bytes go out of
 * scope when the caller's request ends.
 */
import { FileRejected, type Extracted } from "./types";
import { sniff, classifyZip } from "./sniff";
import { preflightZip } from "./zip-preflight";
import { extractPdf } from "./extract-pdf";
import { extractDocx } from "./extract-docx";
import { extractXlsx } from "./extract-xlsx";
import { extractCsv } from "./extract-csv";
import { extractTxt } from "./extract-txt";
import { displayName, stem } from "./filename";

export async function extractFile(bytes: Buffer, originalName: string): Promise<Extracted> {
  if (bytes.length === 0) throw new FileRejected("EMPTY");
  try {
    const s = sniff(bytes, originalName);
    switch (s.kind) {
      case "pdf": return await extractPdf(bytes);
      case "zip": {
        const kind = classifyZip(preflightZip(bytes));
        return kind === "docx" ? await extractDocx(bytes) : await extractXlsx(bytes);
      }
      case "csv": return extractCsv(s.text, stem(displayName(originalName)));
      case "txt": return extractTxt(s.text);
    }
  } catch (e) {
    // Never let a parser's own error (whose message can quote the document) escape.
    if (e instanceof FileRejected) throw e;
    throw new FileRejected("MALFORMED");
  }
}

export { FileRejected, FILE_ERROR_MESSAGES } from "./types";
export type { Extracted, AttachmentContent, TextUnit, SheetData, Cell, FileErrorCode } from "./types";
export { displayName } from "./filename";
