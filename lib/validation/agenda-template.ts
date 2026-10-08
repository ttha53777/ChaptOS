import { z } from "zod";
import { AGENDA_TEMPLATE_CATEGORIES, type AgendaTemplateCategory } from "@/lib/state";
import { AGENDA_BODY_MAX, AGENDA_DESCRIPTION_MAX, AGENDA_NAME_MAX } from "@/lib/agenda-template";

const categorySchema = z
  .string()
  .refine((v): v is AgendaTemplateCategory => (AGENDA_TEMPLATE_CATEGORIES as readonly string[]).includes(v), {
    message: `category must be one of ${AGENDA_TEMPLATE_CATEGORIES.join(", ")}`,
  });

// Unknown {{fields}} are checked in the service, not here, so the 400 can name them.
export const createAgendaTemplateInput = z.object({
  name:        z.string().trim().min(1, "Name the template").max(AGENDA_NAME_MAX),
  description: z.string().trim().max(AGENDA_DESCRIPTION_MAX).optional(),
  category:    categorySchema,
  body:        z.string().max(AGENDA_BODY_MAX).refine(v => v.trim().length > 0, { message: "Write some agenda first" }),
  isDefault:   z.boolean().optional(),
});

export type CreateAgendaTemplateInput = z.infer<typeof createAgendaTemplateInput>;

/**
 * `archived: false` is the Undo of a DELETE. `expectedUpdatedAt` is the
 * updatedAt the editor opened; when it no longer matches, someone else saved
 * in between and the PATCH is refused rather than silently overwriting them.
 */
export const updateAgendaTemplateInput = createAgendaTemplateInput.partial().extend({
  archived:          z.literal(false).optional(),
  expectedUpdatedAt: z.iso.datetime().optional(),
});

export type UpdateAgendaTemplateInput = z.infer<typeof updateAgendaTemplateInput>;

export const agendaTemplateId = z.coerce.number().int().positive();
