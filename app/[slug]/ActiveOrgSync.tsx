"use client";

import { useEffect, useRef } from "react";

/**
 * Aligns the active_org_id cookie to the org the URL slug demands.
 *
 * Rendered by the [slug] layout ONLY when the cookie-resolved active org differs
 * from the URL's org (a stale cookie — e.g. a bookmarked deep-link into a
 * different org than last visited). Server Components can't write cookies during
 * render, so the correction happens here: POST the new active org, then reload
 * so every server component and the ChapterContext refetch pick it up.
 *
 * Common case (cookie already matches URL) never mounts this — no overhead.
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
        if (res.ok) window.location.reload();
      } catch {
        // Network hiccup — leave as-is. The page still renders (guard already
        // authorized this membership); next navigation will retry the sync.
      }
    })();
  }, [organizationId]);

  return null;
}
