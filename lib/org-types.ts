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
 *   - The /create flow: the interview's "kind" answer resolves to a template
 *     (lib/onboarding/kinds.ts), which seeds the editable blueprint.
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
  | "meetings"
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
  "meetings",
  "operations",
] as const;

/**
 * Workflows that are always on and cannot be turned off in the page picker.
 *
 * "operations" backs the Dashboard and Timeline surfaces plus the internal
 * audit/activity plumbing every org needs — disabling it would leave a member
 * with no landing page. The org-config service force-enables these on every
 * write, and the onboarding picker renders them as locked-on, so the two
 * surfaces agree on what can never be removed.
 *
 * The Chapter (meetings) surface used to live here too, but it is now the
 * toggleable "meetings" workflow — an org that doesn't hold formal meetings (a
 * sports team, a loose generic org) can turn it off. Dashboard/Timeline stay,
 * so there is still always a landing page.
 */
export const ALWAYS_ON_WORKFLOWS: readonly WorkflowId[] = ["operations"] as const;

/**
 * WORKFLOW AUTHORITY — who decides whether a page is on.
 *
 * The /create interview asks concrete questions ("in a normal month, which of
 * these actually happen?") and the answers decide the page set. For that to be
 * true, an activity the founder does NOT name must leave its page OFF — which
 * means the org-type template must never pre-seed those pages. Otherwise the
 * template's guess silently survives an answer that didn't include it, and the
 * interview is just theatre over a preset.
 *
 * So every workflow belongs to exactly one class:
 *
 *   BASE — the org gets it no matter what. Never asked, never removed by an
 *   answer. A roster is table stakes; operations backs Dashboard/Timeline.
 *
 *   BEAT — the interview's beats are AUTHORITATIVE over it: named = on,
 *   unnamed = off. kindDefaults() must not seed these (see flow-state.ts), and
 *   the activities checklist computes its removals across this domain.
 *
 * ensureKind() is the one deliberate exception: a founder who skips the
 * interview entirely has given no answers, so there the template genuinely IS
 * the best guess and the full set is seeded.
 *
 * Invariant (asserted in tests/onboarding/org-types.test.ts):
 *   BASE ∪ BEAT === ALL_WORKFLOWS,  ALWAYS_ON ⊆ BASE,  BASE ∩ BEAT === ∅
 */
export const BASE_WORKFLOWS: readonly WorkflowId[] = ["members", "operations"] as const;

export const BEAT_WORKFLOWS: readonly WorkflowId[] = [
  "meetings",
  "attendance",
  "parties",
  "service",
  "events",
  "finance",
  "tasks",
  "communications",
  "docs",
] as const;

export interface RoleSeed {
  name: string;
  color: string;
  rank: number;
  /** Permission names. Empty + `all: true` means full bitfield. */
  permissions: Permission[];
  all?: boolean;
}

/**
 * Normalize a desired workflow set into what actually gets stored:
 *   - keep only known ids (defense in depth; Zod already rejects unknowns),
 *   - de-duplicate,
 *   - union with ALWAYS_ON_WORKFLOWS so core surfaces can never be dropped,
 *   - order by ALL_WORKFLOWS for a stable, readable column.
 *
 * Pure — no DB, no ctx. Shared by setWorkflows (the config PATCH) and
 * provisionOrg (the create blueprint) so both write an identically-shaped set.
 */
export function normalizeWorkflows(ids: readonly string[]): WorkflowId[] {
  const requested = new Set<WorkflowId>(ids as WorkflowId[]);
  for (const w of ALWAYS_ON_WORKFLOWS) requested.add(w);
  return ALL_WORKFLOWS.filter(w => requested.has(w));
}

/**
 * A starter Programming event category seeded per org type. Copied into editable
 * CalendarEventType rows at provisionOrg as `builtin:false, creatable:true,
 * hidden:false, mandatoryDefault:false, workflowId:"events"` — so admins can
 * rename/recolor/reorder/delete any of them from the Programming page or
 * Settings. This is the replacement for the demoted Social/Fundraiser/Program
 * built-ins: a *tailored* per-type suggestion instead of one org's vocabulary
 * imposed on everyone.
 *
 * `slug` is kebab-case, unique within its template, and MUST NOT collide with a
 * built-in slug (chapter/party/deadline/service) — the org-type invariant test
 * guards this. Colors follow the two-theme ivory/dusk palette used by
 * `BUILTIN_EVENT_TYPES` (lib/event-types.ts).
 */
export interface EventTypeSeed {
  slug: string;
  label: string;
  /** Light-theme hex (ivory). */
  color: string;
  /** Dark-theme hex (dusk). */
  colorDark: string;
}

// Shared ivory/dusk palette for the starter categories below, mirroring the
// built-in event-type colors so the timeline stays visually coherent. A concept
// keeps the same color across templates (social = gold, fundraiser = green, …).
const EVT = {
  gold:   { color: "#9a7224", colorDark: "#ddb36a" },
  green:  { color: "#4a7d4c", colorDark: "#86b988" },
  purple: { color: "#6d28d9", colorDark: "#a78bfa" },
  blue:   { color: "#3f6ea3", colorDark: "#8fb0d6" },
  rose:   { color: "#b34f72", colorDark: "#d98ba3" },
  clay:   { color: "#c14a37", colorDark: "#e0796b" },
} as const;

const evt = (slug: string, label: string, c: { color: string; colorDark: string }): EventTypeSeed =>
  ({ slug, label, color: c.color, colorDark: c.colorDark });

/**
 * Fallback starter set for a template that declares no `eventTypeSeeds` of its
 * own (and the generic-org default). Intentionally minimal.
 */
export const DEFAULT_EVENT_TYPE_SEEDS: readonly EventTypeSeed[] = [
  evt("social", "Social", EVT.gold),
  evt("fundraiser", "Fundraiser", EVT.green),
] as const;

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
  /**
   * Starter Programming event categories seeded as editable custom
   * CalendarEventType rows at creation. Omit to fall back to
   * DEFAULT_EVENT_TYPE_SEEDS.
   */
  eventTypeSeeds?: readonly EventTypeSeed[];
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
  // Announcements (communications) and tasks start OFF: a chapter's group
  // chat covers both until exec outgrows it, and they're one toggle away.
  enabledWorkflows: [
    "members",
    "events",
    "attendance",
    "finance",
    "parties",
    "service",
    "docs",
    "meetings",
    "operations",
  ],
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
  eventTypeSeeds: [
    evt("social",      "Social",      EVT.gold),
    evt("fundraiser",  "Fundraiser",  EVT.green),
    evt("programming", "Programming", EVT.purple),
  ],
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
    "meetings",
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
  eventTypeSeeds: [
    evt("social",     "Social",     EVT.gold),
    evt("fundraiser", "Fundraiser", EVT.green),
    evt("workshop",   "Workshop",   EVT.blue),
  ],
};

const SPORTS_TEAM: OrgTypeTemplate = {
  id: "sports-team",
  label: "Sports / club team",
  description:
    "Roster, practice attendance, game-day events, and team comms. No dues, " +
    "GPA, or service hours by default.",
  // Attendance-forward; no finance/service. "events" covers games/practices,
  // "communications" the team channel, "docs" the playbook/forms.
  enabledWorkflows: [
    "members",
    "events",
    "attendance",
    "communications",
    "docs",
    "tasks",
    "operations",
  ],
  roleSeeds: [
    { name: "Captain",       color: "#F59E0B", rank: 100, permissions: [], all: true },
    { name: "Coach",         color: "#3B82F6", rank: 60, permissions: ["MANAGE_EVENTS", "MANAGE_ATTENDANCE", "MANAGE_BROTHERS"] },
    { name: "Team Manager",  color: "#10B981", rank: 50, permissions: ["MANAGE_ANNOUNCEMENTS", "MANAGE_TASKS", "MANAGE_DOCS"] },
  ],
  // Singular forms only — plurals are derived at render time (lib/vocab.ts).
  vocabularyOverrides: {
    Member:   "Player",
    Meetings: "Practice",
    Event:    "Practice",
    Period:   "Season",
  },
  eventTypeSeeds: [
    evt("game",       "Game",       EVT.clay),
    evt("practice",   "Practice",   EVT.blue),
    evt("tournament", "Tournament", EVT.purple),
  ],
};

const SERVICE_ORG: OrgTypeTemplate = {
  id: "service-org",
  label: "Service / volunteer org",
  description:
    "Members, service events, logged volunteer hours, and announcements. " +
    "No parties.",
  // Service-forward: keep service + finance (for fundraising), drop parties.
  enabledWorkflows: [
    "members",
    "events",
    "attendance",
    "finance",
    "service",
    "communications",
    "docs",
    "tasks",
    "meetings",
    "operations",
  ],
  roleSeeds: [
    { name: "President",        color: "#F59E0B", rank: 100, permissions: [], all: true },
    { name: "Service Chair",    color: "#10B981", rank: 50, permissions: ["MANAGE_SERVICE", "MANAGE_EVENTS"] },
    { name: "Treasurer",        color: "#3B82F6", rank: 50, permissions: ["MANAGE_TREASURY"] },
    { name: "Comms Chair",      color: "#EC4899", rank: 50, permissions: ["MANAGE_ANNOUNCEMENTS", "MANAGE_INSTAGRAM"] },
  ],
  vocabularyOverrides: {
    Meetings: "Service events",
  },
  // "service-project" avoids colliding with the built-in "service" slug
  // (Community Service).
  eventTypeSeeds: [
    evt("service-project", "Service Project", EVT.blue),
    evt("fundraiser",      "Fundraiser",      EVT.green),
    evt("outreach",        "Outreach",        EVT.gold),
  ],
};

const HONOR_SOCIETY: OrgTypeTemplate = {
  id: "honor-society",
  label: "Honor society / academic",
  description:
    "Members, meetings, attendance, dues, service hours, and shared docs. " +
    "Tuned for academic + service requirements.",
  enabledWorkflows: [
    "members",
    "events",
    "attendance",
    "finance",
    "service",
    "communications",
    "docs",
    "tasks",
    "meetings",
    "operations",
  ],
  roleSeeds: [
    { name: "President",     color: "#F59E0B", rank: 100, permissions: [], all: true },
    { name: "Vice President", color: "#8B5CF6", rank: 60, permissions: ["MANAGE_EVENTS", "MANAGE_ATTENDANCE", "MANAGE_TASKS"] },
    { name: "Treasurer",     color: "#10B981", rank: 50, permissions: ["MANAGE_TREASURY"] },
    { name: "Secretary",     color: "#3B82F6", rank: 50, permissions: ["MANAGE_ANNOUNCEMENTS", "MANAGE_DOCS"] },
  ],
  vocabularyOverrides: {},
  eventTypeSeeds: [
    evt("induction",  "Induction",  EVT.purple),
    evt("fundraiser", "Fundraiser", EVT.green),
    evt("workshop",   "Workshop",   EVT.blue),
  ],
};

const PERFORMING_ARTS: OrgTypeTemplate = {
  id: "performing-arts",
  label: "Performing arts group",
  description:
    "Members, rehearsals, performance events, dues, and shared scores/scripts. " +
    "No service-hour tracking.",
  enabledWorkflows: [
    "members",
    "events",
    "attendance",
    "finance",
    "communications",
    "docs",
    "tasks",
    "meetings",
    "operations",
  ],
  roleSeeds: [
    { name: "Director",        color: "#F59E0B", rank: 100, permissions: [], all: true },
    { name: "Stage Manager",   color: "#3B82F6", rank: 60, permissions: ["MANAGE_EVENTS", "MANAGE_ATTENDANCE", "MANAGE_TASKS"] },
    { name: "Treasurer",       color: "#10B981", rank: 50, permissions: ["MANAGE_TREASURY"] },
    { name: "Publicity",       color: "#EC4899", rank: 50, permissions: ["MANAGE_INSTAGRAM", "MANAGE_ANNOUNCEMENTS"] },
  ],
  // Singular forms only — plurals are derived at render time (lib/vocab.ts).
  vocabularyOverrides: {
    Member:   "Cast member",
    Meetings: "Rehearsal",
    Event:    "Rehearsal",
  },
  eventTypeSeeds: [
    evt("performance", "Performance", EVT.rose),
    evt("auditions",   "Auditions",   EVT.blue),
    evt("social",      "Social",      EVT.gold),
  ],
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
  [FRATERNITY.id]:      FRATERNITY,
  [GENERIC_CLUB.id]:    GENERIC_CLUB,
  [SPORTS_TEAM.id]:     SPORTS_TEAM,
  [SERVICE_ORG.id]:     SERVICE_ORG,
  [HONOR_SOCIETY.id]:   HONOR_SOCIETY,
  [PERFORMING_ARTS.id]: PERFORMING_ARTS,
  [GENERIC_ORG.id]:     GENERIC_ORG,
};

/** All templates in display order — first is the recommended default. */
export const ORG_TYPES: readonly OrgTypeTemplate[] = [
  FRATERNITY,
  GENERIC_CLUB,
  SPORTS_TEAM,
  SERVICE_ORG,
  HONOR_SOCIETY,
  PERFORMING_ARTS,
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
