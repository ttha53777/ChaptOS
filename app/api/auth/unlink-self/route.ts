import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";

// DELETE — unlink the currently signed-in user from their Brother row,
// clear the brother_linked cookie, and sign them out of Supabase.
// After this they are redirected to /login by the client.
export async function DELETE() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const brother = await db(1).brother.findUnique({
    where: { authUserId: user.id },
    select: { id: true, name: true },
  });
  if (!brother) {
    await supabase.auth.signOut();
    const res = NextResponse.json({ ok: true });
    res.cookies.set("brother_linked", "", { path: "/", httpOnly: true, sameSite: "lax", maxAge: 0 });
    return res;
  }

  await db(1).brother.update({
    where: { id: brother.id },
    data: { authUserId: null },
  });

  await logActivity({
    actorId: brother.id,
    type: "info",
    message: `${brother.name} unlinked their own account`,
    orgId: 1,
  });

  await supabase.auth.signOut();

  const res = NextResponse.json({ ok: true });
  res.cookies.set("brother_linked", "", { path: "/", httpOnly: true, sameSite: "lax", maxAge: 0 });
  return res;
}
