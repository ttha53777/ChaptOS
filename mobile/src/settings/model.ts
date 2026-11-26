/**
 * Settings glue for the app: who the viewer is, as the gates the shared rules
 * (lib/settings/*) take. Everything a section says or decides comes from those
 * modules; this file only reads /api/auth/me.
 */
import type { MeResponse } from "@/lib/api-types";
import { config } from "~/config";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { INTENT_ORDER, NAV_ITEMS, sectionVisible, type Intent, type NavItem, type SectionGates } from "@/lib/settings/nav";

export type SectionId = Exclude<NavItem["id"], "billing">;

export const can = (me: MeResponse, p: Permission) => me.isAdmin || (me.permissions & PERMISSIONS[p]) !== 0;

/** This chapter's admin (Membership.isOrgAdmin), or a platform admin. */
export const isOrgAdmin = (me: MeResponse) =>
  me.isAdmin || me.memberships.some(m => m.organizationId === me.orgId && m.isOrgAdmin);

/** null on the wire = unbounded (an admin). */
export const maxRankOf = (me: MeResponse) => me.maxRank ?? Number.POSITIVE_INFINITY;

export function gatesOf(me: MeResponse): SectionGates {
  return {
    isOrgAdmin: isOrgAdmin(me),
    canManageRoles: can(me, "MANAGE_ROLES"),
    canManageSettings: can(me, "MANAGE_SETTINGS"),
    canManageTreasury: can(me, "MANAGE_TREASURY"),
    canManageEvents: can(me, "MANAGE_EVENTS"),
    hasTreasury: !!me.org?.enabledWorkflows.includes("finance"),
  };
}

/** Billing never shows in the app (store rules): no row, no link. */
export const inApp = (id: NavItem["id"]): id is SectionId => id !== "billing";

/** The sections built so far (Phase 9a). Until a section's sub-phase lands it isn't
 *  listed at all: a row that leads nowhere would offer something the app can't do. */
export const BUILT: ReadonlySet<SectionId> = new Set<SectionId>(["identity", "accounts", "invitations", "roles"]);

export function visibleItems(me: MeResponse): (NavItem & { id: SectionId })[] {
  const g = gatesOf(me);
  return NAV_ITEMS.filter((n): n is NavItem & { id: SectionId } => inApp(n.id) && BUILT.has(n.id) && sectionVisible(n.id, g));
}

/** More's "Chapter settings" line: the sections this person can actually open there
 *  (Invitations has its own row on More, so it's left out), or a plain fallback. */
export function settingsLine(me: MeResponse, orgName: string): string {
  const labels = visibleItems(me).filter(n => n.id !== "invitations").map(n => n.label);
  if (labels.length === 0) return `How ${orgName} is set up`;
  if (labels.length <= 3) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} and more`;
}

export function visibleGroups(items: NavItem[]): Intent[] {
  return INTENT_ORDER.filter(g => items.some(n => n.group === g));
}

/** Each intent group's tab colour (paper-settings.css: peach, sky, mint, lilac). */
export const GROUP_TONE = { Identity: "peach", Membership: "sky", Operations: "mint", System: "lilac" } as const;

/** The web address people sign in at, as the badge prints it ("chaptos.com"). */
export function siteHost(): string {
  try {
    const h = new URL(config.apiUrl || "https://chaptos.com").host;
    return /^(localhost|\d+\.\d+\.\d+\.\d+)(:\d+)?$/.test(h) ? "chaptos.com" : h;
  } catch {
    return "chaptos.com";
  }
}

/** Where a join link opens: the web origin this build talks to. */
export const webOrigin = () => config.apiUrl || "https://chaptos.com";
