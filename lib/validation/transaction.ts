import { z } from "zod";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Money cap. The service multiplies by 100 and stores into a BigInt cents
// mirror; an Infinity or astronomically large value would make
// BigInt(Math.round(amount * 100)) throw a RangeError (→ opaque 500) or corrupt
// the Float column. Reject non-finite up front and cap at $1B, which is far
// above any real chapter transaction while staying safely within Number range.
const MAX_AMOUNT = 1_000_000_000;
const money = z.coerce.number().finite().nonnegative().max(MAX_AMOUNT);

export const createTransactionInput = z.object({
  type:          z.enum(["income", "expense"]),
  category:      z.string().min(1),
  amount:        money,
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
  amount:        money.optional(),
  date:          z.string().regex(DATE_RE).optional(),
  description:   z.string().min(1).optional(),
  paymentMethod: z.string().nullable().optional(),
  paidTo:        z.string().nullable().optional(),
  semester:      z.string().nullable().optional(),
});
export type UpdateTransactionInput = z.infer<typeof updateTransactionInput>;
