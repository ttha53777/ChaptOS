import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { ACTIVE_ORG_COOKIE } from "@/lib/auth/require-user";
import { logError } from "@/lib/observability";

// Sign the user out completely.
//
// Two things have to happen, and both must write to THIS response object —
// mutating cookies() inside a route handler does NOT attach Set-Cookie headers
// (only middleware / the NextResponse cookie API does). The previous version
// called createServerSupabaseClient() (which writes via cookies().set) and so
// silently failed to clear the Supabase session cookies — the user looked
// signed out but their sb-* tokens survived until expiry.
//
//   1. Invalidate the Supabase session server-side (auth.signOut), letting the
//      SSR client expire the sb-* cookies onto `res` via setAll.
//   2. Defensively expire every sb-* cookie we received, plus our own
//      brother_linked + active_org_id cookies. Clearing active_org_id matters
//      on shared devices: otherwise the next user inherits the previous user's
//      last-active org via the stale cookie.

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          // Write the cleared/rotated session cookies onto the response so the
          // browser actually drops them.
          setAll: (list) =>
            list.forEach(({ name, value, options }) =>
              res.cookies.set(name, value, options)
            ),
        },
      }
    );
    await supabase.auth.signOut();
  } catch (e) {
    logError(e, { route: "/api/auth/signout", method: "POST" });
    // Continue — we still force-expire the cookies below so the client ends up
    // signed out even if the Supabase call failed.
  }

  // Defensive sweep: expire any Supabase auth cookie that's still present
  // (auth-token can be chunked into sb-…-auth-token.0/.1), in case signOut()
  // didn't enumerate them.
  for (const c of req.cookies.getAll()) {
    if (c.name.startsWith("sb-")) {
      res.cookies.set(c.name, "", { path: "/", maxAge: 0 });
    }
  }

  // Our own cookies — same flags used when setting, so the browser matches.
  res.cookies.set("brother_linked", "", {
    path: "/", httpOnly: true, sameSite: "lax", maxAge: 0,
  });
  res.cookies.set(ACTIVE_ORG_COOKIE, "", {
    path: "/", httpOnly: true, sameSite: "lax", maxAge: 0,
  });

  return res;
}
