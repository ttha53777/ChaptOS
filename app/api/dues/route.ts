import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { getDuesBoard } from "@/lib/services/dues-charge-service";
import { duesBoardQuery } from "@/lib/validation/dues";

// The Dues tab: every live charge in view and where each member stands on them.
// Open to every member — the whole chapter sees who owes what (controls to
// change it are treasury-gated on the write routes).
export async function GET(req: NextRequest) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const { searchParams } = new URL(req.url);
    const query = duesBoardQuery.parse({ semester: searchParams.get("semester") ?? undefined });
    return Response.json(await getDuesBoard(ctx, query));
  } catch (e) {
    logError(e, { route: "/api/dues", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
