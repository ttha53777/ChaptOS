import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAuthUser } from "@/lib/auth/session-user";
import { ACTIVE_ORG_COOKIE } from "@/lib/auth/require-user";
import { isSameOrigin } from "@/lib/auth/same-origin";
import { deleteOwnAccount, previewAccountDeletion } from "@/lib/auth/account-deletion";
import { deleteAccountInput } from "@/lib/validation/account";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { toResponse } from "@/lib/errors";
import { logError } from "@/lib/observability";
import type { AccountDeletionPreview } from "@/lib/api-types";

// The signed-in person's own account. Keyed by the verified session alone — no
// org, no roster row required — so someone who has left every org, or only ever
// filed a join request, can still erase themselves. See lib/auth/account-deletion.ts
// for exactly what goes and what is anonymised.

// GET — what deletion would do, and whether anything blocks it.
export async function GET() {
  const user = await getVerifiedAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const preview = await previewAccountDeletion(user.id);
    return Response.json(preview satisfies AccountDeletionPreview);
  } catch (e) {
    logError(e, { route: "/api/auth/account", method: "GET", userId: user.id });
    return toResponse(e);
  }
}

// DELETE — permanently delete the account. Body { confirm: "DELETE" }.
export async function DELETE(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return Response.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }

  const user = await getVerifiedAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const limit = rateLimit(`account-delete:${user.id}`, 3, 60_000);
  if (!limit.ok) return tooManyRequests(limit);

  try {
    const body = await req.json().catch(() => ({}));
    deleteAccountInput.parse(body);
    await deleteOwnAccount(user.id);
  } catch (e) {
    logError(e, { route: "/api/auth/account", method: "DELETE", userId: user.id });
    return toResponse(e);
  }

  // The login is gone, so this only has to drop the browser's copy of the
  // session; "local" skips revoking server-side sessions that no longer exist.
  // A bearer client simply discards its token.
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Nothing to sign out of — not a failure of the deletion.
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACTIVE_ORG_COOKIE, "", { path: "/", httpOnly: true, sameSite: "lax", maxAge: 0 });
  res.cookies.set("brother_linked", "", { path: "/", httpOnly: true, sameSite: "lax", maxAge: 0 });
  return res;
}
