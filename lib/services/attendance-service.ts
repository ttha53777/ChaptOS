import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { CheckInStatus, ExcuseStatus } from "@/lib/state";
import { getActiveSemester } from "@/lib/attendance";
import { CHECKIN_WINDOW_MS, acceptsCheckIns, checkInMsRemaining, checkInState } from "@/lib/checkin";
import type { RecordAttendanceInput } from "@/lib/validation/attendance";

export type AttendanceSummaryRow = {
  calendarEventId: number;
  present:         number;
  eligible:        number;
};

/**
 * Per-event present/eligible counts for every calendar event in a category,
 * aggregated in two queries instead of one round-trip per event.
 *
 * Tenancy: the attendance join tables have no organizationId column (they are
 * raw pass-throughs in lib/db/tenant.ts). Isolation comes from two org-scoped
 * anchors — the event-id set is read through the org-scoped ctx.db.calendarEvent,
 * and records are filtered by the org's active semesterId — so a record can never
 * match both this org's semester and a foreign event. Mirrors the guarantee the
 * /api/attendance/[eventId] route relies on, but batched.
 *
 * Returns [] when there is no active semester (rather than throwing) so a
 * page-wide summary degrades to blank counts instead of erroring.
 */
export async function summarizeAttendance(
  ctx: RequestContext,
  opts: { category?: string | null } = {},
): Promise<AttendanceSummaryRow[]> {
  // Trust the category string as a plain WHERE filter — valid values are now
  // per-org CalendarEventType slugs, so custom categories must pass through.
  const category = opts.category || undefined;

  const [events, semester] = await Promise.all([
    ctx.db.calendarEvent.findMany({
      where: category ? { category } : {},
      select: { id: true },
    }),
    getActiveSemester(ctx.db),
  ]);

  const eventIds = events.map(e => e.id);
  if (eventIds.length === 0 || !semester) {
    // No semester → no records to count; return zeroed rows so the caller still
    // learns which events exist.
    return eventIds.map(id => ({ calendarEventId: id, present: 0, eligible: 0 }));
  }

  const [records, excuses, exemptions] = await Promise.all([
    ctx.db.attendanceRecord.findMany({
      where: { semesterId: semester.id, calendarEventId: { in: eventIds } },
      select: { calendarEventId: true, brotherId: true, attended: true },
    }),
    ctx.db.attendanceExcuse.findMany({
      where: { semesterId: semester.id, calendarEventId: { in: eventIds }, status: ExcuseStatus.Approved },
      select: { calendarEventId: true, brotherId: true },
    }),
    ctx.db.attendanceExemption.findMany({
      where: { semesterId: semester.id },
      select: { brotherId: true },
    }),
  ]);
  // Semester-exempt members are dropped from every event's numerator and
  // denominator (they hold no eligible-attendance obligation this term).
  const exemptBrotherIds = new Set(exemptions.map(e => e.brotherId));

  // Excused brothers are dropped from both numerator and denominator, matching
  // the [eventId] route: eligible = records that aren't excused, present =
  // eligible AND attended.
  const excusedByEvent = new Map<number, Set<number>>();
  for (const e of excuses) {
    const set = excusedByEvent.get(e.calendarEventId) ?? new Set<number>();
    set.add(e.brotherId);
    excusedByEvent.set(e.calendarEventId, set);
  }

  const counts = new Map<number, { present: number; eligible: number }>();
  for (const id of eventIds) counts.set(id, { present: 0, eligible: 0 });
  for (const r of records) {
    if (exemptBrotherIds.has(r.brotherId)) continue;
    const excused = excusedByEvent.get(r.calendarEventId);
    if (excused?.has(r.brotherId)) continue;
    const c = counts.get(r.calendarEventId);
    if (!c) continue;
    c.eligible += 1;
    if (r.attended) c.present += 1;
  }

  return eventIds.map(id => ({ calendarEventId: id, ...counts.get(id)! }));
}

export async function recordAttendance(ctx: RequestContext, input: RecordAttendanceInput) {
  const [event, semester] = await Promise.all([
    ctx.db.calendarEvent.findUnique({ where: { id: input.calendarEventId } }),
    getActiveSemester(ctx.db),
  ]);
  if (!event)            throw new NotFoundError("Event");
  if (!event.mandatory)  throw new ValidationError("Only mandatory events track attendance");
  if (!semester)         throw new ValidationError("No active semester");

  const [excuses, exemptions, brotherIds] = await Promise.all([
    ctx.db.attendanceExcuse.findMany({
      where: { calendarEventId: input.calendarEventId, semesterId: semester.id, status: ExcuseStatus.Approved },
    }),
    ctx.db.attendanceExemption.findMany({
      where: { semesterId: semester.id },
      select: { brotherId: true },
    }),
    ctx.db.member.listIds(),
  ]);
  const excusedBrotherIds = new Set(excuses.map(e => e.brotherId));
  const exemptBrotherIds  = new Set(exemptions.map(e => e.brotherId));
  // Eligible = this org's roster, minus per-event excused, minus semester-exempt.
  const eligible = brotherIds.filter(id => !excusedBrotherIds.has(id) && !exemptBrotherIds.has(id));
  const eligibleIds = eligible;
  const attendedSet = new Set(input.attendedIds);

  // Existing rows for this event, so the write below can be a MERGE rather than
  // a wholesale replace. This matters now that members write their own rows via
  // the live check-in window: a blanket deleteMany over every eligible member
  // would silently erase every self-check-in the moment an officer opened the
  // sheet to correct one person.
  const existing = await ctx.db.attendanceRecord.findMany({
    where: { calendarEventId: input.calendarEventId, brotherId: { in: eligibleIds } },
    select: { brotherId: true, attended: true },
  });
  const existingByBrother = new Map(existing.map(r => [r.brotherId, r.attended]));

  // Only the members whose value actually changes (or who have no row yet) get
  // rewritten. Rows that already say the right thing are left untouched.
  const stale = eligible.filter(id => existingByBrother.get(id) !== attendedSet.has(id));

  // Set-based writes: two statements regardless of roster size. A per-member
  // upsert loop here 500s (P2024 transaction timeout) once a chapter passes ~60
  // members, because each upsert is a serial round-trip inside the transaction.
  // The tenant $transaction wrapper takes a callback (it SET LOCALs the org id).
  await ctx.db.$transaction(async tx => {
    if (stale.length === 0) return;
    // Delete-then-create only the stale subset. Excused members are absent from
    // eligibleIds, so their pre-existing rows are left intact — same semantics
    // as the old upsert loop, which also skipped excused brothers.
    await tx.attendanceRecord.deleteMany({
      where: { calendarEventId: input.calendarEventId, brotherId: { in: stale } },
    });
    await tx.attendanceRecord.createMany({
      data: stale.map(brotherId => ({
        calendarEventId: input.calendarEventId,
        brotherId,
        semesterId:      semester.id,
        attended:        attendedSet.has(brotherId),
      })),
    });
  }, { timeout: 15_000 });

  await emit(ctx, "attendance.recorded", { type: "CalendarEvent", id: event.id }, {
    calendarEventId: event.id,
    semesterId:      semester.id,
    eventTitle:      event.title,
    presentCount:    input.attendedIds.length,
    eligibleCount:   eligible.length,
  });

  // Handler ran the recalc; reload the roster for the response.
  return ctx.db.member.listRoster();
}

// ─── Live check-in window ──────────────────────────────────────────────────
//
// An officer opens the window from the room; members tap themselves present
// while it is open; closing it writes the absences. Closing is not bookkeeping —
// lib/attendance.ts computes the denominator from AttendanceRecord rows that
// EXIST, so a member with no row is not counted absent, they are not counted at
// all. Without the close write every ratio would read 100%.

export type LiveCheckIn = {
  event: {
    id: number;
    title: string;
    date: string;
    time: string | null;
    location: string | null;
    mandatory: boolean;
  };
  state:         CheckInStatus;
  openedAt:      string;
  closedAt:      string | null;
  closedByName:  string | null;
  msRemaining:   number;
  presentCount:  number;
  eligibleCount: number;
  me: {
    checkedIn:   boolean;
    checkedInAt: string | null;
    excuse:      { status: ExcuseStatus; reason: string } | null;
  };
};

/** A closed window keeps showing its final tally for this long. */
const CLOSED_LINGER_MS = 10 * 60 * 1000;

/**
 * The live check-in widget's entire read. Returns null when this org has no
 * window worth showing — the overwhelmingly common case, and the one that runs
 * on every dashboard load, so it bails after a single indexed query.
 */
export async function getLiveCheckIn(ctx: RequestContext): Promise<LiveCheckIn | null> {
  const now = new Date();

  // Most recently opened window, ignoring anything long finished. A window that
  // expired without being closed still surfaces (as "closed") so an officer sees
  // it and can close it for real — that close is what records the absences.
  const event = await ctx.db.calendarEvent.findFirst({
    where: {
      mandatory: true,
      checkInOpenedAt: { not: null, gte: new Date(now.getTime() - CHECKIN_WINDOW_MS - CLOSED_LINGER_MS) },
      OR: [
        { checkInClosedAt: null },
        { checkInClosedAt: { gte: new Date(now.getTime() - CLOSED_LINGER_MS) } },
      ],
    },
    orderBy: { checkInOpenedAt: "desc" },
  });
  if (!event || !event.checkInOpenedAt) return null;

  const state = checkInState(event, now);
  if (!state) return null;

  const semester = await getActiveSemester(ctx.db);
  if (!semester) return null;

  const [records, excuses, exemptions, brotherIds] = await Promise.all([
    ctx.db.attendanceRecord.findMany({
      where: { calendarEventId: event.id },
      select: { brotherId: true, attended: true, loggedAt: true },
    }),
    ctx.db.attendanceExcuse.findMany({
      where: { calendarEventId: event.id, semesterId: semester.id },
      select: { brotherId: true, status: true, reason: true },
    }),
    ctx.db.attendanceExemption.findMany({ where: { semesterId: semester.id }, select: { brotherId: true } }),
    ctx.db.member.listIds(),
  ]);

  const approvedExcused = new Set(
    excuses.filter(e => e.status === ExcuseStatus.Approved).map(e => e.brotherId),
  );
  const exempt = new Set(exemptions.map(e => e.brotherId));
  // Eligible = this org's roster, minus per-event approved excuses, minus
  // semester-exempt. Identical to the rule recordAttendance and closeCheckIn use.
  const eligibleIds = brotherIds.filter(id => !approvedExcused.has(id) && !exempt.has(id));
  const eligible = new Set(eligibleIds);

  const presentCount = records.filter(r => r.attended && eligible.has(r.brotherId)).length;

  const mine = records.find(r => r.brotherId === ctx.actorId);
  const myExcuse = excuses.find(
    e => e.brotherId === ctx.actorId && e.status !== ExcuseStatus.Rejected,
  );

  let closedByName: string | null = null;
  if (event.checkInClosedById) {
    const row = await ctx.db.member.findRosterRow(event.checkInClosedById);
    closedByName = row?.name ?? null;
  }

  return {
    event: {
      id:        event.id,
      title:     event.title,
      date:      event.date,
      time:      event.time,
      location:  event.location,
      mandatory: event.mandatory,
    },
    state,
    openedAt:      event.checkInOpenedAt.toISOString(),
    closedAt:      event.checkInClosedAt?.toISOString() ?? null,
    closedByName,
    msRemaining:   checkInMsRemaining(event, now),
    presentCount,
    eligibleCount: eligibleIds.length,
    me: {
      checkedIn:   !!mine?.attended,
      checkedInAt: mine?.attended ? mine.loggedAt.toISOString() : null,
      excuse:      myExcuse ? { status: myExcuse.status as ExcuseStatus, reason: myExcuse.reason } : null,
    },
  };
}

/** One member's line in the "Who's here" sheet. */
export type LiveAttendee = {
  brotherId: number;
  name:      string;
  avatarUrl: string | null;
  /** Checked in (or recorded present by an officer) for this event. */
  present:   boolean;
  /** When they were marked present, ISO; null while they are not. */
  at:        string | null;
  /** An approved excuse — accounted for, and out of the denominator entirely. */
  excused:   boolean;
};

export type LiveRoster = {
  eventId:   number;
  attendees: LiveAttendee[];
};

/**
 * The roster behind the live band's `23/31` — who those 23 are, and who is
 * still missing.
 *
 * Deliberately NOT folded into getLiveCheckIn's payload. That read is polled
 * every 20s by every open dashboard in the room; this one is fetched only when
 * a member actually opens the sheet, so a meeting of 60 people doesn't ship 60
 * names to 60 tabs three times a minute.
 *
 * No requirePerm: the tally is already visible to every member in the band, and
 * the room can see who is in it. Officer-only fields (dues, GPA) are not
 * selected here — this returns names and presence, nothing assessable.
 *
 * Eligibility matches getLiveCheckIn exactly (roster minus approved excuses
 * minus semester exemptions). Those two rules must not drift: the sheet's rows
 * are what explains the band's denominator, so a member counting the list has
 * to arrive at the same number the card shows.
 */
export async function getLiveRoster(
  ctx: RequestContext,
  calendarEventId: number,
): Promise<LiveRoster> {
  // Org-scoped resolve first — AttendanceRecord has no organizationId, so the
  // event is the only tenancy anchor for the records read below.
  const event = await ctx.db.calendarEvent.findUnique({ where: { id: calendarEventId } });
  if (!event) throw new NotFoundError("Event");
  if (!event.checkInOpenedAt) throw new ValidationError("Check-in was never opened for this event");

  const semester = await getActiveSemester(ctx.db);
  if (!semester) throw new ValidationError("No active semester");

  const [roster, records, excuses, exemptions] = await Promise.all([
    ctx.db.member.listRoster(),
    ctx.db.attendanceRecord.findMany({
      where:  { calendarEventId: event.id },
      select: { brotherId: true, attended: true, loggedAt: true },
    }),
    ctx.db.attendanceExcuse.findMany({
      where:  { calendarEventId: event.id, semesterId: semester.id },
      select: { brotherId: true, status: true },
    }),
    ctx.db.attendanceExemption.findMany({ where: { semesterId: semester.id }, select: { brotherId: true } }),
  ]);

  const approvedExcused = new Set(
    excuses.filter(e => e.status === ExcuseStatus.Approved).map(e => e.brotherId),
  );
  const exempt  = new Set(exemptions.map(e => e.brotherId));
  const present = new Map(
    records.filter(r => r.attended).map(r => [r.brotherId, r.loggedAt] as const),
  );

  const attendees = roster
    // Exempt members are not expected at all, so listing them as "not here yet"
    // would be a standing false accusation. Approved excuses DO stay: the sheet
    // is where you see that someone is accounted for rather than missing.
    //
    // Archived members are NOT filtered here, however tempting that looks:
    // ctx.db.member.listIds() excludes only ghosts, so getLiveCheckIn counts
    // archived members in eligibleCount. Dropping them here would make the
    // sheet's rows add up to less than the denominator on the card that opened
    // it. If archived members should be out of attendance entirely, that is one
    // change to listIds and both numbers move together.
    .filter(m => !exempt.has(m.id))
    .map(m => {
      const excused = approvedExcused.has(m.id);
      // An approved excuse wins over an attendance record, matching
      // getLiveCheckIn's presentCount, which counts only eligible members and
      // drops the excused from that set. The two states can coexist in the DB —
      // selfCheckIn refuses an already-approved excuse, but an officer can
      // approve one AFTER the member checked in, or record them present by
      // hand — and if the sheet showed them in "Here now" the rows would add up
      // to more than the number on the card.
      const at = excused ? null : (present.get(m.id) ?? null);
      return {
        brotherId: m.id,
        name:      m.name,
        avatarUrl: m.avatarUrl,
        present:   at !== null,
        at:        at ? at.toISOString() : null,
        excused,
      };
    })
    // Present first and most-recent-first within that, so the sheet reads as
    // the room filling up; everyone still missing sorts by name underneath.
    .sort((a, b) => {
      if (a.present !== b.present) return a.present ? -1 : 1;
      if (a.present && b.present) return (b.at ?? "").localeCompare(a.at ?? "");
      return a.name.localeCompare(b.name);
    });

  return { eventId: event.id, attendees };
}

/**
 * Resolve an event through the ORG-SCOPED delegate and assert its window is
 * accepting check-ins. Resolving via ctx.db.calendarEvent first is what makes
 * the raw-tx write that follows org-safe: AttendanceRecord has no
 * organizationId column, so the event is the only tenancy anchor there.
 */
async function loadOpenWindow(ctx: RequestContext, calendarEventId: number) {
  const [event, semester] = await Promise.all([
    ctx.db.calendarEvent.findUnique({ where: { id: calendarEventId } }),
    getActiveSemester(ctx.db),
  ]);
  if (!event)           throw new NotFoundError("Event");
  if (!event.mandatory) throw new ValidationError("Only mandatory events track attendance");
  if (!semester)        throw new ValidationError("No active semester");
  if (!acceptsCheckIns(checkInState(event))) {
    throw new ValidationError("Check-in is not open for this event");
  }
  return { event, semester };
}

/**
 * The acting member marks themself present. brotherId is ctx.actorId, never a
 * body field, so a member can only ever check themself in.
 *
 * Emitted with { activity: false } and NO registered handler: a feed row per
 * member is noise, and a per-tap attendance recalc would blow the 3s handler
 * budget on a real roster. The recalc happens once, when the window closes.
 */
export async function selfCheckIn(ctx: RequestContext, calendarEventId: number): Promise<LiveCheckIn | null> {
  const { event, semester } = await loadOpenWindow(ctx, calendarEventId);

  // An approved excuse means they are already accounted for and are not in the
  // denominator. A PENDING excuse does not block: it may yet be rejected, in
  // which case they still needed to be in the room.
  const excuse = await ctx.db.attendanceExcuse.findUnique({
    where: { calendarEventId_brotherId: { calendarEventId, brotherId: ctx.actorId } },
    select: { status: true },
  });
  if (excuse?.status === ExcuseStatus.Approved) {
    throw new ConflictError("You have an approved excuse for this event");
  }

  // Upsert, so a double-tap is idempotent rather than a 409.
  await ctx.db.$transaction(async tx => {
    await tx.attendanceRecord.upsert({
      where:  { calendarEventId_brotherId: { calendarEventId, brotherId: ctx.actorId } },
      update: { attended: true },
      create: { calendarEventId, brotherId: ctx.actorId, semesterId: semester.id, attended: true },
    });
  });

  await emit(ctx, "attendance.self_checked_in", { type: "CalendarEvent", id: event.id }, {
    brotherId:  ctx.actorId,
    calendarEventId: event.id,
    semesterId: semester.id,
    eventTitle: event.title,
  }, { activity: false });

  return getLiveCheckIn(ctx);
}

/** Undo the actor's own check-in, while the window is still open. */
export async function undoSelfCheckIn(ctx: RequestContext, calendarEventId: number): Promise<LiveCheckIn | null> {
  const { event, semester } = await loadOpenWindow(ctx, calendarEventId);

  await ctx.db.$transaction(async tx => {
    // Scoped by the (event, brother) unique key, and the event was resolved
    // org-scoped above, so this cannot touch a foreign org's row.
    await tx.attendanceRecord.deleteMany({
      where: { calendarEventId, brotherId: ctx.actorId },
    });
  });

  await emit(ctx, "attendance.self_checkin_undone", { type: "CalendarEvent", id: event.id }, {
    brotherId:  ctx.actorId,
    calendarEventId: event.id,
    semesterId: semester.id,
    eventTitle: event.title,
  }, { activity: false });

  return getLiveCheckIn(ctx);
}

/**
 * Officer opens the window. Now is the start time — see the note in lib/checkin.ts.
 *
 * This is the one check-in write with a room waiting on it, so it does not end
 * in `getLiveCheckIn(ctx)` the way the others do. That re-read re-derives the
 * event, the semester, the records, the excuses, the exemptions and the roster
 * — a second full round of queries to describe a window this function just
 * created and already knows almost everything about.
 *
 * Instead the counts are gathered in ONE parallel batch alongside the write, and
 * the answer is assembled here. Two details keep it honest rather than merely
 * fast:
 *   · `presentCount` is not assumed to be 0. Opening also REOPENS a previously
 *     closed window (the update clears checkInClosedAt), and those carry
 *     AttendanceRecord rows from the earlier close.
 *   · Eligibility uses the same roster-minus-approved-excuses-minus-exempt rule
 *     as getLiveCheckIn and closeCheckIn. If those three ever drift, the band's
 *     denominator changes the instant the first poll lands.
 */
export async function openCheckIn(ctx: RequestContext, calendarEventId: number): Promise<LiveCheckIn | null> {
  const event = await ctx.db.calendarEvent.findUnique({ where: { id: calendarEventId } });
  if (!event)           throw new NotFoundError("Event");
  if (!event.mandatory) throw new ValidationError("Only mandatory events track attendance");
  if (acceptsCheckIns(checkInState(event))) {
    throw new ConflictError("Check-in is already open for this event");
  }

  const semester = await getActiveSemester(ctx.db);
  if (!semester) throw new ValidationError("No active semester");

  const openedAt = new Date();

  // The write and the three reads the response needs, in one parallel batch.
  // Nothing here reads the row the update writes, so ordering doesn't matter.
  const [, records, excuses, exemptions, brotherIds] = await Promise.all([
    ctx.db.calendarEvent.update({
      where: { id: calendarEventId },
      data: {
        checkInOpenedAt:   openedAt,
        checkInOpenedById: ctx.actorId,
        // Clear any prior close so reopening an old window starts a fresh one.
        checkInClosedAt:   null,
        checkInClosedById: null,
      },
    }),
    ctx.db.attendanceRecord.findMany({
      where:  { calendarEventId: event.id },
      select: { brotherId: true, attended: true, loggedAt: true },
    }),
    ctx.db.attendanceExcuse.findMany({
      where:  { calendarEventId: event.id, semesterId: semester.id },
      select: { brotherId: true, status: true, reason: true },
    }),
    ctx.db.attendanceExemption.findMany({ where: { semesterId: semester.id }, select: { brotherId: true } }),
    ctx.db.member.listIds(),
  ]);

  await emit(ctx, "checkin.opened", { type: "CalendarEvent", id: event.id }, {
    calendarEventId: event.id,
    eventTitle:      event.title,
  });

  const approvedExcused = new Set(
    excuses.filter(e => e.status === ExcuseStatus.Approved).map(e => e.brotherId),
  );
  const exempt = new Set(exemptions.map(e => e.brotherId));
  const eligibleIds = brotherIds.filter(id => !approvedExcused.has(id) && !exempt.has(id));
  const eligible = new Set(eligibleIds);

  const mine = records.find(r => r.brotherId === ctx.actorId);
  const myExcuse = excuses.find(
    e => e.brotherId === ctx.actorId && e.status !== ExcuseStatus.Rejected,
  );

  return {
    event: {
      id:        event.id,
      title:     event.title,
      date:      event.date,
      time:      event.time,
      location:  event.location,
      mandatory: event.mandatory,
    },
    // A window opened `now` is Open by definition — CHECKIN_CLOSING_MS is far
    // from the full window length — so this needs no re-derivation.
    state:         CheckInStatus.Open,
    openedAt:      openedAt.toISOString(),
    closedAt:      null,
    closedByName:  null,
    msRemaining:   CHECKIN_WINDOW_MS,
    presentCount:  records.filter(r => r.attended && eligible.has(r.brotherId)).length,
    eligibleCount: eligibleIds.length,
    me: {
      checkedIn:   !!mine?.attended,
      checkedInAt: mine?.attended ? mine.loggedAt.toISOString() : null,
      excuse:      myExcuse ? { status: myExcuse.status as ExcuseStatus, reason: myExcuse.reason } : null,
    },
  };
}

/**
 * Officer closes the window — the write that makes the numbers true.
 *
 * Everyone eligible who never checked in gets an `attended: false` row here.
 * Until this runs they have no row at all, and lib/attendance.ts would leave
 * them out of the denominator entirely rather than counting them absent.
 */
export async function closeCheckIn(ctx: RequestContext, calendarEventId: number): Promise<LiveCheckIn | null> {
  const [event, semester] = await Promise.all([
    ctx.db.calendarEvent.findUnique({ where: { id: calendarEventId } }),
    getActiveSemester(ctx.db),
  ]);
  if (!event)                 throw new NotFoundError("Event");
  if (!event.checkInOpenedAt) throw new ValidationError("Check-in was never opened for this event");
  if (event.checkInClosedAt)  throw new ConflictError("Check-in is already closed for this event");
  if (!semester)              throw new ValidationError("No active semester");

  // Same eligibility rule as recordAttendance: roster minus approved excuses
  // minus semester-exempt.
  const [excuses, exemptions, brotherIds, existing] = await Promise.all([
    ctx.db.attendanceExcuse.findMany({
      where: { calendarEventId, semesterId: semester.id, status: ExcuseStatus.Approved },
      select: { brotherId: true },
    }),
    ctx.db.attendanceExemption.findMany({ where: { semesterId: semester.id }, select: { brotherId: true } }),
    ctx.db.member.listIds(),
    ctx.db.attendanceRecord.findMany({
      where: { calendarEventId },
      select: { brotherId: true, attended: true },
    }),
  ]);

  const excusedBrotherIds = new Set(excuses.map(e => e.brotherId));
  const exemptBrotherIds  = new Set(exemptions.map(e => e.brotherId));
  const eligibleIds = brotherIds.filter(id => !excusedBrotherIds.has(id) && !exemptBrotherIds.has(id));

  const haveRow = new Set(existing.map(r => r.brotherId));
  const noShows = eligibleIds.filter(id => !haveRow.has(id));

  await ctx.db.$transaction(async tx => {
    // createMany, never a per-member upsert loop — that loop is what caused
    // P2024 transaction timeouts past ~60 members.
    if (noShows.length > 0) {
      await tx.attendanceRecord.createMany({
        data: noShows.map(brotherId => ({
          calendarEventId,
          brotherId,
          semesterId: semester.id,
          attended:   false,
        })),
      });
    }
    await tx.calendarEvent.updateMany({
      // organizationId is explicit: tx is the raw client, so the org-scoped
      // delegate's filter does not apply inside the transaction.
      where: { id: calendarEventId, organizationId: ctx.orgId },
      data:  { checkInClosedAt: new Date(), checkInClosedById: ctx.actorId },
    });
  }, { timeout: 15_000 });

  const presentCount = existing.filter(r => r.attended && !excusedBrotherIds.has(r.brotherId) && !exemptBrotherIds.has(r.brotherId)).length;

  // Reuse the existing action so the registered recalc handler
  // (lib/events/handlers/recalc-attendance.ts) fires unchanged. No new handler.
  await emit(ctx, "attendance.recorded", { type: "CalendarEvent", id: event.id }, {
    calendarEventId: event.id,
    semesterId:      semester.id,
    eventTitle:      event.title,
    presentCount,
    eligibleCount:   eligibleIds.length,
  }, { activity: false });

  await emit(ctx, "checkin.closed", { type: "CalendarEvent", id: event.id }, {
    calendarEventId: event.id,
    eventTitle:      event.title,
    presentCount,
    eligibleCount:   eligibleIds.length,
  });

  return getLiveCheckIn(ctx);
}

/**
 * Officer reopens a closed window: deletes the absence rows the close created
 * (leaving genuine check-ins intact) and recalcs back.
 */
export async function reopenCheckIn(ctx: RequestContext, calendarEventId: number): Promise<LiveCheckIn | null> {
  const [event, semester] = await Promise.all([
    ctx.db.calendarEvent.findUnique({ where: { id: calendarEventId } }),
    getActiveSemester(ctx.db),
  ]);
  if (!event)                 throw new NotFoundError("Event");
  if (!event.checkInClosedAt) throw new ValidationError("Check-in is not closed for this event");
  if (!semester)              throw new ValidationError("No active semester");

  await ctx.db.$transaction(async tx => {
    // Only the absences. An attended: true row is somebody's real check-in (or
    // an officer's correction) and must survive a reopen.
    await tx.attendanceRecord.deleteMany({
      where: { calendarEventId, attended: false },
    });
    await tx.calendarEvent.updateMany({
      where: { id: calendarEventId, organizationId: ctx.orgId },
      data:  {
        // Reopening restarts the clock: the original openedAt may be hours old,
        // and leaving it would hand back a window that is already expired.
        checkInOpenedAt:   new Date(),
        checkInOpenedById: ctx.actorId,
        checkInClosedAt:   null,
        checkInClosedById: null,
      },
    });
  }, { timeout: 15_000 });

  // Recalc back down: the absence rows are gone, so ratios must be recomputed.
  await emit(ctx, "attendance.recorded", { type: "CalendarEvent", id: event.id }, {
    calendarEventId: event.id,
    semesterId:      semester.id,
    eventTitle:      event.title,
    presentCount:    0,
    eligibleCount:   0,
  }, { activity: false });

  await emit(ctx, "checkin.reopened", { type: "CalendarEvent", id: event.id }, {
    calendarEventId: event.id,
    eventTitle:      event.title,
  });

  return getLiveCheckIn(ctx);
}
