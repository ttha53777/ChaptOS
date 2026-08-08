import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { createTransactionCategoryInput } from "@/lib/validation/transaction-categories";
import {
  createTransactionCategory,
  listTransactionCategories,
} from "@/lib/services/transaction-category-service";
import { logError } from "@/lib/observability";

// No permission gate on the read: every member's ledger view needs the full set to
// resolve the label and color of transactions already on the books.
export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    return Response.json(await listTransactionCategories(ctx));
  } catch (e) {
    logError(e, { route: "/api/treasury/categories", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_TREASURY" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = createTransactionCategoryInput.parse(body);
    const category = await createTransactionCategory(ctx, input);
    return Response.json(category, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/treasury/categories", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
