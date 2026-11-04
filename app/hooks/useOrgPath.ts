"use client";

import { useCallback } from "react";
import { usePathname } from "next/navigation";
import { useChapter } from "../context/ChapterContext";
import { orgHref, orgSlugFromPath } from "@/lib/org-paths";

/**
 * Prefixes an app path with the active org, so links resolve under the
 * org-scoped /org/[slug] route tree.
 *
 *   const orgPath = useOrgPath();
 *   orgPath("/treasury")  // → "/org/lpe/treasury"
 *   orgPath("/")          // → "/org/lpe"
 *
 * Pass paths WITHOUT the org prefix (e.g. "/treasury", "/").
 *
 * Slug source, in priority order:
 *   1. ChapterContext (currentUser.org.slug) — authoritative once loaded.
 *   2. The slug in the current pathname — covers the brief window on initial
 *      mount before /api/auth/me resolves. These links only ever render inside
 *      /org/[slug]/*, so the URL's own slug IS the org. Without this, fast
 *      clicks during load would hit bare "/treasury" (a 404).
 *
 * If neither yields a slug (e.g. rendered outside any org route), we return the
 * bare path unchanged.
 */
export function useOrgPath() {
  const { currentUser } = useChapter();
  const pathname = usePathname();

  const slug = currentUser?.org?.slug ?? orgSlugFromPath(pathname);

  return useCallback(
    (path: string): string => {
      if (!slug) return path; // no org context at all — graceful fallback
      return orgHref(slug, path);
    },
    [slug],
  );
}
