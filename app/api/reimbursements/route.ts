import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { createReimbursementInput } from "@/lib/validation/reimbursement";
import { listReimbursements, createReimbursement } from "@/lib/services/reimbursement-service";
import { logError } from "@/lib/observability";

export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const reimbursements = await listReimbursements(ctx);
    return Response.json(reimbursements);
  } catch (e) {
    logError(e, { route: "/api/reimbursements", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = createReimbursementInput.parse(body);
    const r = await createReimbursement(ctx, input);
    return Response.json(r, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/reimbursements", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
