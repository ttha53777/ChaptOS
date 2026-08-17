/**
 * The words the events page says about time.
 *
 * Pure string helpers, split out of the page so they can be read (and one day
 * tested) without mounting a large client component. They are the page's voice:
 * "today" rather than a date, a count you can act on rather than a summary.
 */

import type { ProgrammingTask } from "../../data";
import { fmtDate } from "../../data";

/** Days until a date, relative to `today` (negative = past). */
export function daysUntil(dueDate: string, today: string): number {
  const ms = new Date(dueDate + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime();
  return Math.round(ms / 86_400_000);
}

/** A card's compact "when": Today / Tomorrow / Nd / a date, plus its urgency. */
export function cardWhen(dueDate: string | null, today: string): { label: string; tone: "" | "soon" | "today" | "nodate" } {
  if (!dueDate) return { label: "No date yet", tone: "nodate" };
  if (dueDate < today) return { label: fmtDate(dueDate), tone: "" };
  const d = daysUntil(dueDate, today);
  if (d === 0) return { label: "Today", tone: "today" };
  if (d === 1) return { label: "Tomorrow", tone: "today" };
  // Inside a week, the weekday plus the gap beats a date you'd have to count on
  // a calendar: "Thu · 5d" is both the day you'd say out loud and the distance.
  if (d <= 7) {
    const dow = new Date(dueDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
    return { label: `${dow} · ${d}d`, tone: "soon" };
  }
  return { label: fmtDate(dueDate), tone: "" };
}

/** One clause of the status line: plain text, or text the page tints. */
export type StatusBit = { text: string; tone?: "warn" };

/**
 * The status line under the greeting — derived clauses, not a model call.
 *
 * This replaced an "AI"-chipped digest paragraph that said the same facts in
 * prose. The facts are the ones the board's gates make actionable: what's next,
 * what could be confirmed right now, and what nobody has picked up. Each is a
 * count you can go and change, so the line is a to-do rather than a summary.
 *
 * Returns the pieces rather than a string because the counts are tinted and the
 * event's name is bolded — assembling them here would mean returning HTML.
 */
export function statusBits(
  next: ProgrammingTask | null,
  readyToConfirm: number,
  unownedIdeas: number,
  today: string,
): { lead: { title: string; when: string } | null; bits: StatusBit[] } {
  const bits: StatusBit[] = [];
  if (readyToConfirm > 0) {
    bits.push({ text: `${readyToConfirm} ready to confirm.`, tone: "warn" });
  }
  if (unownedIdeas > 0) {
    bits.push({
      text: `${unownedIdeas} idea${unownedIdeas === 1 ? "" : "s"} with no one on ${unownedIdeas === 1 ? "it" : "them"}.`,
      tone: "warn",
    });
  }
  if (!next) return { lead: null, bits };
  return { lead: { title: next.title, when: statusWhen(next.dueDate, today) }, bits };
}

/** The lead clause's time word: today / tomorrow / the weekday name. */
function statusWhen(dueDate: string | null, today: string): string {
  if (!dueDate) return "soon";
  const d = daysUntil(dueDate, today);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  return new Date(dueDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });
}
