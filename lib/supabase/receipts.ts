/**
 * Reimbursement receipt storage — the single place that knows the receipts bucket
 * layout and talks to Supabase Storage for it.
 *
 * The bucket is private and has no storage policies (supabase/storage-receipts.sql),
 * so only the service-role client can touch it. That makes the app the only gate:
 * callers MUST have already checked the actor may see/attach this receipt (see
 * reimbursement-service.ts). Nothing here falls back to a session client — a
 * missing service-role key is a configuration error, not a reason to degrade.
 */

import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ValidationError } from "@/lib/errors";
import { logError } from "@/lib/observability";

export const RECEIPT_BUCKET = "receipts";

/** Under the ~4.5 MB request-body ceiling of serverless hosts; the client shrinks photos first. */
export const RECEIPT_MAX_BYTES = 4 * 1024 * 1024;

/** How long a viewing link lives. Long enough to open, too short to be worth sharing. */
const SIGNED_URL_SECONDS = 60;

type ReceiptKind = { type: string; ext: string };

/**
 * Identify the file from its leading bytes rather than trusting the browser's
 * claimed MIME type. Only formats a receipt plausibly arrives in; notably no SVG
 * or HTML, which could carry script.
 */
function sniff(b: Uint8Array): ReceiptKind | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (b.length >= 8 && b[0] === 0x89 && ascii(1, 4) === "PNG" && b[4] === 0x0d && b[5] === 0x0a) return { type: "image/png", ext: "png" };
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { type: "image/webp", ext: "webp" };
  if (b.length >= 5 && ascii(0, 5) === "%PDF-") return { type: "application/pdf", ext: "pdf" };
  // ISO-BMFF: size(4) "ftyp" brand(4). iPhone photos are HEIC.
  if (b.length >= 12 && ascii(4, 8) === "ftyp" && ["heic", "heix", "mif1", "msf1", "hevc", "heim", "heis"].includes(ascii(8, 12))) {
    return { type: "image/heic", ext: "heic" };
  }
  return null;
}

/**
 * Validate an uploaded receipt. Throws ValidationError (→ 400) on an empty,
 * oversized, or unrecognised file. Pure — no Storage access — so it's testable
 * on its own and runs before anything is written.
 */
export async function readReceipt(file: File): Promise<ReceiptKind & { bytes: Buffer }> {
  if (file.size === 0) throw new ValidationError("The receipt file is empty");
  if (file.size > RECEIPT_MAX_BYTES) throw new ValidationError("Receipt must be under 4 MB");
  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) throw new ValidationError("Receipt must be a photo (JPEG, PNG, WebP, HEIC) or a PDF");
  return { ...kind, bytes };
}

/** Folder per org so deleteOrg can clear it by prefix; random name so a replaced receipt's old links die. */
export function receiptObjectPath(orgId: number, reimbursementId: number, ext: string): string {
  return `org-${orgId}/${reimbursementId}-${randomUUID()}.${ext}`;
}

function storage() {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Receipt storage is not configured (SUPABASE_SERVICE_ROLE_KEY is unset).");
  return admin.storage.from(RECEIPT_BUCKET);
}

export async function putReceiptObject(path: string, bytes: Buffer, contentType: string): Promise<void> {
  const { error } = await storage().upload(path, bytes, { contentType, upsert: false });
  if (error) {
    logError(error, { route: "lib/supabase/receipts", method: "putReceiptObject" });
    throw new Error(`Failed to upload receipt. Ensure the ${RECEIPT_BUCKET} storage bucket exists.`);
  }
}

export async function signReceiptUrl(path: string): Promise<string> {
  const { data, error } = await storage().createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data) {
    logError(error, { route: "lib/supabase/receipts", method: "signReceiptUrl" });
    throw new Error("Failed to open the receipt.");
  }
  return data.signedUrl;
}

/**
 * Best-effort removal. Never throws — the row change around it is the source of
 * truth — but logs, because a receipt left behind is someone's financial
 * paperwork that was meant to be gone.
 */
export async function removeReceiptObjects(paths: (string | null | undefined)[]): Promise<void> {
  const real = paths.filter((p): p is string => !!p);
  if (real.length === 0) return;
  try {
    const { error } = await storage().remove(real);
    if (error) throw error;
  } catch (e) {
    logError(e, { route: "lib/supabase/receipts", method: "removeReceiptObjects" });
  }
}

/** Clear every receipt an org ever stored. Best-effort, for deleteOrg after the org row is gone. */
export async function removeOrgReceipts(orgId: number): Promise<void> {
  const folder = `org-${orgId}`;
  try {
    const bucket = storage();
    // Re-list from the top each pass: the previous page was just deleted.
    for (let pass = 0; pass < 50; pass++) {
      const { data, error } = await bucket.list(folder, { limit: 1000 });
      if (error) throw error;
      if (!data?.length) return;
      const { error: rmError } = await bucket.remove(data.map(f => `${folder}/${f.name}`));
      if (rmError) throw rmError;
      if (data.length < 1000) return;
    }
  } catch (e) {
    logError(e, { route: "lib/supabase/receipts", method: "removeOrgReceipts", extra: { orgId } });
  }
}
