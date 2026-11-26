// Settings wire shapes (Identity, Accounts, Roles, Invitations). Type-only: see
// lib/api-types/index.ts for the rules.
import type { InviteStatus } from "@/lib/state";

/** One person in GET /api/auth/accounts: the account-admin view of the roster. */
export interface AccountRow {
  /** brotherId. */
  id: number;
  /** This org's name for them (Membership.name, with its fallback). */
  name: string;
  /** The Membership.role free text ("Brother"). */
  role: string;
  /** Has a Google account linked (false = can't sign in). */
  linked: boolean;
  isSelf: boolean;
  /** Org admin here (Membership.isOrgAdmin). */
  isAdmin: boolean;
  email: string | null;
  avatarUrl: string | null;
  /** Their roles here, highest rank first. */
  roles: { id: number; name: string; color: string | null; rank: number }[];
}

/** GET /api/roles as a MANAGE_ROLES holder reads it: RoleChip with the bits always present. */
export interface RoleDetail {
  id: number;
  name: string;
  color: string | null;
  rank: number;
  memberCount: number;
  permissions: number;
  isSystem: boolean;
}

/** POST /api/roles (201) and PATCH /api/roles/[id]: the saved row. */
export interface RoleSaved {
  id: number;
  organizationId: number;
  name: string;
  color: string | null;
  rank: number;
  permissions: number;
  isSystem: boolean;
  createdAt: string;
}

/** POST /api/brothers/[id]/roles (201). */
export interface RoleGranted {
  brotherId: number;
  roleId: number;
}

/** PATCH /api/auth/accounts/[id] (platform admins): the admin switch. */
export interface AdminChanged {
  id: number;
  isAdmin: boolean;
}

/** One invite link in GET /api/invites (MANAGE_SETTINGS; `?include=all` adds dead ones) and POST /api/invites (201). */
export interface InviteRow {
  id: number;
  token: string;
  label: string | null;
  maxUses: number | null;
  status: InviteStatus;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  /** People admitted through it. */
  redemptionCount: number;
  /** Requests through it still waiting on an officer. */
  pendingCount: number;
  /** Places left (maxUses − admitted − waiting), or null when uncapped. */
  availableUses: number | null;
  createdByName: string | null;
}

/** One join through a link: GET /api/invites/[id]/redemptions. */
export interface InviteRedemption {
  brotherId: number;
  name: string;
  redeemedAt: string;
}

/** PATCH /api/orgs/config (MANAGE_SETTINGS). The app re-reads /api/auth/me after. */
export interface OrgConfigSaved {
  ok: true;
}

/** POST /api/orgs/logo (multipart `file`) and DELETE /api/orgs/logo. */
export interface OrgLogoSaved {
  logoUrl: string | null;
}

/** One custom metric: GET /api/metrics/definitions (every member), POST (201) and PATCH /api/metrics/definitions/[id] (MANAGE_SETTINGS). */
export interface MetricDefinition {
  id: number;
  organizationId: number;
  /** kebab-case, fixed once created. */
  slug: string;
  name: string;
  unit: string | null;
  goal: number;
  atRiskBelow: number;
  watchBelow: number | null;
  aggregation: "avg" | "sum" | "count_on_track";
  displayOrder: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** PATCH /api/calendar/subscription (org admins). The app re-reads the view after. */
export interface CalendarFeedChanged {
  ok: true;
}
