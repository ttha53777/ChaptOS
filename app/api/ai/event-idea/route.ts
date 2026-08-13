import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { eventIdeaInput } from "@/lib/validation/ai";
import { getEventIdea } from "@/lib/services/event-idea-service";
import { logError } from "@/lib/observability";

// The panel behind a tapped Ask Chapt event-idea row: the explanation prose plus
// a server-signed, prefilled propose_add_calendar_event card.
//
// Any active member may open one. The card carries its own permission gate — a
// member without MANAGE_EVENTS gets the same blocked-not-routed treatment as any
// other writ card, and the write itself is authorized again at /api/calendar,
// which is the gate that actually matters. Gating this route on MANAGE_EVENTS
// would only hide the explanation from the people most likely to be reading for
// ideas.
//
// POST rather than GET because the tapped row's text is the input (a title and a
// subtitle clause, too long and too punctuation-heavy for a query string). It
// writes nothing.

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = eventIdeaInput.parse(body);
    return Response.json(await getEventIdea(ctx, input));
  } catch (e) {
    logError(e, { route: "/api/ai/event-idea", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
