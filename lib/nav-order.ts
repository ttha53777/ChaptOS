/**
 * Sidebar nav ordering.
 *
 * Admins can reorder the sidebar pages (Notion-style up/down). The chosen order
 * is stored as `OrganizationConfig.navOrder` — a list of nav labels — and edited
 * through the Workflows settings section (same org-admin gate and PATCH
 * /api/orgs/config plumbing as enabledWorkflows / disabledFeatures).
 *
 * The order is SPARSE and ADVISORY:
 *   - It lists nav labels, not workflow ids, because the sidebar reasons in nav
 *     labels (NAV / NAV_GROUPS).
 *   - Labels not present in navOrder keep their default position, appended after
 *     the ordered ones. So a brand-new page (added in a later release) shows up
 *     in its default slot without anyone re-saving, and an org that never touched
 *     the order renders exactly as before.
 *   - Unknown labels in the stored list (e.g. a page later removed from the
 *     product) are ignored.
 *
 * Reordering is scoped WITHIN each NAV_GROUP — moving a page across the
 * "Overview"/"Members"/"Operations" headings would fight the group structure, so
 * the editor and `applyNavOrder` both operate per-group. A single navOrder array
 * still holds every group's labels; applyNavOrder just filters to the labels it's
 * given, so one list drives all groups.
 */

/**
 * The sidebar's nav GROUPS, in render order. Each group is a heading plus the
 * nav labels under it, in their default order. This is the server-safe source of
 * truth for "what pages/groups exist and in what default order" — the client
 * Sidebar imports it to render, the org-config service imports it to validate a
 * submitted navOrder, and the Workflows settings editor imports it to lay out the
 * per-group reorder controls. Kept here (not in the "use client" Sidebar) so
 * server code can import it without pulling client-only modules.
 *
 * The labels are routing keys, not display text — the sidebar maps them to
 * vocab-aware display labels at render time.
 */
export const NAV_GROUPS: ReadonlyArray<{ label: string; items: readonly string[] }> = [
  { label: "Overview", items: ["Dashboard", "Timeline"] },
  { label: "Members", items: ["Brotherhood", "Chapter", "Tasks"] },
  { label: "Operations", items: ["Docs", "Instagram", "Programming", "Service", "Parties", "Treasury"] },
] as const;

/** Every nav label across all groups, in default order. Used to validate a
 *  submitted navOrder (normalizeNavOrder) and as the sidebar's flat NAV list. */
export const NAV_LABELS: readonly string[] = NAV_GROUPS.flatMap((g) => g.items);

/**
 * Order `labels` (the members of one nav group, in their default order) by the
 * admin-chosen `navOrder`. Labels present in `navOrder` come first, in that
 * order; any remaining labels keep their default order, appended after. Stable
 * for labels the order doesn't mention.
 */
export function applyNavOrder(labels: readonly string[], navOrder: readonly string[]): string[] {
  if (!navOrder.length) return [...labels];
  const present = new Set(labels);
  const seen = new Set<string>();
  const ordered: string[] = [];

  // 1. Labels the admin explicitly ordered, in their stored order (skip unknown
  //    or out-of-group labels — applyNavOrder only emits labels it was given).
  for (const label of navOrder) {
    if (present.has(label) && !seen.has(label)) {
      ordered.push(label);
      seen.add(label);
    }
  }
  // 2. Anything not mentioned in navOrder keeps its default position at the end.
  for (const label of labels) {
    if (!seen.has(label)) ordered.push(label);
  }
  return ordered;
}

/**
 * Normalize an incoming navOrder list before persisting: trim, drop blanks and
 * duplicates, and keep only labels the sidebar actually knows about. Order is
 * preserved. `knownLabels` is the full set of valid nav labels (NAV) so a stale
 * or hand-crafted client can't write junk into the column.
 */
export function normalizeNavOrder(
  input: readonly string[],
  knownLabels: readonly string[],
): string[] {
  const known = new Set(knownLabels);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const label = typeof raw === "string" ? raw.trim() : "";
    if (label && known.has(label) && !seen.has(label)) {
      out.push(label);
      seen.add(label);
    }
  }
  return out;
}
