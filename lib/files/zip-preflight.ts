/**
 * Inspect a zip (DOCX / XLSX) before any third-party parser touches it.
 *
 * Office files are zips, so a hostile one can be a zip bomb, carry path-
 * traversal names or hide an encrypted payload. This walks the central
 * directory with nothing but node:zlib and enforces every cap on the ACTUAL
 * inflated output — declared sizes are attacker-controlled and never trusted.
 * Only after this passes do mammoth / read-excel-file see the buffer.
 */
import { inflateRawSync } from "node:zlib";
import { FileRejected } from "./types";
import { ZIP_MAX_ENTRIES, ZIP_MAX_ENTRY_BYTES, ZIP_MAX_TOTAL_BYTES } from "./limits";

const EOCD_SIG = 0x06054b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

export interface ZipEntryInfo { name: string; size: number }

function findEocd(b: Buffer): number {
  // The EOCD record is 22 bytes plus a comment of at most 65535.
  const stop = Math.max(0, b.length - 22 - 0xffff);
  for (let i = b.length - 22; i >= stop; i--) {
    if (b.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

function unsafeName(name: string): boolean {
  if (name.startsWith("/") || name.startsWith("\\") || /^[a-zA-Z]:/.test(name)) return true;
  return name.split(/[\\/]/).some(part => part === "..");
}

/**
 * Validate the archive and return its entry names with their real inflated
 * sizes. Throws FileRejected: ENCRYPTED for an encrypted entry, MALFORMED for
 * anything structurally off or over a cap.
 */
export function preflightZip(b: Buffer): ZipEntryInfo[] {
  const malformed = () => new FileRejected("MALFORMED");
  if (b.length < 22) throw malformed();

  const eocd = findEocd(b);
  if (eocd < 0) throw malformed();
  if (eocd >= 20 && b.readUInt32LE(eocd - 20) === ZIP64_LOCATOR_SIG) throw malformed();

  const total = b.readUInt16LE(eocd + 10);
  const cdSize = b.readUInt32LE(eocd + 12);
  const cdOffset = b.readUInt32LE(eocd + 16);
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw malformed(); // zip64
  if (total === 0 || total > ZIP_MAX_ENTRIES) throw malformed();
  if (cdOffset + cdSize > eocd) throw malformed();

  const entries: ZipEntryInfo[] = [];
  let inflatedTotal = 0;
  let p = cdOffset;
  for (let n = 0; n < total; n++) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== CENTRAL_SIG) throw malformed();
    const flags = b.readUInt16LE(p + 8);
    const method = b.readUInt16LE(p + 10);
    const compSize = b.readUInt32LE(p + 20);
    const nameLen = b.readUInt16LE(p + 28);
    const extraLen = b.readUInt16LE(p + 30);
    const commentLen = b.readUInt16LE(p + 32);
    const localOffset = b.readUInt32LE(p + 42);
    if (p + 46 + nameLen > b.length) throw malformed();
    const name = b.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (flags & 0x1) throw new FileRejected("ENCRYPTED");
    if (unsafeName(name)) throw malformed();
    if (compSize === 0xffffffff || localOffset === 0xffffffff) throw malformed();

    if (localOffset + 30 > b.length || b.readUInt32LE(localOffset) !== LOCAL_SIG) throw malformed();
    const dataStart = localOffset + 30 + b.readUInt16LE(localOffset + 26) + b.readUInt16LE(localOffset + 28);
    if (dataStart + compSize > b.length) throw malformed();
    const data = b.subarray(dataStart, dataStart + compSize);

    const room = Math.min(ZIP_MAX_ENTRY_BYTES, ZIP_MAX_TOTAL_BYTES - inflatedTotal);
    let size: number;
    if (method === 0) {
      size = compSize;
      if (size > room) throw malformed();
    } else if (method === 8) {
      try {
        // maxOutputLength makes zlib stop the moment output passes the cap, so a
        // bomb costs at most `room` bytes of work, however large it claims to be.
        size = inflateRawSync(data, { maxOutputLength: Math.max(1, room) }).length;
      } catch {
        throw malformed();
      }
    } else {
      throw malformed();
    }
    inflatedTotal += size;
    entries.push({ name, size });
  }
  return entries;
}
