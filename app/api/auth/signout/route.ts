import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logError } from "@/lib/observability";

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
  } catch (e) {
    logError(e, { route: "/api/auth/signout", method: "POST" });
    // Continue — still clear the cookies so the client ends up signed out
  }

  const res = NextResponse.json({ ok: true });
  // Clear with the same flags used when setting, so browsers match correctly
  res.cookies.set("brother_linked", "", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
  });
  return res;
}
