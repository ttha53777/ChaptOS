import { FileRejected, type Extracted, type TextUnit } from "./types";
import { FILE_MAX_CHARS, PDF_MAX_PAGES } from "./limits";

/** Fewer non-space characters per page than this, on average, means scanned images. */
const MIN_CHARS_PER_PAGE = 20;

/**
 * One unit per page ("p7" → "p. 7"), read with unpdf's serverless pdf.js build.
 * Stops at PDF_MAX_PAGES or FILE_MAX_CHARS and says so with `truncated`.
 */
export async function extractPdf(bytes: Buffer): Promise<Extracted> {
  const { getDocumentProxy } = await import("unpdf");
  let doc: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    // isEvalSupported: false — pdf.js must never compile font programs with eval.
    doc = await getDocumentProxy(new Uint8Array(bytes), { isEvalSupported: false, verbosity: 0 });
  } catch (e) {
    throw new FileRejected((e as { name?: string } | null)?.name === "PasswordException" ? "ENCRYPTED" : "MALFORMED");
  }
  try {
    const pageCount = doc.numPages;
    const units: TextUnit[] = [];
    let chars = 0;
    let nonSpace = 0;
    let truncated = pageCount > PDF_MAX_PAGES;
    for (let n = 1; n <= Math.min(pageCount, PDF_MAX_PAGES); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str + (item.hasEOL ? "\n" : "");
      }
      text = text.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      page.cleanup();
      nonSpace += text.replace(/\s/g, "").length;
      if (chars + text.length > FILE_MAX_CHARS) {
        const room = FILE_MAX_CHARS - chars;
        if (room > 200) { units.push({ ref: `p${n}`, label: `Page ${n}`, text: text.slice(0, room) }); chars += room; }
        truncated = true;
        break;
      }
      units.push({ ref: `p${n}`, label: `Page ${n}`, text });
      chars += text.length;
    }
    const pagesRead = Math.max(1, units.length);
    if (nonSpace / pagesRead < MIN_CHARS_PER_PAGE) throw new FileRejected("NO_TEXT_LAYER");
    return { kind: "pdf", content: { type: "text", units }, unitCount: units.length, charCount: chars, truncated };
  } catch (e) {
    if (e instanceof FileRejected) throw e;
    throw new FileRejected("MALFORMED");
  } finally {
    await doc.destroy().catch(() => {});
  }
}
