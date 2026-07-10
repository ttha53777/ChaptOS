/**
 * Plain-language permission "areas" for the /create roles step.
 *
 * Areas bucket the 14 real MANAGE_* flags into six human abilities. Each pill
 * on the roles screen is one area; tapping grants/removes its whole bundle,
 * and the Advanced disclosure splits a bundle into its individual flags
 * (PERM_LABELS). `gate` ties an area's visibility to the org's enabled
 * workflows, so the roles screen only shows abilities the workspace has.
 *
 * Areas are DISJOINT — each real permission belongs to exactly one area — so a
 * role never lights two pills from one ability. All 14 flags are covered,
 * including MANAGE_SETTINGS (org config + invite links), which lives in the
 * People/admin area. tests/onboarding/perm-areas.test.ts enforces the
 * partition, so adding a 15th permission fails loudly here until it's homed.
 *
 * Pure data + helpers, no React. The toggle helpers return NEW arrays so they
 * compose with React state updates.
 */

import type { Permission } from "@/lib/permissions";
import type { WorkflowId } from "@/lib/org-types";

export type PermAreaId = "money" | "people" | "meetings" | "events" | "comms" | "content";

export interface PermArea {
  id: PermAreaId;
  label: string;
  perms: readonly Permission[];
  /** Whether this area applies given the org's enabled workflows. */
  gate: (enabled: ReadonlySet<WorkflowId>) => boolean;
}

export const PERM_AREAS: readonly PermArea[] = [
  {
    id: "money", label: "Money",
    perms: ["MANAGE_TREASURY"],
    gate: w => w.has("finance"),
  },
  {
    id: "people", label: "People",
    perms: ["MANAGE_BROTHERS", "MANAGE_ROLES", "MANAGE_SETTINGS"],
    gate: () => true,
  },
  {
    id: "meetings", label: "Meetings",
    perms: ["MANAGE_ATTENDANCE", "MANAGE_SEMESTERS"],
    gate: w => w.has("attendance"),
  },
  {
    id: "events", label: "Events",
    perms: ["MANAGE_EVENTS", "MANAGE_PARTIES"],
    gate: w => w.has("events"),
  },
  {
    id: "comms", label: "Comms",
    perms: ["MANAGE_ANNOUNCEMENTS", "MANAGE_INSTAGRAM"],
    gate: () => true,
  },
  {
    id: "content", label: "Content",
    perms: ["MANAGE_DOCS", "MANAGE_TASKS", "MANAGE_POLLS", "MANAGE_SERVICE"],
    gate: w => w.has("docs") || w.has("tasks") || w.has("service"),
  },
] as const;

/** Short human labels for the advanced per-flag toggles — one per MANAGE_* flag. */
export const PERM_LABELS: Record<Permission, string> = {
  MANAGE_TREASURY:      "Log dues & payments",
  MANAGE_BROTHERS:      "Edit the roster",
  MANAGE_ROLES:         "Assign roles",
  MANAGE_SETTINGS:      "Org settings & invites",
  MANAGE_ATTENDANCE:    "Take attendance",
  MANAGE_SEMESTERS:     "Manage the term",
  MANAGE_EVENTS:        "Manage events",
  MANAGE_PARTIES:       "Run parties & socials",
  MANAGE_ANNOUNCEMENTS: "Post announcements",
  MANAGE_INSTAGRAM:     "Run Instagram",
  MANAGE_DOCS:          "Manage docs",
  MANAGE_TASKS:         "Assign tasks",
  MANAGE_POLLS:         "Run polls",
  MANAGE_SERVICE:       "Track service hours",
};

/** One short verb-phrase per area, for the auto-generated "Can …" summary. */
export const AREA_PHRASE: Record<PermAreaId, string> = {
  money:    "handle the money",
  people:   "manage the roster",
  meetings: "run meetings",
  events:   "plan events",
  comms:    "get the word out",
  content:  "keep docs & tasks",
};

/** One-line "what this ability lets a role do" — shown on a pill's hover. */
export const AREA_DESC: Record<PermAreaId, string> = {
  money:    "Record dues and payments, and see who still owes.",
  people:   "Add or remove members, assign roles, and manage org settings & invite links.",
  meetings: "Take attendance and set up the term's meeting schedule.",
  events:   "Create events, and plan parties & socials.",
  comms:    "Post announcements to the chapter and run the Instagram.",
  content:  "Manage shared docs, assign tasks, run polls, and track service hours.",
};

/** Areas visible for an org, given its enabled workflow set. */
export function activeAreas(enabled: ReadonlySet<WorkflowId>): PermArea[] {
  return PERM_AREAS.filter(a => a.gate(enabled));
}

export type AreaState = "on" | "partial" | "off";

/** An area's state on a permission set: all of its flags, some, or none. */
export function areaState(permissions: readonly Permission[], area: PermArea): AreaState {
  const have = area.perms.filter(p => permissions.includes(p)).length;
  return have === 0 ? "off" : have === area.perms.length ? "on" : "partial";
}

/** Toggle a whole area: "on" clears its flags; "partial"/"off" grants them all. */
export function toggleArea(permissions: readonly Permission[], area: PermArea): Permission[] {
  if (areaState(permissions, area) === "on") {
    return permissions.filter(p => !area.perms.includes(p));
  }
  return [...permissions, ...area.perms.filter(p => !permissions.includes(p))];
}

/** Toggle one flag (the Advanced disclosure). */
export function togglePerm(permissions: readonly Permission[], perm: Permission): Permission[] {
  return permissions.includes(perm)
    ? permissions.filter(p => p !== perm)
    : [...permissions, perm];
}

/**
 * The auto-generated "Can …" line under a seat title. `all` is the founder
 * seat; otherwise the granted areas (any state but "off") are listed as an
 * English clause, filtered to the areas the workspace actually shows.
 */
export function roleSummary(
  permissions: readonly Permission[],
  enabled: ReadonlySet<WorkflowId>,
  all?: boolean,
): string {
  if (all) return "Runs everything — that's you.";
  const on = activeAreas(enabled)
    .filter(a => areaState(permissions, a) !== "off")
    .map(a => AREA_PHRASE[a.id]);
  if (!on.length) return "Along for the ride — no admin abilities yet. Tap a pill to add one.";
  const list = on.length === 1
    ? on[0]
    : on.slice(0, -1).join(", ") + (on.length > 2 ? "," : "") + " and " + on[on.length - 1];
  return "Can " + list + ".";
}
