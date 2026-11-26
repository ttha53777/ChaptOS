/**
 * Settings → Event fields: the rules and every sentence, shared by the web section
 * (sections/EventFieldsSection.tsx) and the app (mobile/src/settings/EventFields.tsx).
 * Pure: no React, Node or Prisma.
 *
 * Every row writes on its own (PATCH/DELETE /api/events/fields/[id], POST to add);
 * duplicate labels, the ceiling and in-use refusals are the API's to say.
 */
import { FIELD_KINDS, MAX_EVENT_FIELDS, MAX_FIELD_LABEL, type FieldKind } from "@/lib/event-fields";

export { FIELD_KINDS, MAX_EVENT_FIELDS, MAX_FIELD_LABEL, type FieldKind };

/** What each kind collects, in the officer's words rather than the schema's. */
export const KIND_COPY: Record<FieldKind, { label: string; eg: string }> = {
  text:   { label: "Text",     eg: "Anything written — a contact, a note, a dress code." },
  num:    { label: "Number",   eg: "A count. Head count, buses, tables." },
  money:  { label: "Money",    eg: "A dollar amount, kept apart from what was actually spent." },
  bool:   { label: "Yes / no", eg: "A box that's either ticked or it isn't. Risk form filed?" },
  date:   { label: "Date",     eg: "A second date the event depends on — a deposit deadline." },
  person: { label: "Person",   eg: "Somebody on the roster who isn't the owner." },
  file:   { label: "File",     eg: "A link or an attachment." },
};

type FieldLike = { slug: string; label: string; kind: string; builtin: boolean; enabled: boolean; displayOrder: number };

export const kindLabel = (kind: string) => KIND_COPY[kind as FieldKind]?.label ?? kind;

/** Reading order: displayOrder, then slug. */
export function sortFields<F extends FieldLike>(fields: readonly F[]): F[] {
  return [...fields].sort((a, b) => a.displayOrder - b.displayOrder || a.slug.localeCompare(b.slug));
}

/** The line under a row. */
export function fieldNote(f: FieldLike): string {
  const eg = KIND_COPY[f.kind as FieldKind]?.eg;
  return f.builtin ? `${eg} Built in — rename it or stop collecting it, but it can't be deleted outright.` : (eg ?? "");
}

/** What the toggle says once it lands. */
export const toggleMessage = (f: FieldLike) => f.enabled
  ? `${f.label} is no longer collected. Existing answers are kept.`
  : `${f.label} is collected on every event again.`;

export const EVENT_FIELDS_COPY = {
  lede: "What every event records. Set once for the chapter, not per event — that's what makes a budget or a head count something you can compare across the term.",
  loading: "Loading…",
  loadFailed: "Could not load event fields.",
  saveFailed: "Could not save the change.",
  moveUp: "Move up",
  moveDown: "Move down",
  builtin: "Built-in",
  off: "Off",
  rename: "Rename",
  stop: "Stop collecting",
  again: "Collect again",
  delete: "Delete",
  renamed: "Field renamed.",
  orderSaved: "Order saved.",
  newPlaceholder: "Beneficiary",
  fixedType: "A field's type is fixed once events start answering it — retyping an answered field has no safe reading.",
  addField: "Add field",
  added: (label: string) => `${label} is now collected on every event.`,
  cancel: "Cancel",
  newField: "+ New field",
  ceilingTitle: `A chapter can collect at most ${MAX_EVENT_FIELDS} fields.`,
  ceiling: `That's all ${MAX_EVENT_FIELDS} fields. Stop collecting one to make room.`,
  deleteTitle: (label: string) => `Delete “${label}”?`,
  deleteMessage: "Every event's answer to this field goes with it. If you only want to stop asking, use “Stop collecting” instead — that keeps the answers on file.",
  deleted: (label: string) => `${label} deleted.`,
} as const;
