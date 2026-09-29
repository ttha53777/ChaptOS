import { createHash } from "node:crypto";
import { rateLimit } from "@/lib/rate-limit";
import { buildContext } from "@/lib/context";
import { readCalendarFeed } from "@/lib/services/calendar-feed-service";
import { DomainError, toResponse } from "@/lib/errors";
import { logTiming } from "@/lib/observability";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteArgs = { params: Promise<{ publicId: string; secret: string }> };
async function serve(request: Request, args: RouteArgs) {
  const started = performance.now();
  try {
    // Vercel overwrites x-forwarded-for. Self-hosted ingress must do the same.
    // Generous provider polling budget, separate from interactive write limits.
    const address = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
    if (address && !rateLimit(`feed-ip:${createHash("sha256").update(address).digest("hex")}`, 6000, 60_000).ok) {
      return new Response(null, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
    }
    const { ctx, error } = await buildContext({ mode: "calendarFeed", credentials: await args.params });
    if (error) return error;
    const result = await readCalendarFeed(ctx);
    const headers = { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, no-cache, max-age=0, must-revalidate", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", ETag: result.etag };
    const matched = request.headers.get("if-none-match")?.split(",").some(value => value.trim().replace(/^W\//, "") === result.etag || value.trim() === "*");
    logTiming({ route: "/api/calendar/feeds/[redacted]", method: request.method, extra: { orgId: ctx.orgId, bytes: result.bytes, elapsedMs: performance.now() - started, status: matched ? 304 : 200 } });
    return new Response(matched || request.method === "HEAD" ? null : result.body, { status: matched ? 304 : 200, headers });
  } catch (error) {
    // Never pass bearer URLs, exception messages or stacks to telemetry.
    const status = error instanceof DomainError && error.status === 404 ? 404 : 503;
    logTiming({ route: "/api/calendar/feeds/[redacted]", method: request.method, message: "feed_fetch_failed", extra: { status } });
    const response = toResponse(new DomainError(status === 404 ? "NOT_FOUND" : "INTERNAL", status === 404 ? "Not found" : "Calendar temporarily unavailable", status));
    response.headers.set("Cache-Control", "no-store");
    if (status === 503) response.headers.set("Retry-After", "60");
    return request.method === "HEAD" ? new Response(null, { status, headers: response.headers }) : response;
  }
}
export const GET = serve;
export const HEAD = serve;
