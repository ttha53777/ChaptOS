/**
 * Test files for lib/files, built in code so no binary fixtures are committed.
 *
 * Each writer produces the smallest valid file of its kind: enough structure
 * for the real parsers (unpdf, mammoth, read-excel-file) to open, and nothing
 * else. The hostile ones (zip bomb, traversal name, encrypted entry, macro
 * project) are the same writers with one field changed.
 */
import { deflateRawSync, crc32 } from "node:zlib";
import { randomBytes } from "node:crypto";

// ── PDF ─────────────────────────────────────────────────────────────────────

function escapePdf(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function writePdf(objects: string[], trailerExtra = ""): Buffer {
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailerExtra}>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/**
 * A PDF with one page per entry. Each page's text is drawn line by line, so
 * "a\nb" lands as two lines. `draw` replaces the text with raw drawing ops
 * (an image-only page has drawing and no text).
 */
export function pdf(pages: string[], opts: { encrypt?: boolean; draw?: boolean } = {}): Buffer {
  const objs: string[] = [];
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  pages.forEach((text, i) => {
    const stream = opts.draw
      ? "0.5 g 72 72 400 600 re f"
      : "BT /F1 11 Tf 14 TL 72 740 Td " + text.split("\n").map(l => `(${escapePdf(l)}) Tj T*`).join(" ") + " ET";
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  if (!opts.encrypt) return writePdf(objs);
  // Standard security handler with a user password we never supply: O and U are
  // arbitrary, so the empty password fails pdf.js's check and it asks for one.
  const hex = (n: number) => randomBytes(n).toString("hex");
  objs.push(`<< /Filter /Standard /V 1 /R 2 /O <${hex(32)}> /U <${hex(32)}> /P -44 >>`);
  return writePdf(objs, `/Encrypt ${objs.length} 0 R /ID [<${hex(16)}> <${hex(16)}>] `);
}

// ── Zip ─────────────────────────────────────────────────────────────────────

export interface ZipEntry {
  name: string;
  data: Buffer | string;
  /** 0 = stored, 8 = deflate (default). */
  method?: 0 | 8;
  /** General-purpose flags; bit 0 marks the entry encrypted. */
  flags?: number;
}

export function zip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const raw = typeof e.data === "string" ? Buffer.from(e.data, "utf8") : e.data;
    const method = e.method ?? 8;
    const body = method === 8 ? deflateRawSync(raw) : raw;
    const name = Buffer.from(e.name, "utf8");
    const crc = crc32(raw);
    const flags = e.flags ?? 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

// ── DOCX ────────────────────────────────────────────────────────────────────

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type DocxBlock = { h?: 1 | 2 | 3; text: string } | { table: string[][] };

export function docxEntries(blocks: DocxBlock[]): ZipEntry[] {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const body = blocks.map(b => {
    if ("table" in b) {
      const rows = b.table.map(r => `<w:tr>${r.map(c => `<w:tc><w:p><w:r><w:t>${xmlEscape(c)}</w:t></w:r></w:p></w:tc>`).join("")}</w:tr>`).join("");
      return `<w:tbl>${rows}</w:tbl>`;
    }
    const style = b.h ? `<w:pPr><w:pStyle w:val="Heading${b.h}"/></w:pPr>` : "";
    return `<w:p>${style}<w:r><w:t xml:space="preserve">${xmlEscape(b.text)}</w:t></w:r></w:p>`;
  }).join("");
  const styles = [1, 2, 3].map(n => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/></w:style>`).join("");
  return [
    { name: "[Content_Types].xml", data:
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>' },
    { name: "_rels/.rels", data:
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: "word/_rels/document.xml.rels", data:
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: "word/styles.xml", data: `<?xml version="1.0" encoding="UTF-8"?><w:styles ${W}>${styles}</w:styles>` },
    { name: "word/document.xml", data: `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}</w:body></w:document>` },
  ];
}

export const docx = (blocks: DocxBlock[]) => zip(docxEntries(blocks));

// ── XLSX ────────────────────────────────────────────────────────────────────

export type XCell = string | number | boolean | null | { date: string };

export function xlsxEntries(sheets: { name: string; rows: XCell[][] }[]): ZipEntry[] {
  const strings: string[] = [];
  const sIndex = (s: string) => { let i = strings.indexOf(s); if (i < 0) { i = strings.length; strings.push(s); } return i; };
  const col = (i: number) => { let n = i + 1, s = ""; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  const serial = (iso: string) => (Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000;

  const sheetXml = sheets.map(sh => {
    const rows = sh.rows.map((row, r) => {
      const cells = row.map((v, c) => {
        const ref = `${col(c)}${r + 1}`;
        if (v === null) return "";
        if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
        if (typeof v === "boolean") return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
        if (typeof v === "object") return `<c r="${ref}" s="1"><v>${serial(v.date)}</v></c>`;
        return `<c r="${ref}" t="s"><v>${sIndex(v)}</v></c>`;
      }).join("");
      return `<row r="${r + 1}">${cells}</row>`;
    }).join("");
    return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  });

  const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  return [
    { name: "[Content_Types].xml", data:
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { name: "_rels/.rels", data:
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data:
      `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}"><sheets>` +
      sheets.map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") + "</sheets></workbook>" },
    { name: "xl/_rels/workbook.xml.rels", data:
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
      `<Relationship Id="rId${sheets.length + 1}" Type="${R}/sharedStrings" Target="sharedStrings.xml"/>` +
      `<Relationship Id="rId${sheets.length + 2}" Type="${R}/styles" Target="styles.xml"/></Relationships>` },
    ...sheetXml.map((data, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data })),
    { name: "xl/styles.xml", data:
      '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>' },
    { name: "xl/sharedStrings.xml", data:
      `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">` +
      strings.map(s => `<si><t>${xmlEscape(s)}</t></si>`).join("") + "</sst>" },
  ];
}

export const xlsx = (sheets: { name: string; rows: XCell[][] }[]) => zip(xlsxEntries(sheets));

/** The budget workbook the file-tool tests compute against. Totals are hand-checked in the tests. */
export const BUDGET_SHEETS: { name: string; rows: XCell[][] }[] = [
  {
    name: "Events",
    rows: [
      ["Spring budget", null, null, null],
      ["Item", "Category", "Amount", "Date"],
      ["Formal venue", "Social", 1200.5, { date: "2026-03-14" }],
      ["DJ", "Social", 450, { date: "2026-03-14" }],
      ["Food bank van", "Service", 85.25, { date: "2026-02-02" }],
      ["Rush BBQ", "Recruitment", 310.1, { date: "2026-01-20" }],
      ["Tabling flyers", "Recruitment", 42.3, { date: "2026-01-18" }],
      ["Refund", "Social", -100, { date: "2026-03-20" }],
      ["TBD", "Social", "pending", null],
    ],
  },
  { name: "Notes", rows: [["Approved at chapter on Feb 1"]] },
];

// ── Hostile and odd inputs ──────────────────────────────────────────────────

/** One deflated entry that inflates to `mb` megabytes of zeros. */
export function zipBomb(mb = 80): Buffer {
  return zip([...docxEntries([{ text: "hi" }]).slice(0, 4), { name: "word/document.xml", data: Buffer.alloc(mb * 1024 * 1024) }]);
}

export const traversalZip = () => zip([...docxEntries([{ text: "hi" }]), { name: "../../evil.xml", data: "<x/>" }]);
export const encryptedEntryZip = () => zip(docxEntries([{ text: "hi" }]).map((e, i) => (i === 4 ? { ...e, flags: 1 } : e)));
export const macroWorkbook = () => zip([...xlsxEntries([{ name: "S", rows: [["a", 1]] }]), { name: "xl/vbaProject.bin", data: randomBytes(64) }]);
export const plainZip = () => zip([{ name: "readme.txt", data: "hello" }]);

/** OLE compound file header — what an old .doc / .xls starts with. */
export const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
export const oleLegacy = () => Buffer.concat([OLE_MAGIC, randomBytes(512)]);
export const oleEncrypted = () => Buffer.concat([OLE_MAGIC, Buffer.alloc(64), Buffer.from("EncryptedPackage", "utf16le"), randomBytes(64)]);

export const pngBytes = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(64)]);

export const CSV_TEXT =
  'Member,Category,Amount\n' +
  '"Chen, Rob",Dues,"$1,200.00"\n' +
  'Sam Ortiz,Dues,(45.00)\n' +
  'Ana Ruiz,Social,12%\n' +
  'Lee Park,Social,\n';

export const utf16Text = (s: string) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(s, "utf16le")]);

/** Random bytes with a NUL early, so they can never pass as text. */
export const randomBinary = () => Buffer.concat([Buffer.from([0x01, 0x00, 0xff]), randomBytes(256)]);
