import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { parseAvatarFromMetadata } from "@/lib/avatar";

/** A verified account, before membership exists. Never trusts client user IDs. */
export async function getJoinSession() {
  const cookieStore = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return { authUserId: user.id, account: {
    email: user.email ?? null,
    name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null,
    avatarUrl: parseAvatarFromMetadata(user.user_metadata).avatarUrl,
  } };
}
