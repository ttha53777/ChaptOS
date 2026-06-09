import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { emit } from "@/lib/events";
import { logError } from "@/lib/observability";

// DELETE — unlink the currently signed-in user from their Brother row and sign
// them out of Supabase. Also expires the legacy brother_linked cookie (no longer
// read; cleared so sessions predating its removal don't keep it around).
export async function DELETE() {
  const supabase = await createServerSupabaseClient();
  const { ctx, error } = await buildContext();
  if (error) {
    // Already signed out / brother not linked — still clear cookie cleanly.
    await supabase.auth.signOut();
    const res = NextResponse.json({ ok: true });
    res.cookies.set("brother_linked", "", { path: "/", httpOnly: true, sameSite: "lax", maxAge: 0 });
    return res;
  }

  try {
    await ctx.db.brother.update({
      where: { id: ctx.actorId },
      data: { authUserId: null },
    });

    await emit(ctx, "brother.account_unlinked", { type: "Brother", id: ctx.actorId }, {
      name: ctx.actorName,
      bySelf: true,
    });

    await supabase.auth.signOut();

    const res = NextResponse.json({ ok: true });
    res.cookies.set("brother_linked", "", { path: "/", httpOnly: true, sameSite: "lax", maxAge: 0 });
    return res;
  } catch (e) {
    // Unlink failed — leave the session intact so the user can retry.
    logError(e, { route: "/api/auth/unlink-self", method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
