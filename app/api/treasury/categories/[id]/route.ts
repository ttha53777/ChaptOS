import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { updateTransactionCategoryInput } from "@/lib/validation/transaction-categories";
import {
  deleteTransactionCategory,
  updateTransactionCategory,
} from "@/lib/services/transaction-category-service";
import { logError } from "@/lib/observability";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_TREASURY" });
  if (error) return error;
  const { id } = await params;
  const numId = parseInt(id, 10);
  try {
    const body = await req.json().catch(() => ({}));
    const input = updateTransactionCategoryInput.parse(body);
    const category = await updateTransactionCategory(ctx, numId, input);
    return Response.json(category);
  } catch (e) {
    logError(e, { route: `/api/treasury/categories/${id}`, method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_TREASURY" });
  if (error) return error;
  const { id } = await params;
  const numId = parseInt(id, 10);
  try {
    await deleteTransactionCategory(ctx, numId);
    return new Response(null, { status: 204 });
  } catch (e) {
    logError(e, { route: `/api/treasury/categories/${id}`, method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
