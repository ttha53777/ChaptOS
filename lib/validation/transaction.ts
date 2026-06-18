import { z } from "zod";
import { DATE_RE } from "@/lib/dates";

const MAX_AMOUNT = 1_000_000_000;
const money = z.coerce.number().finite().nonnegative().max(MAX_AMOUNT);

export const createTransactionInput = z.object({
  type:             z.enum(["income", "expense"]),
  category:         z.string().min(1),
  amount:           money,
  date:             z.string().regex(DATE_RE, "date must use YYYY-MM-DD format"),
  description:      z.string().min(1),
  paymentMethod:    z.string().optional().nullable(),
  semester:         z.string().optional().nullable(),
  status:           z.enum(["posted", "scheduled"]).optional().default("posted"),
  calendarEventIds: z.array(z.number().int().positive()).optional().default([]),
});
export type CreateTransactionInput = z.infer<typeof createTransactionInput>;

export const updateTransactionInput = z.object({
  type:             z.enum(["income", "expense"]).optional(),
  category:         z.string().min(1).optional(),
  amount:           money.optional(),
  date:             z.string().regex(DATE_RE).optional(),
  description:      z.string().min(1).optional(),
  paymentMethod:    z.string().nullable().optional(),
  semester:         z.string().nullable().optional(),
  status:           z.enum(["posted", "scheduled"]).optional(),
  calendarEventIds: z.array(z.number().int().positive()).optional(),
});
export type UpdateTransactionInput = z.infer<typeof updateTransactionInput>;
