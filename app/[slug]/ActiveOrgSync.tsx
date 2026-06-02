"use client";

import { useEffect, useRef } from "react";

/**
 * Background-aligns the active_org_id cookie to the org the URL slug demands.
 *
 * Rendered by the [slug] layout ALONGSIDE the page children when the cookie lags
 * the URL's org (a bookmarked deep-link or cross-org link). Org resolution already
 * followed the URL slug (requireUser({ orgSlug })), so the page renders the right
 * org now — this just corrects the cookie for slug-less entry points (/, the org
 * switcher, API calls without slug context) on the NEXT navigation.
 *
 * It does NOT reload: the visible page is already correct, so a fire-and-forget
 * POST is enough. Renders nothing. The common case (cookie already matches the
 * URL) never mounts this — zero overhead.
 */
export function ActiveOrgSync({ organizationId }: { organizationId: number }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    // Fire-and-forget. A failure just leaves the cookie stale until the next
    // slug-driven render retries — never blocks or disrupts the current page.
    void fetch("/api/auth/active-org", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId }),
    }).catch(() => {});
  }, [organizationId]);

  return null;
}
