import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/lib/prisma";
import { ACTIVE_ORG_COOKIE } from "@/lib/auth/require-user";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code    = searchParams.get("code");
  // Org slug forwarded from the login page via redirectTo.
  // Passed through to /pending-access so the claim form can target the right org.
  const orgSlug = searchParams.get("org");
  // Onboarding intent forwarded from the login page's "Start a new chapter"
  // card (which has no org slug). When an unlinked, org-less user signed in to
  // CREATE an org, route them straight to the create form instead of the
  // /welcome chooser. Any other value is ignored.
  const intent = searchParams.get("intent");
  // Deep-link target: the path the user originally requested before being
  // bounced to /login (the proxy forwards it as ?next=). Honored for LINKED
  // users so a signed-out deep-link to /<slug>/treasury returns there after
  // sign-in. Must be a local path (leading "/", no "//") to prevent open
  // redirects.
  const nextParam = searchParams.get("next");
  const safeNext = nextParam && /^\/(?!\/)/.test(nextParam) ? nextParam : null;

  if (!code) {
    return NextResponse.redirect(buildUrl(origin, "/login", orgSlug, "error=auth"));
  }

  // Single cookie-bearing response. Supabase's setAll writes the session
  // cookies (or cookie-clears, on failure) onto `cookieJar`; every redirect we
  // return MUST carry cookieJar's headers, otherwise those Set-Cookie headers
  // are silently dropped. We start it pointed at the dashboard but rewrite the
  // Location per branch via `redirectTo()` so the cookies survive regardless of
  // where the user ends up.
  const cookieJar = new NextResponse(null);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value, options }) =>
            cookieJar.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Redirect to `url` while preserving any cookies Supabase wrote onto cookieJar.
  const redirectTo = (url: string) =>
    NextResponse.redirect(url, { headers: cookieJar.headers });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    // Carry cookieJar headers here too: on a failed exchange Supabase may have
    // expired a stale/invalid session cookie, and we want that clear to land.
    return redirectTo(buildUrl(origin, "/login", orgSlug, "error=auth"));
  }

  const brother = await prisma.brother.findUnique({
    where: { authUserId: data.user.id },
    select: {
      id: true,
      organization: { select: { id: true, slug: true } },
      memberships: {
        select: { organizationId: true, organization: { select: { slug: true } } },
      },
    },
  });

  if (brother) {
    // "Start a new chapter": a linked user founding ANOTHER org. A Google
    // account maps to one Brother, but that Brother can own multiple orgs via
    // Membership (provisionOrg reuses the existing Brother). Honor the create
    // intent instead of bouncing them to an org they already have. ?resume=1
    // tells /create to restore the localStorage draft and auto-fire the build.
    if (intent === "create") {
      return redirectTo(buildUrl(origin, "/create", null, "resume=1"));
    }

    // Resolve which org to land in, in priority order:
    //   1. ?org= deep-link hint, if they're a member of it.
    //   2. The active_org_id cookie, if it still points at one of their orgs.
    //   3. Their home org (Brother.organization).
    //   4. First membership (covers a multi-org founder whose home org row
    //      lives elsewhere — see the multi-org founding work).
    const bySlug = orgSlug ? brother.memberships.find(m => m.organization.slug === orgSlug) : null;
    const cookieOrgId = Number(request.cookies.get(ACTIVE_ORG_COOKIE)?.value);
    const byCookie = Number.isInteger(cookieOrgId)
      ? brother.memberships.find(m => m.organizationId === cookieOrgId)
      : null;
    const home = brother.organization
      ? { organizationId: brother.organization.id, organization: { slug: brother.organization.slug } }
      : null;
    const target = bySlug || byCookie || home || brother.memberships[0] || null;

    // Pre-set the active_org cookie to the org we're routing them into, so the
    // first /[slug] render resolves to the right org without a background sync.
    // Mirrors what /api/orgs does on org creation.
    if (target) {
      cookieJar.cookies.set(ACTIVE_ORG_COOKIE, String(target.organizationId), {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    // Prefer the original deep-link path if it was preserved AND lands inside
    // the org we resolved (so the cookie and URL agree). Otherwise the org
    // dashboard with the welcome toast.
    if (safeNext && target && safeNext.startsWith(`/${target.organization.slug}`)) {
      return redirectTo(`${origin}${safeNext}`);
    }
    const dest = target ? `/${target.organization.slug}?toast=welcome` : "/?toast=welcome";
    return redirectTo(`${origin}${dest}`);
  }

  // Unlinked from here down.

  // Deep-link target first: a freshly-signed-in but still-unlinked user who was
  // headed somewhere specific (e.g. an invite at /join/<token>) returns there.
  // Must come BEFORE the orgSlug branch — otherwise an invite redeemer (who
  // carries next= but no org=) would never hit it; and an org= deep-linker who
  // turns out unlinked is correctly routed by the destination's own guard
  // (the [slug] layout sends them to /pending-access). safeNext is the
  // open-redirect-guarded local path from the proxy.
  if (safeNext) {
    return redirectTo(`${origin}${safeNext}`);
  }

  if (orgSlug) {
    // Unlinked but the org context was preserved through OAuth (e.g. they
    // started at /login?org=lpe). Skip the choice screen — they already know
    // which org they're joining.
    return redirectTo(buildUrl(origin, "/pending-access", orgSlug));
  }

  // Unlinked and no org hint. If they came to create an org, return to the
  // create flow's build step (?resume=1 restores the saved draft); otherwise
  // drop them on /welcome to choose between joining and creating.
  if (intent === "create") {
    return redirectTo(buildUrl(origin, "/create", null, "resume=1"));
  }
  return redirectTo(buildUrl(origin, "/welcome", null));
}

/**
 * Build a URL, optionally appending an org slug and extra query params.
 * Keeps all construction in one place so the logic is easy to audit.
 */
function buildUrl(origin: string, path: string, orgSlug: string | null, extra?: string): string {
  const params = new URLSearchParams();
  if (orgSlug) params.set("org", orgSlug);
  if (extra)   extra.split("&").forEach(pair => {
    const [k, v] = pair.split("=");
    if (k) params.set(k, v ?? "");
  });
  const qs = params.toString();
  return `${origin}${path}${qs ? `?${qs}` : ""}`;
}
