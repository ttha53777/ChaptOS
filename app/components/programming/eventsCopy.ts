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
/** `kind` names what the clause counts, so a clickable clause knows where to go. */
export type StatusBit = { text: string; tone?: "warn"; kind: "wrap" | "ready" | "unowned" };

/**
 * The status line under the greeting — derived clauses, not a model call.
 *
 * This replaced an "AI"-chipped digest paragraph that said the same facts in
 * prose. The facts are the ones the board's gates make actionable: what already
 * happened and still needs wrapping up, what's next, what could be confirmed
 * right now, and what nobody has picked up. Each is a
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
  toWrapUp = 0,
): { lead: { title: string; when: string } | null; bits: StatusBit[] } {
  const bits: StatusBit[] = [];
  // First: it's the only clause about something already late. The red dots on
  // the board say which ones; this says how many.
  if (toWrapUp > 0) {
    bits.push({
      text: `${toWrapUp} already happened and ${toWrapUp === 1 ? "needs" : "need"} wrapping up.`,
      tone: "warn",
      kind: "wrap",
    });
  }
  if (readyToConfirm > 0) {
    bits.push({ text: `${readyToConfirm} ready to confirm.`, tone: "warn", kind: "ready" });
  }
  if (unownedIdeas > 0) {
    bits.push({
      text: `${unownedIdeas} idea${unownedIdeas === 1 ? "" : "s"} with no one on ${unownedIdeas === 1 ? "it" : "them"}.`,
      tone: "warn",
      kind: "unowned",
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

/**
 * Paper's empty board offers a few ideas to start from. Keyed by the words an
 * org's own category slugs and labels tend to use, since every org names its
 * types itself — only the categories this org actually has get chips, and an
 * unmatched category gets none rather than a generic guess.
 */
const STARTER_IDEAS: { match: RegExp; titles: string[] }[] = [
  { match: /social|mixer|party/i,                       titles: ["Alumni mixer", "Game night"] },
  { match: /fund|philanthrop|charity/i,                 titles: ["Bake sale", "Charity 5K"] },
  { match: /service|volunteer|community/i,              titles: ["Food bank shift", "Beach cleanup"] },
  { match: /program|professional|career|academic|educ/i, titles: ["Speaker night", "Study hall"] },
  { match: /rush|recruit/i,                             titles: ["Rush info night"] },
  { match: /brotherhood|sisterhood|bond|retreat/i,      titles: ["Camping trip"] },
];

export function starterIdeas(categories: { slug: string; label: string; color?: string | null }[]) {
  const out: { title: string; category: string; color: string | null }[] = [];
  for (const c of categories) {
    const hit = STARTER_IDEAS.find(s => s.match.test(c.slug) || s.match.test(c.label));
    for (const title of hit?.titles ?? []) out.push({ title, category: c.slug, color: c.color ?? null });
  }
  return out.slice(0, 6);
}
