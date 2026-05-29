import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { ExcuseStatus } from "@/lib/state";
import { getActiveSemester } from "@/lib/attendance";
import type { RecordAttendanceInput } from "@/lib/validation/attendance";

export async function recordAttendance(ctx: RequestContext, input: RecordAttendanceInput) {
  const [event, semester] = await Promise.all([
    ctx.db.calendarEvent.findUnique({ where: { id: input.calendarEventId } }),
    getActiveSemester(),
  ]);
  if (!event)            throw new NotFoundError("Event");
  if (!event.mandatory)  throw new ValidationError("Only mandatory events track attendance");
  if (!semester)         throw new ValidationError("No active semester");

  const [excuses, brothers] = await Promise.all([
    ctx.db.attendanceExcuse.findMany({
      where: { calendarEventId: input.calendarEventId, semesterId: semester.id, status: ExcuseStatus.Approved },
    }),
    ctx.db.brother.findMany({ where: { isGhost: false }, select: { id: true } }),
  ]);
  const excusedBrotherIds = new Set(excuses.map(e => e.brotherId));
  const eligible = brothers.filter(b => !excusedBrotherIds.has(b.id));

  await ctx.db.$transaction(
    eligible.map(b =>
      ctx.db.attendanceRecord.upsert({
        where:  { calendarEventId_brotherId: { calendarEventId: input.calendarEventId, brotherId: b.id } },
        update: { attended: input.attendedIds.includes(b.id) },
        create: {
          calendarEventId: input.calendarEventId,
          brotherId:       b.id,
          semesterId:      semester.id,
          attended:        input.attendedIds.includes(b.id),
        },
      }),
    ),
  );

  await emit(ctx, "attendance.recorded", { type: "CalendarEvent", id: event.id }, {
    calendarEventId: event.id,
    semesterId:      semester.id,
    eventTitle:      event.title,
    presentCount:    input.attendedIds.length,
    eligibleCount:   eligible.length,
  });

  // Handler ran the recalc; reload visible brothers for response.
  return ctx.db.brother.findMany({ where: { isGhost: false } });
}
