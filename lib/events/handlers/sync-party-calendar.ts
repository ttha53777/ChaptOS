import { on } from "../dispatch";

// Scheduling belongs to CalendarEvent; the party ledger mirrors name/date for
// its existing consumers. Post-event party notes are separate from the event's
// description. Do not re-emit here: these are projections, not new user edits.
on("calendar.updated", async (ctx, { subject }) => {
  const event = await ctx.db.calendarEvent.findUnique({ where: { id: subject.id } });
  if (!event) return;
  await ctx.db.partyEvent.updateMany({
    where: { attendanceEventId: event.id },
    data: { name: event.title, date: event.date },
  });
});

on("party.updated", async (ctx, { subject, metadata }) => {
  if (!metadata.changedFields.some(field => field === "name" || field === "date")) return;
  const party = await ctx.db.partyEvent.findUnique({ where: { id: subject.id } });
  if (!party?.attendanceEventId) return;
  await ctx.db.calendarEvent.update({
    where: { id: party.attendanceEventId },
    data: {
      ...(metadata.changedFields.includes("name") ? { title: party.name } : {}),
      ...(metadata.changedFields.includes("date") ? { date: party.date } : {}),
    },
  });
});
