import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { createRoleInput } from "@/lib/validation/role";
import { createRole, listRoles } from "@/lib/services/role-service";
import { logError } from "@/lib/observability";

export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    return Response.json(await listRoles(ctx));
  } catch (e) {
    logError(e, { route: "/api/roles", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_ROLES" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = createRoleInput.parse(body);
    const role = await createRole(ctx, input);
    return Response.json(role, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/roles", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
