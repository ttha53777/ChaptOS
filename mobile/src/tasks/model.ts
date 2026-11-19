/**
 * Pure rules for the Tasks tab, matching the web (app/org/[slug]/tasks/PaperTasks.tsx and
 * page.tsx): two piles, Overdue (past its date) then Upcoming (soonest first, undated
 * last); a task is "mine" when it names me, a role I hold, or everyone; I can tick it
 * when it's mine or I can manage tasks; I can vote on a poll that's everyone's or names
 * me or a role I hold.
 */
import type { MeResponse, Poll, Task } from "@/lib/api-types";
import { localDay } from "~/data/home";
import { daysFrom, monthDay, relDay, weekdayShort } from "~/today/time";

/** lib/permissions.ts PERMISSIONS.MANAGE_TASKS. Runtime constants can't be imported into the app. */
const MANAGE_TASKS = 1 << 12;

export interface Viewer { id: number; roleIds: Set<number>; canManage: boolean }

export function viewerOf(me: MeResponse): Viewer {
  return { id: me.id, roleIds: new Set(me.roles.map(r => r.id)), canManage: (me.permissions & MANAGE_TASKS) !== 0 };
}

export function isMine(t: Task, v: Viewer): boolean {
  return t.everyone != null || t.assignments.some(a => a.brotherId === v.id || (a.roleId != null && v.roleIds.has(a.roleId)));
}

export const canTick = (t: Task, v: Viewer) => v.canManage || isMine(t, v);

export function canVote(p: Poll, v: Viewer): boolean {
  return p.everyone || p.assignments.some(a => a.brotherId === v.id || (a.roleId != null && v.roleIds.has(a.roleId)));
}

export const pileOf = (t: Pick<Task, "dueDate">, today: string): "over" | "up" =>
  t.dueDate && daysFrom(today, t.dueDate) < 0 ? "over" : "up";

/** Soonest first; undated tasks wait at the bottom. */
export function byDue(a: Pick<Task, "id" | "dueDate">, b: Pick<Task, "id" | "dueDate">): number {
  if (!a.dueDate || !b.dueDate) return a.dueDate ? -1 : b.dueDate ? 1 : a.id - b.id;
  return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.id - b.id;
}

/** The board's right-hand words: "4 days late", "Yesterday", "Tomorrow", "Sat · in 3 days". */
export function rowWhen(dueDate: string | null, today: string): string {
  if (!dueDate) return "No date";
  const n = daysFrom(today, dueDate);
  if (n < -1) return `${-n} days late`;
  if (n === -1) return "Yesterday";
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n < 7) return `${weekdayShort(dueDate)} · in ${n} days`;
  return `in ${n} days`;
}

export type Band = "overdue" | "today" | "soon" | "upcoming" | "none" | "done";

export function bandOf(t: Task, today: string): Band {
  if (t.status === "done") return "done";
  if (!t.dueDate) return "none";
  const n = daysFrom(today, t.dueDate);
  return n < 0 ? "overdue" : n === 0 ? "today" : n === 1 ? "soon" : "upcoming";
}

/** The deck card's cap line. */
export function deckLabel(t: Task, today: string): string {
  const b = bandOf(t, today);
  if (b === "overdue") return `Overdue · ${-daysFrom(today, t.dueDate!)}d late`;
  if (b === "today") return "Due today";
  if (b === "soon") return "Due tomorrow";
  if (b === "upcoming") return `Due ${monthDay(t.dueDate!)}`;
  return b === "done" ? "Done" : "No date";
}

/** "as Social Chair" / "anyone can" / "your part · 4/13 done". */
export function capNote(t: Task, v: Viewer): string | null {
  if (t.everyone === "each") return `your part · ${t.doneCount ?? 0}/${t.memberCount ?? "?"} done`;
  if (t.everyone === "any") return "anyone can";
  const viaRole = t.assignments.find(a => a.role && v.roleIds.has(a.role.id) && a.brotherId !== v.id);
  if (viaRole?.role && !t.assignments.some(a => a.brotherId === v.id)) return `as ${viaRole.role.name}`;
  return null;
}

/** Who a task is on, in words, for rows and the sheet. */
export function whoLine(t: Task, v: Viewer): string {
  if (t.everyone === "each") return "Everyone, each their own";
  if (t.everyone === "any") return "Anyone";
  const names = t.assignments.map(a => a.role ? a.role.name : a.brotherId === v.id ? "You" : a.brother?.name.split(" ")[0] ?? "Someone");
  return names.join(", ") || "No one";
}

export function closesText(p: Poll, today: string): string {
  if (p.status === "closed") return p.closedAt ? `Closed ${monthDay(localDay(new Date(p.closedAt)))}` : "Closed";
  if (!p.closeDate) return "Stays open";
  const n = daysFrom(today, p.closeDate);
  return n < 0 ? "Closes any time now" : n === 0 ? "Closes today" : n === 1 ? "Closes tomorrow" : `Closes ${relDay(today, p.closeDate)}`;
}

/** Per-option counts this viewer may see (never while sealed). */
export const revealed = (p: Poll) => !p.sealed && p.options.every(o => o.voteCount != null);

export function leaderOf(p: Poll): number | null {
  let best: number | null = null, n = 0;
  for (const o of p.options) { const c = o.voteCount ?? 0; if (c > n) { n = c; best = o.id; } }
  return best;
}
