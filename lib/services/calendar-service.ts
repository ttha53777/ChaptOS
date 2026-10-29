import { UNCLEAR_TIME, moveSchedule, scheduleDate, scheduleEndTime, scheduleTime, timeIsClear, type Schedule } from "@/lib/calendar-feed/schedule";
import { repeatDates } from "@/lib/event-repeat";
import { agendaValues, fillAgenda } from "@/lib/agenda-template";
import { followDateChange } from "@/lib/calendar-feed/reschedule";
import { Prisma, type CalendarEvent } from "@/app/generated/prisma/client";
import { guardLegacyNotes, withoutNotesDoc } from "@/lib/collaboration/notes-compat";
import { collaborativeNotesEnabled } from "@/lib/collaboration/notes-config";
import { can } from "@/lib/permissions";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { assertWithinActiveSemester } from "./semester-bounds";
import { applyDetailAction, forMembers, parseEventDetails, partyFieldsOf, withLedgerFallback, type DetailAction, type EventDetail } from "@/lib/event-details";
import { rememberDetailTemplate } from "@/lib/event-details-db";
import type { CreateCalendarInput, UpdateCalendarInput } from "@/lib/validation/calendar";

/**
 * Validate an event's category against the org's CalendarEventType rows — the
 * per-org replacement for the old fixed-enum CHECK. On create the type must be
 * creatable-from-the-timeline and not hidden (deadlines are managed
 * through tasks; hidden types are retired). Workflow-gating is a client/picker
 * concern, not enforced here. On update we only require the type to exist, so a
 * legacy event keeps an editable category even after its type was hidden.
 */
async function assertCategoryUsable(ctx: RequestContext, slug: string, mode: "create" | "update") {
  const type = await ctx.db.calendarEventType.findFirst({ where: { slug } });
  if (!type) throw new ValidationError(`Unknown event type "${slug}"`);
  if (mode === "create" && (!type.creatable || type.hidden)) {
    throw new ValidationError(`The "${type.label}" event type isn't available for new events`);
  }
}

export async function listCalendar(ctx: RequestContext, opts: { category?: string | null } = {}) {
  // Trust the category string as a plain WHERE filter — valid values are now
  // per-org CalendarEventType slugs, so custom categories must pass through.
  const where: Prisma.CalendarEventWhereInput = opts.category ? { category: opts.category } : {};
  // The scoped wrapper's return type doesn't carry the `include` through, so type the
  // payload explicitly. The runtime select matches this shape.
  type CalendarRowWithProgramming = Prisma.CalendarEventGetPayload<{
    include: { programmingEvent: { select: { id: true } }; partyEvent: { select: { id: true; theme: true; collabOrg: true } } };
    omit: { notesDoc: true };
  }>;
  const rows = await ctx.db.calendarEvent.findMany({
    where,
    omit: { notesDoc: true },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    // Pull the owning ProgrammingEvent id (1:1 back-relation) so the Timeline can
    // deep-link a programming-backed event into the Programming page.
    include: { programmingEvent: { select: { id: true } }, partyEvent: { select: { id: true, theme: true, collabOrg: true } } },
  }) as unknown as CalendarRowWithProgramming[];
  // Fetch only IDs of initialized documents, never the binary state in list reads.
  const initialized = new Set((await ctx.db.calendarEvent.findMany({ where: { ...where, notesDoc: { not: null } }, select: { id: true } })).map(row => row.id));
  // Flatten the relation to a scalar so the client DTO stays flat (app/data.ts).
  // Planning details (checklist, budget) are officers' working notes; a member's
  // read never carries them, rather than the rail merely hiding them.
  const officer = can(ctx, "MANAGE_EVENTS");
  return rows.map(({ programmingEvent, partyEvent, details, ...row }) => {
    // A party's theme / collab are mirrored into its details on every write;
    // this fills them in for parties last saved before that mirror existed.
    const all = withLedgerFallback(parseEventDetails(details), partyEvent);
    return {
      ...row,
      // A Json column to Prisma; every write goes through scheduleSchema, so it is one.
      schedule: (row.schedule ?? null) as Schedule | null,
      details: officer ? all : forMembers(all),
      notesInitialized: initialized.has(row.id),
      notesCollaborationEnabled: collaborativeNotesEnabled(ctx.orgId) && can(ctx, "MANAGE_EVENTS") && row.category === "chapter",
      programmingEventId: programmingEvent?.id ?? null,
      partyEventId: partyEvent?.id ?? null,
      // Theme and collab live on the party ledger; the rail shows them as facts.
      partyTheme: partyEvent?.theme || null,
      partyCollabOrg: partyEvent?.collabOrg || null,
    };
  });
}

/**
 * A template's agenda as it lands in a new meeting's notes: blanks filled from
 * the meeting itself, times in the meeting's own zone, so the copy reads the
 * same wherever the officer who created it happened to be.
 */
function fillAgendaFor(input: CreateCalendarInput, body: string): string {
  const s = input.schedule;
  return fillAgenda(body, agendaValues({
    title:     input.title,
    date:      input.date,
    startTime: s?.kind === "timed" ? scheduleTime(s) ?? "" : "",
    endTime:   s ? scheduleEndTime(s) ?? "" : "",
    allDay:    s?.kind === "allDay",
    timeText:  s ? null : input.time,
    location:  input.location,
  }));
}

/**
 * Clear any "who" in the details that isn't on this org's roster. The schema only
 * checks it's a positive integer, so a foreign or stale id would otherwise sit
 * there as a claim nobody can see — the client names it from the org's roster.
 */
async function onlyRosterWho(ctx: RequestContext, details: EventDetail[]): Promise<EventDetail[]> {
  const ids = new Set<number>();
  for (const d of details) {
    if (d.type === "supplies") for (const i of d.items) if (i.who != null) ids.add(i.who);
    if (d.type === "contact" && d.who != null) ids.add(d.who);
  }
  if (ids.size === 0) return details;
  const onRoster = new Set(await ctx.db.member.listIds({ brotherId: { in: [...ids] } }));
  const keep = (who: number | null) => (who != null && onRoster.has(who) ? who : null);
  return details.map(d =>
    d.type === "supplies" ? { ...d, items: d.items.map(i => ({ ...i, who: keep(i.who) })) }
    : d.type === "contact" ? { ...d, who: keep(d.who) }
    : d);
}

export async function createCalendar(ctx: RequestContext, input: CreateCalendarInput) {
  if (input.schedule) input = { ...input, date: scheduleDate(input.schedule), time: scheduleTime(input.schedule) };
  if (input.details?.length) input = { ...input, details: await onlyRosterWho(ctx, input.details) };
  if (!timeIsClear(input.time ?? "")) throw new ValidationError(UNCLEAR_TIME);
  const templateId = input.agendaTemplateId ?? null;
  if (templateId != null) {
    if (input.category !== "chapter") throw new ValidationError("Agenda templates are for chapter meetings.");
    if ((input.description ?? "").trim()) throw new ValidationError("Start the notes from an agenda template or from your own text, not both.");
  }
  await assertCategoryUsable(ctx, input.category, "create");
  await assertWithinActiveSemester(ctx, input.date);
  const occurrences = repeatOccurrences(input);
  if (occurrences.length > 1) await assertWithinActiveSemester(ctx, occurrences[occurrences.length - 1].date);
  const created = await ctx.db.$transaction(async tx => {
    // Read inside the transaction so an archive racing this create can't leave
    // the meeting pointing at a template that was already gone.
    const template = templateId == null ? null : await tx.agendaTemplate.findFirst({
      where: { id: templateId, organizationId: ctx.orgId, archivedAt: null },
      select: { body: true },
    });
    if (templateId != null && !template) throw new ValidationError("That agenda template was deleted. Pick another one, or start the notes blank.");
    const rows = occurrences.map(one => {
      const agenda = template ? fillAgendaFor(one, template.body) : null;
      return {
        organizationId: ctx.orgId,
        schedule: one.schedule ?? Prisma.DbNull,
        title:       one.title,
        date:        one.date,
        time:        one.time ?? null,
        category:    one.category,
        mandatory:   one.mandatory,
        description: agenda ?? one.description ?? null,
        location:    one.location ?? null,
        details:     one.details?.length ? one.details : Prisma.DbNull,
        // notesSeed is how "has minutes" tells this untouched agenda from real minutes.
        ...(agenda != null ? { notesSeed: agenda, agendaTemplateId: templateId } : {}),
      };
    });
    // A repeat is one statement, not one round trip per meeting.
    const events = rows.length === 1
      ? [await tx.calendarEvent.create({ data: rows[0] })]
      : (await tx.calendarEvent.createManyAndReturn({ data: rows })).sort((a, b) => a.date.localeCompare(b.date));
    // The calendar entry and its ledger are one creation, so commit both or neither.
    // A theme / collab typed in More details is the ledger's theme / collab too.
    const parties = input.category === "party" ? await tx.partyEvent.createManyAndReturn({
      data: events.map(event => ({ organizationId: ctx.orgId, name: event.title, date: event.date, attendanceEventId: event.id, ...partyFieldsOf(input.details ?? []) })),
    }) : [];
    if (input.rememberDetails !== undefined) {
      await rememberDetailTemplate(tx, ctx.orgId, input.category, input.details ?? [], input.rememberDetails);
    }
    return events.map(event => ({ event, partyEventId: parties.find(p => p.attendanceEventId === event.id)?.id ?? null }));
  });
  // Every meeting is its own fact, but a repeat is one line in the activity feed.
  const last = created[created.length - 1].event;
  const seriesLine = created.length > 1
    ? `${ctx.actorName || "Someone"} scheduled ${created.length} × ${last.title}, ${input.repeat!.every === 1 ? "weekly" : "every other week"} from ${created[0].event.date} to ${last.date}`
    : undefined;
  for (const [i, { event }] of created.entries()) {
    await emit(ctx, "calendar.created", { type: "CalendarEvent", id: event.id }, {
      title: event.title, date: event.date, category: event.category,
    }, seriesLine ? (i === 0 ? { activityMessage: seriesLine } : { activity: false }) : {});
  }
  const [first, ...rest] = created.map(({ event, partyEventId }) => ({ ...withoutNotesDoc(event), partyEventId }));
  // A repeat answers with the first meeting, as a single create does, plus the rest.
  return rest.length ? { ...first, series: rest } : first;
}

/** The event itself, or one copy per repeat date at the same local wall time. */
function repeatOccurrences(input: CreateCalendarInput): CreateCalendarInput[] {
  if (!input.repeat) return [input];
  const dates = repeatDates(input.date, input.repeat);
  if (dates.length < 2) throw new ValidationError(`Pick an end date at least ${input.repeat.every === 1 ? "a week" : "two weeks"} after the first one.`);
  return dates.map(date => {
    if (!input.schedule) return { ...input, date };
    const schedule = moveSchedule(input.schedule, date);
    if (!schedule) throw new ValidationError(`${input.title} can't repeat on ${date}: that start time doesn't exist that day (daylight saving). Pick another time.`);
    return { ...input, date, schedule, time: scheduleTime(schedule) };
  });
}

export async function updateCalendar(ctx: RequestContext, id: number, input: UpdateCalendarInput) {
  if (input.schedule) input = { ...input, date: scheduleDate(input.schedule), time: scheduleTime(input.schedule) };
  if (input.details?.length) input = { ...input, details: await onlyRosterWho(ctx, input.details) };
  if (input.category != null) await assertCategoryUsable(ctx, input.category, "update");
  // Only re-validate when the date is actually being moved to a concrete value;
  // clearing it (null) or leaving it untouched (undefined) skips the bound check
  // so harmless edits to legacy out-of-range events aren't blocked.
  if (input.date != null) await assertWithinActiveSemester(ctx, input.date);

  const data: Prisma.CalendarEventUpdateInput = {};
  const changedFields: string[] = [];
  for (const k of Object.keys(input) as (keyof UpdateCalendarInput)[]) {
    const v = input[k];
    if (v === undefined || k === "rememberDetails") continue;
    if (k === "details") { data.details = v && (v as EventDetail[]).length ? (v as EventDetail[]) : Prisma.DbNull; changedFields.push(k); continue; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any)[k] = k === "schedule" && v === null ? Prisma.DbNull : v;
    changedFields.push(k);
  }
  if (input.description !== undefined) {
    // Bump notesUpdatedAt so the client can flag a stale AI summary.
    data.notesUpdatedAt = new Date();
  }

  // Verify org ownership before entering the transaction — the raw tx client
  // cannot use the org-scoped wrapper for point mutations.
  const existing = await ctx.db.calendarEvent.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError("Calendar event");

  const event = await ctx.db.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<CalendarEvent[]>(Prisma.sql`SELECT * FROM "CalendarEvent" WHERE id = ${id} AND "organizationId" = ${ctx.orgId} FOR UPDATE`);
    if (!locked) throw new NotFoundError("Calendar event");
    const party = await tx.partyEvent.findFirst({ where: { attendanceEventId: id, organizationId: ctx.orgId } });
    // A linked ledger contains party-specific history. Keep its category stable
    // rather than silently discarding that history in the generic editor.
    if (party && input.category !== undefined && input.category !== "party") {
      throw new ValidationError("This event has a party ledger. Keep the Party category to preserve its records.");
    }
    guardLegacyNotes(locked, input);
    // Only a time being changed must say AM/PM, so older events stay editable.
    if (input.time && input.time.trim() !== (locked.time ?? "").trim() && !timeIsClear(input.time)) throw new ValidationError(UNCLEAR_TIME);
    if (input.date != null && input.schedule === undefined && input.time === undefined) {
      const followed = followDateChange(locked.schedule, input.date);
      if (followed) { data.schedule = followed.schedule; data.time = followed.time; }
    }
    if (input.description !== undefined) {
      if ((input.description ?? "") === (locked.description ?? "")) delete data.notesUpdatedAt;
      else data.notesContentRevision = { increment: 1 };
    }
    const updated = await tx.calendarEvent.update({ where: { id: existing.id, organizationId: ctx.orgId }, data });
    if (input.rememberDetails !== undefined) {
      await rememberDetailTemplate(tx, ctx.orgId, updated.category, parseEventDetails(updated.details), input.rememberDetails);
    }
    const ledgerFields = partyFieldsOf(parseEventDetails(updated.details));
    let attachedParty = !party && updated.category === "party"
      ? await tx.partyEvent.create({ data: { organizationId: ctx.orgId, name: updated.title, date: updated.date, attendanceEventId: id, ...ledgerFields } })
      : party;
    // Edited details carry the party's theme / collab back to its ledger.
    if (party && input.details !== undefined && (party.theme !== ledgerFields.theme || party.collabOrg !== ledgerFields.collabOrg)) {
      attachedParty = await tx.partyEvent.update({ where: { id: party.id, organizationId: ctx.orgId }, data: ledgerFields });
    }

    // Sync linked ServiceEvent. description→notes, others map 1:1.
    const svcData: Record<string, string> = {};
    if (input.title    !== undefined) svcData.title    = String(input.title    ?? "");
    if (input.date     !== undefined) svcData.date     = String(input.date     ?? "");
    if (input.location !== undefined) svcData.location = String(input.location ?? "");
    if (input.description !== undefined) svcData.notes = String(input.description ?? "");
    if (Object.keys(svcData).length > 0) {
      // Include organizationId: the tx client is raw (no scoped wrapper), so we
      // must guard explicitly to prevent touching service events from another org.
      await tx.serviceEvent.updateMany({
        where: { calendarEventId: id, organizationId: ctx.orgId },
        data: svcData,
      });
    }
    return { ...updated, partyEventId: attachedParty?.id ?? null, partyTheme: attachedParty?.theme || null, partyCollabOrg: attachedParty?.collabOrg || null };
  });

  await emit(ctx, "calendar.updated", { type: "CalendarEvent", id: event.id }, {
    title: event.title, changedFields,
  });
  return withoutNotesDoc(event);
}

/** What deleting an event would take with it, counted the way deleteCalendar removes it,
 *  for the timeline's delete slip. `blocked` is the one refusal deleteCalendar makes
 *  beyond the route's MANAGE_EVENTS: a party ledger needs MANAGE_PARTIES. Asked when the
 *  slip opens, so a delete that can't happen is said up front instead of animated. */
export interface DeletePreview {
  attendance: number;
  excuses: number;
  party: { name: string; doorRevenue: number; expenses: number; completed: boolean } | null;
  /** Members with service hours logged on its service event. */
  serviceMembers: number;
  /** A programming card scheduled onto this entry, which goes back to Ideas. */
  programming: boolean;
  /** The fundraiser this event backs; deleting the event deletes it and its shopping list. */
  fundraiser: { supplies: number; wrapped: boolean } | null;
  blocked: "MANAGE_PARTIES" | null;
}

export async function previewDeleteCalendar(ctx: RequestContext, id: number): Promise<DeletePreview> {
  const target = await ctx.db.calendarEvent.findUnique({ where: { id }, select: { id: true } });
  if (!target) throw new NotFoundError("Calendar event");
  // Two at a time: the scoped pool is small (see scoped-query budget).
  const [attendance, excuses] = await Promise.all([
    ctx.db.attendanceRecord.count({ where: { calendarEventId: id } }),
    ctx.db.attendanceExcuse.count({ where: { calendarEventId: id } }),
  ]);
  const [party, serviceMembers] = await Promise.all([
    ctx.db.partyEvent.findFirst({ where: { attendanceEventId: id }, select: { name: true, doorRevenue: true, expenses: true, completed: true } }),
    ctx.db.serviceParticipation.count({ where: { serviceEvent: { calendarEventId: id } } }),
  ]);
  const [programmingCount, fund] = await Promise.all([
    ctx.db.programmingEvent.count({ where: { calendarEventId: id } }),
    ctx.db.fundraiser.findFirst({ where: { calendarEventId: id }, select: { wrappedAt: true, _count: { select: { supplies: true } } } }),
  ]);
  const programming = programmingCount > 0;
  const fundraiser = fund ? { supplies: fund._count.supplies, wrapped: fund.wrappedAt != null } : null;
  return {
    attendance, excuses, party, serviceMembers, programming, fundraiser,
    blocked: party && !can(ctx, "MANAGE_PARTIES") ? "MANAGE_PARTIES" : null,
  };
}

export async function deleteCalendar(ctx: RequestContext, id: number) {
  const target = await ctx.db.calendarEvent.findUnique({
    where: { id },
    select: { title: true },
  });
  if (!target) throw new NotFoundError("Calendar event");

  const { services: deletedServices, party: deletedParty } = await ctx.db.$transaction(async (tx) => {
    // Lock the parent before removing children so concurrent attendance writes
    // cannot insert a new FK reference between cleanup and deletion.
    const [locked] = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`SELECT id FROM "CalendarEvent" WHERE id = ${id} AND "organizationId" = ${ctx.orgId} FOR UPDATE`);
    if (!locked) throw new NotFoundError("Calendar event");
    const party = await tx.partyEvent.findFirst({ where: { attendanceEventId: id, organizationId: ctx.orgId } });
    if (party && !can(ctx, "MANAGE_PARTIES")) {
      throw new ForbiddenError("Managing parties is required to delete an event with a party ledger");
    }
    // The Fundraiser row (and its list) goes with the event by FK cascade.
    const fundraiser = await tx.fundraiser.findFirst({ where: { calendarEventId: id, organizationId: ctx.orgId }, select: { id: true } });
    if (fundraiser && !can(ctx, "MANAGE_FUNDRAISING")) {
      throw new ForbiddenError("Managing fundraisers is required to delete a fundraiser's event");
    }
    await tx.partyEvent.deleteMany({ where: { attendanceEventId: id, organizationId: ctx.orgId } });
    const attendanceWhere = { calendarEventId: id, calendarEvent: { organizationId: ctx.orgId } };
    await tx.attendanceRecord.deleteMany({ where: attendanceWhere });
    await tx.attendanceExcuse.deleteMany({ where: attendanceWhere });
    const services = await tx.serviceEvent.findMany({
      where: { calendarEventId: id, organizationId: ctx.orgId },
      select: { id: true, title: true },
    });
    // Explicit organizationId: tx client is raw, no scoped wrapper.
    await tx.serviceEvent.deleteMany({ where: { calendarEventId: id, organizationId: ctx.orgId } });
    // A programming event backed by this calendar entry falls back to Idea
    // (the FK SET NULLs the link; resetting the stage keeps the CHECK valid and
    // returns the event to the board's Idea column instead of destroying it).
    await tx.programmingEvent.updateMany({
      where: { calendarEventId: id, organizationId: ctx.orgId },
      data:  { stage: "idea", calendarEventId: null },
    });
    await tx.calendarEvent.delete({ where: { id, organizationId: ctx.orgId } });
    return { services, party };
  });

  await emit(ctx, "calendar.deleted", { type: "CalendarEvent", id }, { title: target.title });
  if (deletedParty) {
    await emit(ctx, "party.deleted", { type: "PartyEvent", id: deletedParty.id }, { name: deletedParty.name });
  }
  for (const service of deletedServices) {
    await emit(ctx, "service_event.deleted", { type: "ServiceEvent", id: service.id }, { title: service.title });
  }
}

/**
 * One in-place change to an event's details from the timeline rail: a member
 * claims (or drops) an item on "Who's bringing what", or an officer ticks a
 * checklist item. The rules live in applyDetailAction so the rail's optimistic
 * update and this authoritative one can't disagree; the row lock makes two
 * members grabbing the last bag of ice resolve to one of them.
 *
 * Returns the details as this caller may see them.
 */
export async function changeEventDetail(ctx: RequestContext, id: number, action: DetailAction): Promise<EventDetail[]> {
  const existing = await ctx.db.calendarEvent.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError("Calendar event");
  const officer = can(ctx, "MANAGE_EVENTS");
  const { details, title, item } = await ctx.db.$transaction(async tx => {
    const [row] = await tx.$queryRaw<{ title: string; details: unknown }[]>(Prisma.sql`SELECT title, details FROM "CalendarEvent" WHERE id = ${id} AND "organizationId" = ${ctx.orgId} FOR UPDATE`);
    if (!row) throw new NotFoundError("Calendar event");
    const current = parseEventDetails(row.details);
    const result = applyDetailAction(current, action, { brotherId: ctx.actorId, isOfficer: officer });
    if (!result.ok) {
      if (result.reason === "forbidden") throw new ForbiddenError(result.message);
      if (result.reason === "taken") throw new ValidationError(result.message);
      throw new NotFoundError(result.message);
    }
    await tx.calendarEvent.update({ where: { id, organizationId: ctx.orgId }, data: { details: result.details } });
    const d = result.details.find(x => x.id === action.detailId);
    const label = d?.type === "supplies" ? d.items.find(i => i.id === action.itemId)?.item
      : d?.type === "checklist" ? d.items.find(i => i.id === action.itemId)?.t : undefined;
    return { details: result.details, title: row.title, item: label ?? "" };
  });
  await emit(ctx, "calendar.detail_changed", { type: "CalendarEvent", id }, {
    title, op: action.op, item, value: action.op === "claim" ? action.claim : action.done,
  });
  return officer ? details : forMembers(details);
}
