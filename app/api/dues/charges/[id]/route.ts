import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { updateDuesCharge, voidDuesCharge } from "@/lib/services/dues-charge-service";
import { updateDuesChargeInput } from "@/lib/validation/dues";

function chargeId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError("Invalid ID");
  return id;
}

// Rename a charge, move its due date, change its note.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_TREASURY" });
  if (error) return error;
  try {
    const id = chargeId((await params).id);
    const body = await req.json().catch(() => ({}));
    await updateDuesCharge(ctx, id, updateDuesChargeInput.parse(body));
    return new Response(null, { status: 204 });
  } catch (e) {
    logError(e, { route: "/api/dues/charges/[id]", method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

// Take a charge back (the Undo after handing it out). 409 once anyone has paid toward it.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_TREASURY" });
  if (error) return error;
  try {
    await voidDuesCharge(ctx, chargeId((await params).id));
    return new Response(null, { status: 204 });
  } catch (e) {
    logError(e, { route: "/api/dues/charges/[id]", method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
