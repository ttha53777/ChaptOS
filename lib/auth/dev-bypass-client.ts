export const DEV_IMPERSONATE_COOKIE = "dev_impersonate";

/**
 * Client-side counterpart for "are we in an impersonated dev session?" — true
 * when the (non-httpOnly) impersonation cookie is present in document.cookie.
 * Used by client components (e.g. ChapterProvider) that otherwise gate data
 * loading on a real Supabase session, which the bypass deliberately lacks.
 * Safe in production: the cookie is only ever set by the local screenshot tool.
 */
export function hasDevImpersonationCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some(c => c.startsWith(`${DEV_IMPERSONATE_COOKIE}=`));
}

