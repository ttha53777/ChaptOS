import { z } from "zod";
import { DATE_RE } from "@/lib/dates";
import { TRANSACTION_TYPES, TRANSACTION_STATUSES, TransactionStatus } from "@/lib/state";

const MAX_AMOUNT = 1_000_000_000;
const money = z.coerce.number().finite().nonnegative().max(MAX_AMOUNT);

const txType   = () => z.enum(TRANSACTION_TYPES    as readonly [string, ...string[]]);
const txStatus = () => z.enum(TRANSACTION_STATUSES as readonly [string, ...string[]]);

export const createTransactionInput = z.object({
  type:             txType(),
  category:         z.string().min(1),
  amount:           money,
  date:             z.string().regex(DATE_RE, "date must use YYYY-MM-DD format"),
  description:      z.string().min(1),
  paymentMethod:    z.string().optional().nullable(),
  semester:         z.string().optional().nullable(),
  status:           txStatus().optional().default(TransactionStatus.Posted),
  calendarEventIds: z.array(z.number().int().positive()).optional().default([]),
});
export type CreateTransactionInput = z.infer<typeof createTransactionInput>;

export const updateTransactionInput = z.object({
  type:             txType().optional(),
  category:         z.string().min(1).optional(),
  amount:           money.optional(),
  date:             z.string().regex(DATE_RE).optional(),
  description:      z.string().min(1).optional(),
  paymentMethod:    z.string().nullable().optional(),
  semester:         z.string().nullable().optional(),
  status:           txStatus().optional(),
  calendarEventIds: z.array(z.number().int().positive()).optional(),
});
export type UpdateTransactionInput = z.infer<typeof updateTransactionInput>;
