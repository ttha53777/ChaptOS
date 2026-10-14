import { getVerifiedAuthUser } from "@/lib/auth/session-user";
import { parseAvatarFromMetadata } from "@/lib/avatar";

/** A verified account, before membership exists. Never trusts client user IDs. */
export async function getJoinSession() {
  const user = await getVerifiedAuthUser();
  if (!user) return null;
  return { authUserId: user.id, account: {
    email: user.email ?? null,
    name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null,
    avatarUrl: parseAvatarFromMetadata(user.user_metadata).avatarUrl,
  } };
}
