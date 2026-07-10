import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { DEV_IMPERSONATE_COOKIE, devBypassEnabled, verifyImpersonation } from "@/lib/auth/dev-bypass";
import { isSameOrigin } from "@/lib/auth/same-origin";

/** Methods that mutate state and therefore need CSRF gating. */
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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
  // API routes: the proxy's ONLY job here is central CSRF enforcement. Route
  // handlers do their own auth (createServerSupabaseClient / buildContext), so
  // we don't run the session refresh below, and an API request must NEVER be
  // bounced to /login (it would turn a 401 JSON contract into an HTML redirect).
  //
  // Our auth cookies are SameSite=Lax, so the browser sends them on cross-site
  // top-level navigations — a CSRF window for plain form POSTs. isSameOrigin()
  // rejects definite cross-origin browser mutations and fails open for callers
  // with no Origin/Sec-Fetch-Site (server-to-server, test clients). Reads
  // (GET/HEAD/OPTIONS) pass straight through. This is the single choke point
  // that covers all ~64 mutating routes, including the pre-auth bootstrap POSTs
  // (claim/redeem-invite/orgs/avatar) that never reach buildContext.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    if (UNSAFE_METHODS.has(request.method) && !isSameOrigin(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.next();
  }

  // Inject the request pathname so server layouts can read it via headers().
  // App Router layouts receive params but not the full URL path; [slug]/layout
  // reads x-pathname for its onboarding-gate check (is this /[slug]/onboarding?).
  // This MUST be set on the REQUEST headers (forwarded to server components),
  // not the response headers — headers() in a Server Component reads the
  // incoming request, so a response-only header is invisible there and the
  // onboarding gate would loop-redirect /[slug]/onboarding onto itself.
  request.headers.set("x-pathname", request.nextUrl.pathname);
  let response = NextResponse.next({ request });

  // Dev-only impersonation bypass — see lib/auth/dev-bypass.ts. The proxy runs
  // before any layout/requireUser and would otherwise bounce the impersonated
  // request to /login (it only knows Supabase). When a validly-signed dev cookie
  // is present, let the request straight through; requireUser's matching bypass
  // resolves the impersonated Brother downstream. Double-gated + inert in prod.
  if (devBypassEnabled() && verifyImpersonation(request.cookies.get(DEV_IMPERSONATE_COOKIE)?.value) !== null) {
    return response;
  }

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
    // Root is the public marketing page — anonymous visitors see it instead of
    // being bounced to /login. Signed-in users still hit app/page.tsx, which
    // routes them into their org. Everything else stays gated.
    if (request.nextUrl.pathname === "/") return response;
    // /create is the pre-auth org-creation flow: a founder runs the whole
    // interview signed out and signs in at the Build step. It stays inside the
    // matcher (unlike /login) so the post-OAuth resume leg still gets a fresh
    // session cookie from the refresh above.
    if (request.nextUrl.pathname === "/create") return response;
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
  // /welcome and /create stay BEHIND the proxy so their session cookies are
  // refreshed (/create's Build step and post-OAuth resume leg read the session
  // in the browser); /create is then allowed through anonymously in the body.
  // login/auth/join/pending-access are excluded — they must be reachable while
  // signed out (/join lets an invited, signed-out user land and trigger OAuth
  // themselves).
  //
  // /api is INCLUDED (it was previously excluded): the proxy is the central
  // CSRF choke point for mutating API routes. The proxy() body short-circuits
  // /api/* to a CSRF-only check and skips the session-refresh/login-bounce
  // logic, so including it here is purely additive for security.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|login|auth|join|pending-access|images|fonts).*)",
  ],
};
