/**
 * The org's OPTIONAL event field vocabulary: the ten built-ins, slug derivation,
 * and the sanitizer every read and write of `ProgrammingEvent.fieldValues` runs
 * through.
 *
 * WHAT THIS REPLACED, and why the shape changed. The events page used to carry a
 * per-event `ProgrammingChecklistItem` list — free text, written from scratch on
 * every event. Nobody spells "book the van" the same way twice, so nothing could
 * ever be counted, compared, or charted across events. Here the ORG declares the
 * vocabulary once and every event answers the same question. Same posture as the
 * per-org transaction categories and Membership.customFields.
 *
 * KEEP THIS MODULE PURE. It is reached from the events page (a "use client"
 * tree), so importing anything that touches @/lib/db, @/lib/errors or @/lib/prisma
 * from here pulls the Prisma runtime into the browser and 500s the dev server —
 * while `tsc --noEmit` and vitest both stay green, which is what makes the failure
 * mode nasty. lib/org-types.ts already learned this the hard way. The DB-backed
 * half lives in lib/event-fields-db.ts.
 */

/**
 * The value kinds a field can hold.
 *
 * Deliberately small and closed. Each one has a distinct editor and a distinct
 * coercion below — a kind that renders and stores identically to `text` is not a
 * kind, it is a label (see the note on custom-member-fields' `select`, which is
 * stored but has no distinct UI, in the plan's §5b).
 */
export const FIELD_KINDS = ["text", "num", "money", "bool", "date", "person", "file"] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export function isFieldKind(value: string): value is FieldKind {
  return (FIELD_KINDS as readonly string[]).includes(value);
}

/** Ceiling per org. Bounds the payload every event's panel has to resolve. */
export const MAX_EVENT_FIELDS = 24;

/** Longest stored string value, per field. Matches sanitizeCustomFields' cap. */
const MAX_VALUE_LEN = 2000;

/** Longest label a field may carry (also enforced by the Zod schema). */
export const MAX_FIELD_LABEL = 48;

export interface EventFieldDef {
  slug: string;
  label: string;
  kind: FieldKind;
  enabled: boolean;
  builtin: boolean;
  displayOrder: number;
}

export interface BuiltinEventField {
  slug: string;
  label: string;
  kind: FieldKind;
  /** Whether a freshly-seeded org has this one switched on. */
  defaultEnabled: boolean;
}

/**
 * The ten fields the platform ships to every org, seeded `builtin: true`.
 *
 * The five enabled ones are the questions almost every org asks about almost
 * every event. The five disabled ones are real but not universal — an org that
 * needs them switches them on, which costs one tap; an org that doesn't never
 * sees them, which is the whole reason they aren't hardcoded columns.
 *
 * `description`, `attachment` and `cohost` are backed by REAL COLUMNS
 * (description / attachmentUrl+attachmentDocId / collabOrg), not by fieldValues —
 * they predate this table and their data was never copied into JSON. They appear
 * here so the org can turn them off like any other optional field; the service
 * reads and writes the column.
 */
export const BUILTIN_EVENT_FIELDS: readonly BuiltinEventField[] = [
  { slug: "description", label: "Description",      kind: "text",  defaultEnabled: true  },
  { slug: "budget",      label: "Budget",           kind: "money", defaultEnabled: true  },
  { slug: "attachment",  label: "Attachment",       kind: "file",  defaultEnabled: true  },
  { slug: "headcount",   label: "Head count",       kind: "num",   defaultEnabled: true  },
  { slug: "cohost",      label: "Co-host",          kind: "text",  defaultEnabled: true  },
  { slug: "contact",     label: "Point of contact", kind: "text",  defaultEnabled: false },
  { slug: "setup",       label: "Setup time",       kind: "text",  defaultEnabled: false },
  { slug: "risk",        label: "Risk form",        kind: "bool",  defaultEnabled: false },
  { slug: "dress",       label: "Dress code",       kind: "text",  defaultEnabled: false },
  { slug: "transport",   label: "Transportation",   kind: "text",  defaultEnabled: false },
] as const;

/**
 * Built-in slugs that are backed by a real ProgrammingEvent column rather than by
 * `fieldValues`. Their answers must never be written into the JSON, or the same
 * fact would exist in two places and drift.
 */
export const COLUMN_BACKED_FIELDS: Readonly<Record<string, "description" | "attachment" | "collabOrg">> = {
  description: "description",
  attachment:  "attachment",
  cohost:      "collabOrg",
};

export function isColumnBackedField(slug: string): boolean {
  return slug in COLUMN_BACKED_FIELDS;
}

const BUILTIN_SLUGS = new Set(BUILTIN_EVENT_FIELDS.map(f => f.slug));

/** Whether a slug belongs to the shipped ten (which are reserved, not deletable). */
export function isBuiltinFieldSlug(slug: string): boolean {
  return BUILTIN_SLUGS.has(slug);
}

/**
 * Derive a stored key from a display label: "Bus company" → "bus-company".
 *
 * Only ever applied to NEW fields, and only ever on the SERVER. Never accept a
 * slug from the client: it could collide with a built-in and shadow it, and
 * nothing about a slug is a user-facing choice. (lib/custom-member-fields.ts does
 * accept one, and its "add a field" button has been 400ing on `id: ""` ever
 * since — see the plan's §5b.)
 *
 * Returns "" for a label with nothing slug-able in it (e.g. "🎉"); callers fall
 * back to a generic base rather than storing an empty key.
 */
export function slugifyFieldLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * `slugifyFieldLabel` plus the de-dupe loop: "Budget" beside an existing budget
 * becomes "budget-2". `taken` is the org's live slug set.
 */
export function deriveFieldSlug(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugifyFieldLabel(label) || "field";
  if (!used.has(base)) return base;
  for (let n = 2; n <= 99; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export type FieldValue = string | number | boolean | null;
export type FieldValues = Record<string, FieldValue>;

/**
 * Strip unknown slugs and coerce values against the org's LIVE definitions.
 *
 * Run on every read and every write, exactly like sanitizeCustomFields. Two
 * consequences fall out of that for free and are load-bearing:
 *
 *  - A DISABLED field's answers stay on disk but never reach a response, so
 *    "off" hides without destroying, and re-enabling resurrects them. That is
 *    the OFF ≠ DELETE rule with no extra machinery.
 *  - A DELETED field's orphaned answers are never surfaced, so the delete guard
 *    in the service is about honesty ("3 events answered this"), not integrity.
 *
 * Column-backed built-ins are dropped: their answers live in real columns, and a
 * copy in the JSON would be a second, drifting source of truth.
 */
export function sanitizeFieldValues(raw: unknown, defs: readonly EventFieldDef[]): FieldValues {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};

  const bySlug = new Map(defs.filter(d => d.enabled).map(d => [d.slug, d]));
  const result: FieldValues = {};

  for (const [slug, value] of Object.entries(raw as Record<string, unknown>)) {
    const def = bySlug.get(slug);
    if (!def) continue;
    if (isColumnBackedField(slug)) continue;

    if (value === null || value === undefined || value === "") {
      // An explicit empty clears the answer rather than storing "".
      continue;
    }

    switch (def.kind) {
      case "num":
      case "money": {
        const n = Number(value);
        if (Number.isFinite(n)) result[slug] = n;
        break;
      }
      case "bool":
        result[slug] = Boolean(value);
        break;
      default:
        // text / date / person / file all store a string; date and person are
        // narrowed by their editors, not here — a bad date is a display problem,
        // whereas rejecting it server-side would lose the answer entirely.
        result[slug] = String(value).slice(0, MAX_VALUE_LEN);
    }
  }

  return result;
}

/**
 * Merge an incoming partial answer set over the stored one, then sanitize.
 *
 * A PATCH carries only the fields the panel edited, so an absent slug must mean
 * "unchanged" and an explicit null/"" must mean "cleared" — which sanitize
 * already implements by dropping empties.
 */
export function mergeFieldValues(
  stored: unknown,
  incoming: Record<string, unknown>,
  defs: readonly EventFieldDef[],
): FieldValues {
  const base = sanitizeFieldValues(stored, defs);
  const merged: Record<string, unknown> = { ...base };
  for (const [slug, value] of Object.entries(incoming)) {
    if (value === null || value === undefined || value === "") delete merged[slug];
    else merged[slug] = value;
  }
  return sanitizeFieldValues(merged, defs);
}

/* ── Per-event attachment ──────────────────────────────────────────────────────
 *
 * Two scopes decide whether an event collects a field:
 *
 *   · the ORG list (EventFieldDefinition.enabled) — does this field exist for the
 *     chapter at all, and does a NEW event start with it attached;
 *   · the EVENT's own opt-outs (ProgrammingEvent.detachedFields) — which of those
 *     this one event has since said no to.
 *
 * Only the exceptions are stored. An event that never expressed an opinion about
 * a field simply follows the org default, which is what lets a chapter switch a
 * new field on and have it reach the whole board without a backfill.
 *
 * A field that is OFF for the org is off everywhere, regardless of what an event
 * once recorded: the org list is a menu, and you cannot attach what isn't on it.
 */

/** Read a `detachedFields` JSON column into a slug set, tolerating junk. */
export function parseDetached(raw: unknown): Set<string> {
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((v): v is string => typeof v === "string"));
}

/**
 * The fields THIS event collects: org-enabled, minus its own opt-outs.
 *
 * This is the list the event's sheet renders and the only one its answers are
 * sanitized against.
 */
export function fieldsForEvent(
  defs: readonly EventFieldDef[],
  detachedRaw: unknown,
): EventFieldDef[] {
  const detached = parseDetached(detachedRaw);
  return defs.filter(d => d.enabled && !detached.has(d.slug));
}

/**
 * Normalize a detached set before it is stored.
 *
 * Slugs the org doesn't offer are dropped rather than kept: a stale opt-out for a
 * deleted field would sit in the column forever, and one for a field the org has
 * switched off would silently suppress it if the org switched it back on. Sorted
 * so the column doesn't churn on rewrite.
 */
export function sanitizeDetached(
  raw: unknown,
  defs: readonly EventFieldDef[],
): string[] {
  const known = new Set(defs.filter(d => d.enabled).map(d => d.slug));
  return [...parseDetached(raw)].filter(s => known.has(s)).sort();
}
