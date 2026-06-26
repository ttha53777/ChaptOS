import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { createPollInput } from "@/lib/validation/poll";
import { createPoll, listPolls } from "@/lib/services/poll-service";
import { logError } from "@/lib/observability";

export async function GET(req: NextRequest) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const url = new URL(req.url);
    const mine = url.searchParams.get("assignee") === "me";
    const status = url.searchParams.get("status") ?? undefined;
    return Response.json(await listPolls(ctx, { mine, status }));
  } catch (e) {
    logError(e, { route: "/api/polls", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  // Creating/assigning requires MANAGE_POLLS (also enforced in the service so the
  // permission story stays in one place).
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_POLLS" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = createPollInput.parse(body);
    const poll = await createPoll(ctx, input);
    return Response.json(poll, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/polls", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
