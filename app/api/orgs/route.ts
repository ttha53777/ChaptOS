import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ACTIVE_ORG_COOKIE } from "@/lib/auth/require-user";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createOrgInput } from "@/lib/validation/org";
import { provisionOrg } from "@/lib/services/org-service";
import { AlreadyLinkedError, toResponse } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { prisma } from "@/lib/prisma"; // lint-modules:ignore (pre-auth onboarding; user has no ctx yet)

// POST /api/orgs — self-serve organization creation.
//
// Authenticates the Supabase session directly (the user has no Brother yet,
// so buildContext() won't work). Validates input with Zod + slug rules,
// rate-limits per Google account, calls provisionOrg() which does everything
// atomically, then sets the active_org_id cookie so the new org loads on
// the next request.
//
// Rate limit: 3 orgs per Google account per 24h. Same number suggested in
// Milestone 1 — generous for real users who genuinely want multiple orgs
// (chapter + alumni network, e.g.), tight enough that an abuser would need
// many accounts to flood the namespace.

const LIMIT_PER_ACCOUNT = 3;
const WINDOW_24H        = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  // ── 1. Validate Supabase session ────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // ── 2. Rate-limit by Google account id ──────────────────────────────────
  const rl = rateLimit(`org-create:${user.id}`, LIMIT_PER_ACCOUNT, WINDOW_24H);
  if (!rl.ok) return tooManyRequests(rl);

  // ── 3. Validate input ───────────────────────────────────────────────────
  // toResponse() maps ZodError → 400 with details — services don't need to
  // re-throw or repackage. Same convention every other route follows.
  let input;
  try {
    const body = await req.json();
    input = createOrgInput.parse(body);
  } catch (e) {
    return toResponse(e);
  }

  // ── 4. Provision ───────────────────────────────────────────────────────
  let provisioned;
  try {
    provisioned = await provisionOrg(input, user.id, user.email ?? null);
  } catch (e) {
    // Recovery for the narrow already-linked race. Note: a linked user founding
    // an additional org now SUCCEEDS (provisionOrg reuses their Brother), so
    // this branch no longer fires for ordinary multi-org creation. It only
    // triggers when a brand-new account fires two concurrent creates and the
    // second loses the authUserId insert race — in which case one org WAS
    // created. Resolve that org, re-set the session cookies, and hand back a 200
    // so the loser lands in the org that won instead of dead-ending on an error.
    if (e instanceof AlreadyLinkedError) {
      const recovered = await recoverExistingOrg(user.id).catch(() => null);
      if (recovered) {
        return setSessionCookies(
          NextResponse.json(
            { ok: true, organizationId: recovered.id, slug: recovered.slug, alreadyLinked: true },
            { status: 200 },
          ),
          recovered.id,
        );
      }
      // Linked, but we couldn't resolve the org (should be impossible — a
      // linked Brother always has an organizationId). Fall through to the
      // normal 409 so the user at least gets a clear message.
    }
    // Domain errors (ValidationError, ConflictError) map cleanly via toResponse.
    // Anything else is genuinely unexpected — log it with correlation context.
    logError(e, {
      route: "/api/orgs",
      method: "POST",
      userId: user.id,
      extra: { slug: input.slug, orgType: input.orgType },
    });
    return toResponse(e);
  }

  // ── 5. Set active-org + brother-linked cookies ─────────────────────────
  // Same cookie shape as /api/auth/active-org and the claim flow. The next
  // page load resolves the new org and the dashboard remounts under it.
  return setSessionCookies(
    NextResponse.json(
      {
        ok: true,
        organizationId: provisioned.organizationId,
        slug: provisioned.slug,
      },
      { status: 201 },
    ),
    provisioned.organizationId,
  );
}

/**
 * Set the active-org + brother_linked cookies that get the founder into their
 * org on the next request. Shared by the create-success and already-linked
 * recovery paths so they stay in lockstep with /api/auth/active-org's shape.
 */
function setSessionCookies(res: NextResponse, organizationId: number): NextResponse {
  res.cookies.set(ACTIVE_ORG_COOKIE, String(organizationId), {
    path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365,
  });
  res.cookies.set("brother_linked", "1", {
    path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

/**
 * Resolve the org a Google account is already linked to, for the
 * already-linked recovery path. Returns the Brother's home org (the one a
 * founder would have created on a prior attempt). null if no linked Brother
 * or no slug — the caller falls back to a plain 409.
 */
async function recoverExistingOrg(authUserId: string): Promise<{ id: number; slug: string } | null> {
  const brother = await prisma.brother.findUnique({
    where: { authUserId },
    select: { organization: { select: { id: true, slug: true } } },
  });
  return brother?.organization ?? null;
}
