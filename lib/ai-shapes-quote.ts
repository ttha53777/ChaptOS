// Quote (docs/ask-chapt-answer-system-plan.md, Phase 5): when the answer is
// what the minutes say, show what they say — word for word.
//
// The model names a meeting it found with search_meeting_notes and either a
// passage or one of that meeting's summarized decisions. A passage is drawn
// only if it appears verbatim in the minutes (after normalizing whitespace and
// quote marks); otherwise the decision's own text is used; with neither, no
// quote. "Decided" is stamped only for a summarized decision — the minutes
// carry no vote counts, so none are drawn.

import type { db } from "@/lib/db";
import type { AnswerRow } from "@/lib/ai-tools";
import type { ShapeRequest } from "@/lib/ai-shape-request";
import { listItems, type ShapeEvidence } from "@/lib/ai-shape-evidence";
import { parseMeetingSummary, type MeetingSummaryData } from "@/lib/meeting-summary";
import type { QuoteShape } from "@/lib/api-types";
import type { BuiltShape } from "@/lib/ai-shapes";

type Scoped = ReturnType<typeof db>;
interface Opts { rows: AnswerRow[]; today: string }

/** Lowercase, straight quotes, one space; markdown emphasis and list marks dropped. */
export function normalizeQuote(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[*_`#>]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Pure: is `quote` a verbatim stretch of `minutes`? Short fragments don't count as a quote. */
export function isVerbatim(quote: string, minutes: string): boolean {
  const q = normalizeQuote(quote).replace(/^["']|["']$/g, "").trim();
  return q.length >= 12 && normalizeQuote(minutes).includes(q);
}

/** Pure: the meeting + the request → the quote, or null. Exported for tests. */
export function quoteFrom(input: {
  meeting: { id: number; title: string; date: string };
  minutes: string;
  summary: MeetingSummaryData | null;
  quote?: string;
  decision?: number;
}): BuiltShape<QuoteShape> | null {
  const decisions = input.summary?.decisions ?? [];
  const decisionText = input.decision != null ? decisions[input.decision] : undefined;
  const verbatim = input.quote && isVerbatim(input.quote, input.minutes) ? input.quote.trim().replace(/^["“]|["”]$/g, "") : undefined;
  const text = verbatim ?? decisionText;
  if (!text) return null;
  // A passage counts as decided when it is, or sits inside, a summarized decision.
  const n = normalizeQuote(text);
  const decided = decisionText != null || decisions.some(d => normalizeQuote(d).includes(n) || n.includes(normalizeQuote(d)));
  return {
    shape: {
      type: "quote",
      meeting: input.meeting,
      text,
      decided,
      items: (input.summary?.actions ?? []).slice(0, 8).map(a => ({ id: a.id, text: a.text, owner: a.owner, due: a.due, done: a.done })),
    },
    rows: [{ kind: "event", title: input.meeting.title, value: input.meeting.date, ref: { type: "event", id: input.meeting.id } }],
  };
}

export async function buildQuote(req: ShapeRequest, evidence: ShapeEvidence, scoped: Scoped, _orgId: number, _o: Opts): Promise<BuiltShape | null> {
  if (req.meeting == null) return null;
  // The meeting must be one this turn's search actually returned.
  const seen = evidence.reads(["search_meeting_notes"]).flatMap(r => listItems(r.result));
  const hit = seen.find(m => m.id === req.meeting);
  if (!hit) return null;
  // The tool may have sent an excerpt; check the passage against the full minutes.
  const ev = await scoped.calendarEvent.findFirst({
    where: { id: req.meeting },
    select: { id: true, title: true, date: true, description: true, notesSummaryData: true },
  }) as { id: number; title: string; date: string; description: string | null; notesSummaryData: unknown } | null;
  if (!ev) return null;
  return quoteFrom({
    meeting: { id: ev.id, title: ev.title, date: ev.date },
    minutes: ev.description ?? "",
    summary: parseMeetingSummary(ev.notesSummaryData),
    quote: req.quote,
    decision: req.decision,
  });
}
