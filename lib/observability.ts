/**
 * Server-side observability helper.
 *
 * Today (no SENTRY_DSN set): emits one structured JSON line per error to
 * stdout. Vercel's Functions log viewer parses these for you, so you can
 * filter by userId, route, or requestId.
 *
 * Tomorrow (SENTRY_DSN set + `npm i @sentry/nextjs`): also forwards the
 * error to Sentry via a lazy dynamic import. No dependency cost until
 * you actually want it.
 *
 * Usage:
 *   try { ... }
 *   catch (e) {
 *     logError(e, { route: "/api/calendar", method: "POST", userId: user.id });
 *     return Response.json({ error: "Failed" }, { status: 500 });
 *   }
 */

type Severity = "error" | "warn" | "info";

export interface LogContext {
  route: string;             // e.g. "/api/calendar" — the route handler, NOT the request URL
  method?: string;           // "GET" | "POST" | "PATCH" | "DELETE"
  userId?: number | string;  // Brother.id when known
  requestId?: string;        // round-trip correlation id; logError generates one if absent
  extra?: Record<string, unknown>;
}

interface LogLine {
  level: Severity;
  ts: string;
  requestId: string;
  route: string;
  method?: string;
  userId?: number | string;
  message: string;
  errorName?: string;
  stack?: string;
  extra?: Record<string, unknown>;
}

function newRequestId(): string {
  // crypto.randomUUID is in Node 19+ and the edge runtime. Both targets we run on.
  try { return globalThis.crypto.randomUUID(); }
  catch { return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
}

function emit(line: LogLine) {
  // One JSON object per line so Vercel/CloudWatch/etc. can parse fields out.
  const stream = line.level === "error" ? console.error : line.level === "warn" ? console.warn : console.log;
  stream(JSON.stringify(line));
}

/** Best-effort Sentry forwarding. No-op until SENTRY_DSN is set AND @sentry/nextjs is installed. */
async function forwardToSentry(line: LogLine, err: unknown) {
  if (!process.env.SENTRY_DSN) return;
  try {
    // Dynamic import keeps Sentry out of the bundle when not configured.
    // The package may not be installed yet — we swallow the resolution error.
    // @ts-expect-error — optional peer; resolved at runtime only when present.
    const Sentry = await import("@sentry/nextjs").catch(() => null);
    if (!Sentry) return;
    Sentry.captureException(err, {
      tags: { route: line.route, method: line.method, requestId: line.requestId },
      user: line.userId != null ? { id: String(line.userId) } : undefined,
      extra: line.extra,
    });
  } catch {
    // Never let observability break a request.
  }
}

/**
 * Emit one structured `info` line for latency/timing telemetry. Reuses the same
 * JSON-per-line format as logError so Vercel's log viewer can filter by route or
 * userId. The timing payload (iters, per-iteration LLM ms, per-tool ms, TTFT,
 * total) goes under `ctx.extra`. Best-effort: never throws into the request path.
 */
export function logTiming(ctx: LogContext & { message?: string }): string {
  const requestId = ctx.requestId ?? newRequestId();
  try {
    emit({
      level: "info",
      ts: new Date().toISOString(),
      requestId,
      route: ctx.route,
      method: ctx.method,
      userId: ctx.userId,
      message: ctx.message ?? "timing",
      extra: ctx.extra,
    });
  } catch {
    // Observability must never break a request.
  }
  return requestId;
}

export function logError(err: unknown, ctx: LogContext): string {
  const requestId = ctx.requestId ?? newRequestId();
  const e = err as { message?: string; name?: string; stack?: string } | undefined;
  const line: LogLine = {
    level: "error",
    ts: new Date().toISOString(),
    requestId,
    route: ctx.route,
    method: ctx.method,
    userId: ctx.userId,
    message: e?.message ?? String(err),
    errorName: e?.name,
    stack: e?.stack,
    extra: ctx.extra,
  };
  emit(line);
  // Fire-and-forget: a failed Sentry call must never block or throw into the request path.
  void forwardToSentry(line, err);
  return requestId;
}
