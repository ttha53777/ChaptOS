import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { acceptTermsInput } from "@/lib/validation/terms";
import { recordTermsAcceptance, termsStatus } from "@/lib/auth/terms-acceptance";
import { TermsAcceptanceContext } from "@/lib/state";
import { toResponse } from "@/lib/errors";
import { logError } from "@/lib/observability";
import type { TermsStatus } from "@/lib/api-types";

/**
 * POST /api/auth/terms — "I agree" on the in-app Terms of Service prompt.
 *
 * Identity-level, not org-level: the terms bind the person in every org they
 * belong to, so there's no ctx and no permission to check, only a signed-in
 * account. requireUser (not getVerifiedAuthUser) so the authUserId recorded is
 * the one /api/auth/me reads back — they differ under dev impersonation.
 *
 * Answers with the fresh TermsStatus so the prompt can close without refetching
 * /api/auth/me.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimit(`terms-accept:${user.authUserId}`, 10, 60_000);
  if (!rl.ok) return tooManyRequests(rl);

  try {
    const { version } = acceptTermsInput.parse(await req.json().catch(() => ({})));
    await recordTermsAcceptance({ authUserId: user.authUserId, version, context: TermsAcceptanceContext.Prompt });
    return Response.json(termsStatus(version) satisfies TermsStatus);
  } catch (e) {
    logError(e, { route: "/api/auth/terms", method: "POST", userId: user.id });
    return toResponse(e);
  }
}
