"use client";

import { useState } from "react";
import { useChapter } from "../context/ChapterContext";

/**
 * Minimal active-org switcher. Renders only when the user has >1 membership.
 * On select: POSTs to /api/auth/active-org, then full-reloads so server-rendered
 * routes pick up the new orgId from the cookie.
 */
export function OrgSwitcher() {
  const { currentUser } = useChapter();
  const [pending, setPending] = useState(false);

  if (!currentUser || currentUser.memberships.length <= 1) return null;

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const organizationId = Number(e.target.value);
    if (!Number.isInteger(organizationId)) return;
    setPending(true);
    try {
      const res = await fetch("/api/auth/active-org", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      if (!res.ok) {
        setPending(false);
        return;
      }
      // Cookie set; reload so server components re-render with the new org.
      window.location.reload();
    } catch {
      setPending(false);
    }
  }

  return (
    <label className="flex items-center gap-2 text-xs text-zinc-400">
      <span className="sr-only">Active organization</span>
      <select
        className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-200 outline-none focus:border-indigo-500"
        value={currentUser.orgId}
        onChange={onChange}
        disabled={pending}
        aria-label="Active organization"
      >
        {currentUser.memberships.map(m => (
          <option key={m.organizationId} value={m.organizationId}>
            {m.orgName}
          </option>
        ))}
      </select>
    </label>
  );
}
