import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { aiEnabled } from "@/lib/ai";
import { notesId } from "@/lib/validation/meeting-notes";
import { summarizeMeeting } from "@/lib/services/meeting-summary-service";

export async function POST(req: Request) {
  const { ctx, error } = await buildContext({ rateLimit: { limit: 20, windowMs: 60_000 } });
  if (error) return error;
  if (!aiEnabled()) return Response.json({ error: "AI is not configured" }, { status: 503 });
  try {
    const body = await req.json();
    return Response.json(await summarizeMeeting(ctx, notesId.parse(body?.id)));
  } catch (e) { return toResponse(e); }
}
