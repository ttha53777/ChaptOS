import { requireUser } from "@/lib/auth/require-user";
import { parseAvatarFromMetadata } from "@/lib/avatar";
import { prisma } from "@/lib/prisma";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [brother, supabase] = await Promise.all([
      prisma.brother.findUnique({
        where: { id: user.id },
        select: { name: true, email: true, avatarUrl: true },
      }),
      createServerSupabaseClient(),
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
      prisma.brother.update({
        where: { id: user.id },
        data: { email: user.email },
      }).catch(e => console.error("Brother email backfill failed:", e));
    }

    return Response.json({
      id: user.id,
      name: brother?.name ?? user.email ?? "Unknown",
      role: user.role,
      isAdmin: user.isAdmin,
      email: user.email ?? "",
      avatarUrl,
      hasCustomAvatar,
    });
  } catch (e) {
    console.error("GET /api/auth/me failed:", e);
    return Response.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}
