import { requestJson } from "./api";

/**
 * Leave the active org, then hard-navigate somewhere valid: another org the user
 * still belongs to, else /welcome. The route clears the active_org cookie in the
 * same response. Shared by LeaveOrgModal (Accounts settings) and the sidebar
 * profile menu's inline confirm.
 *
 * Resolves only on failure, with a human-readable message — on success the page
 * is already navigating away.
 */
export async function leaveOrg({ orgSlug, memberships, activeOrgId }: {
  orgSlug: string;
  memberships: { organizationId: number; orgSlug: string }[];
  activeOrgId: number;
}): Promise<string> {
  try {
    // Slug is the stable confirmation token the server re-checks against the
    // active org.
    await requestJson("/api/orgs/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmSlug: orgSlug }),
    });
    const remaining = memberships.find(m => m.organizationId !== activeOrgId);
    window.location.assign(remaining ? `/${remaining.orgSlug}` : "/welcome");
    return new Promise<string>(() => {});
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    // requestJson surfaces the server's error text in the message, so the 409
    // last-admin guard message is already human-readable.
    return message.includes("409")
      ? "You're the last admin. Promote another admin before leaving."
      : message.includes("403") || /forbidden|cross-origin/i.test(message)
        ? "You can't leave this organization right now."
        : "Couldn't leave the organization. Try again.";
  }
}
