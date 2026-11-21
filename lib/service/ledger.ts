/**
 * The Service page's rules and words, shared by the web (`app/org/[slug]/service`) and
 * the app (`mobile/src/service`). Pure: "today" is passed in as a YYYY-MM-DD string,
 * no Temporal, no server imports, safe under noUncheckedIndexedAccess.
 *
 * Events split into Coming up (date >= today, soonest first) and Logged (date < today,
 * newest first). Members are punch cards: one hole per hour of the goal (capped at 40),
 * punched as hours land.
 */
import type { Schedule } from "@/lib/calendar-feed/schedule";

/** What the page reads off an event (the wire's ServiceEvent, or the web's optimistic draft). */
export interface LedgerEvent {
  id: number;
  title: string;
  date: string;
  location: string;
  notes: string;
  schedule?: Schedule | null;
  time?: string | null;
  /** Added on the web but not saved yet: shown, but nothing can act on it. */
  pending?: boolean;
}

/** One member's hours at one event (ServiceParticipationRow, as far as the page reads it). */
export interface LedgerRow {
  id: number;
  serviceEventId: number;
  brotherId: number;
  hours: number;
  brother: { id: number; name: string; avatarUrl: string | null };
}

/** A roster member, as far as the page reads one. */
export interface LedgerMember {
  id: number;
  name: string;
  serviceHours: number;
}

export const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export const DOW3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Trim a trailing .0: "3", but "3.5". */
export function r1(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** YYYY-MM-DD of `now` in the device's zone. */
export function todayOf(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function dateParts(date: string): { y: number; m: number; d: number; dow: number } {
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  return { y, m, d, dow: new Date(y, m - 1, d).getDay() };
}

/** "Jan" for month 1. */
export const mon3 = (m: number): string => MON3[m - 1] ?? "";
/** "Sun" for day 0. */
export const dow3 = (dow: number): string => DOW3[dow] ?? "";

/** "Sat, Oct 17" */
export function dayLabel(date: string): string {
  const p = dateParts(date);
  return `${dow3(p.dow)}, ${mon3(p.m)} ${p.d}`;
}

/** Whole days from `today` to `date` (negative = past). */
export function daysFrom(date: string, today: string): number {
  const a = dateParts(date), b = dateParts(today);
  return Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86_400_000);
}

/** "Today", "Tomorrow", "In 4 days". */
export function relWhen(date: string, today: string): string {
  const n = daysFrom(date, today);
  if (n <= 0) return "Today";
  if (n === 1) return "Tomorrow";
  return `In ${n} days`;
}

function clock(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
}

/** "10:00 AM–1:00 PM", the legacy free text, or null for all-day. */
export function timeLabel(ev: Pick<LedgerEvent, "schedule" | "time">): string | null {
  const s = ev.schedule;
  if (s?.kind === "timed") return clock(s.start, s.timeZone) + (s.end ? `–${clock(s.end, s.timeZone)}` : "");
  if (s?.kind === "allDay") return null;
  return ev.time?.trim() || null;
}

export type Standing = "ok" | "watch" | "risk";
/** On track (goal met), halfway, or under half. */
export function standing(h: number, goal: number): Standing {
  return h >= goal ? "ok" : h >= goal / 2 ? "watch" : "risk";
}

/* ── the page's numbers ─────────────────────────────────────────────────────────── */

export interface LedgerStats {
  total: number;
  onTrack: number;
  behind: number;
  upcoming: number;
  next: LedgerEvent | undefined;
  hasEvents: boolean;
  /** Log my hours waits for an event that has happened (or is today). */
  hasPast: boolean;
}

export function ledgerStats<E extends LedgerEvent>(roster: readonly LedgerMember[], events: readonly E[], goal: number, today: string): LedgerStats & { next: E | undefined } {
  const total = roster.reduce((s, b) => s + b.serviceHours, 0);
  const onTrack = roster.filter(b => b.serviceHours >= goal).length;
  const upcomingAll = events.filter(e => e.date >= today);
  const next = [...upcomingAll].sort((a, b) => a.date.localeCompare(b.date))[0];
  return {
    total, onTrack, behind: roster.length - onTrack, upcoming: upcomingAll.length, next,
    hasEvents: events.length > 0, hasPast: events.some(e => e.date <= today),
  };
}

/** Average hours per member, one decimal. */
export const avgHours = (total: number, members: number): number => Math.round((total / Math.max(1, members)) * 10) / 10;

/** The digest after the bold "<total> hours", as the web's own text runs (a joined string shapes differently). */
export function digestRest(stats: LedgerStats, eventCount: number, goal: number): string[] {
  return [
    " logged across ", String(eventCount), " ", eventCount === 1 ? "event" : "events", ".",
    stats.behind > 0 ? ` ${stats.behind} ${stats.behind === 1 ? "member is" : "members are"} still short of the ${goal}h goal.` : ` Every member has hit the ${goal}h goal.`,
  ];
}

/** "in 4 days", "tomorrow": the digest's Next up tail. */
export const nextWhen = (date: string, today: string): string => relWhen(date, today).toLowerCase();

/** The digest when there's nothing to add up yet. */
export function digestEmpty(orgName: string, memberCount: number): string {
  return memberCount === 0 ? `${orgName} hasn't added members yet.` : "No service events logged yet — record one and start crediting the members who show up.";
}

/** Search on titles and locations; Coming up soonest first, Logged newest first. */
export function splitEvents<E extends LedgerEvent>(events: readonly E[], search: string, today: string): { matched: E[]; up: E[]; past: E[] } {
  const q = search.trim().toLowerCase();
  const matched = events.filter(e => !q || e.title.toLowerCase().includes(q) || e.location.toLowerCase().includes(q));
  return {
    matched,
    up: matched.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)),
    past: matched.filter(e => e.date < today).sort((a, b) => b.date.localeCompare(a.date)),
  };
}

/** Search on names; most hours first, then by name. */
export function rankMembers<M extends LedgerMember>(roster: readonly M[], search: string): M[] {
  const q = search.trim().toLowerCase();
  return roster.filter(b => !q || b.name.toLowerCase().includes(q))
    .sort((a, b) => b.serviceHours - a.serviceHours || a.name.localeCompare(b.name));
}

/** An event card's tag: "In 4 days" within the week, else "Coming up"; "Past" once over. */
export function eventTag(date: string, today: string): { up: boolean; label: string } {
  if (date < today) return { up: false, label: "Past" };
  return { up: true, label: daysFrom(date, today) <= 7 ? relWhen(date, today) : "Coming up" };
}

/** Who's on an event's sheet and for how long; null until its sheet has loaded. */
export function sheetSum(rows: readonly LedgerRow[] | undefined): { n: number; h: number } | null {
  return rows ? { n: rows.length, h: rows.reduce((s, p) => s + p.hours, 0) } : null;
}

/** Group the org's rows by event (every event present, even with no rows). */
export function rowsByEvent<R extends LedgerRow>(events: readonly { id: number }[], rows: readonly R[]): Record<number, R[]> {
  const byEvent: Record<number, R[]> = Object.fromEntries(events.map(e => [e.id, [] as R[]]));
  for (const r of rows) (byEvent[r.serviceEventId] ??= []).push(r);
  return byEvent;
}

/** An event's sheet, by name. */
export const sheetRows = <R extends LedgerRow>(rows: readonly R[] | undefined): R[] =>
  [...(rows ?? [])].sort((a, b) => a.brother.name.localeCompare(b.brother.name));

/** "01", "02"… */
export const lineNo = (i: number): string => String(i + 1).padStart(2, "0");

/** The empty sheet's line. */
export function sheetEmpty(isUp: boolean, canService: boolean): string {
  return isUp ? "Nobody’s logged yet — hours go in after the event." : canService ? "No one logged yet. Use “Log hours” to record attendees." : "No one logged yet.";
}

/** "1 member", "3 members". */
export const members = (n: number): string => `${n} ${n === 1 ? "member" : "members"}`;

/** Holes on a punch card: one per hour of the goal, at most 40. */
export const holesFor = (goal: number): number => Math.max(0, Math.min(goal, 40));

/** The tail after a card's holes: "+5" past the goal, "2 to go" short of it, "done" on it. */
export function cardTail(hours: number, goal: number): { kind: "x" | "short"; text: string } {
  if (hours > goal) return { kind: "x", text: `+${r1(hours - goal)}` };
  if (hours < goal) return { kind: "short", text: `${r1(goal - hours)} to go` };
  return { kind: "x", text: "done" };
}

/** Events a member can log against, newest first (nothing still being saved). */
export const loggable = <E extends LedgerEvent>(events: readonly E[]): E[] =>
  events.filter(e => !e.pending).sort((a, b) => b.date.localeCompare(a.date));

/** "3 members · 7.5h on this sheet": the Log hours footer's running tally. */
export function logTally(draft: Record<number, string>): string {
  let n = 0, h = 0;
  for (const v of Object.values(draft)) { const x = parseFloat(v) || 0; if (x > 0) { n++; h += x; } }
  return `${members(n)} · ${r1(h)}h on this sheet`;
}

/** The Log hours body: every member with an hours value, blanks skipped. */
export function logEntries(draft: Record<number, string>): { brotherId: number; hours: number }[] {
  return Object.entries(draft)
    .filter(([, val]) => val !== "")
    .map(([id, val]) => ({ brotherId: Number(id), hours: Math.max(0, parseFloat(val) || 0) }));
}

/** Seed Log hours from the event's sheet. */
export function logSeed(rows: readonly LedgerRow[] | undefined): Record<number, string> {
  const seed: Record<number, string> = {};
  for (const p of rows ?? []) seed[p.brotherId] = String(p.hours);
  return seed;
}

/** Log my hours' value. */
export const mineHours = (val: string): number => Math.max(0, parseFloat(val) || 0);

/** A member's events, newest first, and hours from before per-event tracking. */
export function memberLedger<E extends LedgerEvent>(memberId: number, serviceHours: number, events: readonly E[], byEvent: Record<number, readonly LedgerRow[] | undefined>):
  { loaded: boolean; list: { event: E; hours: number }[]; early: number } {
  const list: { event: E; hours: number }[] = [];
  for (const ev of events) {
    const row = (byEvent[ev.id] ?? []).find(p => p.brotherId === memberId);
    if (row) list.push({ event: ev, hours: row.hours });
  }
  list.sort((a, b) => b.event.date.localeCompare(a.event.date));
  const logged = list.reduce((s, x) => s + x.hours, 0);
  return { loaded: events.every(e => e.pending || byEvent[e.id]), list, early: Math.round((serviceHours - logged) * 10) / 10 };
}

/** "of 10h goal · on track" / "of 10h goal · 4h to go". */
export function memberGoalLine(hours: number, goal: number): string {
  return `of ${goal}h goal · ${standing(hours, goal) === "ok" ? "on track" : `${r1(goal - hours)}h to go`}`;
}

/** The punch card in day one: three punched, up to ten holes. */
export function dayOneHoles(goal: number): { punched: number; holes: number } {
  const punched = Math.min(3, goal);
  return { punched, holes: Math.max(punched, Math.min(goal, 10)) };
}

/** Hour chips under Log my hours. */
export const MINE_CHIPS = [1, 2, 3, 4, 6] as const;

/* ── words ──────────────────────────────────────────────────────────────────────── */

export const PAGE = {
  kicker: "The service log",
  greet: "Hours, ",
  greetHi: "by the event.",
  digest: "Digest",
  nextUp: " Next up: ",
  newEvent: "New service event",
  logMine: "Log my hours",
  logMineNone: "No service events yet",
  ask: "Ask who’s behind",
  askQ: "Who's behind on service hours?",
  searchEvents: "Search events…",
  searchMembers: "Search members…",
  events: "Events",
  members: "Members",
  comingUp: "Coming up",
  logged: "Logged",
  newestFirst: "newest first",
  here: "here",
  hours: "hours",
  signedIn: "Signed in",
  hoursCol: "Hours",
  fetching: "Fetching the sheet…",
  you: " · you",
  remove: "Remove",
  logHours: "Log hours",
  edit: "Edit",
  delete: "Delete",
  noMatch: "Nothing matches.",
  noMatchLine: "Try a different search — it looks at titles and locations.",
  clear: "Clear search",
  noMembers: "No members found.",
  noMembersLine: "Try a different search.",
  emptyTitle: "No service events yet.",
  emptyOfficer: "Log your first cleanup, food bank or fundraiser — then record who showed up and how long they stayed. It lands on the Timeline too.",
  emptyMember: "Ask an officer to log the chapter’s service events — then your hours land here.",
  legendOk: (goal: number) => `On track · ${goal}h+`,
  legendHalf: "Halfway",
  legendUnder: "Under half",
  legendNote: "One hole per hour of the goal — punched as hours land.",
  member: "Member",
} as const;

/** The four measures: label, icon, tone, and the note under each (or why it's unset). */
export const MEASURES = {
  hours: { label: "Hours logged", icon: "clock", tone: "mint", note: "this term", why: "Counts from your first service event." },
  events: { label: "Service events", icon: "heart", tone: "rose", note: (up: number) => `${up} coming up`, why: "Cleanups, food banks, fundraisers." },
  onTrack: { label: "On track", icon: "check", tone: "sky", note: (goal: number) => `${goal}h goal`, why: (goal: number) => `Everyone’s goal is ${goal}h this term.` },
  avg: { label: "Avg / member", icon: "people", tone: "lilac", note: "hours", why: "Once hours are logged." },
} as const;

export const DAY_ONE = {
  kicker: "Service",
  greet: "Service hours, ",
  greetHi: "the easy way",
  digest: "Add the event. Afterwards, write down who came and for how long. We add it up and keep everyone’s hours for the term.",
  aria: "How service works",
  calMonth: "Nov",
  calDay: "7",
  calTitle: "Park cleanup",
  pad: [["Ava Chen", "3h"], ["Marcus Lee", "3h"], ["Leo Brandt", "2h"], ["Hours", "8h"]] as const,
  card: "Service card",
  steps: [
    { title: "1 · Add the event", line: "What it is, and when." },
    { title: "2 · Write down who came", line: "Names and hours, once it’s over." },
    { title: "3 · Watch the cards fill", line: (goal: number) => `Every hour counts toward the ${goal}h goal.` },
  ],
  cta: "Plan your first service event",
  member: "Nothing planned yet. An officer can add the first one.",
} as const;

export const FORM = {
  add: "Log service event",
  edit: "Edit service event",
  title: "Title",
  titlePh: "Beach cleanup, food bank, …",
  when: "When",
  location: "Location",
  locationPh: "Address or venue name",
  notes: "Notes",
  notesPh: "Details, dress code, what to bring…",
  opt: "opt",
  foot: (term: string | null) => `${term ? `Dates stay inside ${term}. ` : ""}It lands on the Timeline as a service event.`,
  cancel: "Cancel",
  save: (adding: boolean) => (adding ? "Log event" : "Save changes"),
} as const;

export const LOG = {
  title: (event: string) => `Log hours · ${event}`,
  hint: "Enter hours for everyone who showed up. Leave a member blank to skip them.",
  find: "Find a member…",
  findLabel: "Find member",
  total: (h: number) => `${r1(h)}h total`,
  unit: "h",
  cancel: "Cancel",
  save: "Save hours",
  saving: "Saving…",
} as const;

export const MINE = {
  title: "Log my hours",
  which: "Which event?",
  whichLabel: "Service event",
  how: "How many hours?",
  hoursLabel: "Hours",
  chip: (n: number) => `${n}h`,
  hintA: "You’re at ",
  hintB: (goal: number) => ` of ${goal}. Logging again for the same event replaces your hours there.`,
  cancel: "Cancel",
  save: "Log my hours",
  saving: "Saving…",
} as const;

export const MEMBER = {
  reading: "Reading the sign-in sheets…",
  none: "No event-logged hours yet.",
  early: "Recorded before per-event tracking",
  done: "Done",
} as const;

/** Every toast on the page. */
export const SAY = {
  loadFail: "Could not load service events.",
  attendeesFail: "Could not load attendees.",
  added: (title: string) => `Added "${title}".`,
  addFail: "Could not add the service event.",
  updated: "Service event updated.",
  saveFail: "Could not save changes.",
  deleted: (title: string) => `Deleted "${title}".`,
  deleteFail: "Could not delete the event.",
  logged: "Hours logged.",
  logFail: "Could not log hours.",
  mineLogged: "Your hours were logged.",
  mineFail: "Could not log your hours.",
  removeFail: "Could not remove attendee.",
} as const;
