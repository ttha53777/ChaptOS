import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { recordApprovalInput, recordEventIdeaApprovalInput, listApprovalsQuery } from "@/lib/validation/ai";
import { recordChatApproval, recordEventIdeaApproval, listChatApprovals } from "@/lib/services/chat-approval-service";
import { logError } from "@/lib/observability";

// The Ask Chapt approval record. GET is the history any active member can read
// (it's the org's own audit trail); POST records an approval — gated inside the
// service by the signed proposal blob + the actor's permission, which is the
// real authority here (a static requirePerm can't express "the permission the
// signed blob names").

export async function GET(req: NextRequest) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const url = new URL(req.url);
    const query = listApprovalsQuery.parse({ kind: url.searchParams.get("kind") ?? undefined });
    return Response.json(await listChatApprovals(ctx, query));
  } catch (e) {
    logError(e, { route: "/api/ai/approvals", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    // Two ways in. The ordinary one echoes the signed proposal blob back. The
    // event-idea panel can't — its card is completed by the user after signing —
    // so it names the row it created and the service re-reads it org-scoped.
    if ((body as { source?: unknown })?.source === "event_idea") {
      const input = recordEventIdeaApprovalInput.parse(body);
      return Response.json(await recordEventIdeaApproval(ctx, input.eventId), { status: 201 });
    }
    const input = recordApprovalInput.parse(body);
    return Response.json(await recordChatApproval(ctx, input), { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/ai/approvals", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
