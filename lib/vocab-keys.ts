/**
 * The vocabulary keys and their default words, without lib/vocab's `pluralize`
 * dependency: pure, so the native app (scripts/lint-mobile-imports.py SHARED) and
 * the web share one list. lib/vocab re-exports everything here.
 */

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
