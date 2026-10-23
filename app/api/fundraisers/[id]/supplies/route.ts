import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { addSupplyInput } from "@/lib/validation/fundraiser";
import { addSupply } from "@/lib/services/fundraiser-service";
import { logError } from "@/lib/observability";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_FUNDRAISING" });
  if (error) return error;
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError("Invalid ID");
    const body = await req.json().catch(() => ({}));
    return Response.json(await addSupply(ctx, id, addSupplyInput.parse(body)), { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/fundraisers/[id]/supplies", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
