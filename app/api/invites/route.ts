import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { createInviteInput } from "@/lib/validation/invite";
import { createInvite, listInvites } from "@/lib/services/invite-service";
import { logError } from "@/lib/observability";

// Invite links are credentials, so both list and create require MANAGE_SETTINGS
// (org/platform admins bypass via buildContext).

export async function GET() {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_SETTINGS", rateLimit: false });
  if (error) return error;
  try {
    return Response.json(await listInvites(ctx));
  } catch (e) {
    logError(e, { route: "/api/invites", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_SETTINGS" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = createInviteInput.parse(body);
    const invite = await createInvite(ctx, input);
    return Response.json(invite, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/invites", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
