import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { createTransactionInput } from "@/lib/validation/transaction";
import { createTransaction, listTransactions } from "@/lib/services/transaction-service";
import { logError } from "@/lib/observability";

export async function GET(req: NextRequest) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const { searchParams } = new URL(req.url);
    const transactions = await listTransactions(ctx, {
      type:     searchParams.get("type")     ?? undefined,
      semester: searchParams.get("semester") ?? undefined,
      category: searchParams.get("category") ?? undefined,
    });
    return Response.json(transactions);
  } catch (e) {
    logError(e, { route: "/api/transactions", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_TREASURY" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = createTransactionInput.parse(body);
    const tx = await createTransaction(ctx, input);
    return Response.json(tx, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/transactions", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
