"use client";

import { useChapter } from "../context/ChapterContext";

/**
 * Minimal active-org switcher. Renders only when the user has >1 membership.
 *
 * Switching = navigating to the target org's URL (/<slug>). The /[slug] layout
 * guard reconciles the active_org_id cookie to the URL, so we don't POST here —
 * org identity flows through the URL and the cookie follows.
 *
 * We use a HARD navigation (location.assign), not router.push. Next caches and
 * reuses the [slug] layout across navigations that stay within the same layout
 * file — and /lpe → /other is the SAME layout, just a different param. A soft
 * push risks the guard (and its cookie-sync <ActiveOrgSync>) not re-running, so
 * the new org's data would never load. A hard nav guarantees the server layout
 * re-executes, the cookie syncs, and ChapterContext remounts against the new
 * org. Org switching is rare; correctness over SPA-smoothness here.
 */
export function OrgSwitcher() {
  const { currentUser } = useChapter();

  if (!currentUser || currentUser.memberships.length <= 1) return null;

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    // Sentinel: "found another org" — the /create flow detects the existing
    // session at its Build step and skips the Google button.
    if (e.target.value === "__new__") {
      window.location.assign("/create");
      return;
    }
    const organizationId = Number(e.target.value);
    if (!Number.isInteger(organizationId)) return;
    const target = currentUser?.memberships.find(m => m.organizationId === organizationId);
    if (!target) return;
    window.location.assign(`/${target.orgSlug}`);
  }

  return (
    <label className="flex items-center gap-2 text-xs text-[#958d7c]">
      <span className="sr-only">Active organization</span>
      <select
        className="w-full rounded-md border border-[rgba(236,231,221,0.12)] bg-[#161310] px-2 py-1 text-[#c9c2b4] outline-none transition-colors focus:border-[#a78bfa]"
        value={currentUser.orgId}
        onChange={onChange}
        aria-label="Active organization"
      >
        {currentUser.memberships.map(m => (
          <option key={m.organizationId} value={m.organizationId}>
            {m.orgName}
          </option>
        ))}
        <option value="__new__">＋ Create a new organization…</option>
      </select>
    </label>
  );
}
