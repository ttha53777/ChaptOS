/**
 * Types, constants, and pure helpers for org-defined custom member fields.
 *
 * Definitions live in OrganizationConfig.customMemberFields (JSON array).
 * Values live in Brother.customFields (sparse JSON map { fieldId → value }).
 *
 * This file has no React or Prisma imports — it is safe to use in both server
 * and client modules.
 */

export type FieldType = "text" | "number" | "select";

export interface CustomMemberFieldDef {
  /** Stable slug generated from the label on creation; never mutated. */
  id: string;
  /** Human-readable display name shown in roster headers, drawer, settings. */
  label: string;
  /** Field type. Only "text" has a distinct UI in MVP; "number" and "select"
   *  are accepted and stored but rendered as text inputs until a follow-up PR. */
  type: FieldType;
  /** If true, block save in the drawer when the value is blank. Validated on
   *  updateBrother, not createBrother (the field may not exist at join time). */
  required: boolean;
  /** Include as a dynamic column in the brothers roster table. */
  showOnRoster: boolean;
  /** 0-based column ordering among showOnRoster fields; lower = further left. */
  rosterOrder: number;
  /** Optional input placeholder shown in the drawer edit form. */
  placeholder?: string;
  /** Allowed option strings for type "select"; ignored for other types. */
  options?: string[];
}

export type CustomFieldValues = Record<string, string | number | null>;

export const MAX_FIELDS = 20;
export const MAX_LABEL  = 64;
export const MAX_VALUE  = 255;

const FIELD_ID_RE = /^[a-z0-9_]{1,48}$/;

/**
 * Convert a human label into a stable field id slug.
 * e.g. "Pledge Class" → "pledge_class", "Jersey #" → "jersey_"
 * Collisions in a definition list are resolved by the caller (append _2, _3…).
 */
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 48) || "field";
}

/**
 * Generate a unique id for a new field definition, avoiding collisions with
 * existing ids in the same list.
 */
export function generateFieldId(label: string, existingIds: string[]): string {
  const base = slugify(label);
  if (!existingIds.includes(base)) return base;
  for (let n = 2; n <= 99; n++) {
    const candidate = `${base}_${n}`.slice(0, 48);
    if (!existingIds.includes(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`.slice(0, 48);
}

/**
 * Validate a raw field id string (used by the Zod schema and service).
 */
export function isValidFieldId(id: string): boolean {
  return FIELD_ID_RE.test(id);
}

/**
 * Strip unknown field ids and coerce / truncate values against the live
 * definition list. Called on every brother read and write so orphan values
 * (from deleted field definitions) are never surfaced to the client.
 *
 * @param raw    The raw `customFields` JSON object from the DB or request body.
 * @param defs   The org's current field definitions (fetched server-side).
 * @returns      A clean map with only known ids and sanitized values.
 */
export function sanitizeCustomFields(
  raw: unknown,
  defs: CustomMemberFieldDef[],
): CustomFieldValues {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};

  const knownIds = new Set(defs.map(d => d.id));
  const result: CustomFieldValues = {};

  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!knownIds.has(id)) continue;

    const def = defs.find(d => d.id === id);
    if (!def) continue; // knownIds guard above should prevent this, but be safe

    if (value === null || value === undefined) {
      result[id] = null;
      continue;
    }

    if (def.type === "number") {
      const n = Number(value);
      result[id] = Number.isFinite(n) ? n : null;
    } else {
      // text and select: coerce to string, truncate
      const str = String(value).slice(0, MAX_VALUE);
      result[id] = str;
    }
  }

  return result;
}

/**
 * Normalise and validate a raw array of field definitions coming from the
 * settings editor (admin input — trusted but sanitized for defense in depth).
 *
 * - Strips definitions with invalid or missing ids
 * - Truncates labels to MAX_LABEL
 * - Defaults unknown types to "text"
 * - Caps the list at MAX_FIELDS
 * - Deduplicates by id (first occurrence wins)
 *
 * Does NOT generate ids for new definitions — that is the service's job
 * (setCustomMemberFields) since it needs the full existing id set.
 */
export function sanitizeFieldDefs(raw: unknown[]): CustomMemberFieldDef[] {
  const seen = new Set<string>();
  const result: CustomMemberFieldDef[] = [];

  for (const item of raw) {
    if (result.length >= MAX_FIELDS) break;
    if (typeof item !== "object" || item === null) continue;

    const f = item as Record<string, unknown>;
    const id = typeof f.id === "string" ? f.id : "";
    if (!isValidFieldId(id) || seen.has(id)) continue;

    const label = typeof f.label === "string" ? f.label.trim().slice(0, MAX_LABEL) : "";
    if (!label) continue;

    const type: FieldType =
      f.type === "number" || f.type === "select" ? f.type : "text";

    seen.add(id);
    result.push({
      id,
      label,
      type,
      required:     Boolean(f.required),
      showOnRoster: Boolean(f.showOnRoster),
      rosterOrder:  typeof f.rosterOrder === "number" ? Math.max(0, Math.min(99, Math.floor(f.rosterOrder))) : result.length,
      placeholder:  typeof f.placeholder === "string" ? f.placeholder.slice(0, 120) : undefined,
      options:
        Array.isArray(f.options)
          ? (f.options as unknown[])
              .filter((o): o is string => typeof o === "string")
              .slice(0, 20)
              .map(o => o.slice(0, 64))
          : undefined,
    });
  }

  return result;
}
