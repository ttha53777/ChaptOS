import { FileRejected, type Extracted, type TextUnit } from "./types";
import { FILE_MAX_CHARS, PDF_MAX_PAGES } from "./limits";
import { itemsToLines, bodySize, renderLines, type PdfItem, type PdfLine } from "./pdf-layout";

/** Fewer non-space characters per page than this, on average, means scanned images. */
const MIN_CHARS_PER_PAGE = 20;

/**
 * One unit per page ("p7" → "p. 7"), read with unpdf's serverless pdf.js build.
 * Each page's layout is rebuilt (headings, table columns, paragraph breaks —
 * see pdf-layout.ts) against the body text size of the whole document, so the
 * pages are laid out first and rendered second.
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
    const pages: PdfLine[][] = [];
    let truncated = pageCount > PDF_MAX_PAGES;
    let rawChars = 0;
    for (let n = 1; n <= Math.min(pageCount, PDF_MAX_PAGES); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items: PdfItem[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const t = item.transform as number[];
        items.push({ str: item.str, x: t[4], y: t[5], w: item.width, size: Math.hypot(t[0], t[1]) || item.height || 11 });
      }
      page.cleanup();
      const lines = itemsToLines(items);
      pages.push(lines);
      // Layout adds little, so stop reading once the raw text alone would fill the cap.
      rawChars += lines.reduce((acc, l) => acc + l.cells.reduce((m, c) => m + c.text.length + 1, 0), 0);
      if (rawChars > FILE_MAX_CHARS) break;
    }

    const body = bodySize(pages.flat());
    const units: TextUnit[] = [];
    let chars = 0;
    let nonSpace = 0;
    for (const [i, lines] of pages.entries()) {
      const n = i + 1;
      const text = renderLines(lines, body);
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
    if (units.length < pages.length || pages.length < Math.min(pageCount, PDF_MAX_PAGES)) truncated = true;
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
