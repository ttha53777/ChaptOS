import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { notesId } from "@/lib/validation/meeting-notes";
import { openMeetingNotes } from "@/lib/services/meeting-notes-service";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_EVENTS" });
  if (error) return error;
  try {
    return Response.json(await openMeetingNotes(ctx, notesId.parse((await params).id)), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return toResponse(e); }
}
