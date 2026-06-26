import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { castVoteInput } from "@/lib/validation/poll";
import { castVote } from "@/lib/services/poll-service";
import { logError } from "@/lib/observability";

// POST gates on VIEW only; castVote enforces assignee-only (direct or via a held
// role) and that the poll is still open. Returns the updated poll (live tallies +
// the caller's new pick).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) throw new ValidationError("Invalid ID");
    const body = await req.json().catch(() => ({}));
    const input = castVoteInput.parse(body);
    return Response.json(await castVote(ctx, numId, input.optionId));
  } catch (e) {
    logError(e, { route: "/api/polls/[id]/vote", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
