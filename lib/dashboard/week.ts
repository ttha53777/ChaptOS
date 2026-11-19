/**
 * The dashboard's week: the agenda (This week card), the digest's inputs, and what
 * the briefing line keys on. Pure and client-safe; the web page and the native app
 * (mobile/, via the shared-rules import boundary) both compute it here.
 */
import type { CalendarEvent, Task } from "@/lib/api-types";
import { isoWeekBounds } from "@/lib/dates";

type Ig = { id: number; status: string; dueDate: string; title: string };
type Party = { id: number; date: string; name: string };

/** Only the digest needs the Instagram and party lists. */
export interface WeekInputs<I extends Ig = Ig, P extends Party = Party> {
  today: string;
  tasks: Task[];
  calendar: CalendarEvent[];
  instagram: I[];
  parties: P[];
  /** Members At Risk (statusCounts["At Risk"]), for the digest key. */
  atRiskCount: number;
}

export interface WeekDigest<I extends Ig = Ig, P extends Party = Party> {
  start: string;
  end: string;
  /** Open deadlines due this week. */
  deadlinesDue: Task[];
  igDue: I[];
  /** This week's calendar minus party-linked events (parties have their own line). */
  eventsThisWeek: CalendarEvent[];
  partiesThisWeek: P[];
  atRiskCount: number;
  /** Work already late (any open dated task before today). */
  overdueCount: number;
  /** Every calendar entry this week, parties included: the This week card. */
  agenda: CalendarEvent[];
  /** Something worth narrating. */
  hasSignal: boolean;
  /** Stable key for one week's state: the narration is generated once per key. */
  key: string;
}

/** The POST /api/ai/digest body for this week (the web page sends the same). */
export function digestRequest(w: WeekDigest, igEnabled: boolean) {
  return {
    key: w.key,
    weekRange: { start: w.start, end: w.end },
    deadlines: w.deadlinesDue.map(d => ({ title: d.title, dueDate: d.dueDate })),
    instagram: igEnabled ? w.igDue.map(t => ({ title: t.title, dueDate: t.dueDate })) : [],
    events: w.eventsThisWeek.map(e => ({ title: e.title, date: e.date })),
    parties: w.partiesThisWeek.map(p => ({ name: p.name, date: p.date })),
    atRiskCount: w.atRiskCount,
    overdueCount: w.overdueCount,
  };
}

export function weekDigest<I extends Ig, P extends Party>(i: WeekInputs<I, P>): WeekDigest<I, P> {
  const { start, end } = isoWeekBounds(new Date(`${i.today}T00:00:00`));
  const inWeek = (iso: string) => iso >= start && iso <= end;
  const deadlinesDue = i.tasks.filter(d => d.status !== "done" && d.dueDate != null && inWeek(d.dueDate));
  const igDue = i.instagram.filter(t => t.status !== "posted" && inWeek(t.dueDate));
  const eventsThisWeek = i.calendar.filter(e => inWeek(e.date) && !e.partyEventId);
  const partiesThisWeek = i.parties.filter(p => inWeek(p.date));
  const overdueCount = i.tasks.filter(d => d.status !== "done" && d.dueDate != null && d.dueDate < i.today).length;
  const agenda = i.calendar.filter(e => e.date >= start && e.date <= end);
  const total = deadlinesDue.length + igDue.length + eventsThisWeek.length + partiesThisWeek.length;
  const ids = (arr: { id: number }[]) => arr.map(x => x.id).sort((a, b) => a - b).join(",");
  const key = [
    "v5", // bump when the AI prompt/length changes, to invalidate cached narrations
    start, end,
    `d:${ids(deadlinesDue)}`,
    `i:${ids(igDue)}`,
    `e:${ids(eventsThisWeek)}`,
    `p:${ids(partiesThisWeek)}`,
    `r:${i.atRiskCount}`,
    `o:${overdueCount}`,
  ].join("|");
  return {
    start, end, deadlinesDue, igDue, eventsThisWeek, partiesThisWeek,
    atRiskCount: i.atRiskCount, overdueCount, agenda,
    hasSignal: total > 0 || overdueCount > 0,
    key,
  };
}
