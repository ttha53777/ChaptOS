/**
 * Org logo storage helpers — the single place that knows the org-logos bucket
 * layout and talks to Supabase Storage. Kept separate from org-service.ts so the
 * service layer stays focused on ctx/db/events and there's exactly one module
 * that encodes the bucket + path convention (shared by setOrgLogo, clearOrgLogo,
 * and deleteOrg's cleanup).
 *
 * Authorization note: these functions assume the CALLER has already verified the
 * actor may administer the org (the route runs buildContext + an org-admin gate).
 * Storage RLS additionally enforces that the upload lands in the uploader's own
 * auth.uid() folder — see supabase/storage-org-logos.sql.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ValidationError } from "@/lib/errors";
import { logError } from "@/lib/observability";

export const ORG_LOGO_BUCKET = "org-logos";

/** Cap matches the avatar route so the two image surfaces behave the same. */
const MAX_BYTES = 2 * 1024 * 1024;

/** Map an image MIME type to a file extension. Mirrors the avatar route. */
function extForType(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  if (type === "image/svg+xml") return "svg";
  return "jpg";
}

/**
 * Validate + upload an org logo, returning its public (cache-busted) URL.
 *
 * Path: `<auth.uid()>/org-<orgId>-logo.<ext>`. Keyed by the uploader's auth id
 * so the existing per-user-folder RLS authorizes the write; the `org-<id>`
 * filename segment disambiguates logos when one founder created several orgs.
 *
 * Throws ValidationError on a missing/non-image/oversized file (→ 400 via
 * toResponse) and a plain Error if storage rejects the upload (→ 500).
 */
export async function uploadOrgLogoObject(authUserId: string, orgId: number, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new ValidationError("File must be an image");
  }
  if (file.size > MAX_BYTES) {
    throw new ValidationError("Image must be under 2 MB");
  }

  const supabase = await createServerSupabaseClient();
  const ext = extForType(file.type);
  const path = `${authUserId}/org-${orgId}-logo.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(ORG_LOGO_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (uploadError) {
    logError(uploadError, { route: "lib/services/org-logo", method: "uploadOrgLogoObject", extra: { orgId } });
    throw new Error(`Failed to upload logo. Ensure the ${ORG_LOGO_BUCKET} storage bucket exists.`);
  }

  const { data: urlData } = supabase.storage.from(ORG_LOGO_BUCKET).getPublicUrl(path);
  return `${urlData.publicUrl}?v=${Date.now()}`;
}

/**
 * Best-effort removal of the storage object a logo URL points at. Used by
 * clearOrgLogo and deleteOrg so a removed/deleted org's image doesn't linger.
 * Never throws — a storage hiccup must not fail the surrounding operation; the
 * authoritative state is the nulled/removed Organization.logoUrl column.
 *
 * We derive the object path from the public URL rather than recomputing it,
 * because the stored extension depends on the original upload's MIME type.
 */
export async function removeOrgLogoObject(logoUrl: string | null | undefined): Promise<void> {
  const path = objectPathFromPublicUrl(logoUrl);
  if (!path) return;
  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.storage.from(ORG_LOGO_BUCKET).remove([path]);
    if (error) {
      logError(error, { route: "lib/services/org-logo", method: "removeOrgLogoObject" });
    }
  } catch (e) {
    logError(e, { route: "lib/services/org-logo", method: "removeOrgLogoObject" });
  }
}

/**
 * Extract the in-bucket object path from a public Supabase Storage URL.
 * Public URLs look like:
 *   https://<ref>.supabase.co/storage/v1/object/public/org-logos/<uid>/org-<id>-logo.png?v=...
 * Returns "<uid>/org-<id>-logo.png" (the part after the bucket name), or null if
 * the URL isn't an org-logos object (e.g. a legacy localStorage data URL).
 */
export function objectPathFromPublicUrl(logoUrl: string | null | undefined): string | null {
  if (!logoUrl) return null;
  const marker = `/object/public/${ORG_LOGO_BUCKET}/`;
  const idx = logoUrl.indexOf(marker);
  if (idx === -1) return null;
  const afterBucket = logoUrl.slice(idx + marker.length);
  const path = afterBucket.split("?")[0]; // drop the ?v= cache-buster
  return path || null;
}
