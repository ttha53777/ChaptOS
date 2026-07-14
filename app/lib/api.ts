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

/**
 * Error thrown by requestJson for non-2xx responses. Keeps the same message
 * shape as before (so existing `console.error`/generic-message callers are
 * unaffected) but also exposes the HTTP status and parsed JSON body, letting
 * callers branch on structured details like `body.details.code`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * The server's own `error` string, fit to show a user.
 *
 * ApiError.message is diagnostic ("/api/dues/payments returned 409: ..."), which is the
 * wrong thing to put in front of someone. Domain errors (lib/errors) already carry a
 * written-for-humans message — "Payment of $100.00 exceeds Noah Kim's outstanding
 * balance of $75.00" — so prefer that, and fall back when there isn't one.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const msg = (err.body as { error?: unknown } | null)?.error;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}

/** Pull `details.code` out of an ApiError body, if present. */
export function apiErrorCode(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const details = (err.body as { details?: unknown } | null)?.details;
  const code = (details as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const merged = withOrgSlug(init);
  const signal = merged.signal ?? AbortSignal.timeout(15_000);
  const response = await fetch(url, { ...merged, signal });
  if (!response.ok) {
    let detail = "";
    let body: unknown = null;
    try {
      body = await response.json();
      const errMsg = (body as { error?: unknown } | null)?.error;
      detail = typeof errMsg === "string" ? `: ${errMsg}` : "";
    } catch {
      // Fall back to status code when the API does not return JSON.
    }
    throw new ApiError(`${url} returned ${response.status}${detail}`, response.status, body);
  }
  if (response.status === 204) return undefined as T;
  try {
    return await (response.json() as Promise<T>);
  } catch {
    throw new Error(`${url} returned non-JSON response`);
  }
}
