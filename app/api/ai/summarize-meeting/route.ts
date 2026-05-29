import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { aiEnabled, getOpenAI, CHAT_MODEL } from "@/lib/ai";
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

export async function POST(req: NextRequest) {
  if (!aiEnabled()) return Response.json({ error: "AI is not configured" }, { status: 503 });

  const { ctx, error } = await buildContext({ rateLimit: { limit: 20, windowMs: 60_000 } });
  if (error) return error;

  try {
    const body = await req.json().catch(() => null) as { id?: number } | null;
    const id = Number(body?.id);
    if (!Number.isFinite(id) || id <= 0) throw new ValidationError("id required");

    const event = await ctx.db.calendarEvent.findUnique({
      where: { id },
      select: { id: true, title: true, date: true, description: true, category: true },
    });
    if (!event) throw new ValidationError("Meeting not found");

    const notes = (event.description ?? "").trim();
    if (notes.length < 20) throw new ValidationError("Not enough notes to summarize yet.");

    const openai = getOpenAI();
    if (!openai) return Response.json({ error: "AI is not configured" }, { status: 503 });

    let summary: string | null = null;
    try {
      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        max_tokens: 400,
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Meeting: ${event.title} (${event.date})\n\nNotes:\n${notes}` },
        ],
      });
      summary = completion.choices[0]?.message?.content?.trim() ?? null;
    } catch (e) {
      logError(e, { route: "/api/ai/summarize-meeting", method: "POST", userId: ctx.actorId, extra: { stage: "openai_call", eventId: id, requestId: ctx.requestId } });
      return Response.json({ error: "Couldn't reach the summarizer. Try again." }, { status: 502 });
    }
    if (!summary) return Response.json({ error: "Summarizer returned no text." }, { status: 502 });

    const updated = await ctx.db.calendarEvent.update({
      where: { id },
      data: { notesSummary: summary, notesSummaryAt: new Date() },
      select: { id: true, notesSummary: true, notesSummaryAt: true },
    });

    return Response.json(updated);
  } catch (e) {
    logError(e, { route: "/api/ai/summarize-meeting", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
