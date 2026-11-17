import { signOut as authSignOut } from "~/auth";
import { resetCache } from "~/data/query";
import { setActiveOrg } from "~/state/org";

/** Sign out of this device and forget everything this session cached. */
export async function signOutHere(): Promise<void> {
  await authSignOut();
  setActiveOrg(null);
  await resetCache();
}
