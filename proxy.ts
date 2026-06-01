import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return redirectPreservingOrg(request, "/login");
  }

  // If the user hasn't claimed a Brother row yet, send them to the claim page.
  // The cookie is set by /auth/callback (returning users) and /api/auth/claim (new claims).
  const isLinked = request.cookies.get("brother_linked")?.value === "1";
  if (!isLinked) {
    // Carry the org hint so the claim form targets the right org — same reason
    // as the unauth branch. Without it a deep-link to /lpe/x would land on a
    // slug-less /pending-access and the claim would fail with "No organization".
    return redirectPreservingOrg(request, "/pending-access");
  }

  return response;
}

/**
 * Redirect to `pathname`, carrying the deep-link's org slug as ?org=<slug> when
 * the request targets an org route. The first path segment of a matched route is
 * the org slug — EXCEPT the platform-level top-level routes below, which aren't
 * orgs. (login/auth/pending-access/api are excluded by the matcher, so they
 * never reach here.)
 */
function redirectPreservingOrg(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  const firstSeg = request.nextUrl.pathname.split("/")[1] || "";
  const PLATFORM_SEGMENTS = new Set(["welcome", "admin"]);
  if (firstSeg && !PLATFORM_SEGMENTS.has(firstSeg)) {
    url.searchParams.set("org", firstSeg);
  }
  return NextResponse.redirect(url);
}

export const config = {
  // `welcome` is excluded so an authenticated-but-unlinked user (no Brother row
  // yet — e.g. a brand-new account that wants to CREATE an org) can actually
  // reach the join/create choice screen at /welcome and /welcome/create. Without
  // this, the `!isLinked` branch above would bounce them to /pending-access,
  // which only does name-claim and has no create-org path — trapping new founders.
  // /welcome self-guards: it redirects users who already have an org to their
  // dashboard, so members never linger there.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|login|auth|pending-access|welcome|api|images|fonts).*)",
  ],
};
