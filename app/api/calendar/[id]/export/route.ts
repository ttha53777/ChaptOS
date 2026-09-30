import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { exportCalendarEventInput } from "@/lib/validation/calendar-feed";
import { exportCalendarEvent } from "@/lib/services/calendar-feed-service";

/**
 * GET /api/calendar/<id>/export?to=google|ics&org=<slug>
 * A plain link (new tab or download), so it can't send the x-org-slug header;
 * `org` names the org instead and still goes through the membership check.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const query = exportCalendarEventInput.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const { ctx, error } = await buildContext({ rateLimit: false, orgSlug: query.success ? query.data.org : undefined });
  if (error) return error;
  try {
    if (!query.success) throw new ValidationError("Choose google or ics");
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError("Invalid ID");
    const result = await exportCalendarEvent(ctx, id, query.data.to, new URL(request.url).origin);
    if (result.kind === "google") return new Response(null, { status: 302, headers: { Location: result.url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    return new Response(result.body, { headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (e) { return toResponse(e); }
}
