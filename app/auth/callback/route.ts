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

  // Build a response first so we can write cookies onto it. Linked users land
  // on the dashboard with ?toast=welcome so the client can show a brief
  // "Welcome to <org>" toast (stripped from the URL on mount).
  const res = NextResponse.redirect(`${origin}/?toast=welcome`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(buildUrl(origin, "/login", orgSlug, "error=auth"));
  }

  const brother = await prisma.brother.findUnique({
    where: { authUserId: data.user.id },
    select: { id: true },
  });

  if (brother) {
    res.cookies.set("brother_linked", "1", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
    // res already redirects to "/"
  } else if (orgSlug) {
    // Unlinked but the org context was preserved through OAuth (e.g. they
    // started at /login?org=lpe). Skip the choice screen — they already know
    // which org they're joining.
    return NextResponse.redirect(buildUrl(origin, "/pending-access", orgSlug), {
      headers: res.headers,
    });
  } else {
    // Unlinked and no org hint — cold cross-org user. Drop them on /welcome
    // to choose between joining an existing org and creating a new one.
    return NextResponse.redirect(buildUrl(origin, "/welcome", null), {
      headers: res.headers,
    });
  }

  return res;
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
