import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { approveJoinRequest } from "@/lib/services/join-request-service";
import { approveJoinRequestInput } from "@/lib/validation/join-request";
import { logError } from "@/lib/observability";

// Admit someone, optionally with a role. This is the ONLY path that creates a
// roster spot — the officer-typed one was removed with the flow it replaced.
//
// Two failures worth knowing about, both mapped by toResponse:
//   402  the org is out of seats (PaymentRequiredError)
//   403  the chosen role ranks at or above the approver's own (ForbiddenError)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_BROTHERS" });
  if (error) return error;
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) throw new ValidationError("Invalid ID");
    const body = await req.json().catch(() => ({}));
    const input = approveJoinRequestInput.parse(body);
    return Response.json(await approveJoinRequest(ctx, numId, input));
  } catch (e) {
    logError(e, { route: "/api/join-requests/[id]/approve", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
