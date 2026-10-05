/**
 * The structured meeting summary stored on CalendarEvent.notesSummaryData.
 *
 * The summarizer returns { gist, decisions, actions } as strict JSON; this file
 * owns the shape, the parse that guards every read (the column is plain JSONB),
 * the markdown rendering kept in notesSummary for readers that only want text
 * (Timeline rail, Ask Chapt), and the carry-over that keeps a ticked action item
 * ticked when the minutes are re-summarized.
 *
 * Pure — no db imports — because the chapter page imports the types and parse.
 */
import { z } from "zod";

export const meetingActionItem = z.object({
  /** Stable within one summary; the done toggle addresses items by it. */
  id:        z.string().min(1).max(40),
  text:      z.string().min(1).max(400),
  /** The owner as the minutes wrote them ("Dev"), or null when nobody was named. */
  owner:     z.string().max(120).nullable(),
  /** The roster member that name resolved to, when it resolved to exactly one. */
  brotherId: z.number().int().positive().nullable(),
  /** yyyy-mm-dd, only when the minutes gave a date. */
  due:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  done:      z.boolean(),
});
export type MeetingActionItem = z.infer<typeof meetingActionItem>;

export const meetingSummaryData = z.object({
  gist:      z.string().max(600),
  decisions: z.array(z.string().max(400)).max(40),
  actions:   z.array(meetingActionItem).max(60),
});
export type MeetingSummaryData = z.infer<typeof meetingSummaryData>;

/** A stored value, or null when the column is empty or not this shape (legacy rows). */
export function parseMeetingSummary(value: unknown): MeetingSummaryData | null {
  const parsed = meetingSummaryData.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** What the model returns, before owners are resolved and ids assigned. */
export const rawMeetingSummary = z.object({
  gist:      z.string(),
  decisions: z.array(z.string()),
  actions:   z.array(z.object({ text: z.string(), owner: z.string().nullable(), due: z.string().nullable() })),
});
export type RawMeetingSummary = z.infer<typeof rawMeetingSummary>;

/** The strict json_schema the summarizer is held to. */
export const MEETING_SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    gist:      { type: "string" },
    decisions: { type: "array", items: { type: "string" } },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text:  { type: "string" },
          owner: { type: ["string", "null"] },
          due:   { type: ["string", "null"] },
        },
        required: ["text", "owner", "due"],
      },
    },
  },
  required: ["gist", "decisions", "actions"],
} as const;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Resolve an owner as written to one roster member: an exact full-name match,
 * else a unique first-name match. Anything ambiguous stays unresolved — a wrong
 * owner is worse than a name with no link.
 */
export function resolveOwner(owner: string | null, roster: { brotherId: number; name: string }[]): number | null {
  if (!owner?.trim()) return null;
  const want = norm(owner);
  const exact = roster.filter(m => norm(m.name) === want);
  if (exact.length === 1) return exact[0].brotherId;
  if (exact.length > 1) return null;
  const first = roster.filter(m => norm(m.name).split(" ")[0] === want.split(" ")[0]);
  return first.length === 1 ? first[0].brotherId : null;
}

/**
 * Turn the model's output into stored data. Owners are resolved against the
 * roster; an item whose text matches one in the previous summary keeps its done
 * flag, so re-summarizing never un-ticks work someone already finished.
 */
export function buildMeetingSummary(
  raw: RawMeetingSummary,
  roster: { brotherId: number; name: string }[],
  previous: MeetingSummaryData | null,
): MeetingSummaryData {
  const doneBefore = new Set((previous?.actions ?? []).filter(a => a.done).map(a => norm(a.text)));
  const clip = (s: string, n: number) => s.trim().slice(0, n);
  return {
    gist: clip(raw.gist, 600),
    decisions: raw.decisions.map(d => clip(d, 400)).filter(Boolean).slice(0, 40),
    actions: raw.actions
      .filter(a => a.text.trim())
      .slice(0, 60)
      .map((a, i) => ({
        id: `a${i + 1}`,
        text: clip(a.text, 400),
        owner: a.owner?.trim() ? clip(a.owner, 120) : null,
        brotherId: resolveOwner(a.owner, roster),
        due: a.due && /^\d{4}-\d{2}-\d{2}$/.test(a.due) ? a.due : null,
        done: doneBefore.has(norm(a.text)),
      })),
  };
}

/** The markdown notesSummary keeps for text-only readers (same dialect as before). */
export function meetingSummaryMarkdown(data: MeetingSummaryData): string {
  const lines = [data.gist.trim()];
  if (data.decisions.length) lines.push("", "**Decisions**", ...data.decisions.map(d => `- ${d}`));
  if (data.actions.length) {
    lines.push("", "**Action items**", ...data.actions.map(a =>
      `- ${a.owner ? `${a.owner}: ` : ""}${a.text}${a.due ? ` (by ${a.due})` : ""}${a.done ? " — done" : ""}`));
  }
  return lines.join("\n");
}
