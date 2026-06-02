import { NextResponse } from "next/server";
import { ACTIVE_ORG_COOKIE } from "@/lib/auth/require-user";

export const LINKED_COOKIE_OPTS = {
  path: "/", httpOnly: true, sameSite: "lax" as const, maxAge: 60 * 60 * 24 * 365,
};

/**
 * Build the post-link response for the pre-auth join flows (claim + invite
 * redeem), pre-selecting the org via active_org_id so the first /[slug] render
 * resolves to it without a background cookie sync. Mirrors /api/orgs. Link
 * status itself is read from the DB by requireUser() — there's no separate
 * cookie for it. Extra fields (e.g. a claim-mode redirect signal) are merged
 * into the JSON body.
 */
export function claimedResponse(orgId: number, body: Record<string, unknown> = {}): NextResponse {
  const res = NextResponse.json({ ok: true, ...body });
  res.cookies.set(ACTIVE_ORG_COOKIE, String(orgId), LINKED_COOKIE_OPTS);
  return res;
}
