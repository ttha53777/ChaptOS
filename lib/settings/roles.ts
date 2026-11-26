/**
 * Roles and Accounts as words and rules: each permission as the page it unlocks, the
 * group shelves, the role colors, starting templates, the rank ladder, and the
 * Accounts tiers. Pure, shared by the web sections (app/org/[slug]/settings/sections/
 * roles, accounts) and the native app (mobile/src/settings), so both describe a role
 * the same way.
 */
import type { AccountRow, RoleDetail } from "@/lib/api-types";
import { PERMISSIONS, PERMISSION_LIST, type Permission } from "@/lib/permissions";

export type { AccountRow };

/** The Paper sprite glyphs the permission tiles use (a subset of both icon sets). */
export type PermIcon =
  | "people" | "form" | "key" | "gear" | "wallet" | "jar" | "cal" | "ticket" | "heart" | "timeline"
  | "megaphone" | "doc" | "box" | "bars" | "camera";


/** One row from GET /api/roles (detailed form: the caller holds MANAGE_ROLES). */
export type RoleRow = RoleDetail;

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
export const PERM_META: Record<Permission, { label: string; desc: string; can: string; icon: PermIcon; big?: boolean }> = {
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

// ── Holders (Roles page) ─────────────────────────────────────────────────────

/** One BrotherRole pair. The page keeps them as a Set of these keys. */
export const pairKey = (roleId: number, personId: number) => `${roleId}:${personId}`;

export const NEUTRAL_ROLE_COLOR = "#94A3B8";
export const roleColor = (r: { color: string | null }) => r.color ?? NEUTRAL_ROLE_COLOR;

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** The pages a role opens, as short tags: at most four, then "+N". */
export function permTags(bits: number): string[] {
  const names = heldPermissions(bits).map(permLabel);
  if (names.length === 0) return ["No extra access"];
  if (names.length === PERMISSION_LIST.length) return ["Everything"];
  return names.length > 4 ? [...names.slice(0, 4), `+${names.length - 4}`] : names;
}

/** "Who's a Treasurer?" / "Who's an Events Lead?" */
export const whoTitle = (roleName: string) => `Who's ${/^[aeiou]/i.test(roleName) ? "an" : "a"} ${roleName}?`;

/** The toast after a grant or revoke: "Sam is now Treasurer", "You are no longer Treasurer". */
export function grantToast(person: { name: string; isSelf: boolean }, roleName: string, adding: boolean): string {
  const who = person.isSelf ? "You" : firstName(person.name);
  const verb = person.isSelf ? (adding ? "are now" : "are no longer") : (adding ? "is now" : "is no longer");
  return `${who} ${verb} ${roleName}`;
}

/** Roles, highest rank first, then by name: the order every Roles surface lists them in. */
export const sortRoles = <R extends { rank: number; name: string }>(roles: R[]): R[] =>
  [...roles].sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name));

// ── Role sheet ───────────────────────────────────────────────────────────────

export function draftFromRole(role: RoleRow): Draft {
  return {
    name: role.name,
    color: role.color ?? DEFAULT_COLOR,
    rank: role.rank,
    permissions: role.permissions,
    // A persisted null color stays null unless someone picks one.
    colorTouched: role.color !== null,
  };
}

/** Where a new role lands by default: just above members with no role. */
export function defaultRank(roles: RoleRow[], myMaxRank: number): number {
  const rungs = ladderRungs(roles);
  const lowestAboveZero = rungs.filter(r => r.rank > 0).pop();
  return gapRank(lowestAboveZero?.rank ?? null, 0, myMaxRank) ?? 0;
}

/**
 * What a role edit sends: only what changed. An unchanged bitfield can still carry
 * bits the editor doesn't hold, which the server would refuse to re-assign.
 */
export function rolePatch(target: RoleRow, d: Draft): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (d.rank !== target.rank) payload.rank = d.rank;
  if (d.permissions !== target.permissions) payload.permissions = d.permissions;
  if (d.colorTouched && d.color.toLowerCase() !== (target.color ?? "").toLowerCase()) payload.color = d.color;
  if (!target.isSystem && d.name !== target.name) payload.name = d.name;
  return payload;
}

/** Whether a sheet's draft differs from where it started. */
export function draftDirty(mode: "create" | "edit" | "view", d: Draft, initial: Draft, role: RoleRow | undefined): boolean {
  const name = d.name.trim();
  if (mode === "view") return false;
  if (mode === "create") return name !== "" || d.permissions !== 0;
  return (
    (!role?.isSystem && name !== initial.name) ||
    (d.colorTouched && d.color.toLowerCase() !== (role?.color ?? "").toLowerCase()) ||
    d.rank !== initial.rank ||
    d.permissions !== initial.permissions
  );
}

/** The ladder's two explanations under it. */
export function ladderWhy(others: RoleRow[], rank: number, name: string): { givers: string; manages: string } {
  const givers = others.filter(r => r.rank > rank && (r.permissions & PERMISSIONS.MANAGE_ROLES)).map(r => r.name);
  const below = others.filter(r => r.rank < rank).map(r => r.name);
  return {
    givers: givers.length ? `${andList(givers)}, and org admins.` : "Org admins only.",
    manages: below.length ? `If ${name} can change Roles, it could hand out ${andList(below)}.` : `Nothing. No roles sit below ${name}.`,
  };
}

/** Where a gap sits, in words: "below Treasurer, above members with no role". */
export function neighbours(rungs: Rung[], hi: number | null, lo: number): string {
  const above = rungs.find(r => r.rank === hi);
  const below = rungs.find(r => r.rank === lo);
  const a = above?.roles.map(r => r.name).join(" / ");
  const b = below && below.roles.length ? below.roles.map(r => r.name).join(" / ") : "members with no role";
  return a ? `below ${a}, above ${b}` : `above ${b}`;
}

/** The shelf's line under one group, when nothing is hovered. */
export function shelfLine(perms: Permission[], bits: number, roleLabel: string): { lead: string; bold?: string; tail?: string } {
  const on = perms.filter(p => (bits & PERMISSIONS[p]) !== 0).map(permLabel);
  if (on.length === 0) return { lead: `None picked. ${roleLabel} can see these pages but not change them.` };
  if (on.length === perms.length && perms.length > 1) return { lead: `${roleLabel} can change `, bold: "all of these", tail: "." };
  return { lead: `${roleLabel} can change `, bold: andList(on), tail: "." };
}

export const HEX6 = /^[0-9a-f]{6}$/i;
export const HEX3 = /^[0-9a-f]{3}$/i;
/** A typed hex (no #) as the #RRGGBB the API takes, or null while it's incomplete. */
export function hexOf(v: string): string | null {
  if (HEX6.test(v)) return `#${v.toUpperCase()}`;
  if (HEX3.test(v)) return `#${[...v.toUpperCase()].map(c => c + c).join("")}`;
  return null;
}

// ── Accounts ─────────────────────────────────────────────────────────────────

/** One row from GET /api/roles as Accounts reads it. `permissions` only comes back
 *  for MANAGE_ROLES holders (role-service withholds it from everyone else). */
export interface RoleInfo {
  id: number;
  name: string;
  color: string | null;
  rank: number;
  permissions?: number;
}

export type Tier = "admin" | "officer" | "member";
export type TierTone = "lilac" | "butter" | "mint";

export const TIERS: { id: Tier; title: string; tone: TierTone }[] = [
  { id: "admin",   title: "Admins",   tone: "lilac" },
  { id: "officer", title: "Officers", tone: "butter" },
  { id: "member",  title: "Members",  tone: "mint" },
];

// Officers are people holding any role. A role can be a pure title with no
// permissions, but grouping by "has a role" reads the same for viewers who
// can't see permission bits as for those who can.
export const tierOf = (a: AccountRow): Tier => a.isAdmin ? "admin" : a.roles.length ? "officer" : "member";

/** Permissions a person holds here, or null when the viewer can't see role bits. */
export function permsOf(a: AccountRow, roles: Map<number, RoleInfo>): Permission[] | null {
  if (a.isAdmin) return heldPermissions(ALL_BITS);
  let bits = 0;
  for (const r of a.roles) {
    const p = roles.get(r.id)?.permissions;
    if (p === undefined) return null;
    bits |= p;
  }
  return heldPermissions(bits);
}

export const listJoin = andList;

export const canSentence = (perms: Permission[]) => listJoin(perms.map(p => PERM_META[p].can));

/** The Accounts search: name, email or a role name, narrowed to an area when one is picked. */
export function accountMatches(a: AccountRow, needle: string, area: Permission | null, roleMap: Map<number, RoleInfo>): boolean {
  if (area) { const p = permsOf(a, roleMap); if (!p?.includes(area)) return false; }
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return a.name.toLowerCase().includes(q) || (a.email ?? "").toLowerCase().includes(q) || a.roles.some(r => r.name.toLowerCase().includes(q));
}

/** The roster row's "what they can change" line. */
export function canLineOf(a: AccountRow, roleMap: Map<number, RoleInfo>): { kind: "all" | "view" | "some" | "unknown"; text: string; full?: string } {
  if (a.isAdmin) return { kind: "all", text: "Everything" };
  const p = permsOf(a, roleMap);
  if (p === null) return { kind: "unknown", text: "" };
  if (!p.length) return { kind: "view", text: "Can view" };
  const labels = p.map(permLabel);
  return { kind: "some", text: `${labels.slice(0, 2).join(", ")}${labels.length > 2 ? ` +${labels.length - 2}` : ""}`, full: labels.join(", ") };
}

/** The person sheet's "What … can do" verdict, as parts (bold name first). */
export function verdictOf(p: AccountRow, perms: Permission[] | null, canGiveRoles: boolean): { who: string; rest: string } {
  const me = p.isSelf;
  const who = me ? "You" : firstName(p.name);
  if (p.isAdmin) return { who, rest: ` ${me ? "hold" : "holds"} the master key: ${me ? "you" : "they"} can change every page here, manage billing, and make other admins.` };
  if (perms === null) return { who, rest: ` ${me ? "hold" : "holds"} ${p.roles.length === 1 ? "the role" : "the roles"} ${p.roles.map(r => r.name).join(", ")}. What each role unlocks is set in Roles.` };
  if (perms.length) return { who, rest: ` can ${canSentence(perms)}.` };
  return { who, rest: ` can see the whole chapter and change ${me ? "your" : "their"} own profile, RSVPs and tasks.${canGiveRoles ? ` Give ${me ? "yourself" : "them"} a role to unlock more.` : ""}` };
}

/** One role's line in the person sheet: who else holds it. */
export function heldLine(others: { name: string }[], on: boolean): string {
  const names = others.slice(0, 2).map(x => firstName(x.name)).join(", ");
  return others.length ? (others.length > 2 ? `${names} +${others.length - 2}` : `${names} too`) : on ? "" : "Nobody yet";
}
