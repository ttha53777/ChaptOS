import { z } from "zod";

export const upsertBudgetInput = z.object({
  semester:          z.string().min(1),
  carryoverBalance:  z.coerce.number(),
  reserveAmount:     z.coerce.number().nonnegative(),
  allocations:       z.array(z.object({
    category: z.string().min(1),
    percent:  z.number().min(0).max(100),
  })),
});
export type UpsertBudgetInput = z.infer<typeof upsertBudgetInput>;
