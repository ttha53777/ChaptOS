/**
 * The one way the app talks to the server.
 *
 *  - Authorization: Bearer <access token>, x-org-slug (the active org, unless the
 *    call says `org: null`), x-app-version on every request. No cookies.
 *  - A 401 refreshes the token once and retries; a second 401 (or a dead refresh
 *    token) drops the session, which sends the app back to sign-in. Calls made
 *    with `allow401` hand the 401 back instead (the "is this person a member?"
 *    probes, where 401 is an answer, not a failure).
 *  - 426 APP_UPDATE_REQUIRED trips the update gate, which blocks the whole app.
 *  - Errors become ApiError with the server's { error, code, details }.
 */
import type { AppUpdateRequired } from "@/lib/api-types";
import { dropSession, getAccessToken, refreshAccessToken } from "~/auth";
import { config } from "~/config";
import { activeOrg } from "~/state/org";
import { updateGate } from "~/state/update-gate";
import { ApiError, NetworkError } from "./errors";

export interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** JSON-encoded unless it's FormData. */
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  /** Override the org header: a slug, or null to send none (identity routes). */
  org?: string | null;
  signal?: AbortSignal;
  /** Return the 401 as an ApiError instead of refreshing/signing out. */
  allow401?: boolean;
  /** Send no Authorization header (public routes). */
  anonymous?: boolean;
}

function buildUrl(path: string, query?: ApiOptions["query"]): string {
  const qs = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return `${config.apiUrl}${path}${qs ? `?${qs}` : ""}`;
}

async function send(path: string, opts: ApiOptions, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json", "x-app-version": config.appVersion };
  if (token && !opts.anonymous) headers.Authorization = `Bearer ${token}`;
  const org = opts.org === undefined ? activeOrg.get().slug : opts.org;
  if (org) headers["x-org-slug"] = org;
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers["Content-Type"] = "application/json"; }
  try {
    return await fetch(buildUrl(path, opts.query), { method: opts.method ?? "GET", headers, body, signal: opts.signal });
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") throw e;
    throw new NetworkError(e);
  }
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  let token = opts.anonymous ? null : await getAccessToken();
  let res = await send(path, opts, token);

  if (res.status === 401 && token && !opts.allow401) {
    token = await refreshAccessToken();
    if (token) res = await send(path, opts, token);
    if (!token || res.status === 401) {
      await dropSession();
      throw new ApiError(401, "Your session ended. Sign in again.", "UNAUTHORIZED");
    }
  }

  const data = await parse(res);
  if (res.ok) return data as T;

  const err = (data && typeof data === "object" ? data : {}) as { error?: string; code?: string; details?: unknown };
  if (res.status === 426 && err.code === "APP_UPDATE_REQUIRED") {
    updateGate.set({ minVersion: (data as AppUpdateRequired).minVersion });
  }
  throw new ApiError(res.status, err.error ?? `Request failed (${res.status})`, err.code ?? null, err.details ?? null, data);
}
