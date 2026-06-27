import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { updateOrgConfigInput } from "@/lib/validation/org";
import { setWorkflows, setVocab, setThresholds, setDisabledFeatures, setCustomMemberFields, completeOnboarding } from "@/lib/services/org-config-service";
import { logError } from "@/lib/observability";

// PATCH /api/orgs/config — update the active org's config.
//
// Accepts `enabledWorkflows` (workflow toggle set), `vocabularyOverrides` (term
// substitution map), `thresholds` (member-status cutoffs), `disabledFeatures`
// (hidden page sections), or any combination. Each field is optional; only the
// ones present are mutated. The org is resolved by buildContext() from the
// x-org-slug header so there is no slug in the path to drift out of sync with
// ctx.orgId.
export async function PATCH(req: NextRequest) {
  const { ctx, error } = await buildContext({ requireOrgAdmin: true });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = updateOrgConfigInput.parse(body);

    if (input.enabledWorkflows !== undefined) {
      await setWorkflows(ctx, { enabledWorkflows: input.enabledWorkflows });
    }
    if (input.vocabularyOverrides !== undefined) {
      await setVocab(ctx, input.vocabularyOverrides);
    }
    if (input.thresholds !== undefined) {
      await setThresholds(ctx, input.thresholds);
    }
    if (input.disabledFeatures !== undefined) {
      await setDisabledFeatures(ctx, { disabledFeatures: input.disabledFeatures });
    }
    if (input.customMemberFields !== undefined) {
      await setCustomMemberFields(ctx, input.customMemberFields);
    }
    // Stamp completion LAST, after every config field is persisted, so the
    // marker is never set on a partially-saved org.
    if (input.completeOnboarding) {
      await completeOnboarding(ctx);
    }

    return Response.json({ ok: true });
  } catch (e) {
    logError(e, { route: "/api/orgs/config", method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
