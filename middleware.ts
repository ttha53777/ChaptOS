import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Auth guard middleware.
 *
 * Redirects unauthenticated requests for protected pages to /login.
 * API routes handle their own auth via buildContext(); middleware skips them.
 * Static assets and Next.js internals are excluded via the matcher config.
 */

const PUBLIC_PREFIXES = ["/login", "/auth/callback", "/pending-access"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Let public pages and all API routes pass through.
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.next();

  // Build a response first so Supabase can refresh session cookies onto it.
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value, options }) => {
            req.cookies.set(name, value);
            res.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // getUser() validates the JWT with Supabase; safe against tampered cookies.
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", req.url);
    // Preserve org slug if present so the login page can thread it through OAuth.
    const orgSlug = req.nextUrl.searchParams.get("org");
    if (orgSlug) loginUrl.searchParams.set("org", orgSlug);
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Match all paths except Next.js internals and static assets.
     * The negative lookahead keeps _next/static, _next/image, and common
     * public-folder extensions out of middleware processing.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
