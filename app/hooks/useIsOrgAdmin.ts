"use client";

import { useChapter } from "../context/ChapterContext";

/**
 * True when the signed-in user holds org-admin authority over the ACTIVE org.
 *
 * Mirrors how the server derives `ctx.isOrgAdmin` (lib/context/request-context.ts):
 * platform admin, OR the Membership for the active org carries isOrgAdmin. Note
 * this is deliberately NOT a permission bit — a few things (org deletion, the
 * platform subscription) are the account holder's business rather than a
 * delegable power, so `can(...)` can't express them.
 *
 * UI use only. Every server entry point re-checks; this exists so we don't
 * render a control that would 403 on click.
 */
export function useIsOrgAdmin(): boolean {
  const { currentUser } = useChapter();
  if (!currentUser) return false;
  // `isAdmin` is the (deprecated-name) platform-admin flag from /api/auth/me.
  if (currentUser.isAdmin) return true;
  return currentUser.memberships.find(m => m.organizationId === currentUser.orgId)?.isOrgAdmin ?? false;
}
