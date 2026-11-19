/**
 * The Tasks page's rules, shared by the web (app/org/[slug]/tasks/*) and the native app
 * (mobile/src/tasks/*), so both draw the same piles, words, ballots and spotlight.
 *
 * Pure and client-safe: no React, no server imports, no Temporal. Every date here is the
 * viewer's own calendar day (`today` is local midnight), as on the web page, so nothing
 * needs an injected time zone. On the app's SHARED list (scripts/lint-mobile-imports.py),
 * so it must also compile under mobile's noUncheckedIndexedAccess.
 */
import type { Poll, Task, TaskDetail, TaskHistoryEntry } from "../api-types/tasks";

// ── dates ─────────────────────────────────────────────────────────────────────
export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const FULLDOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
export const MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_MS = 86_400_000;

export function isoOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function plusDays(d: Date, n: number): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
export function dateOf(iso: string): Date { const [y, m, d] = iso.split("-").map(Number); return new Date(y!, m! - 1, d); }
/** Local midnight of today (the web page's `startOfToday`). */
export function startOfToday(): Date { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
/** Whole calendar days from today to `iso` (negative = past). */
export function dFrom(iso: string, today: Date): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y!, m! - 1, d) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / DAY_MS);
}
export const dowOf = (iso: string): string => DOW[dateOf(iso).getDay()]!;
/** "Nov 13" from an ISO day (app/data fmtDate). */
export function fmtDay(iso: string): string { const [, m, d] = iso.split("-").map(Number); return `${MONS[m! - 1]} ${d}`; }
/** The viewer's local calendar day of an instant, as "Nov 13". */
export const localDayOf = (at: string): string => fmtDay(isoOf(new Date(at)));
export const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const shortD = (d: Date) => `${MONS[d.getMonth()]} ${d.getDate()}`;
export const longD = (d: Date) => `${DOW[d.getDay()]}, ${MONS[d.getMonth()]} ${d.getDate()}`;
export const daysBetween = (a: Date, b: Date) => Math.round((midnight(b).getTime() - midnight(a).getTime()) / DAY_MS);
export function clock(d: Date): string {
  const h = d.getHours(), m = d.getMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
/** "17:30" → "5:30 PM", "12:00" → "Noon", "09:00" → "9 AM". */
export function fmtDueTime(t: string): string {
  const [h, m] = t.split(":").map(Number) as [number, number];
  if (h === 12 && m === 0) return "Noon";
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

// ── words ─────────────────────────────────────────────────────────────────────
export const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export function andList(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
/** "A and B", "A, B and 3 more" (the sheets' name lists). */
export function names(xs: string[]): string {
  if (xs.length <= 2) return xs.join(" and ");
  return `${xs.slice(0, 2).join(", ")} and ${xs.length - 2} more`;
}
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
/** The pastel a face without a photo takes, by member id. */
export const AV_TONES = ["peach", "sky", "mint", "butter", "lilac", "rose"] as const;
export const avTone = (id: number) => AV_TONES[Math.abs(id) % AV_TONES.length]!;

// ── who ───────────────────────────────────────────────────────────────────────
export type Me = { selfId: number | null; myRoleIds: Set<number> };

/** Mine: assigned to everyone, to me, or to a role I hold (the server's isAssignee). */
export const isMine = (t: Pick<Task, "everyone" | "assignments">, me: Me) => t.everyone != null || t.assignments.some(a =>
  (a.brotherId != null && a.brotherId === me.selfId) || (a.roleId != null && me.myRoleIds.has(a.roleId)));
/** A whole-chapter poll, or an older targeted one that names me or a role I hold. */
export const canVote = (p: Pick<Poll, "everyone" | "assignments">, me: Me) => p.everyone || p.assignments.some(a =>
  (a.brotherId != null && a.brotherId === me.selfId) || (a.roleId != null && me.myRoleIds.has(a.roleId)));
/** An assignee can flip status even without MANAGE_TASKS. */
export const canComplete = (t: Pick<Task, "everyone" | "assignments">, me: Me, canManage: boolean) => canManage || isMine(t, me);

// ── the list ──────────────────────────────────────────────────────────────────
export function pileOf(t: Pick<Task, "dueDate">, today: Date): "over" | "up" {
  return t.dueDate && dFrom(t.dueDate, today) < 0 ? "over" : "up";
}
/** The row words: "4 days late", "Yesterday", "Tomorrow", "Sat · in 3 days". */
export function rowWhen(dueDate: string | null, today: Date): string {
  if (!dueDate) return "No date";
  const n = dFrom(dueDate, today);
  if (n < -1) return `${-n} days late`;
  if (n === -1) return "Yesterday";
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n < 7) return `${dowOf(dueDate)} · in ${n} days`;
  return `in ${n} days`;
}
/** The row words with a due time riding on them: "Tomorrow · by 5 PM". */
export const rowWhenAt = (t: Pick<Task, "dueDate" | "dueTime">, today: Date) =>
  rowWhen(t.dueDate, today) + (t.dueDate && t.dueTime ? ` · by ${fmtDueTime(t.dueTime)}` : "");
/** Soonest first; undated tasks wait at the bottom. */
export function byDue(a: Pick<Task, "id" | "dueDate">, b: Pick<Task, "id" | "dueDate">): number {
  if (!a.dueDate || !b.dueDate) return a.dueDate ? -1 : b.dueDate ? 1 : a.id - b.id;
  return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.id - b.id;
}
/** The tear-off date stub: month + day, "today" ringed, or ANY — for an undated task. */
export function stubOf(dueDate: string | null, today: Date): { mon: string; day: string; today: boolean } | null {
  if (!dueDate) return null;
  const d = dateOf(dueDate);
  return { mon: MON[d.getMonth()]!, day: String(d.getDate()), today: dFrom(dueDate, today) === 0 };
}
/** An "each" task's progress bar width (percent). */
export const progPct = (c: number, n: number) => (n ? Math.round((c / n) * 100) : 0);

/** The two piles and the Done list, for everyone's tasks or just mine. */
export function taskPiles<T extends Task>(list: T[], today: Date, mineOnly: boolean, me: Me) {
  const vis = mineOnly ? list.filter(t => isMine(t, me)) : list;
  const open = vis.filter(t => t.status !== "done");
  return {
    over: open.filter(t => pileOf(t, today) === "over").sort(byDue),
    up: open.filter(t => pileOf(t, today) === "up").sort(byDue),
    done: vis.filter(t => t.status === "done")
      .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt)),
  };
}
/** The side column stays shorter than the screen: the latest few, the rest on ask. */
export const DONE_SHOWN = 6;

/** Open votes this viewer is asked into (all of them for a poll manager), then the two most recently decided. */
export function pollShelf<P extends Poll>(list: P[], mineOnly: boolean, canManagePolls: boolean, me: Me): P[] {
  const seen = list.filter(p => canManagePolls ? (!mineOnly || canVote(p, me)) : canVote(p, me));
  const openP = seen.filter(p => p.status === "open")
    .sort((a, b) => (a.myVoteOptionId == null) !== (b.myVoteOptionId == null) ? (a.myVoteOptionId == null ? -1 : 1) : (a.closeDate ?? "9") < (b.closeDate ?? "9") ? -1 : 1);
  const decided = seen.filter(p => p.status === "closed")
    .sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? "")).slice(0, 2);
  return [...openP, ...decided];
}

/** The briefing: the headline's two counts and the line under it. */
export function briefOf(over: number, up: number, mineOnly: boolean) {
  return {
    forYou: mineOnly ? " for you" : "",
    sub: over
      ? "Start with the overdue pile, then work down. Tick a task when it’s done."
      : "You’re on top of it. Everything left is still ahead of its date.",
  };
}

// ── votes ─────────────────────────────────────────────────────────────────────
export function leaderOf(p: Pick<Poll, "options">): number | null {
  let best: number | null = null, n = -1;
  for (const o of p.options) { const c = o.voteCount ?? 0; if (c > n) { n = c; best = o.id; } }
  return n > 0 ? best : null;
}
/** The vote card's line: "Closes tomorrow", "Closed Nov 15", "No close date". */
export function closesTxt(p: Pick<Poll, "status" | "closedAt" | "closeDate">, today: Date): string {
  if (p.status === "closed") return `Closed${p.closedAt ? ` ${localDayOf(p.closedAt)}` : ""}`;
  if (!p.closeDate) return "No close date";
  const n = dFrom(p.closeDate, today);
  return `Closes ${n < 0 ? "any time now" : n === 0 ? "today" : n === 1 ? "tomorrow" : n < 7 ? dowOf(p.closeDate) : fmtDay(p.closeDate)}`;
}
export function relClose(iso: string, today: Date): string {
  const n = dFrom(iso, today);
  if (n < 0) return "past its close date";
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  return `in ${n} days`;
}
/** What the vote card shows: bars only once the viewer has voted or the vote is over. */
export function voteCardOf(poll: Poll, canVoteHere: boolean) {
  const closed = poll.status === "closed";
  const mine = poll.myVoteOptionId;
  const reveal = (closed || mine != null) && poll.options.every(o => o.voteCount != null);
  const lead = leaderOf(poll);
  const winner = lead != null ? poll.options.find(o => o.id === lead)?.label : null;
  return {
    closed, mine, reveal, lead, live: !closed && canVoteHere,
    pct: (count: number | null) => (reveal && poll.totalVotes ? Math.round(((count ?? 0) / poll.totalVotes) * 100) : 0),
    foot: closed
      ? (winner ? `Decided · ${winner} won.` : "Closed with no votes.")
      : mine != null ? "Your vote is in. Tap another to change it."
      : canVoteHere ? "Anonymous. Results show after you vote."
      : "Only the people on it vote.",
  };
}
/** The ballot's kicker word for who votes: "Everyone votes", "Treasurer and Secretary vote", "3 voters". */
export function ballotWho(poll: Poll, rosterSize: number): string {
  const roleOnly = !poll.everyone && poll.assignments.length > 0 && poll.assignments.every(a => a.roleId != null);
  return roleOnly
    ? `${andList(poll.assignments.map(a => a.role?.name ?? "").filter(Boolean))} vote`
    : poll.everyone || (poll.assigneeCount >= rosterSize && rosterSize > 1) ? "Everyone votes" : `${plural(poll.assigneeCount, "voter")}`;
}
/** The ballot's line under the question: when it closes, then the turnout. */
export function ballotSub(poll: Poll, today: Date): string {
  const closed = poll.status === "closed";
  return (closed
    ? `Closed${poll.closedAt ? ` ${localDayOf(poll.closedAt)}` : poll.closeDate ? ` ${fmtDay(poll.closeDate)}` : ""}`
    : poll.closeDate ? `Closes ${dowOf(poll.closeDate)}, ${fmtDay(poll.closeDate)} · ${relClose(poll.closeDate, today)}` : "No close date")
    + ` · ${poll.totalVotes} of ${poll.assigneeCount} voted`;
}
/** "Thalha, Leo and Wes and 7 more" (managers: who hasn't voted). */
export function pendingLine(pending: { name: string }[]): string {
  return `${andList(pending.slice(0, 3).map(v => first(v.name)))}${pending.length > 3 ? ` and ${pending.length - 3} more` : ""}`;
}

// ── the spotlight ─────────────────────────────────────────────────────────────
export type SpotTone = "done" | "over" | "up";
export type SpotWhen =
  | { kind: "done"; who: string; on: string | null; rel: string }
  | { kind: "none" }
  | { kind: "late"; day: string; ago: string }
  | { kind: "up"; day: string; tail: string };

/** The spotlight's head: tone, chip, the big tick's words and the sentence under the title. */
export function spotHead(task: Task, today: Date, nameOf: (id: number | null) => string) {
  const each = task.everyone === "each";
  const done = task.status === "done";
  const due = task.dueDate ? dateOf(task.dueDate) : null;
  const at = due && task.dueTime ? `, by ${fmtDueTime(task.dueTime)}` : "";
  const n = task.dueDate ? dFrom(task.dueDate, today) : null;
  const late = !done && n != null && n < 0;
  const tone: SpotTone = done ? "done" : late ? "over" : "up";
  const finAt = done && task.completedAt ? new Date(task.completedAt) : null;
  const chip = done ? (each ? "Your part’s done" : "Done") : late ? "Overdue" : due ? "Upcoming" : "No date";
  let when: SpotWhen;
  if (done) {
    const who = each ? "You did your part" : task.completedById != null ? `${nameOf(task.completedById)} finished it` : "Finished";
    let rel = "";
    if (due && finAt) {
      const k = daysBetween(due, finAt);
      rel = k > 0 ? `, ${plural(k, "day")} after it was due` : k < 0 ? `, ${plural(-k, "day")} early` : ", on the day it was due";
    }
    when = { kind: "done", who, on: finAt ? longD(finAt) : null, rel };
  } else if (!due || n == null) {
    when = { kind: "none" };
  } else if (late) {
    when = { kind: "late", day: `${FULLDOW[due.getDay()]}, ${shortD(due)}${at}`, ago: n === -1 ? "Yesterday" : `${-n} days ago` };
  } else {
    when = {
      kind: "up",
      day: `${n === 0 ? "today " : n === 1 ? "tomorrow " : ""}${FULLDOW[due.getDay()]}, ${shortD(due)}${at}`,
      tail: n === 0 ? (at ? "." : ", by the end of the day.") : n === 1 ? "." : `, in ${n} days.`,
    };
  }
  return { each, done, due, late, tone, finAt, chip, when };
}

/** The names a task is for, lower-case "you"/"everyone", for "Only X can tick this." */
export function forNames(task: Task, selfId: number | null): string[] {
  return task.everyone ? ["everyone"] : task.assignments.map(a => a.role?.name ?? (a.brother ? (a.brother.id === selfId ? "you" : first(a.brother.name)) : "")).filter(Boolean);
}

export type DeskCell =
  | { kind: "gap"; key: string; label: string }
  | { kind: "day"; key: number; day: number; cls: string[]; marks: ("s" | "d" | "f")[] };

/** Start → due bookends, then the weeks between as a desk calendar beside the one number. */
export function deskCal(task: Pick<Task, "createdAt">, today: Date, due: Date, finAt: Date | null, late: boolean) {
  const a0 = midnight(new Date(task.createdAt));
  const fin = finAt ? midnight(finAt) : null;
  const now = fin ?? today;
  const from = new Date(Math.min(a0.getTime(), due.getTime(), now.getTime()));
  const last = new Date(Math.max(due.getTime(), now.getTime()));
  // Mon-first weeks. Up to five weeks show whole; a longer stretch (a task set
  // months ahead, or long overdue) keeps just the weeks holding start, due and
  // today, with the skipped weeks counted in between.
  const weekOf = (d: Date) => plusDays(d, -((d.getDay() + 6) % 7));
  let weeks: Date[] = [];
  if (daysBetween(weekOf(from), weekOf(last)) <= 28) {
    for (let w = weekOf(from); w <= last; w = plusDays(w, 7)) weeks.push(w);
  } else {
    const keys = [a0, due, now].map(d => weekOf(d).getTime());
    weeks = [...new Set(keys)].sort((x, y) => x - y).map(t => new Date(t));
  }

  let big: string, cap: string, tone: "late" | "left" | "fin";
  if (fin) {
    const k = daysBetween(due, fin);
    big = k === 0 ? "✓" : String(Math.abs(k));
    cap = k === 0 ? "on the day" : `${Math.abs(k) === 1 ? "day" : "days"} ${k > 0 ? "late" : "early"}`;
    tone = k > 0 ? "late" : "fin";
  } else if (late) {
    const k = daysBetween(due, today);
    big = String(k); cap = `${k === 1 ? "day" : "days"} late`; tone = "late";
  } else {
    const k = daysBetween(today, due);
    big = String(k); cap = k === 0 ? "due today" : `${k === 1 ? "day" : "days"} left`; tone = "left";
  }

  const cells: DeskCell[] = [];
  const dayCell = (d: Date): DeskCell => {
    const t = d.getTime();
    const c: string[] = [];
    const marks: ("s" | "d" | "f")[] = [];
    if (d < from || d > last) c.push("out");
    else {
      if (t === a0.getTime()) { c.push("as"); marks.push("s"); }
      if (t === due.getTime()) { c.push("due"); marks.push("d"); }
      if (fin && t === fin.getTime()) { c.push("dn"); marks.push("f"); }
      if (!fin && t === today.getTime()) c.push("today");
      if (d > due && d <= now) c.push("late");
      else if (!fin && d > today && d < due) c.push("left");
      else if (d < now && t !== due.getTime()) c.push("gone");
    }
    return { kind: "day", key: t, day: d.getDate(), cls: c, marks };
  };
  weeks.forEach((w, wi) => {
    if (wi > 0) {
      const skipped = daysBetween(weeks[wi - 1]!, w) / 7 - 1;
      if (skipped > 0) cells.push({ kind: "gap", key: `gap${w.getTime()}`, label: `${plural(skipped, "week")} later` });
    }
    for (let i = 0; i < 7; i++) cells.push(dayCell(plusDays(w, i)));
  });
  const span = daysBetween(a0, due);
  const gs = weeks[0]!, ge = plusDays(weeks[weeks.length - 1]!, 6);
  return {
    a0, fin, big, cap, tone, cells,
    spanText: span > 0 ? `${plural(span, "day")} to do it` : span === 0 ? "Same day" : "Set after its date",
    monthLabel: MONL[gs.getMonth()] + (gs.getMonth() !== ge.getMonth() || gs.getFullYear() !== ge.getFullYear() ? ` – ${MONL[ge.getMonth()]}` : ""),
    foot: fin ? `Finished ${shortD(fin)}` : late ? `It was due ${shortD(due)}` : `Due ${shortD(due)}`,
  };
}

/** Everyone · each: how much of the chapter is done, and who's left. */
export function partsOf<B extends { id: number; name: string }>(task: Task, detail: TaskDetail | null, roster: B[], selfId: number | null) {
  const doneN = task.doneCount ?? 0, total = task.memberCount ?? roster.length;
  const doneIds = new Set((detail?.parts ?? []).map(p => p.brotherId));
  const sorted = [...roster].sort((a, b) => a.name.localeCompare(b.name));
  const doneB = sorted.filter(b => doneIds.has(b.id));
  const left = sorted.filter(b => !doneIds.has(b.id));
  const name = (b: B) => b.id === selfId ? "you" : first(b.name);
  const LIST = 8;
  return {
    doneN, total, pct: total ? Math.round((doneN / total) * 100) : 0, doneIds, faces: [...doneB, ...left], left,
    leftNames: `${left.slice(0, LIST).map(name).join(", ")}${left.length > LIST ? ` and ${left.length - LIST} more` : ""}`,
  };
}

/** What an update event changed, in words. */
export function editedWhat(fields: string[] | null): string {
  const said: string[] = [];
  const has = (f: string) => fields?.includes(f);
  if (has("title")) said.push("renamed it");
  if (has("dueDate")) said.push("changed the due date");
  else if (has("dueTime")) said.push("changed the due time");
  if (has("notes")) said.push("edited the note");
  if (has("assignees") || has("everyone")) said.push("changed who’s on it");
  return said.length ? andList(said) : "edited it";
}

export type HistoryLine = { at: Date; actorId: number | null; text: string; tone: "c" | "d" | "e" | "r" };

/** The history, newest first. */
export function historyLines(task: Task, detail: TaskDetail | null): HistoryLine[] {
  const each = task.everyone === "each";
  const lines: HistoryLine[] = [];
  const events: TaskHistoryEntry[] = detail?.history ?? [];
  // Tasks moved over from the old Deadlines table have no create event.
  if (detail && !events.some(e => e.action === "task.created")) {
    lines.push({ at: new Date(task.createdAt), actorId: task.createdById, text: "assigned it", tone: "c" });
  }
  // A tick through PATCH {status} is logged as an update whose only field is
  // "status", with no completed/reopened event of its own. Status is binary, so
  // replaying the log in order says which way each flip went.
  let isDone = false;
  for (const e of events) {
    const at = new Date(e.at);
    if (e.action === "task.created") lines.push({ at, actorId: e.actorId, text: "assigned it", tone: "c" });
    else if (e.action === "task.completed") { if (!each) isDone = true; lines.push({ at, actorId: e.actorId, text: each ? "did their part" : "marked it done", tone: "d" }); }
    else if (e.action === "task.reopened") { if (!each) isDone = false; lines.push({ at, actorId: e.actorId, text: each ? "unticked their part" : "reopened it", tone: "r" }); }
    else if (e.action === "task.updated") {
      const fields = e.changedFields ?? [];
      if (fields.includes("status")) {
        isDone = !isDone;
        lines.push({ at, actorId: e.actorId, text: isDone ? "marked it done" : "reopened it", tone: isDone ? "d" : "r" });
      }
      const rest = fields.filter(f => f !== "status");
      if (rest.length || fields.length === 0) lines.push({ at, actorId: e.actorId, text: editedWhat(rest), tone: "e" });
    }
  }
  lines.sort((a, b) => b.at.getTime() - a.at.getTime());
  return lines;
}
/** A history line's stamp: "Nov 18 · 4:05 PM". */
export const historyStamp = (at: Date) => `${fmtDay(isoOf(at))} · ${clock(at)}`;

// ── the sheets ────────────────────────────────────────────────────────────────
/** The task sheet's quick days: today, tomorrow, a week out. */
export function taskQuickDays(today: Date) {
  return [
    { key: "today", label: "Today", iso: isoOf(today) },
    { key: "tom", label: "Tomorrow", iso: isoOf(plusDays(today, 1)) },
    { key: "week", label: "Next week", iso: isoOf(plusDays(today, 7)) },
  ];
}
/** The poll sheet's quick close days: tomorrow, the coming Friday, a week out (deduped). */
export function pollQuickDays(today: Date) {
  const fri = (5 - today.getDay() + 7) % 7 || 7;
  return [
    { label: "Tomorrow", iso: isoOf(plusDays(today, 1)) },
    { label: FULLDOW[plusDays(today, fri).getDay()]!.slice(0, 3), iso: isoOf(plusDays(today, fri)) },
    { label: "Next week", iso: isoOf(plusDays(today, 7)) },
  ].filter((x, i, all) => all.findIndex(y => y.iso === x.iso) === i);
}
export const inTermOf = (minDate?: string | null, maxDate?: string | null) => (iso: string) => (!minDate || iso >= minDate) && (!maxDate || iso <= maxDate);

export type WhoMode = "people" | "roles" | "all";
export function validateTask(v: { title: string; due: string; initialDue: string; mode: WhoMode; people: number; roles: number }, inTerm: (iso: string) => boolean): string | null {
  if (!v.title.trim()) return "Say what needs doing.";
  if (v.due && v.due !== v.initialDue && !inTerm(v.due)) return "That date is outside this semester.";
  if (v.mode !== "all" && v.people + v.roles === 0) return v.mode === "roles" ? "Pick at least one role, or choose People or Everyone." : "Pick at least one person, or choose Roles or Everyone.";
  return null;
}
export function validatePoll(v: { question: string; options: string[]; close: string; initialClose?: string }, inTerm: (iso: string) => boolean): string | null {
  const filled = v.options.map(o => o.trim()).filter(Boolean);
  const lower = filled.map(l => l.toLowerCase());
  if (!v.question.trim()) return "Write the question.";
  if (filled.length < 2) return "Give at least two choices.";
  if (lower.some((l, i) => lower.indexOf(l) !== i)) return "Two choices say the same thing.";
  if (v.close && v.close !== v.initialClose && !inTerm(v.close)) return "That date is outside this semester.";
  return null;
}
/** A who tile's small line. */
export function whoSub(m: WhoMode, people: number, roles: number, rosterSize: number): string {
  return m === "people" ? (people ? `${people} picked` : "Pick names")
    : m === "roles" ? (roles ? `${roles} role${roles === 1 ? "" : "s"}` : "By title")
    : `All ${rosterSize}`;
}
/** Who it reaches right now: picked people plus whoever holds a picked role. */
export function reachOf<B extends { id: number; roles?: { id: number }[] | null }>(mode: WhoMode, roster: B[], brotherIds: number[], roleIds: number[]): number[] {
  if (mode === "all") return roster.map(b => b.id);
  const ids = new Set(brotherIds);
  for (const b of roster) if (b.roles?.some(r => roleIds.includes(r.id))) ids.add(b.id);
  return [...ids];
}
