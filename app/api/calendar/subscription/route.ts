import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { getCalendarSubscription, manageCalendarSubscription } from "@/lib/services/calendar-subscription-service";
import { manageCalendarFeedInput } from "@/lib/validation/calendar-feed";
export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try { return Response.json(await getCalendarSubscription(ctx), { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } }); }
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
