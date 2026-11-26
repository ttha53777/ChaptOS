import { signOut as authSignOut } from "~/auth";
import { resetCache } from "~/data/query";
import { unregisterThisPhone } from "~/push";
import { setActiveOrg } from "~/state/org";

/** Sign out of this device and forget everything this session cached. */
export async function signOutHere(): Promise<void> {
  // Before the session goes: DELETE /api/push/devices needs it.
  await unregisterThisPhone();
  await authSignOut();
  setActiveOrg(null);
  await resetCache();
}
