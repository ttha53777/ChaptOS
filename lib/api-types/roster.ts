// Roster wire shapes. Type-only: see lib/api-types/index.ts for the rules.

/** GET /api/brothers — one roster row (Membership-backed, keyed by brotherId). */
export interface Brother {
  id: number;
  name: string;
  role: string;
  attendance: number;
  duesOwed: number;
  gpa: number;
  serviceHours: number;
  /** When this person joined THIS org (Membership.joinedAt), ISO. Absent on old cached data. */
  joinedAt?: string;
  avatarUrl?: string | null;
  roles?: { id: number; name: string; color: string | null; rank: number }[];
  /** Per-member values for org-defined custom fields. Absent on old cached data — treat as {}. */
  customFields?: Record<string, string | number | null>;
}

/** GET /api/brothers/[id]/profile — what the member card shows beyond the roster row: contact + tenure. */
export interface MemberProfile {
  brotherId: number;
  email:     string | null;
  joinedAt:  string;
}
