import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { calendarFeedLive, getCalendarSubscription, manageCalendarSubscription } from "@/lib/services/calendar-subscription-service";
import { calendarSubscriptionQuery, manageCalendarFeedInput } from "@/lib/validation/calendar-feed";
export async function GET(request: Request) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    // ?summary=1: just "is it live", for the dashboard invite. Never the URL.
    // ?view=member: the setup dialog's fields only, skipping the admin audit.
    const { summary, view } = calendarSubscriptionQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(summary ? await calendarFeedLive(ctx) : await getCalendarSubscription(ctx, { memberView: view === "member" }), { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
  catch (e) { return toResponse(e); }
}
export async function PATCH(request: Request) {
  const { ctx, error } = await buildContext({ requireOrgAdmin: true });
  if (error) return error;
  try {
    await manageCalendarSubscription(ctx, manageCalendarFeedInput.parse(await request.json()));
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return toResponse(e); }
}
