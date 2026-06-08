/**
 * UI vocabulary system.
 *
 * Each VocabKey is a canonical term used in nav labels and page headings.
 * OrganizationConfig.vocabularyOverrides stores a sparse map of overrides;
 * resolveLabel() falls back to DEFAULT_LABELS when no override is set.
 *
 * Plurals are derived at render time via the `pluralize` package — store
 * the singular form only, pass plural=true to resolveLabel() when needed.
 */

import pluralize from "pluralize";

export const VOCAB_KEYS = [
  "Member",       // Roster member   → Brother, Player, Officer…
  "Period",       // Academic term   → Semester, Season, Quarter… (default: Semester)
  "Meetings",     // Meetings page   → Chapter, Board, Sessions…
  "Event",        // Calendar event  → Practice, Session…
  "Attendance",   // Attendance tracking
  "Treasury",     // Finance area    → Budget, Finances…
  "Dues",         // Member dues     → Membership Fees, Contributions… (default: Dues)
  "Role",         // Permission role → Position, Rank…
  "Admin",        // Org admin       → Officer, Leader…
  "Service",      // Service hours   → Volunteering, Community…
  "Announcement", // Org-wide posts  → Bulletin, Update…
  "Doc",          // Shared docs     → Resource, File…
] as const;

export type VocabKey = (typeof VOCAB_KEYS)[number];
export type VocabOverrides = Partial<Record<VocabKey, string>>;

/** Fallback display labels used when no override is set. */
export const DEFAULT_LABELS: Record<VocabKey, string> = {
  Member:       "Member",
  Period:       "Semester",
  Meetings:     "Meetings",
  Event:        "Event",
  Attendance:   "Attendance",
  Treasury:     "Treasury",
  Dues:         "Dues",
  Role:         "Role",
  Admin:        "Admin",
  Service:      "Service",
  Announcement: "Announcement",
  Doc:          "Doc",
};

/**
 * Resolve a vocab key to its display string.
 *
 * @param key      - canonical vocab key
 * @param overrides - sparse map from OrganizationConfig.vocabularyOverrides
 * @param plural   - whether to return the plural form
 */
export function resolveLabel(
  key: VocabKey,
  overrides: VocabOverrides,
  plural = false,
): string {
  const singular = overrides[key] ?? DEFAULT_LABELS[key];
  return plural ? pluralize(singular) : singular;
}
