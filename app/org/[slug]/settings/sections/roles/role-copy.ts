import { PERMISSIONS, PERMISSION_LIST, type Permission } from "@/lib/permissions";
import type { PaperIconName } from "../../../../../components/paper/PaperIcon";

/** One row from GET /api/roles (detailed form). */
export interface RoleRow {
  id: number;
  name: string;
  color: string | null;
  rank: number;
  permissions: number;
  isSystem: boolean;
  memberCount: number;
}

export interface Draft {
  name: string;
  color: string;
  rank: number;
  permissions: number;
  colorTouched: boolean;
}

export const DEFAULT_COLOR = "#8B5CF6";

// Quick picks for the role chip, named so the choice reads in words. The custom
// picker covers anything else.
export const SWATCHES: { hex: string; name: string }[] = [
  { hex: "#F59E0B", name: "Amber" },  { hex: "#EF4444", name: "Red" },
  { hex: "#EC4899", name: "Pink" },   { hex: "#8B5CF6", name: "Violet" },
  { hex: "#5865F2", name: "Indigo" }, { hex: "#3B82F6", name: "Blue" },
  { hex: "#06B6D4", name: "Cyan" },   { hex: "#10B981", name: "Green" },
  { hex: "#84CC16", name: "Lime" },   { hex: "#94A3B8", name: "Slate" },
];

/**
 * Each permission as the page it unlocks. `desc` is what changing that page
 * means; `can` finishes the sentence "A Rush Chair can…". The Record type forces
 * copy for a newly added bit. `big` marks the bits that hand over the keys
 * (people, authority, money) so the sheet can ask for care.
 */
export const PERM_META: Record<Permission, { label: string; desc: string; can: string; icon: PaperIconName; big?: boolean }> = {
  MANAGE_BROTHERS:      { label: "Roster",       icon: "people",    big: true, desc: "Approve join requests, edit member details and dues, remove people", can: "approve new members and edit the roster" },
  MANAGE_ATTENDANCE:    { label: "Attendance",   icon: "form",      desc: "Take attendance and approve excuses", can: "take attendance and approve excuses" },
  MANAGE_ROLES:         { label: "Roles",        icon: "key",       big: true, desc: "Make roles and hand out any role ranked below their own", can: "make roles and hand out the ones below theirs" },
  MANAGE_SETTINGS:      { label: "Org settings", icon: "gear",      big: true, desc: "Change how the org is set up and manage invite links", can: "change org settings and invite links" },
  MANAGE_TREASURY:      { label: "Treasury",     icon: "wallet",    big: true, desc: "Record transactions, set budgets, export the books", can: "keep the books and set budgets" },
  MANAGE_FUNDRAISING:   { label: "Fundraisers",  icon: "jar",       desc: "Plan fundraisers, keep their shopping lists, wrap them up", can: "run fundraisers" },
  MANAGE_EVENTS:        { label: "Events",       icon: "cal",       desc: "Add and edit events on the Timeline", can: "add and edit events" },
  MANAGE_PARTIES:       { label: "Parties",      icon: "ticket",    desc: "Plan parties, run the door, wrap up", can: "run parties" },
  MANAGE_SERVICE:       { label: "Service",      icon: "heart",     desc: "Add service events and log hours", can: "run service events" },
  MANAGE_SEMESTERS:     { label: "Semesters",    icon: "timeline",  desc: "Start and edit terms", can: "set up semesters" },
  MANAGE_ANNOUNCEMENTS: { label: "Announce­ment", icon: "megaphone", desc: "Post and edit the pinned announcement", can: "post the announcement" },
  MANAGE_DOCS:          { label: "Docs",         icon: "doc",       desc: "Pin, edit and remove shared docs", can: "pin and edit shared docs" },
  MANAGE_TASKS:         { label: "Tasks",        icon: "box",       desc: "Create, assign and delete tasks and deadlines", can: "assign tasks and deadlines" },
  MANAGE_POLLS:         { label: "Polls",        icon: "bars",      desc: "Start, close and delete polls", can: "run polls" },
  MANAGE_INSTAGRAM:     { label: "Media",        icon: "camera",    desc: "Plan and schedule social posts", can: "plan social posts" },
};

export type GroupTone = "lilac" | "mint" | "butter" | "sky" | "peach";
export const PERM_GROUPS: { label: string; tone: GroupTone; perms: Permission[] }[] = [
  { label: "People & access", tone: "lilac",  perms: ["MANAGE_BROTHERS", "MANAGE_ATTENDANCE", "MANAGE_ROLES", "MANAGE_SETTINGS"] },
  { label: "Money",           tone: "mint",   perms: ["MANAGE_TREASURY", "MANAGE_FUNDRAISING"] },
  { label: "Calendar",        tone: "butter", perms: ["MANAGE_EVENTS", "MANAGE_PARTIES", "MANAGE_SERVICE", "MANAGE_SEMESTERS"] },
  { label: "Communication",   tone: "sky",    perms: ["MANAGE_ANNOUNCEMENTS", "MANAGE_DOCS", "MANAGE_TASKS", "MANAGE_POLLS", "MANAGE_INSTAGRAM"] },
];
// Any bit not filed above still renders, under "Other".
const UNGROUPED = PERMISSION_LIST.filter(p => !PERM_GROUPS.some(g => g.perms.includes(p.name))).map(p => p.name);
if (UNGROUPED.length) PERM_GROUPS.push({ label: "Other", tone: "peach", perms: UNGROUPED });

export const ALL_BITS = PERMISSION_LIST.reduce((acc, p) => acc | p.bit, 0);

export function permLabel(p: Permission): string {
  return (PERM_META[p]?.label ?? p.replace(/^MANAGE_/, "").toLowerCase()).replace(/­/g, "");
}

export function heldPermissions(bits: number): Permission[] {
  return PERMISSION_LIST.filter(p => (bits & p.bit) !== 0).map(p => p.name);
}

export function bitsOf(perms: Permission[]): number {
  return perms.reduce((acc, p) => acc | PERMISSIONS[p], 0);
}

export function permissionSummary(bits: number): string {
  const names = heldPermissions(bits).map(permLabel);
  if (names.length === 0) return "No extra access";
  if (names.length === PERMISSION_LIST.length) return "Everything";
  if (names.length > 4) return `${names.slice(0, 4).join(", ")} +${names.length - 4}`;
  return names.join(", ");
}

/** "a, b and c" */
export function andList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function swatchName(hex: string): string | null {
  return SWATCHES.find(s => s.hex.toLowerCase() === hex.toLowerCase())?.name ?? null;
}

// ── Starting points ──────────────────────────────────────────────────────────

export interface RoleTemplate { id: string; name: string; color: string; blurb: string; perms: Permission[] }

const T = (id: string, name: string, color: string, blurb: string, perms: Permission[]): RoleTemplate =>
  ({ id, name, color, blurb, perms });

const SECRETARY = T("secretary", "Secretary", "#3B82F6", "Minutes, roll call, reminders", ["MANAGE_ATTENDANCE", "MANAGE_ANNOUNCEMENTS", "MANAGE_DOCS", "MANAGE_TASKS"]);
const SOCIAL    = T("social", "Social Chair", "#EC4899", "Parties and socials", ["MANAGE_EVENTS", "MANAGE_PARTIES", "MANAGE_TASKS"]);
const MEDIA     = T("media", "Media Lead", "#06B6D4", "Photos, posts, archives", ["MANAGE_INSTAGRAM", "MANAGE_DOCS"]);
const FUNDS     = T("funds", "Fundraising Lead", "#10B981", "Fundraisers and the jars", ["MANAGE_FUNDRAISING", "MANAGE_EVENTS"]);
const EVENTS    = T("events", "Events Lead", "#F59E0B", "Plans what's on the calendar", ["MANAGE_EVENTS", "MANAGE_TASKS", "MANAGE_POLLS"]);
const OUTREACH  = T("outreach", "Outreach Lead", "#8B5CF6", "New members and join requests", ["MANAGE_BROTHERS", "MANAGE_EVENTS", "MANAGE_ANNOUNCEMENTS"]);

const BY_TYPE: Record<string, RoleTemplate[]> = {
  "fraternity": [
    T("rush", "Rush Chair", "#8B5CF6", "Recruitment, new members", ["MANAGE_BROTHERS", "MANAGE_ATTENDANCE", "MANAGE_EVENTS"]),
    SECRETARY, SOCIAL,
    T("phil", "Philanthropy Chair", "#10B981", "Service and fundraisers", ["MANAGE_SERVICE", "MANAGE_FUNDRAISING", "MANAGE_EVENTS"]),
    T("hist", "Historian", "#06B6D4", "Photos, posts, archives", ["MANAGE_INSTAGRAM", "MANAGE_DOCS"]),
  ],
  "sports-team": [
    T("asst", "Assistant Coach", "#3B82F6", "Practices and attendance", ["MANAGE_EVENTS", "MANAGE_ATTENDANCE"]),
    SECRETARY, SOCIAL, FUNDS, MEDIA,
  ],
  "service-org": [
    T("project", "Project Lead", "#10B981", "Runs service projects", ["MANAGE_SERVICE", "MANAGE_EVENTS", "MANAGE_TASKS"]),
    SECRETARY, OUTREACH, FUNDS, MEDIA,
  ],
};
const GENERIC = [SECRETARY, EVENTS, OUTREACH, FUNDS, MEDIA];

/** Up to five starting points for this org type, minus names the org already has. */
export function templatesFor(orgType: string | null | undefined, existing: string[]): RoleTemplate[] {
  const taken = new Set(existing.map(n => n.trim().toLowerCase()));
  return (BY_TYPE[orgType ?? ""] ?? GENERIC).filter(t => !taken.has(t.name.toLowerCase())).slice(0, 5);
}

// ── Rank ladder ──────────────────────────────────────────────────────────────

export interface Rung { rank: number; roles: RoleRow[] }

/** Distinct ranks, highest first, always ending on a rank-0 rung (members with no role). */
export function ladderRungs(roles: RoleRow[]): Rung[] {
  const by = new Map<number, RoleRow[]>();
  for (const r of roles) by.set(r.rank, [...(by.get(r.rank) ?? []), r]);
  if (!by.has(0)) by.set(0, []);
  return [...by.entries()].sort((a, b) => b[0] - a[0]).map(([rank, rs]) => ({ rank, roles: rs }));
}

/**
 * The rank a click on the gap between `hi` (null = above the top) and `lo` lands
 * on, or null when no integer fits below the actor's own rank. A rank already
 * inside the gap is kept, so opening an existing role never moves it.
 */
export function gapRank(hi: number | null, lo: number, myMaxRank: number, current?: number): number | null {
  const ceiling = Math.min(hi ?? Number.POSITIVE_INFINITY, myMaxRank);
  if (current !== undefined && current > lo && current < ceiling) return current;
  if (!Number.isFinite(ceiling)) return lo + 10;
  if (ceiling - lo < 2) return null;
  return Math.floor((lo + ceiling) / 2);
}
