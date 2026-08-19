import { z } from "zod";
import { DATE_RE } from "@/lib/dates";
import { MAX_EVENT_FIELDS } from "@/lib/event-fields";
import { STAGES } from "@/lib/state/programming-stage";
import { CATEGORY_SLUG_RE } from "./calendar";
import { httpsUrl } from "./shared";

const optionalHttpsUrl = httpsUrl("URL must be valid http(s)").nullable().optional();

// `category` is a CalendarEventType slug; whether the org actually has that
// type (and it's programming-managed) is checked in the service, per-org.
const categorySlug = z.string().trim().min(1).max(50).regex(CATEGORY_SLUG_RE);

/**
 * An event is owned by a person OR a role, never both. The refine states that
 * where a schema can — the DB pair is two nullable FKs with nothing stopping a
 * caller from setting both, and "owned by two different things" has no meaning
 * the gate could act on. Whether the ids belong to THIS org is the service's job.
 */
const ownerBrotherId = z.number().int().positive().nullable().optional();
const ownerRoleId    = z.number().int().positive().nullable().optional();

const oneOwnerOnly = <T extends { ownerBrotherId?: number | null; ownerRoleId?: number | null }>(v: T) =>
  !(v.ownerBrotherId != null && v.ownerRoleId != null);
const oneOwnerMessage = { message: "An event is owned by a person or a role, not both" };

// New events start in the Idea stage, where most fields are optional —
// they only become required when promoting (handled by the gates in setStage).
export const createProgrammingTaskInput = z.object({
  title:    z.string().trim().min(1).max(200),
  dueDate:  z.string().regex(DATE_RE).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  time:     z.string().trim().max(50).nullable().optional(),
  collab:   z.string().trim().max(200).nullable().optional(),
  ownerBrotherId,
  ownerRoleId,
  status:   z.string().min(1).optional(),
  category: categorySlug,
  mandatory: z.boolean().optional(),
}).refine(oneOwnerOnly, oneOwnerMessage);
export type CreateProgrammingTaskInput = z.infer<typeof createProgrammingTaskInput>;

export const updateProgrammingTaskInput = z.object({
  title:           z.string().trim().min(1).max(200).optional(),
  dueDate:         z.string().regex(DATE_RE).nullable().optional(),
  location:        z.string().trim().max(200).nullable().optional(),
  time:            z.string().trim().max(50).nullable().optional(),
  collab:          z.string().trim().max(200).nullable().optional(),
  ownerBrotherId,
  ownerRoleId,
  status:          z.string().min(1).optional(),
  category:        categorySlug.optional(),
  mandatory:       z.boolean().optional(),
  description:     z.string().max(5000).nullable().optional(),
  attachmentUrl:   optionalHttpsUrl,
  attachmentDocId: z.number().int().positive().nullable().optional(),
  // Answers to the org's own optional fields. Deliberately unknown-valued: the
  // shape a slug accepts depends on that field's `kind`, which only the service
  // knows (it holds the live definitions), so coercion and truncation happen
  // there via sanitizeFieldValues rather than being duplicated — and drifting —
  // here.
  fieldValues:     z.record(z.string(), z.unknown()).optional(),
  // Which optional fields this ONE event has opted out of. Sent as the whole set
  // rather than a delta, so the request states a destination instead of a nudge.
  // Unknown slugs are dropped by the service against the live definitions, for
  // the same reason fieldValues is unknown-valued here.
  detachedFields:  z.array(z.string().max(64)).max(MAX_EVENT_FIELDS).optional(),
  spendingCents:   z.number().int().min(0).max(999_999_999).optional(),
  successRating:   z.number().int().min(1).max(5).nullable().optional(),
  wrapUpNotes:     z.string().max(5000).nullable().optional(),
}).refine(oneOwnerOnly, oneOwnerMessage);
export type UpdateProgrammingTaskInput = z.infer<typeof updateProgrammingTaskInput>;

export const attachProgrammingDocInput = z.object({
  title:       z.string().trim().min(1).max(200),
  url:         httpsUrl("URL must be valid http(s)"),
  description: z.string().max(2000).optional().nullable(),
});
export type AttachProgrammingDocInput = z.infer<typeof attachProgrammingDocInput>;

export const setStageInput = z.object({
  stage: z.enum(STAGES),
});
export type SetStageInput = z.infer<typeof setStageInput>;
