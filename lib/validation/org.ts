import { z } from "zod";
import { MAX_SLUG_LEN, MIN_SLUG_LEN } from "@/lib/slug-rules";
import { ORG_TYPE_IDS, ALL_WORKFLOWS, type WorkflowId } from "@/lib/org-types";
import { featureExists } from "@/lib/workflow-features";
import { isValidFieldId, MAX_FIELDS, MAX_LABEL } from "@/lib/custom-member-fields";

// Input for POST /api/orgs (self-serve org creation).
//
// Format-only checks here. Two checks still happen server-side after parsing:
//   * Slug uniqueness (DB query) — can't be done in Zod.
//   * Reserved-slug + profanity-list check — done with validateSlugFormat()
//     so the same rules also apply to the live slug-check endpoint.
//
// We deliberately do NOT lowercase or sanitize input here. The route returns
// a clear 400 for bad casing/whitespace so the client can surface the exact
// reason rather than silently mutating user input.
export const createOrgInput = z.object({
  name:        z.string().trim().min(1, "Organization name is required").max(120, "Name must be at most 120 characters"),
  slug:        z.string().trim().min(MIN_SLUG_LEN).max(MAX_SLUG_LEN),
  orgType:     z.string().refine((v) => ORG_TYPE_IDS.includes(v), { message: "Unknown organization type" }),
  founderName: z.string().trim().min(1, "Your name is required").max(120, "Name must be at most 120 characters"),
});

export type CreateOrgInput = z.infer<typeof createOrgInput>;

// Input for PATCH /api/orgs/[slug]/config — the post-creation page picker and
// any future Settings surface that toggles enabled workflows.
//
// `enabledWorkflows` is the full desired set (a replace, not a patch). Each id
// must be a known WorkflowId; unknown ids are rejected rather than silently
// dropped so a typo surfaces as a 400. The service layer enforces the always-on
// workflows (it appends "operations" and the mandatory surfaces), so callers
// can't accidentally disable core plumbing by omitting it here.
// Member-status thresholds. A full replace of the org's cutoff set (mirrors the
// vocab/workflow fields: present → mutate, absent → leave alone). Bounds match
// lib/thresholds.ts so a value the resolver would reject can't be persisted.
export const thresholdsInput = z.object({
  attendanceAtRisk: z.number().min(0).max(100),
  attendanceWatch:  z.number().min(0).max(100),
  gpaAtRisk:        z.number().min(0).max(4),
  gpaWatch:         z.number().min(0).max(4),
  serviceHoursGoal: z.number().min(0).max(1000),
});

// ─── Custom member field definitions ─────────────────────────────────────────

const fieldTypeSchema = z.enum(["text", "number", "select"]);

export const customMemberFieldDefSchema = z.object({
  id:           z.string().refine(isValidFieldId, { message: "Field id must be 1-48 lowercase alphanumeric/underscore chars" }),
  label:        z.string().min(1, "Label is required").max(MAX_LABEL, `Label must be ${MAX_LABEL} chars or fewer`),
  type:         fieldTypeSchema.default("text"),
  required:     z.boolean().default(false),
  showOnRoster: z.boolean().default(false),
  rosterOrder:  z.number().int().min(0).max(99).default(0),
  placeholder:  z.string().max(120).optional(),
  options:      z.array(z.string().max(64)).max(20).optional(),
});

export const customMemberFieldsInput = z
  .array(customMemberFieldDefSchema)
  .max(MAX_FIELDS, `Cannot define more than ${MAX_FIELDS} custom fields`);

export type CustomMemberFieldDefInput = z.infer<typeof customMemberFieldDefSchema>;

// ─── Org config update ────────────────────────────────────────────────────────

export const updateOrgConfigInput = z.object({
  enabledWorkflows: z
    .array(
      z
        .string()
        .refine((v): v is WorkflowId => (ALL_WORKFLOWS as readonly string[]).includes(v), {
          message: "Unknown workflow",
        }),
    )
    .max(ALL_WORKFLOWS.length, "Too many workflows")
    .optional(),
  vocabularyOverrides: z
    .record(z.string(), z.string().trim().max(40, "Label must be 40 characters or fewer"))
    .optional(),
  thresholds: thresholdsInput.optional(),
  // OPT-OUT map of workflow id → feature ids the org has hidden. Keys must be
  // known workflows; each value's ids must be registered features of that
  // workflow (featureExists). A full replace like the other fields: present →
  // mutate, absent → leave alone. The service normalizes (drops unknowns/empties)
  // as defense in depth.
  disabledFeatures: z
    .record(
      z.string().refine((v): v is WorkflowId => (ALL_WORKFLOWS as readonly string[]).includes(v), {
        message: "Unknown workflow",
      }),
      z.array(z.string()),
    )
    .superRefine((map, ctx) => {
      for (const [workflow, features] of Object.entries(map)) {
        for (const feature of features) {
          if (!featureExists(workflow, feature)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Unknown feature "${feature}" for workflow "${workflow}"`,
              path: [workflow],
            });
          }
        }
      }
    })
    .optional(),
  customMemberFields: customMemberFieldsInput.optional(),
  // Set true on the final wizard step to stamp OrganizationConfig.onboardingCompletedAt.
  // Folded into this PATCH so finishing setup is one round-trip alongside the
  // config save. Idempotent in the service, so re-sending it is harmless.
  completeOnboarding: z.literal(true).optional(),
});

export type UpdateOrgConfigInput = z.infer<typeof updateOrgConfigInput>;

// Input for DELETE /api/orgs — permanent org deletion. The client sends the
// org's slug as a confirmation token; the service re-checks it against the
// active org so a malformed/replayed request can't delete the wrong org. The
// UI additionally makes the user type the org NAME, but the slug is the stable
// machine token we verify on.
export const deleteOrgInput = z.object({
  confirmSlug: z.string().trim().min(1, "Confirmation is required"),
});

export type DeleteOrgInput = z.infer<typeof deleteOrgInput>;

// Input for POST /api/orgs/leave — a member leaving the active org. Same
// confirm-slug posture as deletion: the client sends the org's slug, the service
// re-checks it against the active org so a malformed request can't drop the wrong
// membership. The UI makes the user type the org NAME; the slug is the stable token.
export const leaveOrgInput = z.object({
  confirmSlug: z.string().trim().min(1, "Confirmation is required"),
});

export type LeaveOrgInput = z.infer<typeof leaveOrgInput>;
