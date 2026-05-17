import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
  } catch (e) {
    console.error("POST /api/auth/signout: supabase.auth.signOut failed:", e);
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
