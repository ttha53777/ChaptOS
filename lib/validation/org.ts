import { z } from "zod";
import { MAX_SLUG_LEN, MIN_SLUG_LEN } from "@/lib/slug-rules";
import { ORG_TYPE_IDS, ALL_WORKFLOWS, type WorkflowId } from "@/lib/org-types";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { featureExists } from "@/lib/workflow-features";
import { isValidFieldId, MAX_FIELDS, MAX_LABEL } from "@/lib/custom-member-fields";
import { NAV_LABELS } from "@/lib/nav-order";

// A single known WorkflowId. Shared by the blueprint's enabledWorkflows and the
// config PATCH so both surfaces reject unknown ids with the identical message
// instead of drifting.
const workflowIdSchema = z
  .string()
  .refine((v): v is WorkflowId => (ALL_WORKFLOWS as readonly string[]).includes(v), {
    message: "Unknown workflow",
  });

// The rank reserved for the founder/admin role. Non-founder blueprint roles must
// stay strictly below it so nothing can tie or outrank the founder.
const FOUNDER_RANK = 100;

// One founder-authored role in the create blueprint. Permissions are the bare
// MANAGE_* names (matching how org-type templates store RoleSeed.permissions);
// the service turns them into a bitfield via permissionBits(). `all: true` marks
// the founder role — it is granted the full bitfield and rank 100 regardless of
// what else is sent, so `rank`/`permissions` on that seed are advisory only.
const roleSeedInput = z.object({
  name:        z.string().trim().min(1, "Role name is required").max(60, "Role name must be at most 60 characters"),
  rank:        z.number().int().min(0).max(FOUNDER_RANK - 1),
  all:         z.boolean().optional(),
  permissions: z.array(z.enum(Object.keys(PERMISSIONS) as [Permission, ...Permission[]])).optional(),
  color:       z.string().max(9).optional(),
});

// The pre-creation "blueprint" — the founder's reviewed setup, applied ATOMICALLY
// inside provisionOrg's transaction. Every field is optional: an absent blueprint
// (or an absent field within it) falls back to the org-type template, so the bare
// 4-field create and the recovery/already-linked path keep working unchanged.
//
// Deliberately NARROWER than updateOrgConfigInput — creation only sets the three
// things the interview produces (workflows, vocab, roles). Thresholds, custom
// fields, nav order, disabled features stay post-creation Settings concerns.
const blueprintInput = z.object({
  enabledWorkflows: z
    .array(workflowIdSchema)
    .max(ALL_WORKFLOWS.length, "Too many workflows")
    .optional(),
  vocabularyOverrides: z
    .record(z.string(), z.string().trim().max(40, "Label must be 40 characters or fewer"))
    .optional(),
  roleSeeds: z.array(roleSeedInput).max(16, "Too many roles").optional(),
});

export type BlueprintInput = z.infer<typeof blueprintInput>;

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
  // The founder's reviewed setup from the pre-creation interview. Optional so a
  // minimal client (or the recovery path) can still create a template-only org.
  blueprint:   blueprintInput.optional(),
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
    .array(workflowIdSchema)
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
  // Admin-chosen sidebar order — a list of nav labels. A full replace like the
  // other fields (present → mutate, absent → leave alone). Loosely validated
  // here (strings, length-capped); the service normalizes against the real nav
  // label set and drops anything unknown, so an unrecognized label is silently
  // ignored rather than 400-ing — a reorder shouldn't fail because the client
  // and server disagree on which pages exist.
  navOrder: z.array(z.string().max(40)).max(NAV_LABELS.length).optional(),
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
