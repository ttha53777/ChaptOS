import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { resolvePermissions } from "@/lib/auth/require-permission";
import { parseAvatarFromMetadata } from "@/lib/avatar";
import { db } from "@/lib/db"; // lint-modules:ignore (auth bootstrap; runs before buildContext is viable)
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logError } from "@/lib/observability";

export async function GET() {
  const user = await requireUser();
  if (!user) {
    // requireUser is the DB authority: null means there's no linked Brother row.
    // If the proxy's brother_linked cookie still claims otherwise it's stale
    // (a different account signed in on this browser, or a claim that never
    // completed) — clear it so the next request is gated to /pending-access
    // instead of being waved into the dashboard. Self-heals the gate without the
    // proxy needing a DB call. See proxy.ts.
    const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    res.cookies.set("brother_linked", "", {
      path: "/", httpOnly: true, sameSite: "lax", maxAge: 0,
    });
    return res;
  }

  try {
    const [brother, org, supabase, perms] = await Promise.all([
      db(user.orgId).brother.findUnique({
        where: { id: user.id },
        select: { name: true, email: true, avatarUrl: true },
      }),
      db(user.orgId).organization.findUnique({
        where: { id: user.orgId },
        select: { name: true, slug: true },
      }),
      createServerSupabaseClient(),
      resolvePermissions(user),
    ]);

    const { data: { user: authUser } } = await supabase.auth.getUser();
    const meta = parseAvatarFromMetadata(authUser?.user_metadata);

    // The persisted Brother.avatarUrl is the source of truth — it's written on
    // every upload/remove via syncBrotherAvatar and survives Supabase re-syncing
    // Google's OAuth claims into user_metadata on token refresh/re-login (which
    // would otherwise clobber a custom avatar_url and make the photo "disappear").
    // Fall back to metadata only when the column is null (e.g. pre-backfill rows).
    const avatarUrl = brother?.avatarUrl ?? meta.avatarUrl;
    const hasCustomAvatar = meta.hasCustomAvatar;

    // Backfill: brothers linked before the email column existed have a null email.
    // First time they hit /me after this ships, persist the session email so it
    // shows up in Settings without forcing a relink.
    if (brother && !brother.email && user.email) {
      db(user.orgId).brother.update({
        where: { id: user.id },
        data: { email: user.email },
      }).catch(e => logError(e, { route: "/api/auth/me", method: "GET", userId: user.id, extra: { stage: "email_backfill" } }));
    }

    return Response.json({
      id: user.id,
      name: brother?.name ?? user.email ?? "Unknown",
      role: user.role,
      isAdmin: user.isAdmin,
      email: user.email ?? "",
      avatarUrl,
      hasCustomAvatar,
      org: org ? { name: org.name, slug: org.slug } : null,
      orgId: user.orgId,
      memberships: user.memberships,
      permissions: perms.permissions,
      maxRank: Number.isFinite(perms.maxRank) ? perms.maxRank : null,
      roles: perms.roles,
    });
  } catch (e) {
    logError(e, { route: "/api/auth/me", method: "GET", userId: user?.id });
    return Response.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}
