import type { RequestContext } from "@/lib/context";
import { Prisma } from "@/app/generated/prisma/client";
import { DomainError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { getOpenAI, CHAT_MODEL, MAX_COMPLETION_TOKENS } from "@/lib/ai";
import { logError } from "@/lib/observability";
import {
  MEETING_SUMMARY_SCHEMA, buildMeetingSummary, meetingSummaryMarkdown, meetingSummaryData,
  parseMeetingSummary, rawMeetingSummary, type MeetingSummaryData, type RawMeetingSummary,
} from "@/lib/meeting-summary";
import { can } from "@/lib/permissions";
import { emit } from "@/lib/events";
import { headingOf, minutesBeyondAgenda } from "@/lib/agenda-template";

const SYSTEM = `You summarize a fraternity chapter's meeting minutes for officers who couldn't attend.
Return JSON with:
- "gist": one plain sentence (≤25 words) on what the meeting settled. No preamble.
- "decisions": each thing the chapter decided, voted on, approved or set, one short line each (keep vote counts). [] if none.
- "actions": each follow-up someone owes. "text" is the task as a short imperative ("Book the DJ for formal"), without the owner's name. "owner" is the person's name exactly as the minutes wrote it, or null if nobody was named. "due" is the date it's due as YYYY-MM-DD, or null if the minutes gave none — resolve a bare "Oct 10" to the first such date on or after the meeting date.
Rules: do not invent facts, owners or dates. Be terse.`;

export async function summarizeMeeting(ctx: RequestContext, id: number) {
    const event = await ctx.db.calendarEvent.findUnique({
      where: { id },
      select: { id: true, title: true, date: true, description: true, notesSeed: true, category: true, notesContentRevision: true, notesSummaryData: true },
    });
    if (!event) throw new ValidationError("Meeting not found");

    // Only what was written beyond the copied agenda: its untouched placeholder
    // lines ("[ ] Task — owner — due date") would otherwise come back as action items.
    const notes = minutesBeyondAgenda(event);
    if (notes.split("\n").filter(l => !headingOf(l)).join("\n").trim().length < 20) throw new ValidationError("Not enough notes to summarize yet.");

    const openai = getOpenAI();
    if (!openai) throw new DomainError("INTERNAL", "AI is not configured", 503);

    let raw: RawMeetingSummary;
    try {
      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        // reasoning_effort rules out a custom temperature on this model.
        reasoning_effort: "none",
        response_format: { type: "json_schema", json_schema: { name: "meeting_summary", strict: true, schema: MEETING_SUMMARY_SCHEMA } },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Meeting: ${event.title} (${event.date})\n\nNotes:\n${notes}` },
        ],
      });
      raw = rawMeetingSummary.parse(JSON.parse(completion.choices[0]?.message?.content ?? ""));
    } catch (e) {
      logError(e, { route: "/api/ai/summarize-meeting", method: "POST", userId: ctx.actorId, extra: { stage: "openai_call", eventId: id, requestId: ctx.requestId } });
      throw new DomainError("INTERNAL", "Couldn't reach the summarizer. Try again.", 502);
    }
    const roster = (await ctx.db.member.listRoster()).map(m => ({ brotherId: m.id, name: m.name }));
    const data = buildMeetingSummary(raw, roster, parseMeetingSummary(event.notesSummaryData));
    if (!data.gist && !data.decisions.length && !data.actions.length) throw new DomainError("INTERNAL", "Summarizer returned no text.", 502);
    const summary = meetingSummaryMarkdown(data);

    return ctx.db.$transaction(async tx => {
      const [current] = await tx.$queryRaw<{ id: number; notesSummaryRevision: number | null }[]>(Prisma.sql`SELECT id, "notesSummaryRevision" FROM "CalendarEvent" WHERE id = ${id} AND "organizationId" = ${ctx.orgId} FOR UPDATE`);
      if (!current) throw new ValidationError("Meeting not found");
      const select = { id: true, notesSummary: true, notesSummaryData: true, notesSummaryAt: true, notesSummaryRevision: true, notesContentRevision: true } as const;
      if (current.notesSummaryRevision != null && current.notesSummaryRevision > event.notesContentRevision) {
        return tx.calendarEvent.findUniqueOrThrow({ where: { id, organizationId: ctx.orgId }, select });
      }
      return tx.calendarEvent.update({ where: { id, organizationId: ctx.orgId },
        data: { notesSummary: summary, notesSummaryData: data, notesSummaryAt: new Date(), notesSummaryRevision: event.notesContentRevision }, select });
    });
}

/**
 * Tick an action item on or off. Officers who manage events can tick any item;
 * a member can tick the ones the summary resolved to them. Read-modify-write
 * under a row lock, so two people ticking different items can't drop one.
 */
export async function setActionItemDone(ctx: RequestContext, id: number, itemId: string, done: boolean): Promise<MeetingSummaryData> {
  const existing = await ctx.db.calendarEvent.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError("Meeting");
  const { data, title, text } = await ctx.db.$transaction(async tx => {
    const [row] = await tx.$queryRaw<{ title: string; notesSummaryData: unknown }[]>(Prisma.sql`SELECT title, "notesSummaryData" FROM "CalendarEvent" WHERE id = ${id} AND "organizationId" = ${ctx.orgId} FOR UPDATE`);
    if (!row) throw new NotFoundError("Meeting");
    const current = parseMeetingSummary(row.notesSummaryData);
    const item = current?.actions.find(a => a.id === itemId);
    if (!current || !item) throw new NotFoundError("Action item");
    if (!can(ctx, "MANAGE_EVENTS") && item.brotherId !== ctx.actorId) {
      throw new ForbiddenError("Only an officer or the item's owner can tick it off");
    }
    const next = meetingSummaryData.parse({ ...current, actions: current.actions.map(a => a.id === itemId ? { ...a, done } : a) });
    // notesSummary is the text twin; keep it saying the same thing.
    await tx.calendarEvent.update({ where: { id, organizationId: ctx.orgId }, data: { notesSummaryData: next, notesSummary: meetingSummaryMarkdown(next) } });
    return { data: next, title: row.title, text: item.text };
  });
  await emit(ctx, "calendar.action_item_toggled", { type: "CalendarEvent", id }, { title, itemId, text, done });
  return data;
}
