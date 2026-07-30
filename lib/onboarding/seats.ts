/**
 * Seats — the /create flow's editable view of a role before it exists.
 *
 * A seat is a role-to-be: a title, a color, and an ability set (real MANAGE_*
 * flags). The initial seats come straight from the org-type template's
 * roleSeeds (lib/org-types.ts is the single source of truth — the flow never
 * carries its own copy of the templates), and SEAT_POOL offers extra offices
 * "+ Add a seat" can pull from per org type.
 *
 * No holder names: seats describe authority, not people. Members claim roles
 * after they join.
 */

import { getOrgType } from "@/lib/org-types";
import type { Permission } from "@/lib/permissions";

export interface Seat {
  title: string;
  color: string;
  /** Founder seat — full authority, not editable, becomes the `all` roleSeed. */
  all?: boolean;
  permissions: Permission[];
}

/** A SEAT_POOL entry: a seat blueprint plus the one-line pitch shown in the picker. */
export interface SeatPoolEntry {
  title: string;
  color: string;
  /** Short "what it does" line for the add-a-seat panel. */
  able: string;
  permissions: readonly Permission[];
}

/** Shared accent palette for seats (matches the template roleSeed colors). */
export const ROLE_COLORS = ["#F59E0B", "#10B981", "#EC4899", "#3B82F6", "#8B5CF6"] as const;

/**
 * Light-theme twins for the seat palette — PRESENTATION ONLY.
 *
 * ROLE_COLORS are Tailwind-500 hexes picked for dark surfaces. On the /create
 * flow's ivory paper (#faf9f6) the warm ones fall apart: #F59E0B is 2.08:1 and
 * #10B981 is 2.45:1, and a seat's color is not merely a dot — it paints the
 * role card's 15px serif monogram and its hover-peek title.
 *
 * A seat's `color` is PERSISTED (draftSchema → Role.color, read by the
 * dashboard), so it must not change. This maps it at render time instead, using
 * hexes already shipped in EVENT_TYPE_PALETTE so the two palettes agree.
 * Ratios on #faf9f6: gold 4.18, teal 4.23, rose 4.70, blue 5.06, purple 6.80 —
 * all clear of the 3:1 non-text bar (the flow additionally mixes toward ink for
 * the two text uses, see create-flow.css's ivory block).
 *
 * tests/onboarding/seats.test.ts asserts every seeded role hue has an entry, so
 * a new org type can't ship an unmapped color.
 */
export const ROLE_TONE_IVORY: Record<string, string> = {
  "#f59e0b": "#9a7224", // gold
  "#10b981": "#2f8579", // teal
  "#ec4899": "#b34f72", // rose
  "#3b82f6": "#3f6ea3", // blue
  "#8b5cf6": "#6d28d9", // purple
};

/** The ivory twin for a seat color, or the input unchanged if unmapped. */
export function roleToneIvory(hex: string): string {
  return ROLE_TONE_IVORY[hex.toLowerCase()] ?? hex;
}

/**
 * Initial editable seats for an org type, cloned from the template's roleSeeds
 * so each seat owns its own mutable ability set. Unknown ids fall back to the
 * fraternity template (same fallback the mock used).
 */
export function seatsFromTemplate(orgTypeId: string): Seat[] {
  const template = getOrgType(orgTypeId) ?? getOrgType("fraternity")!;
  return template.roleSeeds.map(r => ({
    title:       r.name,
    color:       r.color,
    all:         r.all || undefined,
    permissions: [...r.permissions],
  }));
}

/** Extra offices "+ Add a seat" can pull from, per org-type id. */
export const SEAT_POOL: Record<string, readonly SeatPoolEntry[]> = {
  fraternity: [
    { title: "Service Chair", color: "#10B981", able: "tracks service hours", permissions: ["MANAGE_SERVICE", "MANAGE_EVENTS"] },
    { title: "Scribe",        color: "#F59E0B", able: "minutes & docs", permissions: ["MANAGE_DOCS", "MANAGE_ANNOUNCEMENTS"] },
    { title: "Rush Chair",    color: "#8B5CF6", able: "recruitment events", permissions: ["MANAGE_EVENTS", "MANAGE_TASKS"] },
  ],
  "generic-club": [
    { title: "Events Lead", color: "#EC4899", able: "plans meetings & socials", permissions: ["MANAGE_EVENTS", "MANAGE_PARTIES"] },
    { title: "Outreach",    color: "#8B5CF6", able: "partnerships & comms", permissions: ["MANAGE_ANNOUNCEMENTS", "MANAGE_INSTAGRAM"] },
  ],
  "sports-team": [
    { title: "Assistant Coach", color: "#EC4899", able: "drills & attendance", permissions: ["MANAGE_ATTENDANCE", "MANAGE_EVENTS"] },
    { title: "Equipment Mgr",   color: "#F59E0B", able: "gear & logistics", permissions: ["MANAGE_DOCS", "MANAGE_TASKS"] },
  ],
  "service-org": [
    { title: "Volunteer Lead", color: "#8B5CF6", able: "coordinates service events", permissions: ["MANAGE_SERVICE", "MANAGE_EVENTS", "MANAGE_TASKS"] },
    { title: "Scribe",         color: "#F59E0B", able: "minutes & docs", permissions: ["MANAGE_DOCS", "MANAGE_ANNOUNCEMENTS"] },
  ],
  "honor-society": [
    { title: "Standards Chair", color: "#8B5CF6", able: "attendance & member standing", permissions: ["MANAGE_ATTENDANCE", "MANAGE_BROTHERS"] },
    { title: "Historian",       color: "#F59E0B", able: "docs & posts", permissions: ["MANAGE_DOCS", "MANAGE_INSTAGRAM"] },
  ],
  "performing-arts": [
    { title: "Tech Director", color: "#8B5CF6", able: "logistics & docs", permissions: ["MANAGE_TASKS", "MANAGE_DOCS"] },
    { title: "House Manager", color: "#F59E0B", able: "events & attendance", permissions: ["MANAGE_EVENTS", "MANAGE_ATTENDANCE"] },
  ],
  "generic-org": [
    { title: "Treasurer", color: "#10B981", able: "logs dues & payments", permissions: ["MANAGE_TREASURY"] },
    { title: "Secretary", color: "#3B82F6", able: "docs & announcements", permissions: ["MANAGE_DOCS", "MANAGE_ANNOUNCEMENTS"] },
  ],
};
