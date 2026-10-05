import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { notesId, toggleActionItemInput } from "@/lib/validation/meeting-notes";
import { setActionItemDone } from "@/lib/services/meeting-summary-service";
import { logError } from "@/lib/observability";

// No requirePerm: the service lets an item's owner tick it as well as officers.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const id = notesId.parse((await params).id);
    const { itemId, done } = toggleActionItemInput.parse(await req.json().catch(() => ({})));
    return Response.json(await setActionItemDone(ctx, id, itemId, done));
  } catch (e) {
    logError(e, { route: "/api/calendar/[id]/action-items", method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
