import { NextRequest } from "next/server";

/**
 * In-memory sliding-window rate limiter. No external dependencies.
 *
 * SCOPE / CAVEAT: state lives in this process only. On a single long-lived Node
 * server this is fully effective. On serverless (per-invocation processes) it
 * limits within a warm instance and resets on cold start — still meaningful
 * protection against burst abuse, but not a hard distributed guarantee. Swap in
 * Upstash/Redis if you need cross-instance enforcement.
 */

interface Window {
  count: number;
  resetAt: number; // epoch ms when the current window expires
}

// Survive `next dev` hot-reloads so counters aren't wiped on every edit.
declare global {
  // eslint-disable-next-line no-var
  var _rateLimitStore: Map<string, Window> | undefined;
}

const store: Map<string, Window> = globalThis._rateLimitStore ?? new Map();
if (process.env.NODE_ENV !== "production") globalThis._rateLimitStore = store;

let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 60_000;

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, win] of store) {
    if (win.resetAt <= now) store.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
}

/**
 * Returns whether `key` is under the limit, and consumes one token if so.
 * @param key      unique bucket key (e.g. `claim:<userId>` or `mutate:<ip>`)
 * @param limit    max requests per window
 * @param windowMs window length in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt, retryAfterSec: 0 };
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return {
    ok: true,
    remaining: limit - existing.count,
    resetAt: existing.resetAt,
    retryAfterSec: 0,
  };
}

/**
 * Best-effort client IP from proxy headers. Falls back to "unknown" so the
 * limiter still buckets (all unknowns share one bucket — acceptable for a
 * coarse abuse guard).
 */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Convenience guard for authenticated mutation handlers: throttles writes per
 * brother id. Returns a 429 Response to return verbatim, or null when allowed.
 * Default: 30 writes per 10s — generous for real use, blocks runaway loops/spam.
 */
export function checkMutationRate(brotherId: number, limit = 30, windowMs = 10_000): Response | null {
  const result = rateLimit(`mutate:${brotherId}`, limit, windowMs);
  return result.ok ? null : tooManyRequests(result);
}

/** Standard 429 response with Retry-After header. */
export function tooManyRequests(result: RateLimitResult): Response {
  return Response.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSec),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    },
  );
}
