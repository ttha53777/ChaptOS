/**
 * Per-org configuration mutations.
 *
 * Today this owns `enabledWorkflows` — the set of workflow registry keys that
 * decide which pages/surfaces the org exposes (consumed by the sidebar, the
 * dashboard, and route guards). The post-creation page picker writes through
 * here; a future Settings surface can reuse setWorkflows() unchanged.
 *
 * Like every service in this directory it takes a RequestContext and goes
 * through ctx.db (org-scoped). It never touches Response objects and emits an
 * OperationalEvent for the change so the activity feed and audit trail stay in
 * lockstep with the rest of the app.
 */

import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ForbiddenError } from "@/lib/errors";
import { ALWAYS_ON_WORKFLOWS, ALL_WORKFLOWS, type WorkflowId } from "@/lib/org-types";
import { normalizeNavOrder, NAV_LABELS } from "@/lib/nav-order";
import { VOCAB_KEYS, type VocabKey, type VocabOverrides } from "@/lib/vocab";
import { resolveThresholds, type Thresholds } from "@/lib/thresholds";
import { normalizeDisabledFeatures, type DisabledFeatures } from "@/lib/workflow-features";
import {
  sanitizeFieldDefs,
  generateFieldId,
  isValidFieldId,
  type CustomMemberFieldDef,
} from "@/lib/custom-member-fields";

export interface OrgConfigDTO {
  enabledWorkflows: WorkflowId[];
}

/**
 * Replace the org's enabled-workflow set.
 *
 * Authorization: org admins only. The page picker is a founder/admin surface;
 * a regular member must never be able to hide pages for the whole org. We gate
 * on isOrgAdmin (platform admins also pass — they hold every capability within
 * the active org) rather than a permission bit because enabling/disabling whole
 * product surfaces is an org-owner action, not a delegated one.
 *
 * The desired set is normalized before persisting:
 *   - de-duplicated (a doubled id from the client is harmless but we store clean
 *     data),
 *   - intersected with ALL_WORKFLOWS (defense in depth; Zod already rejects
 *     unknown ids at the route),
 *   - unioned with ALWAYS_ON_WORKFLOWS so core surfaces can never be dropped,
 *   - ordered to match ALL_WORKFLOWS for a stable, readable column.
 */
export async function setWorkflows(
  ctx: RequestContext,
  input: { enabledWorkflows: string[] },
): Promise<OrgConfigDTO> {
  if (!ctx.isOrgAdmin && !ctx.isPlatformAdmin) {
    throw new ForbiddenError("Only an org admin can change enabled workflows");
  }

  const requested = new Set<WorkflowId>(input.enabledWorkflows as WorkflowId[]);
  for (const w of ALWAYS_ON_WORKFLOWS) requested.add(w);

  // Order by ALL_WORKFLOWS so the stored array is deterministic regardless of
  // the order the client sent ids in.
  const enabledWorkflows = ALL_WORKFLOWS.filter(w => requested.has(w));

  // upsert (not update) so a legacy org missing its config row self-heals rather
  // than 404-ing. organizationId is injected by ctx.db — never client-supplied.
  await ctx.db.organizationConfig.upsert({ enabledWorkflows });

  await emit(ctx, "org.config.updated", { type: "Organization", id: ctx.orgId }, {
    enabledWorkflows,
  });

  return { enabledWorkflows };
}

/**
 * Stamp the org as having finished the post-creation setup wizard.
 * Authorization: org admins only.
 *
 * Idempotent: if onboardingCompletedAt is already set we return the existing
 * timestamp without a write or a duplicate event, so a double-tap on "Continue"
 * (or a retried request) can't re-fire the completion event. The marker is what
 * the OrgGuard layout gates every /[slug]/* route on, so once set the founder is
 * never bounced back into the wizard.
 */
export async function completeOnboarding(ctx: RequestContext): Promise<{ completedAt: Date }> {
  if (!ctx.isOrgAdmin && !ctx.isPlatformAdmin) {
    throw new ForbiddenError("Only an org admin can finish onboarding");
  }

  const existing = await ctx.db.organizationConfig.find();
  if (existing?.onboardingCompletedAt) {
    return { completedAt: existing.onboardingCompletedAt };
  }

  const completedAt = new Date();
  // upsert so a legacy org missing its config row self-heals rather than 404-ing.
  await ctx.db.organizationConfig.upsert({ onboardingCompletedAt: completedAt });

  // Read the org type for the audit payload (Organization, not config). Scoped
  // to the active org by ctx.db; null for legacy orgs that predate org types.
  const org = await ctx.db.organization.findUnique({ where: { id: ctx.orgId }, select: { orgType: true } });

  await emit(ctx, "org.onboarding.completed", { type: "Organization", id: ctx.orgId }, {
    orgType: org?.orgType ?? null,
  });

  return { completedAt };
}

/**
 * Replace the org's sidebar nav order. Authorization: org admins only.
 *
 * Same posture and gate as setWorkflows/setDisabledFeatures: arranging the
 * sidebar is an org-wide layout choice every member sees, so it's an org-owner
 * action, not a delegated permission bit. The incoming list is normalized
 * (trimmed, de-duped, unknown labels dropped, order preserved) so a stale or
 * hand-crafted client can't write junk into the column. The list is SPARSE —
 * labels it omits keep their default sidebar position (see lib/nav-order.ts), so
 * we store exactly what the admin sent without padding it out.
 */
export async function setNavOrder(
  ctx: RequestContext,
  input: { navOrder: string[] },
): Promise<{ navOrder: string[] }> {
  if (!ctx.isOrgAdmin && !ctx.isPlatformAdmin) {
    throw new ForbiddenError("Only an org admin can reorder the sidebar");
  }

  const navOrder = normalizeNavOrder(input.navOrder, NAV_LABELS);

  // upsert (not update) so a legacy org missing its config row self-heals.
  // organizationId is injected by ctx.db — never client-supplied.
  await ctx.db.organizationConfig.upsert({ navOrder });

  await emit(ctx, "org.config.updated", { type: "Organization", id: ctx.orgId }, {
    navOrder,
  });

  return { navOrder };
}

/** Replace the org's vocabulary overrides. Authorization: org admins only. */
export async function setVocab(
  ctx: RequestContext,
  overrides: Record<string, string>,
): Promise<void> {
  if (!ctx.isOrgAdmin && !ctx.isPlatformAdmin) {
    throw new ForbiddenError("Only an org admin can change vocabulary");
  }

  // Strip unknown keys so arbitrary client input can't pollute the JSON column.
  const validKeys = new Set<string>(VOCAB_KEYS);
  const sanitized: VocabOverrides = {};
  for (const [k, v] of Object.entries(overrides)) {
    if (validKeys.has(k)) sanitized[k as VocabKey] = v;
  }

  await ctx.db.organizationConfig.upsert({ vocabularyOverrides: sanitized });

  await emit(ctx, "org.config.updated", { type: "Organization", id: ctx.orgId }, {
    vocabularyOverrides: sanitized,
  });
}

/**
 * Replace the org's member-status thresholds. Authorization: org admins only.
 *
 * The thresholds decide every At-Risk/Watch badge and the health score for the
 * whole org, so changing them is an org-owner action — same gate as workflows
 * and vocab, not a delegated permission bit.
 *
 * The Zod schema (thresholdsInput) already enforces the per-key bounds; we run
 * the values back through resolveThresholds() before persisting so the stored
 * column is always a complete, in-range object (defense in depth + self-healing
 * for any legacy partial row).
 */
export async function setThresholds(
  ctx: RequestContext,
  input: Thresholds,
): Promise<Thresholds> {
  if (!ctx.isOrgAdmin && !ctx.isPlatformAdmin) {
    throw new ForbiddenError("Only an org admin can change thresholds");
  }

  const thresholds = resolveThresholds(input);
  // Plain record for the JSON column + event payload. The Thresholds interface
  // has no index signature, so it isn't directly assignable to Prisma's
  // InputJsonValue / the event's Record<string, number>.
  const record: Record<string, number> = { ...thresholds };

  await ctx.db.organizationConfig.upsert({ thresholds: record });

  await emit(ctx, "org.config.updated", { type: "Organization", id: ctx.orgId }, {
    thresholds: record,
  });

  return thresholds;
}

/**
 * Replace the org's disabled-feature set. Authorization: org admins only.
 *
 * Features are the toggleable sub-sections of a workflow's page (e.g. the
 * Dashboard's Health widget). Hiding one is a visibility change — same gate and
 * posture as setWorkflows: an org-owner action, not a delegated permission bit.
 *
 * The map is OPT-OUT — it records only the features turned *off*. It is
 * normalized before persisting (unknown workflow/feature ids and empty lists
 * dropped, ordered by the registry) so the stored JSON is clean and stable, the
 * same defense-in-depth role the ALL_WORKFLOWS filter plays for setWorkflows.
 */
export async function setDisabledFeatures(
  ctx: RequestContext,
  input: { disabledFeatures: DisabledFeatures },
): Promise<DisabledFeatures> {
  if (!ctx.isOrgAdmin && !ctx.isPlatformAdmin) {
    throw new ForbiddenError("Only an org admin can change which sections are shown");
  }

  const disabledFeatures = normalizeDisabledFeatures(input.disabledFeatures);

  // upsert (not update) so a legacy org missing its config row self-heals.
  // organizationId is injected by ctx.db — never client-supplied.
  await ctx.db.organizationConfig.upsert({ disabledFeatures });

  await emit(ctx, "org.config.updated", { type: "Organization", id: ctx.orgId }, {
    disabledFeatures,
  });

  return disabledFeatures;
}

/**
 * Replace the org's custom member field definitions. Authorization: org admins only.
 *
 * The incoming list is sanitized (unknown types defaulted to "text", labels
 * truncated, list capped at MAX_FIELDS) before persisting. New definitions
 * (those missing a valid id) receive a generated slug id. Existing definitions
 * that carry a valid id are kept as-is so that already-stored Brother.customFields
 * values remain resolvable by id.
 */
export async function setCustomMemberFields(
  ctx: RequestContext,
  input: CustomMemberFieldDef[],
): Promise<CustomMemberFieldDef[]> {
  if (!ctx.isOrgAdmin && !ctx.isPlatformAdmin) {
    throw new ForbiddenError("Only an org admin can change custom member fields");
  }

  // Collect ids that are already valid so we can avoid collisions when
  // generating ids for newly-added definitions.
  const incomingValidIds = input
    .filter(f => isValidFieldId(f.id))
    .map(f => f.id);

  // Assign ids to any definition that doesn't have one yet (new field added
  // via the settings editor before save — the client sends id: "" or omits it).
  const withIds: CustomMemberFieldDef[] = input.map(f => {
    if (isValidFieldId(f.id)) return f;
    const newId = generateFieldId(f.label, incomingValidIds);
    incomingValidIds.push(newId);
    return { ...f, id: newId };
  });

  const sanitized = sanitizeFieldDefs(withIds);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ctx.db.organizationConfig.upsert({ customMemberFields: sanitized as any });

  await emit(ctx, "org.config.updated", { type: "Organization", id: ctx.orgId }, {
    customMemberFields: sanitized.map(f => f.id),
  });

  return sanitized;
}
