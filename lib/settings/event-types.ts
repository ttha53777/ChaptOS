/**
 * Settings → Event types: the rules and every sentence, shared by the web section
 * (sections/EventTypesSection.tsx) and the app (mobile/src/settings/EventTypes.tsx).
 * Pure: no React, Node or Prisma.
 *
 * Built-in types can be renamed and recoloured only; custom ones can be deleted too,
 * which the service refuses while events still use them. Refusals come back from the
 * API and are shown as returned.
 */
import { isEventTypeVisibleInPicker, type EventTypeVisibility } from "@/lib/event-types";

export const MAX_EVENT_TYPES = 40;
export const TYPE_LABEL_MAX = 40;

export function slugifyType(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/** The slug a new type gets: its label's, de-duplicated against the org's. */
export function newTypeSlug(label: string, taken: Iterable<string>): string {
  const base = slugifyType(label) || "type";
  const used = new Set(taken);
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

type TypeLike = EventTypeVisibility & { workflowId: string | null; slug: string; creatable: boolean };

/** The gold tag a type wears when the add-event picker won't offer it, or null. */
export function typeTag(type: TypeLike, enabledWorkflows: readonly string[]): string | null {
  if (isEventTypeVisibleInPicker(type, enabledWorkflows)) return null;
  return type.workflowId ? `NEEDS ${type.workflowId.toUpperCase()}` : "HIDDEN";
}

/** Can the colour pair be matched to a swatch? (both hexes move together) */
export const sameColor = (a: string | null | undefined, b: string) => (a ?? "").toLowerCase() === b.toLowerCase();

export const EVENT_TYPES_COPY = {
  builtin: "BUILT-IN",
  bookedElsewhere: " · booked from its own page, not the timeline",
  follows: (workflowId: string) => [" · follows the ", workflowId, " page"] as const,
  edit: "Edit",
  delete: "Delete",
  removing: "Removing…",
  deleteTitle: (label: string) => `Delete "${label}"?`,
  deleteMessage: "Any events already tagged with this type have to be reassigned first — if some still use it, the delete will be refused and nothing changes.",
  label: "Label",
  labelReq: "Label *",
  labelPlaceholder: "Rush Week",
  slug: "Slug (permanent)",
  color: "Color on the timeline",
  useColor: (name: string) => `Use ${name}`,
  save: "Save",
  saving: "Saving…",
  cancel: "Cancel",
  saved: (label: string) => `"${label}" saved`,
  saveFailed: "Failed to save event type",
  removed: (label: string) => `"${label}" removed`,
  deleteFailed: "Failed to delete event type",
  loading: "Loading…",
  loadFailed: "Failed to load event types",
  maxed: ["Maximum of ", String(MAX_EVENT_TYPES), " event types reached."] as const,
  newType: "New event type",
  slugPreview: (slug: string) => ["Slug: ", slug, " — permanent once created."] as const,
  create: "Create type",
  creating: "Creating…",
  added: (label: string) => `"${label}" added`,
  createFailed: "Failed to create event type",
  add: "Add event type",
} as const;
