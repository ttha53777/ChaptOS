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

/** Lookup by slug (built-ins only). */
export function getBuiltinEventType(slug: string): BuiltinEventType | undefined {
  return BUILTIN_EVENT_TYPES.find(t => t.slug === slug);
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
