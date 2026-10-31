import { currentOrgSlug, requestJson } from "../../lib/api";
import type { Reimbursement } from "../../data";

// Mirrors RECEIPT_MAX_BYTES in lib/supabase/receipts.ts (a server module, so not imported here).
const MAX_BYTES = 4 * 1024 * 1024;
// Photos above this get re-encoded; most phone shots are 2–6 MB straight off the camera.
const SHRINK_ABOVE = 1.5 * 1024 * 1024;
const MAX_EDGE = 2000;

export const RECEIPT_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";

/**
 * Re-encode a large photo as a ≤2000px JPEG so it fits under the upload cap and
 * stays legible. Anything the browser can't decode (PDFs, HEIC outside Safari)
 * passes through untouched for the server to accept or refuse.
 */
async function shrinkIfImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= SHRINK_ABOVE) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Upload (or replace) a request's receipt. Resolves to the updated row. */
export async function uploadReceipt(reimbursementId: number, file: File): Promise<Reimbursement> {
  const ready = await shrinkIfImage(file);
  if (ready.size > MAX_BYTES) throw new RangeError("Receipt must be under 4 MB");
  const body = new FormData();
  body.append("file", ready);
  return requestJson<Reimbursement>(`/api/reimbursements/${reimbursementId}/receipt`, {
    method: "POST",
    body,
    // Uploads from a phone on a weak connection outlast requestJson's 15s default.
    signal: AbortSignal.timeout(60_000),
  });
}

/** A plain link can't send the org header, so the org rides in the query. */
export function receiptHref(reimbursementId: number): string {
  const slug = currentOrgSlug();
  return `/api/reimbursements/${reimbursementId}/receipt${slug ? `?org=${encodeURIComponent(slug)}` : ""}`;
}
