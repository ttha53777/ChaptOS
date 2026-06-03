import { z } from "zod";

// Same guard as the transaction validator: both fields feed BigInt cents
// mirrors via BigInt(Math.round(value * 100)) in budget-service, which throws
// on non-finite input. Cap at ±$1B — well beyond any real chapter budget.
const MAX_AMOUNT = 1_000_000_000;

export const upsertBudgetInput = z.object({
  semester:          z.string().min(1),
  carryoverBalance:  z.coerce.number().finite().min(-MAX_AMOUNT).max(MAX_AMOUNT),
  reserveAmount:     z.coerce.number().finite().nonnegative().max(MAX_AMOUNT),
  allocations:       z.array(z.object({
    category: z.string().min(1),
    percent:  z.number().min(0).max(100),
  })),
});
export type UpsertBudgetInput = z.infer<typeof upsertBudgetInput>;
