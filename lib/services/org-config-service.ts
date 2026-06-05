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
import type { UpdateOrgConfigInput } from "@/lib/validation/org";

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
  input: UpdateOrgConfigInput,
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
