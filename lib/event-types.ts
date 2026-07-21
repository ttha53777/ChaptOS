/**
 * Built-in timeline event-type registry. The source of truth for the types
 * every org is seeded with, plus the shared predicate that decides which types
 * appear in the add-event picker.
 *
 * Posture mirrors `lib/org-types.ts` / `lib/workflow-features.ts`: the template
 * lives in code (small, churns rarely, reviewable as a PR); each org gets an
 * editable *copy* as CalendarEventType rows at creation (provisionOrg) and via
 * the backfill migration. Admins may rename/recolor/reorder any type and add
 * custom ones — but the built-in *slugs* are immutable because behavior branches
 * and client synthesis hardcode them (see `lib/state/calendar-category.ts`).
 *
 * Consumed by:
 *   - provisionOrg + prisma/seed.ts: seed the built-in rows per org.
 *   - The event-type service + timeline client: `isEventTypeVisibleInPicker`.
 *
 * Colors mirror the two-theme palette in
 * `app/components/dashboard/timeline-ledger.css`: `color` is the light ("ivory")
 * value, `colorDark` the dark ("dusk") override.
 */

import type { WorkflowId } from "@/lib/org-types";

export interface BuiltinEventType {
  /** Stable slug — matches CalendarEvent.category. Never renamed. */
  slug: string;
  label: string;
  /** Light-theme hex (ivory). */
  color: string;
  /** Dark-theme hex (dusk); falls back to `color` when absent. */
  colorDark: string;
  /** Workflow that gates picker visibility; null = always available. */
  workflowId: WorkflowId | null;
  /** Pre-checks the "required attendance" toggle in the form. */
  mandatoryDefault: boolean;
  /** false = managed from another surface (party/deadline are synthesized). */
  creatable: boolean;
}

/**
 * The 4 built-ins, in canonical display order. `displayOrder` is derived from
 * this array's index at seed time.
 *
 * Social/Fundraiser/Program were demoted from this list (they were `events`-
 * gated built-ins seeded to every org): they are LPE vocabulary, not platform
 * vocabulary, and live on as *custom* types (builtin=false, workflowId=null) on
 * the orgs that use them — see
 * `prisma/migrations/20260719000000_demote_programming_event_types/migration.sql`.
 * The Programming page derives its category set per-org from CalendarEventType
 * rows (`isProgrammingManagedType` in lib/programming.ts), so no built-in is
 * `events`-gated anymore.
 */
export const BUILTIN_EVENT_TYPES: readonly BuiltinEventType[] = [
  { slug: "chapter",  label: "Chapter",           color: "#3f6ea3", colorDark: "#8fb0d6", workflowId: "meetings", mandatoryDefault: true,  creatable: true  },
  { slug: "party",    label: "Party",             color: "#b34f72", colorDark: "#d98ba3", workflowId: "parties",  mandatoryDefault: false, creatable: false },
  { slug: "deadline", label: "Deadline",          color: "#c14a37", colorDark: "#e0796b", workflowId: "tasks",    mandatoryDefault: false, creatable: false },
  { slug: "service",  label: "Community Service", color: "#2f8579", colorDark: "#5fbdb0", workflowId: "service",  mandatoryDefault: false, creatable: true  },
] as const;

/** The built-in slugs, as a tuple Zod can turn into an enum. */
export const BUILTIN_EVENT_TYPE_SLUGS = BUILTIN_EVENT_TYPES.map(t => t.slug) as [string, ...string[]];

/** Lookup by slug (built-ins only). */
export function getBuiltinEventType(slug: string): BuiltinEventType | undefined {
  return BUILTIN_EVENT_TYPES.find(t => t.slug === slug);
}

/** One pickable color, as an ivory/dusk pair. */
export interface EventTypeColor {
  /** Stable id — what a picker keys its swatches on. */
  id: string;
  label: string;
  /** Light-theme hex (ivory). */
  color: string;
  /** Dark-theme hex (dusk). */
  colorDark: string;
}

/**
 * The palette every event-type color picker offers, and the one the org-type
 * starter seeds draw from (`lib/org-types.ts`). One list so the /create step's
 * swatch strip, the Settings editor and the seeded defaults can't drift into
 * three different sets of hexes.
 *
 * The first four entries are the built-ins' own colors verbatim — recoloring a
 * built-in back to its default is a palette pick like any other. Values mirror
 * the two-theme ledger palette in
 * `app/components/dashboard/timeline-ledger.css`.
 */
export const EVENT_TYPE_PALETTE = [
  { id: "blue",   label: "Blue",   color: "#3f6ea3", colorDark: "#8fb0d6" },
  { id: "rose",   label: "Rose",   color: "#b34f72", colorDark: "#d98ba3" },
  { id: "clay",   label: "Clay",   color: "#c14a37", colorDark: "#e0796b" },
  { id: "teal",   label: "Teal",   color: "#2f8579", colorDark: "#5fbdb0" },
  { id: "gold",   label: "Gold",   color: "#9a7224", colorDark: "#ddb36a" },
  { id: "green",  label: "Green",  color: "#4a7d4c", colorDark: "#86b988" },
  { id: "purple", label: "Purple", color: "#6d28d9", colorDark: "#a78bfa" },
  { id: "sky",    label: "Sky",    color: "#2f5d7c", colorDark: "#7fb3d9" },
  { id: "orchid", label: "Orchid", color: "#8b3fa3", colorDark: "#c98bd9" },
] as const satisfies readonly EventTypeColor[];

/** Palette ids as a literal union — keeps `EVT.gold` a compile-time check. */
export type EventTypeColorId = (typeof EVENT_TYPE_PALETTE)[number]["id"];

/** Palette lookup by the LIGHT hex — how a stored row resolves back to a swatch. */
export function paletteEntryForColor(color: string): EventTypeColor | undefined {
  const hex = color.toLowerCase();
  return EVENT_TYPE_PALETTE.find(c => c.color.toLowerCase() === hex);
}

/**
 * The first palette color not already used by `taken` (matched on the light
 * hex), falling back to cycling once every entry is spoken for. What an "add a
 * type" affordance pre-selects so two new types never land the same color.
 */
export function nextPaletteColor(taken: readonly string[]): EventTypeColor {
  const used = new Set(taken.map(c => c.toLowerCase()));
  return (
    EVENT_TYPE_PALETTE.find(c => !used.has(c.color.toLowerCase())) ??
    EVENT_TYPE_PALETTE[taken.length % EVENT_TYPE_PALETTE.length]!
  );
}

/** The minimal shape the visibility predicate needs — satisfied by a DB row or DTO. */
export interface EventTypeVisibility {
  hidden: boolean;
  creatable: boolean;
  workflowId: string | null;
}

/**
 * Whether a type should appear in the add-event picker. Derived, never stored:
 * a type is offered when it isn't hidden, is creatable from the timeline, and
 * either has no workflow or its workflow is enabled. Shared by the server (which
 * gates event creation) and the client (which builds the dropdown) so they can't
 * drift. Existing events still render regardless — this only gates *creation*.
 */
export function isEventTypeVisibleInPicker(
  type: EventTypeVisibility,
  enabledWorkflows: readonly string[],
): boolean {
  if (type.hidden || !type.creatable) return false;
  return type.workflowId == null || enabledWorkflows.includes(type.workflowId);
}
