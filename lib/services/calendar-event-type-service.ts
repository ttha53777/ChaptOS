import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { CreateEventTypeInput, UpdateEventTypeInput } from "@/lib/validation/event-types";

const MAX_EVENT_TYPES_PER_ORG = 40;

export interface CalendarEventTypeDTO {
  id: number;
  organizationId: number;
  slug: string;
  label: string;
  color: string;
  colorDark: string | null;
  workflowId: string | null;
  builtin: boolean;
  creatable: boolean;
  hidden: boolean;
  mandatoryDefault: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

function requireAdmin(ctx: RequestContext) {
  if (!ctx.isOrgAdmin && !ctx.isPlatformAdmin) {
    throw new ForbiddenError("Only an org admin can manage event types");
  }
}

function toDTO(row: {
  id: number; organizationId: number; slug: string; label: string; color: string;
  colorDark: string | null; workflowId: string | null; builtin: boolean; creatable: boolean;
  hidden: boolean; mandatoryDefault: boolean; displayOrder: number; createdAt: Date; updatedAt: Date;
}): CalendarEventTypeDTO {
  return {
    id:               row.id,
    organizationId:   row.organizationId,
    slug:             row.slug,
    label:            row.label,
    color:            row.color,
    colorDark:        row.colorDark,
    workflowId:       row.workflowId,
    builtin:          row.builtin,
    creatable:        row.creatable,
    hidden:           row.hidden,
    mandatoryDefault: row.mandatoryDefault,
    displayOrder:     row.displayOrder,
    createdAt:        row.createdAt.toISOString(),
    updatedAt:        row.updatedAt.toISOString(),
  };
}

/**
 * All of the org's event types — including hidden and workflow-off ones. The
 * client needs the full set to resolve the color/label of existing events (which
 * render regardless of workflow state) and filters the add-event picker itself
 * via isEventTypeVisibleInPicker.
 */
export async function listEventTypes(ctx: RequestContext): Promise<CalendarEventTypeDTO[]> {
  const rows = await ctx.db.calendarEventType.findMany({
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toDTO);
}

export async function createEventType(
  ctx: RequestContext,
  input: CreateEventTypeInput,
): Promise<CalendarEventTypeDTO> {
  requireAdmin(ctx);

  const total = await ctx.db.calendarEventType.count();
  if (total >= MAX_EVENT_TYPES_PER_ORG) {
    throw new ValidationError(`Org has reached the limit of ${MAX_EVENT_TYPES_PER_ORG} event types`);
  }

  const clash = await ctx.db.calendarEventType.findFirst({ where: { slug: input.slug }, select: { id: true } });
  if (clash) throw new ValidationError(`An event type with the slug "${input.slug}" already exists`);

  const row = await ctx.db.calendarEventType.create({
    data: {
      slug:             input.slug,
      label:            input.label,
      color:            input.color,
      colorDark:        input.colorDark ?? null,
      workflowId:       input.workflowId ?? null,
      builtin:          false,
      creatable:        true,
      hidden:           false,
      mandatoryDefault: input.mandatoryDefault ?? false,
      displayOrder:     input.displayOrder ?? total,
    },
  });

  await emit(ctx, "calendar_event_type.created", { type: "CalendarEventType", id: row.id }, {
    slug: row.slug, label: row.label,
  });

  return toDTO(row);
}

export async function updateEventType(
  ctx: RequestContext,
  id: number,
  input: UpdateEventTypeInput,
): Promise<CalendarEventTypeDTO> {
  requireAdmin(ctx);

  const existing = await ctx.db.calendarEventType.findFirst({ where: { id } });
  if (!existing) throw new NotFoundError("Event type not found");

  // Guard: an active built-in can't be hidden. Its workflow being enabled means
  // it must stay available; hiding is only allowed for custom types (or built-ins
  // whose workflow is currently off, though those are already picker-hidden).
  if (input.hidden === true && existing.builtin) {
    const config = await ctx.db.organizationConfig.find();
    const enabledWorkflows = (config?.enabledWorkflows ?? []) as string[];
    const workflowOn = existing.workflowId == null || enabledWorkflows.includes(existing.workflowId);
    if (workflowOn) {
      throw new ValidationError("A built-in type can't be hidden while its workflow is enabled");
    }
  }

  const changedFields: string[] = [];
  const data: Record<string, unknown> = {};
  const fields = ["label", "color", "colorDark", "workflowId", "mandatoryDefault", "displayOrder", "hidden"] as const;
  for (const f of fields) {
    if (f in input && input[f] !== undefined) {
      data[f] = input[f] ?? null;
      changedFields.push(f);
    }
  }

  const row = await ctx.db.calendarEventType.update({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    where: { id }, data: data as any,
  });

  if (changedFields.length === 1 && changedFields[0] === "hidden") {
    await emit(ctx, "calendar_event_type.hidden", { type: "CalendarEventType", id: row.id }, {
      slug: row.slug, label: row.label, hidden: row.hidden,
    });
  } else {
    await emit(ctx, "calendar_event_type.updated", { type: "CalendarEventType", id: row.id }, {
      slug: row.slug, label: row.label, changedFields,
    });
  }

  return toDTO(row);
}

export async function deleteEventType(ctx: RequestContext, id: number): Promise<void> {
  requireAdmin(ctx);

  const existing = await ctx.db.calendarEventType.findFirst({ where: { id } });
  if (!existing) throw new NotFoundError("Event type not found");

  if (existing.builtin) {
    throw new ValidationError("Built-in event types can't be deleted — hide it instead");
  }

  // No FK backs category, so check references explicitly and refuse to orphan events.
  const inUse = await ctx.db.calendarEvent.count({ where: { category: existing.slug } });
  if (inUse > 0) {
    throw new ValidationError(`This type is used by ${inUse} event${inUse === 1 ? "" : "s"} — reassign or remove them first`);
  }

  await ctx.db.calendarEventType.delete({ where: { id } });

  await emit(ctx, "calendar_event_type.deleted", { type: "CalendarEventType", id }, {
    slug: existing.slug, label: existing.label,
  });
}
