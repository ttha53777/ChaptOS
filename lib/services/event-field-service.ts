import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";
import {
  deriveFieldSlug,
  isBuiltinFieldSlug,
  isFieldKind,
  MAX_EVENT_FIELDS,
  type FieldKind,
} from "@/lib/event-fields";
import type { CreateEventFieldInput, UpdateEventFieldInput } from "@/lib/validation/event-fields";

export interface EventFieldDTO {
  id: number;
  slug: string;
  label: string;
  kind: FieldKind;
  enabled: boolean;
  builtin: boolean;
  displayOrder: number;
}

/**
 * The event vocabulary belongs to whoever runs the events.
 *
 * Deliberately MANAGE_EVENTS rather than the org-admin gate, by the transaction
 * category service's own argument: the person who needs "Bus company" at 11pm is
 * the same officer who already holds MANAGE_EVENTS for POST /api/programming.
 * Gating this on admin would let them create the event but not the field it needs
 * — a dead end requiring a round trip to the president.
 */
function requireEvents(ctx: RequestContext) {
  const allowed = ctx.isPlatformAdmin || ctx.isOrgAdmin || hasPermission(ctx.permissions, "MANAGE_EVENTS");
  if (!allowed) throw new ForbiddenError("Only an events officer can manage event fields");
}

function toDTO(row: {
  id: number; slug: string; label: string; kind: string;
  enabled: boolean; builtin: boolean; displayOrder: number;
}): EventFieldDTO {
  return {
    id:           row.id,
    slug:         row.slug,
    label:        row.label,
    kind:         isFieldKind(row.kind) ? row.kind : "text",
    enabled:      row.enabled,
    builtin:      row.builtin,
    displayOrder: row.displayOrder,
  };
}

type FieldRow = Parameters<typeof toDTO>[0];

/**
 * Every definition, including DISABLED ones.
 *
 * No permission gate, matching listEventTypes and listTransactionCategories:
 * every member's event panel needs the full set to resolve the label of an answer
 * already on an event. Disabled rows ship too — the settings surface needs to see
 * what it can switch back on, and the client filters on `enabled` for editing.
 */
export async function listEventFields(ctx: RequestContext): Promise<EventFieldDTO[]> {
  const rows = await ctx.db.eventFieldDefinition.findMany({
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
  }) as FieldRow[];
  return rows.map(toDTO);
}

export async function createEventField(
  ctx: RequestContext,
  input: CreateEventFieldInput,
): Promise<EventFieldDTO> {
  requireEvents(ctx);

  const total = await ctx.db.eventFieldDefinition.count();
  if (total >= MAX_EVENT_FIELDS) {
    throw new ValidationError(`Org has reached the limit of ${MAX_EVENT_FIELDS} event fields`);
  }

  // One read serving three purposes: the duplicate-label guard, slug de-duping,
  // and the display order of the new row.
  const siblings = await ctx.db.eventFieldDefinition.findMany({
    select: { slug: true, label: true },
  }) as { slug: string; label: string }[];

  // Guard on the case-folded LABEL, not just the slug. A pure slug check would
  // happily accept a second row labelled "budget" beside the built-in "Budget" —
  // different slugs ("budget-2" vs "budget"), indistinguishable in a panel.
  const folded = input.label.toLowerCase();
  if (siblings.some(s => s.label.toLowerCase() === folded)) {
    throw new ValidationError(`An event field called "${input.label}" already exists`);
  }

  const slug = deriveFieldSlug(input.label, siblings.map(s => s.slug));

  // Belt and braces: the de-dupe loop above can't hand back a built-in slug while
  // that built-in exists, but an org whose seed row was deleted out of band must
  // still not get a custom field impersonating a reserved key.
  if (isBuiltinFieldSlug(slug)) {
    throw new ValidationError(`"${slug}" is reserved`);
  }

  const row = await ctx.db.eventFieldDefinition.create({
    data: {
      slug,
      label:        input.label,
      kind:         input.kind,
      enabled:      input.enabled ?? true,
      builtin:      false,
      displayOrder: input.displayOrder ?? siblings.length,
    },
  }) as FieldRow;

  await emit(ctx, "event_field.created", { type: "EventFieldDefinition", id: row.id }, {
    slug: row.slug, label: row.label, kind: row.kind,
  });

  return toDTO(row);
}

export async function updateEventField(
  ctx: RequestContext,
  id: number,
  input: UpdateEventFieldInput,
): Promise<EventFieldDTO> {
  requireEvents(ctx);

  const existing = await ctx.db.eventFieldDefinition.findFirst({ where: { id } }) as FieldRow | null;
  if (!existing) throw new NotFoundError("Event field");

  // A builtin renames, reorders AND switches off like any other row.
  //
  // It used to be refused here, on the stated grounds that "the board and the
  // gates address these by slug, so a missing one is a broken surface." That was
  // simply not true of these ten. The stage gates run off REQUIRED_FIELDS in
  // lib/programming — title, category, owner, date, location, mandatory — which
  // are real columns and share not one slug with this table. Nothing downstream
  // reads `budget` or `risk` and expects it to exist.
  //
  // The refusal cost real orgs real clarity: a chapter that doesn't do buses or
  // dress codes was made to carry those rows on every event sheet forever, which
  // is exactly the hardcoded-column problem this table was built to escape.
  //
  // Turning one off is lossless for all ten, by two different mechanisms:
  // sanitizeFieldValues drops disabled slugs on read while leaving them on disk,
  // and the three column-backed built-ins (description, attachment, cohost) keep
  // their columns untouched — disabling only stops rendering the row. Both are
  // reversible by switching it back on. What a builtin still can't be is
  // DELETED: its slug is reserved, so the row has to survive to hold the place.

  const changedFields: string[] = [];
  const data: Record<string, unknown> = {};
  for (const f of ["label", "enabled", "displayOrder"] as const) {
    if (f in input && input[f] !== undefined) {
      data[f] = input[f];
      changedFields.push(f);
    }
  }

  if (typeof data.label === "string") {
    const clash = await ctx.db.eventFieldDefinition.findFirst({
      where: { id: { not: id }, label: { equals: data.label, mode: "insensitive" } },
      select: { id: true },
    });
    if (clash) throw new ValidationError(`An event field called "${data.label}" already exists`);
  }

  const row = await ctx.db.eventFieldDefinition.update({
    where: { id }, data: data as never,
  }) as FieldRow;

  await emit(ctx, "event_field.updated", { type: "EventFieldDefinition", id: row.id }, {
    slug: row.slug, label: row.label, changedFields,
  });

  return toDTO(row);
}

export async function deleteEventField(ctx: RequestContext, id: number): Promise<void> {
  requireEvents(ctx);

  const existing = await ctx.db.eventFieldDefinition.findFirst({ where: { id } }) as FieldRow | null;
  if (!existing) throw new NotFoundError("Event field");

  if (existing.builtin) {
    throw new ValidationError(
      `"${existing.label}" is a built-in field and can't be deleted. Turn it off instead if you don't use it.`,
    );
  }

  // Nothing backs fieldValues with a foreign key (a JSON key can't carry one), so
  // count the live answers and refuse rather than orphan them. Note this is about
  // HONESTY, not integrity: sanitizeFieldValues already hides orphaned answers on
  // read, so a delete would look clean and quietly discard fifteen events' worth
  // of data. Naming the count gives the officer the choice sanitize would deny
  // them — and disabling is the lossless version of what they were reaching for.
  // Counted in app code rather than with a JSONB `path` filter: Prisma's JSON
  // filters express "this key equals X", not "this key is present", and the
  // near-miss (`not: undefined`) silently compiles to no filter at all — which
  // would count EVERY event and make the field permanently undeletable. The row
  // count here is bounded by one org's events.
  const rows = await ctx.db.programmingEvent.findMany({ select: { fieldValues: true } }) as { fieldValues: unknown }[];
  const answered = rows.filter(r =>
    typeof r.fieldValues === "object" && r.fieldValues !== null &&
    (r.fieldValues as Record<string, unknown>)[existing.slug] !== undefined,
  ).length;

  if (answered > 0) {
    throw new ValidationError(
      `${answered} event${answered === 1 ? " has" : "s have"} answered "${existing.label}" — turn it off instead of deleting it, and the answers are kept.`,
    );
  }

  await ctx.db.eventFieldDefinition.delete({ where: { id } });

  await emit(ctx, "event_field.deleted", { type: "EventFieldDefinition", id }, {
    slug: existing.slug, label: existing.label,
  });
}
