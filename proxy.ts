import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

/**
 * Auth proxy. Two jobs, nothing more:
 *
 *   1. Refresh the Supabase session cookie on every matched request, so the
 *      browser client and server components read a fresh session. (This is why
 *      the proxy must run on these routes at all — see the matcher.)
 *   2. Bounce UNAUTHENTICATED users to /login, preserving where they were
 *      headed so the callback can return them there after sign-in.
 *
 * It deliberately does NOT route by link status. Whether an authenticated user
 * has claimed a Brother row is the DB's truth, resolved by requireUser() in the
 * pages/layouts that need it ([slug]/layout.tsx, app/page.tsx). The old
 * brother_linked cookie + /pending-access bounce here duplicated that state and
 * has been removed — an authenticated-but-unlinked user is routed by
 * /auth/callback (to claim/create) and gated by the [slug] guard if they reach
 * a protected route directly.
 */
export async function proxy(request: NextRequest) {
  // Inject the request pathname so server layouts can read it via headers().
  // App Router layouts receive params but not the full URL path; [slug]/layout
  // reads x-pathname for its onboarding-gate check (is this /[slug]/onboarding?).
  // This MUST be set on the REQUEST headers (forwarded to server components),
  // not the response headers — headers() in a Server Component reads the
  // incoming request, so a response-only header is invisible there and the
  // onboarding gate would loop-redirect /[slug]/onboarding onto itself.
  request.headers.set("x-pathname", request.nextUrl.pathname);
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
    return redirectToLogin(request);
  }

  // Authenticated — let it through with the refreshed session cookie. Any
  // link-status / membership gating happens in the page/layout via requireUser.
  return response;
}

/**
 * Redirect an unauthenticated request to /login, preserving the destination:
 *   - ?next=<original path+query> so the callback can return them there.
 *   - ?org=<slug> when the request targets an org route, so the claim flow
 *     (for a not-yet-linked user) can target the right org.
 * The first path segment of an org route is the slug — except the platform-
 * level segments below, which aren't orgs.
 */
function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  const original = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/login";
  url.search = "";

  url.searchParams.set("next", original);

  const firstSeg = request.nextUrl.pathname.split("/")[1] || "";
  const PLATFORM_SEGMENTS = new Set(["welcome", "admin"]);
  if (firstSeg && !PLATFORM_SEGMENTS.has(firstSeg)) {
    url.searchParams.set("org", firstSeg);
  }
  return NextResponse.redirect(url);
}

export const config = {
  // /welcome stays BEHIND the proxy so its session cookie is refreshed (the
  // browser client reads it on /welcome/create). Authenticated users pass
  // straight through now that the link-status bounce is gone, so new founders
  // reach the create flow without a detour. login/auth/join/pending-access/api
  // are excluded — they must be reachable while signed out (/join lets an
  // invited, signed-out user land and trigger OAuth themselves).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|login|auth|join|pending-access|api|images|fonts).*)",
  ],
};
