/**
 * The words the events page says about time and blockers.
 *
 * Pure string helpers, split out of the page so they can be read (and one day
 * tested) without mounting a 1000-line client component. They are the page's
 * voice: "today" rather than a date, the gap NAMED rather than counted.
 */

import type { ProgrammingTask } from "../../data";
import { fmtDate } from "../../data";
import { attentionLabel, type AttentionEntry } from "@/lib/programming";

/** Days until a date, relative to `today` (negative = past). */
export function daysUntil(dueDate: string, today: string): number {
  const ms = new Date(dueDate + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime();
  return Math.round(ms / 86_400_000);
}

/** Compact "when" label for rail rows: Today / Tomorrow / In Nd / a date. */
export function whenLabel(dueDate: string | null, today: string): string {
  if (!dueDate) return "—";
  const d = daysUntil(dueDate, today);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d > 1 && d <= 30) return `In ${d}d`;
  return fmtDate(dueDate);
}

/** Warmer "when" phrasing for the briefing digest: "today" / "tomorrow" / "this
 *  Thursday" / a plain date. */
export function digestWhen(dueDate: string | null, today: string): string {
  if (!dueDate) return "soon";
  const d = daysUntil(dueDate, today);
  if (d === 0) return "it's today";
  if (d === 1) return "tomorrow";
  const dow = new Date(dueDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });
  if (d <= 7) return `this ${dow}`;
  if (d <= 14) return `next ${dow}`;
  return fmtDate(dueDate);
}

/** The rail's blocker sentence — the gap NAMED, not a count of prep items. */
export function attnReason(entry: AttentionEntry<ProgrammingTask>): string {
  return attentionLabel(entry);
}

/** The AI digest sentence under the briefing — derived, not a live model call. */
export function briefingDigest(
  onDeck: ProgrammingTask | null,
  attention: AttentionEntry<ProgrammingTask>[],
  today: string,
): string {
  if (!onDeck) {
    return "Nothing on the calendar yet — promote an idea out of the backlog to get the next event on the books.";
  }
  const lead = `${onDeck.title} is up first — ${digestWhen(onDeck.dueDate, today)}.`;
  const blocker = attention.find(a => a.task.id === onDeck.id);
  if (blocker) {
    return `${lead} ${attnReason(blocker)} — that's the one thing standing between you and a clear slate.`;
  }
  const others = attention.length;
  if (others > 0) {
    return `${lead} It's ready, but ${others} other ${others === 1 ? "event" : "events"} still need someone or a missing detail.`;
  }
  return `${lead} Everything on the slate is owned and on track.`;
}
