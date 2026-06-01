"use client";

import { useEffect, useRef } from "react";

/**
 * Aligns the active_org_id cookie to the org the URL slug demands, then reloads.
 *
 * Rendered by the [slug] layout INSTEAD OF the page children when the
 * cookie-resolved active org differs from the URL's org (a stale cookie — e.g. a
 * bookmarked deep-link into a different org than last visited). Server Components
 * can't write cookies during render, so the correction happens here: POST the
 * new active org, then reload so every server component and the ChapterContext
 * refetch pick it up.
 *
 * Why it replaces the children rather than rendering alongside them: if the page
 * rendered now, ChapterContext would fetch /api/auth/me against the STILL-STALE
 * cookie and briefly flash the wrong org's data before the reload. Showing a
 * neutral sync screen until the reload avoids that flash entirely.
 *
 * Common case (cookie already matches URL) never mounts this — zero overhead.
 */
export function ActiveOrgSync({ organizationId }: { organizationId: number }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    (async () => {
      try {
        const res = await fetch("/api/auth/active-org", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ organizationId }),
        });
        // On success the cookie now matches the URL. Reload so server-rendered
        // chrome and cookie-scoped API fetches re-run against the right org.
        if (res.ok) {
          window.location.reload();
          return;
        }
      } catch {
        // Network hiccup — fall through to a reload anyway so we don't get
        // stuck on the sync screen. The guard already authorized this
        // membership; a reload re-runs the same path and retries the sync.
      }
      window.location.reload();
    })();
  }, [organizationId]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07090f]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/15 border-t-indigo-400" />
        <p className="text-[12px] text-white/40">Switching organization…</p>
      </div>
    </main>
  );
}
