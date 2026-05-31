import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ACTIVE_ORG_COOKIE } from "@/lib/auth/require-user";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createOrgInput } from "@/lib/validation/org";
import { provisionOrg } from "@/lib/services/org-service";
import { toResponse } from "@/lib/errors";
import { logError } from "@/lib/observability";

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
  const res = NextResponse.json(
    {
      ok: true,
      organizationId: provisioned.organizationId,
      slug: provisioned.slug,
    },
    { status: 201 },
  );
  res.cookies.set(ACTIVE_ORG_COOKIE, String(provisioned.organizationId), {
    path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365,
  });
  res.cookies.set("brother_linked", "1", {
    path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
