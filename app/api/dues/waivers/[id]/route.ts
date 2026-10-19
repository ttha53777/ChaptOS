import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { voidDuesWaiver } from "@/lib/services/dues-charge-service";

// Undo a waiver: the amount goes back on their tab.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_TREASURY" });
  if (error) return error;
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError("Invalid ID");
    return Response.json(await voidDuesWaiver(ctx, id));
  } catch (e) {
    logError(e, { route: "/api/dues/waivers/[id]", method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
