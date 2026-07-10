/**
 * Consistent stroke icons (Lucide-style) — one per ability area — ported
 * verbatim from the mock so the roles screen reads as a refined product
 * surface, not an emoji settings form.
 */

import type { PermAreaId } from "@/lib/onboarding/perm-areas";

const ICON_PATHS: Record<PermAreaId, string> = {
  money:    '<circle cx="12" cy="12" r="8"/><path d="M14.5 9.5a2.5 2 0 0 0-2.5-1.5c-1.4 0-2.5.7-2.5 1.8s1.1 1.6 2.5 1.9 2.5.8 2.5 1.9-1.1 1.8-2.5 1.8a2.5 2 0 0 1-2.5-1.5M12 6.7v1M12 16.3v1"/>',
  people:   '<circle cx="9" cy="8" r="3"/><path d="M4 19a5 5 0 0 1 10 0"/><path d="M16 6a3 3 0 0 1 0 6M20 19a5 5 0 0 0-3-4.6"/>',
  meetings: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 9h16M8 3v4M16 3v4"/><path d="m9 14 2 2 3.5-3.5"/>',
  events:   '<path d="M4.5 19.5 9 9l6 6-10.5 4.5Z"/><path d="M14.5 4.5 16 6M19.5 7.5 18 9M13 3l.5 1.5L15 5l-1.5.5L13 7l-.5-1.5L11 5l1.5-.5L13 3ZM20 11l.4 1.2 1.1.3-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.3.4-1.2Z"/>',
  comms:    '<path d="M4 11v2a1 1 0 0 0 1 1h2l4 4V6L7 10H5a1 1 0 0 0-1 1Z"/><path d="M15 9a3 3 0 0 1 0 6M18 6.5a6 6 0 0 1 0 11"/>',
  content:  '<path d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"/>',
};

export function AreaIcon({ id }: { id: PermAreaId }) {
  return (
    <span className="pi">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        dangerouslySetInnerHTML={{ __html: ICON_PATHS[id] }}
      />
    </span>
  );
}
