import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code    = searchParams.get("code");
  // Org slug forwarded from the login page via redirectTo.
  // Passed through to /pending-access so the claim form can target the right org.
  const orgSlug = searchParams.get("org");

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
      organization: { select: { slug: true } },
      memberships: { select: { organization: { select: { slug: true } } } },
    },
  });

  if (brother) {
    // Linked user → their org dashboard with the welcome toast.
    cookieJar.cookies.set("brother_linked", "1", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
    // Target the org they signed in for (?org= hint) if they're a member of it,
    // else their home org. Fall back to the root redirect if neither resolves.
    const memberSlugs = new Set(
      brother.memberships.map(m => m.organization.slug),
    );
    const targetSlug =
      orgSlug && memberSlugs.has(orgSlug) ? orgSlug : brother.organization?.slug ?? null;
    const dest = targetSlug ? `/${targetSlug}?toast=welcome` : "/?toast=welcome";
    return redirectTo(`${origin}${dest}`);
  }

  // Unlinked from here down. CRITICAL: clear any stale brother_linked cookie.
  // It's set with a 1-year maxAge when a LINKED user signs in. If a different,
  // UNLINKED email then signs in on the same browser (without a clean signout),
  // the old cookie would survive and the proxy would wave this unlinked user
  // straight into the dashboard — skipping the claim flow and leaving them with
  // no Brother. Expiring it here guarantees the proxy routes them to claim.
  cookieJar.cookies.set("brother_linked", "", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
  });

  if (orgSlug) {
    // Unlinked but the org context was preserved through OAuth (e.g. they
    // started at /login?org=lpe). Skip the choice screen — they already know
    // which org they're joining.
    return redirectTo(buildUrl(origin, "/pending-access", orgSlug));
  }

  // Unlinked and no org hint — cold cross-org user. Drop them on /welcome
  // to choose between joining an existing org and creating a new one.
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
