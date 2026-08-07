import { z } from "zod";

// Custom field values — values are validated against org definitions server-side
// in the service layer. We accept a loose record here and sanitize tightly there.
const customFieldsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional();

// There is no createBrotherInput. Officers can no longer type a person onto the
// roster: a roster spot is created by approving a JoinRequest, which is the only
// path that produces one (lib/services/join-request-service.ts). See
// lib/validation/join-request.ts for the approval input.

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
  // Archive / restore. A boolean rather than a timestamp so the caller can't
  // backdate it, and so "is this person active?" stays a yes/no question at the
  // API boundary. Archiving keeps every attendance record, dues row and metric
  // value intact — it only removes the member from the default roster read and
  // from the billable headcount. Restoring re-adds a billable seat and is
  // therefore gated by the same seat check as adding a new member.
  archived:     z.boolean().optional(),
});
export type UpdateBrotherInput = z.infer<typeof updateBrotherInput>;
