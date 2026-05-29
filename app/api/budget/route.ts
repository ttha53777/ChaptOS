import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { upsertBudgetInput } from "@/lib/validation/budget";
import { getBudget, upsertBudget } from "@/lib/services/budget-service";
import { logError } from "@/lib/observability";

export async function GET(req: NextRequest) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const { searchParams } = new URL(req.url);
    const semester = searchParams.get("semester");
    if (!semester) throw new ValidationError("semester is required");
    const budget = await getBudget(ctx, semester);
    if (!budget) return Response.json(null);
    return Response.json({
      semester:         budget.semester,
      carryoverBalance: budget.carryoverBalance,
      reserveAmount:    budget.reserveAmount,
      allocations:      budget.allocations.map(a => ({ category: a.category, percent: a.percent })),
    });
  } catch (e) {
    logError(e, { route: "/api/budget", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function PUT(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_TREASURY" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = upsertBudgetInput.parse(body);
    const budget = await upsertBudget(ctx, input);
    return Response.json({
      semester:         budget.semester,
      carryoverBalance: budget.carryoverBalance,
      reserveAmount:    budget.reserveAmount,
      allocations:      budget.allocations.map(a => ({ category: a.category, percent: a.percent })),
    });
  } catch (e) {
    logError(e, { route: "/api/budget", method: "PUT", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
