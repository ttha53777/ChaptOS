// Signed-in-user wire shapes. Type-only: see lib/api-types/index.ts for the rules.
import type { Schedule } from "@/lib/calendar-feed/schedule";
import type { CustomMemberFieldDef } from "@/lib/custom-member-fields";
import type { Thresholds } from "@/lib/thresholds";

/** One org the signed-in person belongs to. Mirrors MembershipSummary in lib/auth/require-user.ts. */
export interface MembershipSummary {
  id: number;
  organizationId: number;
  isOrgAdmin: boolean;
  orgName: string;
  orgSlug: string;
  /** Display name in THIS org, or null when it falls back to the account name. */
  name: string | null;
  orgLogoUrl: string | null;
  /** Office title in this org (top-ranked role, else Membership.role). */
  title: string;
}

export interface MeRole {
  id: number;
  name: string;
  color: string | null;
  rank: number;
  permissions: number;
}

/**
 * The org's dashboard arrangement (see lib/dashboard-layout.ts for the ids and
 * the normalizer). One per org — every member sees the same page.
 */
export interface DashboardLayout {
  /** Card ids in the full-width spot under the health dial (only the pinned
   *  note may sit there). Added 2026-10. */
  top: string[];
  /** Card ids, top to bottom, in the wide left column. */
  main: string[];
  /** Card ids, top to bottom, in the right rail. */
  rail: string[];
  /** Cards and bands the admin switched off. */
  hidden: string[];
  /** Headline-number ids in strip order (at most 3; [] = no number row). Null
   *  only ever came from older servers, where it meant "whatever the org tracks". */
  numbers: string[] | null;
}

/** The active org as /api/auth/me describes it. Admin-only fields arrive null/0/[] for everyone else. */
export interface MeOrg {
  name: string;
  slug: string;
  orgType: string | null;
  logoUrl: string | null;
  timeZone: string | null;
  instagramHandle: string | null;
  /** Which workflows (sidebar surfaces) the org has switched on. */
  enabledWorkflows: string[];
  /** Sparse map of canonical-term substitutions ("Brother" → "Member"). */
  vocabularyOverrides: Record<string, string>;
  /** The org's complete, resolved member-status cutoffs. */
  thresholds: Thresholds;
  /** OPT-OUT map of hidden page sections: workflow id → feature ids. */
  disabledFeatures: Record<string, string[]>;
  navOrder: string[];
  /** The admin-arranged dashboard every member sees. Null until someone customizes it. */
  dashboardLayout: DashboardLayout | null;
  customMemberFields: CustomMemberFieldDef[];
  metricDefinitionCount: number;
  pendingReimbursementCount: number;
  /** Server-zeroed for viewers without MANAGE_BROTHERS. */
  pendingJoinRequestCount: number;
  /** Server-emptied without MANAGE_EVENTS. Candidates — filter against the viewer's local date. */
  wrapUpsDue: { id: number; title: string; dueDate: string | null; schedule: Schedule | null; stage: "confirmed" }[];
  /** Server-emptied without MANAGE_FUNDRAISING. Unwrapped fundraisers that may be over — filter against the viewer's local date. */
  fundraisersToWrap: { id: number; name: string; date: string }[];
  onboardingComplete: boolean;
  /** Null for anyone who isn't an org/platform admin. */
  billingAlert: "past_due" | "unpaid" | "canceled" | null;
  /** Null for anyone who isn't an org/platform admin. */
  seats: { used: number; capacity: number } | null;
}

/**
 * GET /api/auth/me — the signed-in person in the active org (picked by the
 * x-org-slug header, else the active_org cookie, else their first org).
 *
 * A 401 means either "no valid session" or "valid account, no roster row
 * anywhere" — follow up with GET /api/auth/join-requests to tell them apart.
 */
export interface MeResponse {
  id: number;
  name: string;
  role: string;
  isAdmin: boolean;
  email: string;
  avatarUrl: string | null;
  hasCustomAvatar: boolean;
  org: MeOrg | null;
  orgId: number;
  memberships: MembershipSummary[];
  /** Effective permission bitfield in the active org (see lib/permissions.ts). */
  permissions: number;
  /** Highest role rank; null on the wire means unbounded (org/platform admin). */
  maxRank: number | null;
  roles: MeRole[];
}

/**
 * GET /api/auth/join-requests — the caller's own join requests across orgs,
 * newest first. Works with no roster row at all, which is what makes it the
 * "signed in but not a member yet" probe.
 */
export interface OwnJoinRequest {
  id: number;
  submittedName: string;
  status: string;
  decidedAt: string | null;
  org: { name: string; slug: string };
}

/** One org a deleted account would be removed from. */
export interface AccountDeletionOrg {
  name: string;
  slug: string;
  /**
   * Why this org stops the deletion, or null when it doesn't. "last_admin":
   * nobody else can manage it — promote another admin, or delete the org.
   */
  blocker: "last_admin" | null;
  /** Nobody else is on this roster, so deleting the org is the usual way out. */
  soleMember: boolean;
}

/**
 * GET /api/auth/account — what deleting the signed-in account would do. Works
 * with no roster row at all. DELETE /api/auth/account answers 409 with this same
 * shape under `details` when something blocks it.
 */
export interface AccountDeletionPreview {
  canDelete: boolean;
  /** Platform staff grants are revoked by support, never by self-deletion. */
  isPlatformAdmin: boolean;
  orgs: AccountDeletionOrg[];
}
