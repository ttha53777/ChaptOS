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

  // /welcome and /welcome/create are the onboarding choice + org-creation screens
  // for an authenticated user who has NO Brother row yet (a brand-new founder).
  // They are reachable only WITH a session, so we let any authenticated user
  // through here regardless of link status — the page self-guards (sends users
  // who already have an org to their dashboard). Crucially this keeps /welcome
  // BEHIND the proxy, so the Supabase session cookie is refreshed for the next
  // request and the client can read it. (Excluding /welcome from the matcher
  // broke that — the browser client saw no session and looped to /login.)
  const path = request.nextUrl.pathname;
  if (path === "/welcome" || path.startsWith("/welcome/")) {
    return response;
  }

  // Otherwise: if the user hasn't claimed a Brother row yet, send them to claim.
  // The brother_linked cookie is set by /auth/callback (returning users),
  // /api/auth/claim (new claims), and /api/orgs (founders). It is a fast EDGE
  // HINT, not the source of truth — the proxy can't reach the DB here.
  //
  // The cookie can't be set on a half-linked account: /api/auth/claim only sets
  // it after the Membership write succeeds (else it 500s with no cookie). And it
  // self-heals if it ever goes stale: requireUser() is the DB authority, and the
  // server entry points that find it lying clear the cookie — /api/auth/me
  // expires it on a 401 (no linked Brother), and a full signout sweeps it. So a
  // stale brother_linked at worst costs one extra hop (proxy waves the user to a
  // /[slug] page whose server layout redirects them out before any child
  // renders — no protected data is exposed) before the cookie is cleared.
  const isLinked = request.cookies.get("brother_linked")?.value === "1";
  if (!isLinked) {
    // Carry the org hint so the claim form targets the right org. Without it a
    // deep-link to /lpe/x would land on a slug-less /pending-access and the
    // claim would fail with "No organization".
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
  // NOTE: `welcome` is intentionally NOT excluded here — it must run through the
  // proxy so the Supabase session cookie is refreshed (the browser client reads
  // it on /welcome/create). The proxy allows authenticated users through to
  // /welcome explicitly (see the /welcome branch above), so new founders reach
  // the create flow without being bounced to /pending-access.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|login|auth|pending-access|api|images|fonts).*)",
  ],
};
