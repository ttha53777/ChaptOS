import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ValidationError } from "@/lib/errors";
import { EXPENSE_CATEGORIES } from "@/app/data";
import type { UpsertBudgetInput } from "@/lib/validation/budget";

const VALID_CATEGORIES = new Set<string>(EXPENSE_CATEGORIES);

export async function getBudget(ctx: RequestContext, semester: string) {
  return ctx.db.budget.findUniqueWithAllocations(semester);
}

export async function upsertBudget(ctx: RequestContext, input: UpsertBudgetInput) {
  const seen = new Set<string>();
  for (const a of input.allocations) {
    if (!VALID_CATEGORIES.has(a.category)) throw new ValidationError(`Invalid category: ${a.category}`);
    if (seen.has(a.category)) throw new ValidationError(`Duplicate category: ${a.category}`);
    seen.add(a.category);
  }
  const total = input.allocations.reduce((s, a) => s + a.percent, 0);
  if (Math.abs(total - 100) > 0.01 && total !== 0) {
    throw new ValidationError(`Allocation percents must sum to 100 (got ${total.toFixed(2)})`);
  }

  const orgId = ctx.orgId;
  const result = await ctx.db.$transaction(async (tx) => {
    const budget = await tx.budget.upsert({
      where:  { organizationId_semester: { organizationId: orgId, semester: input.semester } },
      create: {
        organizationId:       orgId,
        semester:             input.semester,
        carryoverBalance:     input.carryoverBalance,
        carryoverBalanceCents: BigInt(Math.round(input.carryoverBalance * 100)),
        reserveAmount:        input.reserveAmount,
        reserveAmountCents:   BigInt(Math.round(input.reserveAmount * 100)),
      },
      update: {
        carryoverBalance:     input.carryoverBalance,
        carryoverBalanceCents: BigInt(Math.round(input.carryoverBalance * 100)),
        reserveAmount:        input.reserveAmount,
        reserveAmountCents:   BigInt(Math.round(input.reserveAmount * 100)),
      },
    });
    await tx.budgetAllocation.deleteMany({ where: { budgetId: budget.id } });
    if (input.allocations.length > 0) {
      await tx.budgetAllocation.createMany({
        data: input.allocations.map(a => ({ budgetId: budget.id, category: a.category, percent: a.percent })),
      });
    }
    // Omit the *Cents BigInt mirrors — not JSON-serializable, not read by any
    // consumer (the Float carryoverBalance/reserveAmount are the live values).
    return tx.budget.findUnique({
      where: { id: budget.id },
      include: { allocations: true },
      omit: { carryoverBalanceCents: true, reserveAmountCents: true },
    });
  });

  if (!result) throw new ValidationError("Failed to upsert budget");

  await emit(ctx, "budget.upserted", { type: "Budget", id: result.id }, {
    semester:        result.semester,
    allocationCount: result.allocations.length,
  });

  return result;
}
