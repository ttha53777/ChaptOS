/**
 * Org-type registry. Each entry is a template applied at org creation time:
 * which workflows are enabled, which roles get seeded, what vocabulary
 * overrides the UI should apply.
 *
 * Lives in code (not DB) for v1. The list is small, churns rarely, and being
 * checked into git means template changes are reviewable as PRs. Move to a
 * DB-backed registry only when you need to add types without a deploy.
 *
 * Consumed by:
 *   - The org-create flow: copies enabledWorkflows + vocabularyOverrides into
 *     OrganizationConfig on provisioning, and seeds the role hierarchy.
 *   - The sidebar/dashboard/route guards (once the workflow registry ships):
 *     filters surfaces by OrganizationConfig.enabledWorkflows.
 *   - The org-type picker UI on /welcome/create: reads label + description.
 *
 * Workflow ids match the workflow audit from the planning doc. Keep this list
 * in sync with the workflow registry when that lands.
 */

import type { Permission } from "@/lib/permissions";

export type WorkflowId =
  | "members"
  | "events"
  | "attendance"
  | "finance"
  | "parties"
  | "service"
  | "communications"
  | "docs"
  | "tasks"
  | "operations";

export const ALL_WORKFLOWS: readonly WorkflowId[] = [
  "members",
  "events",
  "attendance",
  "finance",
  "parties",
  "service",
  "communications",
  "docs",
  "tasks",
  "operations",
] as const;

/**
 * Workflows that are always on and cannot be turned off in the page picker.
 *
 * "operations" backs the Dashboard, Timeline, and Chapter surfaces plus the
 * internal audit/activity plumbing every org needs — disabling it would leave a
 * member with no landing page. The org-config service force-enables these on
 * every write, and the onboarding picker renders them as locked-on, so the two
 * surfaces agree on what can never be removed.
 */
export const ALWAYS_ON_WORKFLOWS: readonly WorkflowId[] = ["operations"] as const;

export interface RoleSeed {
  name: string;
  color: string;
  rank: number;
  /** Permission names. Empty + `all: true` means full bitfield. */
  permissions: Permission[];
  all?: boolean;
}

export interface OrgTypeTemplate {
  /** Registry key. Stored on Organization.orgType. */
  id: string;
  /** Shown on the create-org picker. */
  label: string;
  /** One-sentence explanation shown next to the radio. */
  description: string;
  /** Workflow ids to enable on OrganizationConfig.enabledWorkflows. */
  enabledWorkflows: readonly WorkflowId[];
  /** Roles seeded into the new org. The first role is granted to the founder. */
  roleSeeds: readonly RoleSeed[];
  /**
   * Sparse map of canonical-term overrides written into
   * OrganizationConfig.vocabularyOverrides. Examples: { Member: "Brother" }.
   * UI components that respect canonical aliases read this.
   */
  vocabularyOverrides: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const FRATERNITY: OrgTypeTemplate = {
  id: "fraternity",
  label: "Fraternity / Sorority",
  description:
    "Full chapter operations: brothers, meetings, attendance, dues, " +
    "parties, service hours, semesters.",
  enabledWorkflows: ALL_WORKFLOWS,
  // Mirrors the existing SYSTEM_ROLES from lib/seed-roles.ts so an LPE-style
  // org can be provisioned from scratch and look identical to a seeded one.
  // President is rank 100 and ALL_PERMISSIONS — that's what the founder gets.
  roleSeeds: [
    { name: "President", color: "#F59E0B", rank: 100, permissions: [], all: true },
    { name: "Treasurer", color: "#10B981", rank: 50, permissions: ["MANAGE_TREASURY"] },
    { name: "Social",    color: "#EC4899", rank: 50, permissions: ["MANAGE_EVENTS", "MANAGE_PARTIES", "MANAGE_TASKS"] },
    { name: "PR",        color: "#3B82F6", rank: 50, permissions: ["MANAGE_INSTAGRAM"] },
  ],
  vocabularyOverrides: {
    Member:   "Brother",
    Meetings: "Chapter",
  },
};

const GENERIC_CLUB: OrgTypeTemplate = {
  id: "generic-club",
  label: "Student club / organization",
  description:
    "Members, meetings, attendance, finances, announcements. No parties or " +
    "service-hour tracking.",
  enabledWorkflows: [
    "members",
    "events",
    "attendance",
    "finance",
    "communications",
    "docs",
    "tasks",
    "operations",
  ],
  roleSeeds: [
    { name: "President", color: "#F59E0B", rank: 100, permissions: [], all: true },
    { name: "Treasurer", color: "#10B981", rank: 50, permissions: ["MANAGE_TREASURY"] },
    { name: "Secretary", color: "#3B82F6", rank: 50, permissions: ["MANAGE_EVENTS", "MANAGE_ANNOUNCEMENTS", "MANAGE_TASKS"] },
  ],
  vocabularyOverrides: {
    // Canonical defaults already match a generic club; nothing to override.
  },
};

const GENERIC_ORG: OrgTypeTemplate = {
  id: "generic-org",
  label: "Generic organization",
  description:
    "Minimal setup: members, events, announcements, and shared docs. Add " +
    "more workflows from Settings later.",
  enabledWorkflows: ["members", "events", "communications", "docs", "tasks", "operations"],
  roleSeeds: [
    { name: "Admin", color: "#F59E0B", rank: 100, permissions: [], all: true },
  ],
  vocabularyOverrides: {},
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const REGISTRY: Record<string, OrgTypeTemplate> = {
  [FRATERNITY.id]:    FRATERNITY,
  [GENERIC_CLUB.id]:  GENERIC_CLUB,
  [GENERIC_ORG.id]:   GENERIC_ORG,
};

/** All templates in display order — first is the recommended default. */
export const ORG_TYPES: readonly OrgTypeTemplate[] = [
  FRATERNITY,
  GENERIC_CLUB,
  GENERIC_ORG,
];

/** Lookup by id. Returns null for unknown ids (avoid throwing during runtime config reads). */
export function getOrgType(id: string | null | undefined): OrgTypeTemplate | null {
  if (!id) return null;
  return REGISTRY[id] ?? null;
}

/** Type-guard for validators / Zod refinements. */
export function isOrgTypeId(id: string): boolean {
  return id in REGISTRY;
}

/** Stable list of registered ids — useful for Zod enums. */
export const ORG_TYPE_IDS = ORG_TYPES.map(t => t.id);
