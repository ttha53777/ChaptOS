import { z } from "zod";

// Custom field values — values are validated against org definitions server-side
// in the service layer. We accept a loose record here and sanitize tightly there.
const customFieldsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional();

export const createBrotherInput = z.object({
  name:         z.string().min(1).max(200),
  role:         z.string().min(1),
  // The opening balance a member joins the roster owing. Legitimate here — it's an
  // assessment at the moment of creation, and no money has moved, so there is nothing
  // to reconcile against yet. AFTER creation the balance is not a field you can write:
  // see updateBrotherInput below.
  duesOwed:     z.coerce.number().nonnegative(),
  gpa:          z.coerce.number().nonnegative(),
  serviceHours: z.coerce.number().nonnegative(),
  // Custom field initial values are optional at creation — fields can be
  // filled in from the drawer immediately after the brother is added.
  customFields: customFieldsSchema,
});
export type CreateBrotherInput = z.infer<typeof createBrotherInput>;

// `duesOwed` is deliberately not here. It is a money balance mirrored by the Transaction
// ledger, and overwriting it moves one book without the other — the drift this codebase
// exists to have fixed. Zod strips unknown keys, so a stray PATCH carrying it is a
// no-op rather than a silent corruption. Move a balance via POST /api/dues/payments
// (records the money AND the ledger row) or POST /api/dues/adjustments (a charge or
// waiver, audited, no money moved).
export const updateBrotherInput = z.object({
  name:         z.string().min(1).optional(),
  role:         z.string().min(1).optional(),
  gpa:          z.coerce.number().nonnegative().optional(),
  serviceHours: z.coerce.number().nonnegative().optional(),
  customFields: customFieldsSchema,
});
export type UpdateBrotherInput = z.infer<typeof updateBrotherInput>;
