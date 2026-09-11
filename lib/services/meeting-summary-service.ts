import type { RequestContext } from "@/lib/context";
import { Prisma } from "@/app/generated/prisma/client";
import { DomainError, ValidationError } from "@/lib/errors";
import { getOpenAI, CHAT_MODEL, MAX_COMPLETION_TOKENS } from "@/lib/ai";
import { logError } from "@/lib/observability";

const SYSTEM = `You are an assistant that summarizes fraternity chapter meeting notes for officers who couldn't attend.
Read the notes and write a tight, scannable recap in this format:

- 1 short opener sentence (≤20 words) capturing the main thrust.
- A "Decisions" bullet list (omit the section if there are none).
- An "Action items" bullet list with owner if mentioned (omit if none).
- A "Discussed" bullet list of other notable topics (omit if redundant with the above).

Rules:
- Plain markdown only — use "- " for bullets and "**Decisions**" / "**Action items**" / "**Discussed**" as section headers.
- Be terse. No greetings, no preamble, no closing remarks.
- Do not invent facts; if a section has nothing, drop it.
- Keep the whole thing under ~150 words.`;

export async function summarizeMeeting(ctx: RequestContext, id: number) {
    const event = await ctx.db.calendarEvent.findUnique({
      where: { id },
      select: { id: true, title: true, date: true, description: true, category: true, notesContentRevision: true },
    });
    if (!event) throw new ValidationError("Meeting not found");

    const notes = (event.description ?? "").trim();
    if (notes.length < 20) throw new ValidationError("Not enough notes to summarize yet.");

    const openai = getOpenAI();
    if (!openai) throw new DomainError("INTERNAL", "AI is not configured", 503);

    let summary: string | null = null;
    try {
      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Meeting: ${event.title} (${event.date})\n\nNotes:\n${notes}` },
        ],
      });
      summary = completion.choices[0]?.message?.content?.trim() ?? null;
    } catch (e) {
      logError(e, { route: "/api/ai/summarize-meeting", method: "POST", userId: ctx.actorId, extra: { stage: "openai_call", eventId: id, requestId: ctx.requestId } });
      throw new DomainError("INTERNAL", "Couldn't reach the summarizer. Try again.", 502);
    }
    if (!summary) throw new DomainError("INTERNAL", "Summarizer returned no text.", 502);

    return ctx.db.$transaction(async tx => {
      const [current] = await tx.$queryRaw<{ id: number; notesSummaryRevision: number | null }[]>(Prisma.sql`SELECT id, "notesSummaryRevision" FROM "CalendarEvent" WHERE id = ${id} AND "organizationId" = ${ctx.orgId} FOR UPDATE`);
      if (!current) throw new ValidationError("Meeting not found");
      const select = { id: true, notesSummary: true, notesSummaryAt: true, notesSummaryRevision: true, notesContentRevision: true } as const;
      if (current.notesSummaryRevision != null && current.notesSummaryRevision > event.notesContentRevision) {
        return tx.calendarEvent.findUniqueOrThrow({ where: { id, organizationId: ctx.orgId }, select });
      }
      return tx.calendarEvent.update({ where: { id, organizationId: ctx.orgId },
        data: { notesSummary: summary, notesSummaryAt: new Date(), notesSummaryRevision: event.notesContentRevision }, select });
    });
}
