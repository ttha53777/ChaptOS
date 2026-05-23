import { NextRequest } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { checkMutationRate } from "@/lib/rate-limit";
import { aiEnabled, getOpenAI, CHAT_MODEL } from "@/lib/ai";
import { logActivity } from "@/lib/activity";
import { logError } from "@/lib/observability";

// Summarizes a chapter meeting's notes via OpenAI and persists the result on
// the CalendarEvent row. POST { id } — pulls the latest notes from the DB so we
// never trust the client's copy. Returns the saved summary + timestamp.

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

interface Body {
  id?: number;
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!aiEnabled()) return Response.json({ error: "AI is not configured" }, { status: 503 });

  // Same per-user budget as other AI mutations.
  const limited = checkMutationRate(user.id, 20, 60_000);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as Body | null;
  const id = Number(body?.id);
  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({ error: "id required" }, { status: 400 });
  }

  const event = await prisma.calendarEvent.findUnique({
    where: { id },
    select: { id: true, title: true, date: true, description: true, category: true },
  });
  if (!event) return Response.json({ error: "Meeting not found" }, { status: 404 });

  const notes = (event.description ?? "").trim();
  if (notes.length < 20) {
    return Response.json({ error: "Not enough notes to summarize yet." }, { status: 400 });
  }

  const openai = getOpenAI();
  if (!openai) return Response.json({ error: "AI is not configured" }, { status: 503 });

  let summary: string | null = null;
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      // Meeting recaps need more room than the 60-token narrate() default.
      max_tokens: 400,
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Meeting: ${event.title} (${event.date})\n\nNotes:\n${notes}`,
        },
      ],
    });
    summary = completion.choices[0]?.message?.content?.trim() ?? null;
  } catch (e) {
    logError(e, { route: "/api/ai/summarize-meeting", method: "POST", userId: user.id, extra: { stage: "openai_call", eventId: id } });
    return Response.json({ error: "Couldn't reach the summarizer. Try again." }, { status: 502 });
  }

  if (!summary) {
    return Response.json({ error: "Summarizer returned no text." }, { status: 502 });
  }

  try {
    const updated = await prisma.calendarEvent.update({
      where: { id },
      data: { notesSummary: summary, notesSummaryAt: new Date() },
      select: { id: true, notesSummary: true, notesSummaryAt: true },
    });

    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} summarized notes for ${event.title}`,
    });

    return Response.json({
      id: updated.id,
      notesSummary: updated.notesSummary,
      notesSummaryAt: updated.notesSummaryAt,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return Response.json({ error: "Meeting not found" }, { status: 404 });
    }
    logError(e, { route: "/api/ai/summarize-meeting", method: "POST", userId: user.id, extra: { stage: "db_save", eventId: id } });
    return Response.json({ error: "Failed to save summary" }, { status: 500 });
  }
}
