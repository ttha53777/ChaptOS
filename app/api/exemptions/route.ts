import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { setExemptionInput } from "@/lib/validation/exemption";
import { listExemptions, setExemption } from "@/lib/services/exemption-service";
import { logError } from "@/lib/observability";

export async function GET(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_ATTENDANCE", rateLimit: false });
  if (error) return error;
  try {
    const { searchParams } = new URL(req.url);
    const semesterParam = searchParams.get("semesterId");
    const semesterId = semesterParam ? Number(semesterParam) : undefined;
    const exemptions = await listExemptions(ctx, {
      semesterId: semesterId && Number.isInteger(semesterId) && semesterId > 0 ? semesterId : undefined,
    });
    return Response.json(exemptions);
  } catch (e) {
    logError(e, { route: "/api/exemptions", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_ATTENDANCE" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = setExemptionInput.parse(body);
    const result = await setExemption(ctx, input);
    return Response.json(result);
  } catch (e) {
    logError(e, { route: "/api/exemptions", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
