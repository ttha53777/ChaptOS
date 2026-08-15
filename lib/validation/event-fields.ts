import { z } from "zod";
import { FIELD_KINDS, MAX_FIELD_LABEL } from "@/lib/event-fields";

/**
 * Note there is no `slug` field: the client sends a LABEL and the server derives
 * the slug (deriveFieldSlug) and de-dupes it. A client-chosen slug could shadow a
 * built-in — an org-defined "budget" sitting on top of the reserved Budget field
 * would quietly capture every event's answers — and nothing about a slug is a
 * user-facing choice.
 *
 * This is the one real divergence from lib/custom-member-fields.ts, which DOES
 * accept a client id, and whose "add a field" button has consequently been 400ing
 * on `id: ""` against its own `.refine(isValidFieldId)` since it shipped.
 */
export const createEventFieldInput = z.object({
  label:        z.string().trim().min(1).max(MAX_FIELD_LABEL),
  kind:         z.enum(FIELD_KINDS),
  enabled:      z.boolean().optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
});
export type CreateEventFieldInput = z.infer<typeof createEventFieldInput>;

/**
 * `kind` is excluded, and that exclusion is where its immutability is enforced.
 *
 * The slug keys every answer already filed under it, and retyping a field that
 * fifteen events have answered has no safe interpretation — "$400" read as a
 * boolean is not a migration, it is data loss. Renaming is free and does the job
 * an officer actually wants (the label moves; the answers stay put), so the
 * escape hatch is: rename it, or add a new field and disable this one.
 *
 * `enabled` IS a valid PATCH — the service guards it for builtin rows.
 */
export const updateEventFieldInput = createEventFieldInput.omit({ kind: true }).partial();
export type UpdateEventFieldInput = z.infer<typeof updateEventFieldInput>;
