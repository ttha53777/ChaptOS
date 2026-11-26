/**
 * Settings → Member fields: the rules and every sentence, shared by the web section
 * (app/org/[slug]/settings/sections/MemberFieldsSection.tsx) and the app
 * (mobile/src/settings/MemberFields.tsx). Pure: no React, Node or Prisma.
 *
 * The section edits OrganizationConfig.customMemberFields as one draft and PATCHes
 * the whole list on save (PATCH /api/orgs/config { customMemberFields }).
 */
import { MAX_FIELDS, MAX_LABEL, type CustomMemberFieldDef, type FieldType } from "@/lib/custom-member-fields";

export { MAX_FIELDS, MAX_LABEL };
export const PLACEHOLDER_MAX = 120;

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text",   label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
];

/** A field in the draft; `_new` until a save gives it a server-side id. */
export type DraftField = CustomMemberFieldDef & { _new?: boolean };

/** A blank template for a new field before it receives a server-side id. */
export function blankField(rosterOrder: number): DraftField {
  return {
    id: "",
    label: "",
    type: "text",
    required: false,
    showOnRoster: false,
    rosterOrder,
    placeholder: undefined,
    options: undefined,
    _new: true,
  };
}

export const toDraft = (persisted: readonly CustomMemberFieldDef[]): DraftField[] => persisted.map(f => ({ ...f }));

/** The draft as the PATCH sends it (no client-only marks). */
export function fieldsPayload(draft: readonly DraftField[]): CustomMemberFieldDef[] {
  return draft.map(({ _new: _n, ...rest }) => rest);
}

/** Dirty when the saved rows differ from what's persisted, or any row is new. */
export function fieldsDirty(draft: readonly DraftField[], persisted: readonly CustomMemberFieldDef[]): boolean {
  const clean = fieldsPayload(draft.filter(f => !f._new));
  return JSON.stringify(clean) !== JSON.stringify(persisted) || draft.some(f => f._new);
}

/** Swap a row with its neighbour; roster order follows list order. */
export function moveField(prev: readonly DraftField[], idx: number, dir: -1 | 1): DraftField[] {
  const target = idx + dir;
  const a = prev[idx], b = prev[target];
  if (!a || !b) return [...prev];
  const next = [...prev];
  next[idx] = b;
  next[target] = a;
  return next.map((f, i) => ({ ...f, rosterOrder: i }));
}

/** null when the draft can be saved; otherwise what to say. */
export function fieldsSaveError(draft: readonly DraftField[]): string | null {
  return draft.some(f => !f.label.trim()) ? MEMBER_FIELDS_COPY.needsLabel : null;
}

export const MEMBER_FIELDS_COPY = {
  lede: "Define extra fields that appear in member profiles and optionally as roster columns — e.g. jersey number, major, pledge class, instrument. Values are filled in per-member from the member drawer.",
  emptyTitle: "No custom fields yet",
  emptyHint: "Add one below to start tracking your own member data.",
  untitled: "Untitled field",
  roster: "Roster",
  edit: "Edit",
  done: "Done",
  moveUp: "Move up",
  moveDown: "Move down",
  deleteLabel: (label: string) => `Delete ${label || "field"}`,
  label: "Label",
  labelPlaceholder: "e.g. Jersey #",
  type: "Type",
  placeholder: "Placeholder",
  placeholderHint: "Optional hint text",
  showOnRoster: "Show as roster column",
  required: "Required",
  add: "Add field",
  maxed: ["Maximum of ", String(MAX_FIELDS), " fields reached."] as const,
  save: "Save changes",
  saving: "Saving…",
  reset: "Reset",
  unsaved: "Unsaved",
  saved: "Member fields updated.",
  needsLabel: "Each field must have a label before saving.",
  forbidden: "You need the Org settings permission to change member fields.",
  failed: "Couldn't save your changes. Try again.",
  removeTitle: (label: string) => `Remove "${label.trim() || "Untitled field"}"?`,
  removeMessage: (persisted: boolean) => persisted
    ? "Existing member data for this field is hidden, not deleted — it comes back if you add the field again. Takes effect when you save."
    : "This field hasn't been saved yet, so nothing is lost.",
  remove: "Remove",
} as const;
