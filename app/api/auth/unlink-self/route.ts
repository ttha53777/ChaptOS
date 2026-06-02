import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildContext } from "@/lib/context";
import { emit } from "@/lib/events";

// DELETE — unlink the currently signed-in user from their Brother row and sign
// them out of Supabase. Also expires the legacy brother_linked cookie (no longer
// read; cleared so sessions predating its removal don't keep it around).
export async function DELETE() {
  const supabase = await createServerSupabaseClient();
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) {
    // Already signed out / brother not linked — still clear cookie cleanly.
    await supabase.auth.signOut();
    const res = NextResponse.json({ ok: true });
    res.cookies.set("brother_linked", "", { path: "/", httpOnly: true, sameSite: "lax", maxAge: 0 });
    return res;
  }

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
}
