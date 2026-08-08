import { z } from "zod";
import { TRANSACTION_TYPES } from "@/lib/state";
import { HEX_RE } from "@/lib/validation/event-types";

const kindSchema = z
  .string()
  .refine((v): v is (typeof TRANSACTION_TYPES)[number] => (TRANSACTION_TYPES as readonly string[]).includes(v), {
    message: "kind must be \"income\" or \"expense\"",
  });

/**
 * Note there is no `slug` field, unlike createEventTypeInput: the client sends a
 * LABEL and the server derives the slug (slugifyCategory) and de-dupes it. A
 * client-chosen slug could collide with a legacy value like "Party Supplies" or
 * shadow a reserved one, and nothing about a slug is a user-facing choice.
 *
 * That is also why no kebab-case regex lives here — legacy slugs are Title Case
 * with spaces, and only server-minted slugs are format-checked, by construction.
 */
export const createTransactionCategoryInput = z.object({
  kind:         kindSchema,
  label:        z.string().trim().min(1).max(40),
  color:        z.string().trim().regex(HEX_RE, "Color must be a 6-digit hex like #3f6ea3").optional(),
  colorDark:    z.string().trim().regex(HEX_RE, "colorDark must be a 6-digit hex").nullable().optional(),
  displayOrder: z.number().int().min(0).optional(),
});

export type CreateTransactionCategoryInput = z.infer<typeof createTransactionCategoryInput>;

/**
 * `slug` and `kind` are both excluded, and that exclusion is where their
 * immutability is actually enforced. slug keys every ledger row already filed
 * under it; moving a category across the ledger would orphan all of them.
 * `hidden` IS a valid PATCH — the service guards it for reserved rows.
 */
export const updateTransactionCategoryInput = createTransactionCategoryInput
  .omit({ kind: true })
  .partial()
  .extend({ hidden: z.boolean().optional() });

export type UpdateTransactionCategoryInput = z.infer<typeof updateTransactionCategoryInput>;
