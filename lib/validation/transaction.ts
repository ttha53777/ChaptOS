import { z } from "zod";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const createTransactionInput = z.object({
  type:          z.enum(["income", "expense"]),
  category:      z.string().min(1),
  amount:        z.coerce.number().nonnegative(),
  date:          z.string().regex(DATE_RE, "date must use YYYY-MM-DD format"),
  description:   z.string().min(1),
  paymentMethod: z.string().optional().nullable(),
  paidTo:        z.string().optional().nullable(),
  semester:      z.string().optional().nullable(),
});
export type CreateTransactionInput = z.infer<typeof createTransactionInput>;

export const updateTransactionInput = z.object({
  type:          z.enum(["income", "expense"]).optional(),
  category:      z.string().min(1).optional(),
  amount:        z.coerce.number().nonnegative().optional(),
  date:          z.string().regex(DATE_RE).optional(),
  description:   z.string().min(1).optional(),
  paymentMethod: z.string().nullable().optional(),
  paidTo:        z.string().nullable().optional(),
  semester:      z.string().nullable().optional(),
});
export type UpdateTransactionInput = z.infer<typeof updateTransactionInput>;
