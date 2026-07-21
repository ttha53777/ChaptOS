import { z } from "zod";
import { ALL_WORKFLOWS, type WorkflowId } from "@/lib/org-types";

// Exported so the create-org blueprint's event-type block (lib/validation/org.ts)
// validates slugs and colors with the identical rules instead of a second copy
// that could drift.
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const workflowIdSchema = z
  .string()
  .refine((v): v is WorkflowId => (ALL_WORKFLOWS as readonly string[]).includes(v), {
    message: "Unknown workflow id",
  });

export const createEventTypeInput = z.object({
  slug:             z.string().trim().min(1).max(50).regex(SLUG_RE, "Slug must be lowercase kebab-case (e.g. rush-event)"),
  label:            z.string().trim().min(1).max(40),
  color:            z.string().trim().regex(HEX_RE, "Color must be a 6-digit hex like #3f6ea3"),
  colorDark:        z.string().trim().regex(HEX_RE, "colorDark must be a 6-digit hex").nullable().optional(),
  workflowId:       workflowIdSchema.nullable().optional(),
  mandatoryDefault: z.boolean().optional(),
  displayOrder:     z.number().int().min(0).optional(),
});

export type CreateEventTypeInput = z.infer<typeof createEventTypeInput>;

// slug is intentionally excluded — immutable after creation (built-in slugs are
// hardcoded in behavior branches; custom slugs key existing events). `hidden` is
// a valid PATCH: the service guards it (an active built-in can't be hidden).
export const updateEventTypeInput = createEventTypeInput
  .omit({ slug: true })
  .partial()
  .extend({ hidden: z.boolean().optional() });

export type UpdateEventTypeInput = z.infer<typeof updateEventTypeInput>;
