import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { grantRoleInput } from "@/lib/validation/role";
import { grantRole } from "@/lib/services/role-service";
import { logError } from "@/lib/observability";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_ROLES" });
  if (error) return error;
  try {
    const { id } = await params;
    const brotherId = Number(id);
    if (!Number.isInteger(brotherId) || brotherId <= 0) throw new ValidationError("Invalid brother ID");
    const body = await req.json().catch(() => ({}));
    const input = grantRoleInput.parse(body);
    const result = await grantRole(ctx, brotherId, input.roleId);
    return Response.json(result, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/brothers/[id]/roles", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
