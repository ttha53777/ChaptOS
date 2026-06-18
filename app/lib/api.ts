import { isDashboardRoute } from "./routes";

/** Name of the header carrying the active org slug. Mirrors ORG_SLUG_HEADER server-side. */
export const ORG_SLUG_HEADER = "x-org-slug";

/**
 * The org slug from the current URL (/[slug]/...), or null outside an org route.
 * Only returns a slug on dashboard routes — platform paths like /welcome or
 * /login have reserved first segments that are not org slugs. Sent as a header
 * so the API resolves the org the user is *viewing*, independent of the
 * (possibly lagging) active_org cookie — see require-user.ts.
 */
export function currentOrgSlug(): string | null {
  if (typeof window === "undefined") return null;
  const pathname = window.location.pathname;
  if (!isDashboardRoute(pathname)) return null;
  return pathname.split("/")[1] || null;
}

/** Merge the x-org-slug header into existing init headers without clobbering them. */
function withOrgSlug(init?: RequestInit): RequestInit {
  const slug = currentOrgSlug();
  if (!slug) return init ?? {};
  const headers = new Headers(init?.headers);
  if (!headers.has(ORG_SLUG_HEADER)) headers.set(ORG_SLUG_HEADER, slug);
  return { ...init, headers };
}

/**
 * `fetch` that tags the request with the active org slug header. Use for raw
 * fetches (streaming/SSE, AbortController, or callers that read Response
 * directly) where requestJson's JSON parsing doesn't fit. Same org-resolution
 * guarantee as requestJson.
 */
export function orgFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, withOrgSlug(init));
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const merged = withOrgSlug(init);
  const signal = merged.signal ?? AbortSignal.timeout(15_000);
  const response = await fetch(url, { ...merged, signal });
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = typeof body?.error === "string" ? `: ${body.error}` : "";
    } catch {
      // Fall back to status code when the API does not return JSON.
    }
    throw new Error(`${url} returned ${response.status}${detail}`);
  }
  if (response.status === 204) return undefined as T;
  try {
    return await (response.json() as Promise<T>);
  } catch {
    throw new Error(`${url} returned non-JSON response`);
  }
}
