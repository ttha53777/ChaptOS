import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { clearExemption } from "@/lib/services/exemption-service";
import { logError } from "@/lib/observability";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ brotherId: string }> },
) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_ATTENDANCE" });
  if (error) return error;
  try {
    const { brotherId } = await params;
    const numId = Number(brotherId);
    if (!Number.isInteger(numId) || numId <= 0) throw new ValidationError("Invalid brotherId");

    const { searchParams } = new URL(req.url);
    const semesterParam = searchParams.get("semesterId");
    const semesterId = semesterParam ? Number(semesterParam) : undefined;

    const result = await clearExemption(
      ctx,
      numId,
      semesterId && Number.isInteger(semesterId) && semesterId > 0 ? semesterId : undefined,
    );
    return Response.json(result);
  } catch (e) {
    logError(e, { route: "/api/exemptions/[brotherId]", method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
