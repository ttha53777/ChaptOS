import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { activateSemester, updateSemester } from "@/lib/services/semester-service";
import { updateSemesterInput } from "@/lib/validation/semester";
import { logError } from "@/lib/observability";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_SEMESTERS" });
  if (error) return error;
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) throw new ValidationError("Invalid ID");

    // A body with label/date fields is an update-and-activate (the gate's "extend
    // current" action). An empty/absent body is a bare activate (Settings'
    // "set active" button), which sends no body at all.
    const body = await req.json().catch(() => ({}));
    const hasFields = body && typeof body === "object" && Object.keys(body).length > 0;
    if (hasFields) {
      const input = updateSemesterInput.parse(body);
      return Response.json(await updateSemester(ctx, numId, input));
    }
    return Response.json(await activateSemester(ctx, numId));
  } catch (e) {
    logError(e, { route: "/api/semesters/[id]", method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
