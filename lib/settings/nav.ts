/**
 * The Settings index as data: every section (label, blurb, lede, intent group, tint,
 * icon path), the four intent groups and their words, and who sees each section.
 * Pure, shared by the web page (app/org/[slug]/settings/page.tsx) and the native app
 * (mobile/src/settings), so the two can't disagree on what's there or who it's for.
 */

export type SectionId =
  | "index"
  | "identity"
  | "accounts" | "invitations" | "roles" | "member-fields"
  | "thresholds" | "semesters" | "custom-metrics" | "event-types" | "event-fields" | "calendar" | "opening-balance" | "money-categories" | "workflows"
  | "activity-log" | "billing";

export type Intent = "Identity" | "Membership" | "Operations" | "System";

// Icon tint hint for the index ledger rows (matches the dusk accent palette).
export type Tint = "" | "t-gold" | "t-rose" | "t-sage";

export interface NavItem {
  id: Exclude<SectionId, "index">;
  label: string;
  blurb: string;        // one-line index description
  lede: string;         // italic detail-header lede
  group: Intent;
  tint: Tint;
  icon: string;         // heroicons-style path data
  /** Set when the row leaves Settings instead of expanding a section in place.
   *  Billing is its own page because Stripe redirects back to a fixed path
   *  (/<slug>/billing, hardcoded in billing-service.ts) — it can't live behind a
   *  ?section= param. An item with an href has no section component and is never
   *  passed to renderSection. Org-scoped path, run through orgPath at use. */
  href?: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    // Icon, Instagram handle and vocabulary on one page (IdentitySection).
    // Don't advertise a chapter rename here — nothing in the product can do it
    // (PATCH /api/orgs/config takes no `name`). See A2 in
    // docs/settings-ux-audit.md; restore the mention when rename ships.
    id: "identity", label: "Identity", group: "Identity", tint: "",
    blurb: "Chapter icon, Instagram handle and the words you use.",
    lede: "Your icon, your handle and the words you use. Everyone in the chapter sees these, and the previews update as you go.",
    icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
  },
  {
    id: "accounts", label: "Accounts", group: "Membership", tint: "",
    blurb: "Who's in, their roles, and what each person can change.",
    lede: "Everyone here, sorted by how much they can change. Roles decide what officers can touch; admins hold the master key.",
    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  },
  {
    id: "invitations", label: "Invitations", group: "Membership", tint: "",
    blurb: "Generate and manage org invite links.",
    lede: "Create shareable invite links so new brothers can join this org, and revoke them when you're done.",
    icon: "M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 11-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 115.656 5.656l-1.5 1.5",
  },
  {
    id: "roles", label: "Roles", group: "Membership", tint: "",
    blurb: "Roles, what they can do, and who holds them.",
    lede: "A role is a job with its own access. Give it to one person or several, and anyone can hold more than one. Changes save as you tap.",
    icon: "M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z",
  },
  {
    id: "member-fields", label: "Member fields", group: "Membership", tint: "",
    blurb: "Define custom per-member data fields.",
    lede: "Add your own fields to every member record — majors, pledge classes, anything your chapter tracks.",
    icon: "M4 6h16M4 10h16M4 14h10",
  },
  {
    id: "thresholds", label: "Thresholds", group: "Operations", tint: "t-gold",
    blurb: "Attendance, GPA and service-hour cutoffs.",
    lede: "The cutoffs that flag a brother as needing attention on the dashboard. Set them once; everything downstream uses these numbers.",
    icon: "M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z",
  },
  {
    id: "semesters", label: "Semesters", group: "Operations", tint: "t-sage",
    blurb: "Create semesters, fix their dates, set the active one.",
    lede: "Manage your reporting periods. The active semester drives the dashboard and every period-scoped metric.",
    icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  },
  {
    id: "custom-metrics", label: "Custom metrics", group: "Operations", tint: "t-sage",
    blurb: "Track org-specific metrics beyond the built-ins.",
    lede: "Define your own tracked numbers when the built-in metrics don't cover what your chapter measures.",
    icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  },
  {
    id: "event-types", label: "Event types", group: "Operations", tint: "t-sage",
    blurb: "Rename, recolor and add timeline categories.",
    lede: "The categories your timeline runs on — every event is tagged with one, which sets its color and where it shows up. Built-ins can be renamed and recolored; your own can be added or removed.",
    icon: "M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z",
  },
  {
    id: "event-fields", label: "Event fields", group: "Operations", tint: "t-sage",
    blurb: "Choose what every event records.",
    lede: "What the events board asks about each event — the same questions for all of them, which is what makes a budget or a head count something you can compare across the term. The ten built-ins can be renamed; add your own, or stop collecting the ones you don't use.",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  },
  {
    id: "calendar", label: "Calendar subscription", group: "Operations", tint: "t-sage",
    blurb: "Put your events and deadlines in members' own calendars.",
    lede: "Turn it on once and members can add your events and deadlines to Google or Apple Calendar, where they stay up to date on their own. You keep editing them here.",
    icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z M12 14v4m-2-2h4",
  },
  {
    id: "opening-balance", label: "Opening balance", group: "Operations", tint: "t-gold",
    blurb: "What was in the account when you started the books.",
    lede: "The starting figure your treasury counts forward from. Set it if you skipped it on day one, or fix it if it was wrong.",
    icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    id: "money-categories", label: "Money categories", group: "Operations", tint: "t-gold",
    blurb: "Name the income and expense streams your books use.",
    lede: "The income and expense streams your treasury files money under — what the Type picker offers, what the charts are sliced by, and what budget lines are set against. Rename or recolor any of them; the ones the app posts to itself can't be removed.",
    icon: "M9 7h6m-6 4h6m-3 4h3M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z",
  },
  {
    id: "workflows", label: "Workflows", group: "Operations", tint: "t-gold",
    blurb: "Choose which pages this org shows.",
    lede: "Turn product surfaces on or off for this org. Dashboard, Timeline and Chapter are always available and can't be hidden.",
    icon: "M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z",
  },
  {
    id: "activity-log", label: "Activity log", group: "System", tint: "",
    blurb: "Audit trail of every change across the app.",
    lede: "A chronological record of every mutation across the app — who did what, and when.",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  },
  {
    id: "billing", label: "Billing", group: "System", tint: "t-gold", href: "/billing",
    blurb: "The plan this org is on, and what it costs.",
    lede: "What this organization pays to use the platform — separate from your chapter's own dues and budget.",
    icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
  },
];

export const INTENT_ORDER: Intent[] = ["Identity", "Membership", "Operations", "System"];
export const BY_ID = Object.fromEntries(NAV_ITEMS.map(n => [n.id, n])) as Record<NavItem["id"], NavItem>;

export const GROUP_TITLE: Record<Intent, string> = {
  Identity: "Identity",
  Membership: "Membership",
  Operations: "Operations",
  System: "System",
};
export const GROUP_LEDE: Record<Intent, string> = {
  Identity: "Your icon, your handle and the words you use. Everyone in the chapter sees these, and the previews update as you go.",
  Membership: "Who belongs to this org — accounts, invites, roles and the data you keep on members.",
  Operations: "The numbers and surfaces that run your chapter — thresholds, periods, metrics and which pages show.",
  System: "The record of everything that's changed across the app.",
};

/** The index landing's heading. */
export const INDEX_COPY = {
  kicker: "Configuration",
  lead: "Everything, ",
  mark: "arranged",
  tail: ".",
  sub: "Your chapter's identity, membership, operations and system controls — grouped by what you're trying to do, not where the data lives.",
} as const;

/** The unsaved-draft confirm every in-page navigation raises. */
export const DISCARD_COPY = {
  title: "Discard unsaved changes?",
  message: "You have changes on this page that haven't been saved. Leaving now loses them.",
  confirmLabel: "Discard & continue",
} as const;

/** What a viewer holds that decides which sections they see. */
export interface SectionGates {
  isOrgAdmin: boolean;
  canManageRoles: boolean;
  canManageSettings: boolean;
  canManageTreasury: boolean;
  canManageEvents: boolean;
  /** The org keeps books here (the Treasury page is on). */
  hasTreasury: boolean;
}

/** Whether a section shows for this viewer. Everyone reaches Settings; the rest is per section. */
export function sectionVisible(id: NavItem["id"], g: SectionGates): boolean {
  // Billing is org-admin authority, not a permission bit — see
  // assertCanManageBilling in lib/services/billing-service.ts. A Treasurer
  // runs the chapter's money; the platform subscription is the account
  // holder's business, so MANAGE_SETTINGS deliberately doesn't reach it.
  if (id === "billing")        return g.isOrgAdmin;
  if (id === "roles")          return g.canManageRoles;
  if (id === "invitations")    return g.canManageSettings;
  if (id === "workflows")      return g.canManageSettings;
  if (id === "thresholds")     return g.canManageSettings;
  if (id === "member-fields")  return g.canManageSettings;
  if (id === "custom-metrics") return g.canManageSettings;
  if (id === "event-types")    return g.canManageSettings;
  // Deliberately MANAGE_TREASURY rather than MANAGE_SETTINGS, matching
  // requireTreasury in transaction-category-service: the person who needs to
  // add "Rush" at 11pm is the treasurer, who already holds the bit that lets
  // them post the transaction. Gating on settings would let them file money
  // but not name the bucket — a round trip to the president for nothing.
  if (id === "money-categories") return g.hasTreasury && (g.isOrgAdmin || g.canManageTreasury);
  // Same gate as requireTreasury in treasury-settings-service.
  if (id === "opening-balance")  return g.hasTreasury && (g.isOrgAdmin || g.canManageTreasury);
  // Same argument as money-categories, and the same gate the service uses
  // (requireEvents in event-field-service): the officer who needs "Bus
  // company" at 11pm already holds MANAGE_EVENTS. Gating on settings would
  // let them create the event but not the field it needs.
  if (id === "event-fields") return g.isOrgAdmin || g.canManageEvents;
  return true;
}

/**
 * A ?section= value as a section id, or null when it names nothing. General and
 * Vocabulary merged into Identity; old links still land there. Matched against the
 * real id list (not `id in BY_ID`, which would also accept inherited Object keys
 * like "toString").
 */
export function sectionFromParam(raw: string | null | undefined): NavItem["id"] | null {
  if (!raw) return null;
  const id = raw === "general" || raw === "vocabulary" ? "identity" : raw;
  return NAV_ITEMS.some(n => n.id === id) ? (id as NavItem["id"]) : null;
}

