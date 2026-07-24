import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { recordApprovalInput, listApprovalsQuery } from "@/lib/validation/ai";
import { recordChatApproval, listChatApprovals } from "@/lib/services/chat-approval-service";
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
    const input = recordApprovalInput.parse(body);
    return Response.json(await recordChatApproval(ctx, input), { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/ai/approvals", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
