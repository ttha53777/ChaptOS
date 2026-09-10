import type { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { notesId, notesReadInput, saveNotesInput } from "@/lib/validation/meeting-notes";
import { readMeetingNotes, saveMeetingNotes } from "@/lib/services/meeting-notes-service";
import { readNotesBody } from "@/lib/collaboration/notes-request";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_EVENTS", rateLimit: false });
  if (error) return error;
  try {
    const id = notesId.parse((await params).id);
    const input = notesReadInput.parse(Object.fromEntries(req.nextUrl.searchParams));
    return Response.json(await readMeetingNotes(ctx, id, input.afterSeq), { headers });
  } catch (e) { return toResponse(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_EVENTS" });
  if (error) return error;
  try {
    const id = notesId.parse((await params).id);
    const input = saveNotesInput.parse(await readNotesBody(req));
    return Response.json(await saveMeetingNotes(ctx, id, input), { headers });
  } catch (e) { return toResponse(e); }
}
