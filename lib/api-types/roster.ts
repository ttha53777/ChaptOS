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

/* ── Join requests (MANAGE_BROTHERS) ─────────────────────────────────────────── */

/** One person waiting to be let in (they opened an invite link; nothing exists for them yet). */
export interface JoinRequestRow {
  id: number;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  /** ISO instant the request was filed. */
  createdAt: string;
  inviteId: number;
  /** The link's label ("Spring rush"); null for an unlabeled link. */
  inviteLabel: string | null;
}

/** Whether approving one more would fit the plan (lib/billing/guard SeatCheck). */
export interface JoinSeatCheck {
  allowed: boolean;
  currentMembers: number;
  limit: number;
  requiredTier: string;
  priceCents: number | null;
  action: "checkout" | "upgrade" | "quote" | null;
}

/** GET /api/join-requests?page=1 (query: joinRequestPageInput). */
export interface JoinRequestPage {
  rows: JoinRequestRow[];
  /** Matching this search/filter. */
  total: number;
  /** Everything pending, for the Members badge. */
  pendingTotal: number;
  seats: JoinSeatCheck;
  nextCursor: { afterDate: string; afterId: number } | null;
}

/** POST /api/join-requests/[id]/approve (body: approveJoinRequestInput). */
export interface JoinRequestApproved {
  brotherId: number;
  name: string;
  roleName: string | null;
}
