/**
 * Where an org's workspace lives in the URL space: /org/<slug>/…
 *
 * Pure module — no DB, no IO, safe in the client bundle. Every link into an
 * org, and every read of the slug back out of a pathname, goes through here so
 * the prefix is spelled in exactly one place.
 *
 * Orgs used to live at the root (/<slug>), which made every top-level page a
 * race against whoever claimed that word first and let any org mint a URL that
 * reads like one of ours (chaptos.com/support). Old root links still work —
 * app/[legacy]/[[...rest]] permanently redirects them here.
 */

export const ORG_ROUTE_PREFIX = "/org";

/**
 * The URL for a page inside an org.
 *
 *   orgHref("lpe")              // → "/org/lpe"
 *   orgHref("lpe", "/treasury") // → "/org/lpe/treasury"
 *   orgHref("lpe", "?toast=1")  // → "/org/lpe?toast=1"
 */
export function orgHref(slug: string, path = ""): string {
  const base = `${ORG_ROUTE_PREFIX}/${encodeURIComponent(slug)}`;
  if (path === "" || path === "/") return base;
  if (path.startsWith("?") || path.startsWith("#")) return base + path;
  return base + (path.startsWith("/") ? path : `/${path}`);
}

/** The org slug a pathname points into ("/org/lpe/treasury" → "lpe"), or null. */
export function orgSlugFromPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const segs = pathname.split("/");
  if (`/${segs[1] ?? ""}` !== ORG_ROUTE_PREFIX) return null;
  const slug = segs[2];
  return slug ? decodeURIComponent(slug) : null;
}

/** The path within the org ("/org/lpe/treasury" → "/treasury", "/org/lpe" → "/"). */
export function orgSubpath(pathname: string | null | undefined): string {
  if (!orgSlugFromPath(pathname)) return "/";
  const rest = pathname!.split("/").slice(3).join("/");
  return `/${rest}`;
}

/**
 * True when `path` lands inside the given org — the org root itself or anything
 * under it. A bare prefix check would let "/org/lp" claim "/org/lpe/…".
 */
export function isInsideOrg(path: string, slug: string): boolean {
  const base = orgHref(slug);
  return path === base || path.startsWith(`${base}/`) || path.startsWith(`${base}?`) || path.startsWith(`${base}#`);
}

/**
 * Translate a pre-/org link into the given org ("/lpe/treasury?x" →
 * "/org/lpe/treasury?x"), or null when `path` isn't a root link into it.
 * Used where a stored path skips the legacy redirect route — the sign-in
 * callback's ?next=, which is checked against the org before it's followed.
 */
export function fromLegacyOrgPath(path: string, slug: string): string | null {
  const root = `/${slug}`;
  if (!path.startsWith(root)) return null;
  const rest = path.slice(root.length);
  if (rest !== "" && !/^[/?#]/.test(rest)) return null;
  return orgHref(slug, rest);
}
