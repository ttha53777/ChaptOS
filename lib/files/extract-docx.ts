import mammoth from "mammoth";
import { FileRejected, type Extracted } from "./types";
import { FILE_MAX_CHARS } from "./limits";
import { htmlToSections } from "./html-sections";
import { capUnits } from "./units";

// Images are dropped, never decoded or inlined.
const dropImages = mammoth.images.imgElement(async () => ({ src: "" }));

/** Sections split at headings, so answers can cite "§ Article IV". Caller has already run preflightZip. */
export async function extractDocx(bytes: Buffer): Promise<Extracted> {
  let html: string;
  try {
    const result = await mammoth.convertToHtml({ buffer: bytes }, { convertImage: dropImages, externalFileAccess: false });
    html = result.value;
  } catch {
    throw new FileRejected("MALFORMED");
  }
  const capped = capUnits(htmlToSections(html), FILE_MAX_CHARS);
  if (capped.units.length === 0) throw new FileRejected("EMPTY");
  return { kind: "docx", content: { type: "text", units: capped.units }, unitCount: capped.units.length, charCount: capped.chars, truncated: capped.truncated };
}
