import { NextRequest } from "next/server";
import { z } from "zod";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { applyRoleSet, type RoleToApply } from "@/lib/services/org-setup-service";

// POST /api/orgs/setup-apply — apply the onboarding role set (replace the
// template-seeded roles with the founder-confirmed proposed set).
//
// This is the route for applyRoleSet, the one place that bypasses the role
// service's isSystem rename/delete guards. It is admin-gated by buildContext and
// fresh-org-gated inside the service (refuses once the org has non-founder
// members), so the bypass can't be abused after onboarding. The client sends the
// roles from the (already validated) recommendation; we re-validate here because
// the client is also untrusted — ranks clamped < 100, permissions a bitfield.

const roleSchema = z.object({
  name:        z.string().trim().min(1).max(60),
  rank:        z.number().int().min(0).max(99),
  permissions: z.number().int().min(0).max(0xffffffff),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

const setupApplyInput = z.object({
  roles: z.array(roleSchema).max(12),
});

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requireOrgAdmin: true });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = setupApplyInput.parse(body);
    const result = await applyRoleSet(ctx, input.roles as RoleToApply[]);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    logError(e, { route: "/api/orgs/setup-apply", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
