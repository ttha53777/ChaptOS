import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { getMemberDuesBook } from "@/lib/services/dues-charge-service";

// One member's tab, line by line. Open to every member, like the board.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ brotherId: string }> }) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const { brotherId } = await params;
    const id = Number(brotherId);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError("Invalid ID");
    return Response.json(await getMemberDuesBook(ctx, id));
  } catch (e) {
    logError(e, { route: "/api/dues/members/[brotherId]", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
