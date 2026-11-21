/**
 * The programming board's rules and words, shared by the web events page and the
 * app (mobile/ imports this as a SHARED pure module).
 *
 *   gates     REQUIRED_FIELDS, hasRequiredField, fieldsFor, missingFor, canEnter,
 *             needsConfirmFirst, needsWrapUp
 *   page      nextOnDeckEvent, eventsNeedingAttention, eventsTermStats, statusBits,
 *             measures, cardWhen, cardBlocker, the help screen, the stage line,
 *             the panel's gate bar, and the steps' and toasts' words
 *
 * PURE: "today" is always passed in as a YYYY-MM-DD string, there is no Temporal,
 * no Intl, no server import, and it compiles under noUncheckedIndexedAccess. Times
 * that need a schedule's zone (formatEventTime) are formatted by the caller and
 * handed in as text.
 */

import type { OwnerRef } from "@/lib/event-owner";
import { STAGES, STAGE_LABELS, STAGE_MEANINGS, type ProgrammingStage } from "@/lib/state/programming-stage";

/* ── dates ─────────────────────────────────────────────────────────────────────── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** "Nov 9" — app/data fmtDate, the board's one date format. */
export function shortDate(iso: string): string {
  const m = Number(iso.slice(5, 7));
  return `${MONTHS[m - 1] ?? ""} ${Number(iso.slice(8, 10))}`;
}

/** Three-letter month of a YYYY-MM-DD, for the timeline tickets. */
export function monthShort(iso: string): string {
  return MONTHS[Number(iso.slice(5, 7)) - 1] ?? "";
}

function dow(iso: string): number {
  return new Date(iso + "T00:00:00Z").getUTCDay();
}
export const weekdayShort = (iso: string): string => DOW_SHORT[dow(iso)] ?? "";
export const weekdayLong = (iso: string): string => DOW_LONG[dow(iso)] ?? "";

/** "Friday, November 20, 2026": the page kicker. */
export function longDate(iso: string): string {
  return `${weekdayLong(iso)}, ${MONTHS_LONG[Number(iso.slice(5, 7)) - 1] ?? ""} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;
}

/** Add `n` days to a YYYY-MM-DD string (UTC-safe). */
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Days until a date, relative to `today` (negative = past). */
export function daysUntil(dueDate: string, today: string): number {
  const ms = new Date(dueDate + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime();
  return Math.round(ms / 86_400_000);
}

/* ── gates ─────────────────────────────────────────────────────────────────────── */

export interface RequiredField {
  key: "title" | "category" | "owner" | "date" | "location" | "mandatory";
  label: string;
  /** The earliest lane that demands this field. */
  gate: ProgrammingStage;
  /** Which editor satisfies it; the fix-step builds itself from this. */
  kind: "text" | "type" | "person" | "date" | "bool";
  /** One line on why the lane asks for this. Shown in the fix-step. */
  hint: string;
}

/**
 * The required set, in gate order. Each lane boundary costs something and buys
 * something:
 *
 *   Idea      title + category   — belongs to the chapter
 *   Planning  + an owner         — belongs to SOMEBODY
 *   Confirmed + date + location  — locked in, and PUBLISHED to the Timeline
 *   Done      (through Confirmed) — wrapped
 *
 * `mandatory` is listed at the confirmed gate and is always satisfied — a boolean
 * column is answered by existing. It is there so the panel shows "attendance:
 * required / optional" as a field the publish decision covers, not so it can block.
 */
export const REQUIRED_FIELDS: readonly RequiredField[] = [
  { key: "title",     label: "Title",      gate: "idea",      kind: "text",
    hint: "What to call it. A working title is fine — it can change until it's confirmed." },
  { key: "category",  label: "Type",       gate: "idea",      kind: "type",
    hint: "Which kind of event this is. Drives its colour, and which chapter budget it lands against." },
  { key: "owner",     label: "Owner",      gate: "planning",  kind: "person",
    hint: "One person or one role accountable. An idea belongs to the chapter; a plan belongs to somebody." },
  { key: "date",      label: "Date",       gate: "confirmed", kind: "date",
    hint: "Confirming puts this on everyone's calendar, so it needs a day people can plan around." },
  { key: "location",  label: "Location",   gate: "confirmed", kind: "text",
    hint: "Where it happens. \"TBD\" is not a location — that's what Planning is for." },
  { key: "mandatory", label: "Attendance", gate: "confirmed", kind: "bool",
    hint: "Whether the chapter is required to be there. Always answered — the default is optional." },
] as const;

/** The minimum an event must carry for the gate checks to read it. */
export interface GateableEvent {
  title?: string | null;
  category?: string | null;
  /** Either the resolved DTO owner or the raw FK pair — both are accepted. */
  owner?: OwnerRef | undefined;
  ownerBrotherId?: number | null;
  ownerRoleId?: number | null;
  date?: string | null;
  dueDate?: string | null;
  location?: string | null;
  mandatory?: boolean | null;
}

/**
 * Is this required field answered?
 *
 * `owner` reads BOTH shapes deliberately: the service checks a raw DB row
 * (ownerBrotherId / ownerRoleId) while the page checks a mapped DTO (a resolved
 * `owner`), and one gate definition means the two can't disagree about what
 * "owned" means. `ownerNote` is deliberately not consulted.
 */
export function hasRequiredField(event: GateableEvent, key: RequiredField["key"]): boolean {
  switch (key) {
    case "title":    return Boolean(event.title?.trim());
    case "category": return Boolean(event.category?.trim());
    case "owner":
      return Boolean(event.owner) || event.ownerBrotherId != null || event.ownerRoleId != null;
    case "date":     return Boolean(event.date ?? event.dueDate);
    case "location": return Boolean(event.location?.trim());
    // A boolean is always answered — false is a VALUE (attendance optional).
    case "mandatory": return true;
  }
}

/** Which required fields a stage demands — cumulative down the lanes. */
export function fieldsFor(stage: ProgrammingStage): RequiredField[] {
  // Done demands exactly what Confirmed does; what makes it distinct is the
  // route it must arrive by (see needsConfirmFirst), not an extra field.
  const upto = STAGES.indexOf(stage === "done" ? "confirmed" : stage);
  return REQUIRED_FIELDS.filter(f => STAGES.indexOf(f.gate) <= upto);
}

/** The fields this event would still have to answer to sit in `stage`. */
export function missingFor(event: GateableEvent, stage: ProgrammingStage): RequiredField[] {
  return fieldsFor(stage).filter(f => !hasRequiredField(event, f.key));
}

export function canEnter(event: GateableEvent, stage: ProgrammingStage): boolean {
  return missingFor(event, stage).length === 0;
}

/**
 * Done is the one gate that isn't about fields. "Wrapped" means an event
 * happened, and an event the chapter was never told about didn't happen to
 * them. So Done is reachable only from Confirmed.
 */
export function needsConfirmFirst(event: { stage: ProgrammingStage | string }, stage: ProgrammingStage): boolean {
  return stage === "done" && event.stage !== "confirmed";
}

export const isForward = (from: ProgrammingStage, to: ProgrammingStage): boolean =>
  STAGES.indexOf(to) > STAGES.indexOf(from);

export const isPublishedStage = (stage: ProgrammingStage | string): boolean =>
  stage === "confirmed" || stage === "done";

/** The lane after this one, or null from Done. */
export function nextStageOf(stage: ProgrammingStage): ProgrammingStage | null {
  return stage === "idea" ? "planning" : stage === "planning" ? "confirmed" : stage === "confirmed" ? "done" : null;
}

/**
 * A confirmed event whose last day is behind `today` — it happened, and nobody
 * has wrapped it up yet. The LAST day: an all-day schedule's `end` is exclusive,
 * so a Fri–Sun retreat is over once today reaches Monday. A timed event is judged
 * by its start date. `today` is the VIEWER's local date.
 */
export function needsWrapUp(
  task: { stage: string; dueDate: string | null; schedule?: { kind: string; end?: string } | null },
  today: string,
): boolean {
  if (task.stage !== "confirmed") return false;
  const s = task.schedule;
  if (s?.kind === "allDay" && s.end != null) return s.end <= today;
  return task.dueDate != null && task.dueDate < today;
}

/* ── page derivations ──────────────────────────────────────────────────────────── */

/** Structural subset the page derivations read. */
export interface ProgrammingTaskLike {
  id: number;
  dueDate: string | null;
  stage: ProgrammingStage;
  owner: OwnerRef;
  location: string;
  successRating: number | null;
  spendingCents: number;
}

/** Soonest dated, not-done event on or after `today`. Null if none. */
export function nextOnDeckEvent<T extends ProgrammingTaskLike>(tasks: T[], today: string): T | null {
  const upcoming = tasks
    .filter(t => t.stage !== "done" && t.dueDate != null && t.dueDate >= today)
    .sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string));
  return upcoming[0] ?? null;
}

export interface AttentionEntry<T> {
  task: T;
  /** "owner" = an unowned idea; "fields" = a Planning event missing confirm fields. */
  reason: "owner" | "fields";
  /** The named gaps, for "Needs date + location". Empty for `reason: "owner"`. */
  missing: RequiredField[];
  tone: "rose" | "gold";
}

/** An event within this many days is urgent enough to read rose rather than gold. */
const URGENT_WINDOW_DAYS = 14;

/** The confirm-gate fields a Planning event can genuinely still be missing. */
const CONFIRM_GATE_FIELDS = REQUIRED_FIELDS.filter(f => f.key === "date" || f.key === "location");

/**
 * What still stands between each event and its next lane — NAMED, not counted.
 * Confirmed and Done are settled and return nothing; an OWNED idea is
 * unremarkable. Rose is reserved for a gap inside the 14-day window.
 */
export function eventsNeedingAttention<T extends ProgrammingTaskLike>(tasks: T[], today: string): AttentionEntry<T>[] {
  return tasks
    .filter(t => t.stage === "idea" || t.stage === "planning")
    .filter(t => t.dueDate == null || t.dueDate >= today)
    .map((task): AttentionEntry<T> | null => {
      const urgent = task.dueDate != null && daysUntil(task.dueDate, today) <= URGENT_WINDOW_DAYS;
      const tone: "rose" | "gold" = urgent ? "rose" : "gold";
      if (task.stage === "idea") {
        return task.owner ? null : { task, reason: "owner", missing: [], tone };
      }
      const missing = CONFIRM_GATE_FIELDS.filter(f => !hasRequiredField(task, f.key));
      if (missing.length === 0) return null;
      return { task, reason: "fields", missing, tone };
    })
    .filter((e): e is AttentionEntry<T> => e !== null)
    .sort((a, b) => {
      if (a.task.dueDate == null) return b.task.dueDate == null ? 0 : 1;
      if (b.task.dueDate == null) return -1;
      return a.task.dueDate.localeCompare(b.task.dueDate);
    });
}

/** The blocker sentence for an entry: "Needs an owner" / "Needs date + location". */
export function attentionLabel(entry: AttentionEntry<unknown>): string {
  if (entry.reason === "owner") return "Needs an owner";
  return `Needs ${entry.missing.map(f => f.label.toLowerCase()).join(" + ")}`;
}

export interface EventsTermStats {
  total: number;
  byStage: Record<ProgrammingStage, number>;
  next14: number;
  /** Of the next 14 days' events, how many can't be confirmed yet. */
  next14Unready: number;
  avgSuccess: number | null;
  doneCount: number;
  /** How many wrapped events carry a rating — the denominator of `avgSuccess`. */
  ratedCount: number;
  spendCents: number;
  /** What's LIVE — idea + planning + confirmed, excluding Done. */
  liveTotal: number;
  /** Ideas nobody has picked up. */
  unownedIdeas: number;
  ideaCount: number;
}

/** Glance-strip measures over the whole slate. */
export function eventsTermStats(tasks: ProgrammingTaskLike[], today: string): EventsTermStats {
  const byStage: Record<ProgrammingStage, number> = { idea: 0, planning: 0, confirmed: 0, done: 0 };
  for (const t of tasks) byStage[t.stage] = (byStage[t.stage] ?? 0) + 1;

  const horizon = addDays(today, 14);
  const inWindow = tasks.filter(
    t => t.stage !== "done" && t.dueDate != null && t.dueDate >= today && t.dueDate <= horizon,
  );
  // Field-by-field rather than canEnter: title/category are guaranteed on a
  // persisted event and absent from this structural type.
  const next14Unready = inWindow.filter(
    t => !hasRequiredField(t, "owner") || !hasRequiredField(t, "location") || !hasRequiredField(t, "date"),
  ).length;

  const rated = tasks.filter(t => t.stage === "done" && t.successRating != null);
  const avgSuccess = rated.length
    ? rated.reduce((sum, t) => sum + (t.successRating as number), 0) / rated.length
    : null;

  const unownedIdeas = tasks.filter(t => t.stage === "idea" && !hasRequiredField(t, "owner")).length;

  return {
    total: tasks.length,
    byStage,
    next14: inWindow.length,
    next14Unready,
    avgSuccess,
    doneCount: byStage.done,
    ratedCount: rated.length,
    spendCents: tasks.reduce((sum, t) => sum + (t.spendingCents ?? 0), 0),
    liveTotal: byStage.idea + byStage.planning + byStage.confirmed,
    unownedIdeas,
    ideaCount: byStage.idea,
  };
}

/** Planning events with nothing left to collect — a click away from public. */
export function readyToConfirmCount(tasks: (GateableEvent & { stage: ProgrammingStage })[]): number {
  return tasks.filter(e => e.stage === "planning" && canEnter(e, "confirmed")).length;
}

/* ── the briefing ──────────────────────────────────────────────────────────────── */

export const PAGE = {
  title: "The programme.",
  titleParts: ["The ", "programme", "."] as const,
  dayOneParts: ["Events, ", "one step at a time"] as const,
  loading: "Reading the slate…",
  dayOneLine: "Write down an idea, pick who's running it, then give it a date and a place. That's when the whole chapter sees it.",
  nothing: "Nothing scheduled.",
  newIdea: "New idea",
  newEvent: "New event",
  help: "How this board works",
  search: "Search events…",
  views: { board: "Board", calendar: "Calendar" },
} as const;

/** The kicker's second half: the active term, else the org name. */
export function termLabel(semesterLabel: string | null | undefined, orgName: string | null | undefined): string {
  return semesterLabel ?? orgName ?? "ChaptOS";
}

/** A card's compact "when": Today / Tomorrow / "Thu · 5d" / a date, plus its urgency. */
export function cardWhen(dueDate: string | null, today: string): { label: string; tone: "" | "soon" | "today" | "nodate" } {
  if (!dueDate) return { label: "No date yet", tone: "nodate" };
  if (dueDate < today) return { label: shortDate(dueDate), tone: "" };
  const d = daysUntil(dueDate, today);
  if (d === 0) return { label: "Today", tone: "today" };
  if (d === 1) return { label: "Tomorrow", tone: "today" };
  // Inside a week, the weekday plus the gap beats a date you'd have to count.
  if (d <= 7) return { label: `${weekdayShort(dueDate)} · ${d}d`, tone: "soon" };
  return { label: shortDate(dueDate), tone: "" };
}

/** One clause of the status line. `kind` names what it counts, so a tap knows where to go. */
export type StatusBit = { text: string; tone?: "warn"; kind: "wrap" | "ready" | "unowned" };

/**
 * The status line under the greeting — derived clauses, each a count you can go
 * and change. Returns pieces because the counts are tinted and the name bolded.
 */
export function statusBits(
  next: { title: string; dueDate: string | null } | null,
  readyToConfirm: number,
  unownedIdeas: number,
  today: string,
  toWrapUp = 0,
): { lead: { title: string; when: string } | null; bits: StatusBit[] } {
  const bits: StatusBit[] = [];
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
  return weekdayLong(dueDate);
}

/** " is next — Sunday." — the words after the bold title. */
export const leadTail = (when: string): string => ` is next — ${when}.`;

export interface MeasureWords {
  label: string;
  value: string;
  unit?: string;
  note: string;
  warn?: boolean;
  good?: boolean;
}

/** The four glance measures, in page order. */
export function measures(stats: EventsTermStats): MeasureWords[] {
  return [
    {
      label: "On the slate",
      value: String(stats.liveTotal),
      note: `${stats.byStage.idea} ideas · ${stats.byStage.planning} planning · ${stats.byStage.confirmed} confirmed`,
    },
    {
      label: "Next 14 days",
      value: String(stats.next14),
      unit: stats.next14 === 1 ? " event" : " events",
      note: stats.next14Unready > 0 ? `${stats.next14Unready} can't be confirmed yet` : "all confirmed or ready to be",
      warn: stats.next14Unready > 0,
    },
    {
      label: "Unowned ideas",
      value: String(stats.unownedIdeas),
      unit: ` of ${stats.ideaCount}`,
      note: stats.unownedIdeas > 0
        ? "nobody's picked them up"
        : stats.ideaCount > 0 ? "every idea has someone" : "no ideas yet",
      warn: stats.unownedIdeas > 0,
      good: stats.unownedIdeas === 0 && stats.ideaCount > 0,
    },
    {
      label: "Average stars",
      value: stats.avgSuccess != null ? stats.avgSuccess.toFixed(1) : "—",
      unit: stats.avgSuccess != null ? " / 5" : undefined,
      note: stats.ratedCount > 0
        ? `${stats.ratedCount} event${stats.ratedCount === 1 ? "" : "s"} rated`
        : "nothing rated yet",
    },
  ];
}

/** Search over title, place and collab, then the type chips (an empty set is every type). */
export function filterEvents<T extends { title: string; location: string; collab: string | null; category: string }>(
  events: readonly T[], search: string, types: ReadonlySet<string>,
): T[] {
  let list = [...events];
  const q = search.trim().toLowerCase();
  if (q) {
    list = list.filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.location.toLowerCase().includes(q) ||
      (e.collab ?? "").toLowerCase().includes(q),
    );
  }
  if (types.size) list = list.filter(e => types.has(e.category));
  return list;
}

/** Names the filters in force: "Party or Social + “mixer”". */
export function noMatchBits(typeLabels: readonly string[], search: string): string {
  const bits: string[] = [];
  if (typeLabels.length) bits.push(typeLabels.join(" or "));
  if (search.trim()) bits.push(`“${search.trim()}”`);
  return bits.length ? bits.join(" + ") : "this filter";
}

export const NO_MATCH = {
  title: "No events match.",
  lead: (bits: string) => `Nothing on the slate matches ${bits}. All `,
  count: (n: number) => `${n === 1 ? "event is" : "events are"} still there.`,
  clear: "Clear filters",
} as const;

/** The whole no-match sentence, as one string (the app). */
export const noMatchLine = (bits: string, n: number): string => `${NO_MATCH.lead(bits)}${n} ${NO_MATCH.count(n)}`;

/* ── the board ─────────────────────────────────────────────────────────────────── */

export const DONE_LIMIT = 6;

export const BOARD = {
  privateBracket: "Not on the Timeline yet",
  publicBracket: "On the chapter Timeline · everyone sees these",
  laneEmpty: "Nothing here",
  more: (n: number) => `+${n} more wrapped`,
  less: "Show less",
  noOwner: "No owner",
  required: "Required",
} as const;

/** Lanes by stage, Done newest first. */
export function byStage<T extends { stage: ProgrammingStage; dueDate: string | null }>(tasks: readonly T[]): Record<ProgrammingStage, T[]> {
  const map: Record<ProgrammingStage, T[]> = { idea: [], planning: [], confirmed: [], done: [] };
  for (const t of tasks) (map[t.stage] ?? map.idea).push(t);
  map.done.sort((a, b) => (b.dueDate ?? "").localeCompare(a.dueDate ?? ""));
  return map;
}

/** What a card says it still needs, or null when nothing blocks it. */
export function cardBlocker(
  task: GateableEvent & { stage: ProgrammingStage; dueDate: string | null; schedule?: { kind: string; end?: string } | null },
  today: string,
): { text: string; tone: "rose" | "gold" | "ok" } | null {
  if (needsWrapUp(task, today)) return { text: "Happened — wrap it up", tone: "rose" };
  if (task.stage === "done" || task.stage === "confirmed") return null;
  const days = task.dueDate ? daysUntil(task.dueDate, today) : null;
  const tone: "rose" | "gold" = days != null && days <= URGENT_WINDOW_DAYS ? "rose" : "gold";
  if (task.stage === "idea") return task.owner ? null : { text: "Needs an owner", tone };
  const missing = missingFor(task, "confirmed");
  if (missing.length === 0) return { text: "Ready to confirm", tone: "ok" };
  return { text: `Needs ${missing.map(f => f.label.toLowerCase()).join(" + ")}`, tone };
}

/** An idea card is a sticky note, tilted by its id. */
export const ideaTilt = (id: number): number => ((id % 5) - 2) * 1.1;

/** The card's place line: the location, else "w/ collab". */
export const cardPlace = (location: string, collab: string | null): string => location || (collab ? `w/ ${collab}` : "");

/* ── calendar view and timeline ────────────────────────────────────────────────── */

export const CALENDAR = {
  undated: "No date yet",
  dropHint: "Drop one on a day to set its date.",
  notOn: "not on the Timeline",
  on: "on the Timeline",
  today: "Today",
} as const;

/** Undated, not-done events: the calendar's rail. */
export function undatedOf<T extends { dueDate: string | null; stage: ProgrammingStage }>(tasks: readonly T[]): T[] {
  return tasks.filter(t => !t.dueDate && t.stage !== "done");
}

/** The rail's closing line. */
export function undatedFoot(undated: readonly (GateableEvent & { stage: ProgrammingStage })[]): string {
  const ready = undated.filter(t => t.stage === "planning" && missingFor(t, "confirmed").every(f => f.key === "date")).length;
  return undated.length === 0
    ? "Every event on the slate is on the month."
    : ready > 0
      ? `${ready} of these ${ready === 1 ? "is" : "are"} waiting on nothing but a date.`
      : "A date alone won't confirm them — they're missing other fields too.";
}

/** "November 2026". */
export const monthTitle = (year: number, month0: number): string => `${MONTHS_LONG[month0] ?? ""} ${year}`;

export const TIMELINE = {
  label: "On the chapter timeline",
  sub: "what everyone sees",
  count: (n: number) => `${n} published`,
  empty: "Nothing published yet. Confirming an event is what puts it here.",
} as const;

/** Confirmed and Done, by date: what the chapter sees. */
export function publishedOf<T extends { stage: ProgrammingStage; dueDate: string | null }>(tasks: readonly T[]): T[] {
  return tasks
    .filter(t => t.stage === "confirmed" || t.stage === "done")
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
}

/** A ticket's second line. `timeText` is formatEventTime's answer, from the caller. */
export function stubLine(
  t: { stage: ProgrammingStage; dueDate: string | null; successRating: number | null; location: string; schedule?: { kind: string; end?: string } | null },
  today: string,
  timeText: string | null,
): string {
  if (t.stage === "done") return `${t.successRating ? "★".repeat(t.successRating) + " · " : ""}wrapped`;
  if (needsWrapUp(t, today)) return "happened · not wrapped";
  return [timeText, t.location].filter(Boolean).join(" · ");
}

/* ── day one ───────────────────────────────────────────────────────────────────── */

export const DAY_ONE = {
  steps: [
    { title: "1 · Write the idea", sub: "Just a name and a type." },
    { title: "2 · Pick who runs it", sub: "A person, or a role." },
    { title: "3 · Set a date and place", sub: "Now everyone sees it." },
    { title: "4 · Wrap it up", sub: "Stars and a note for next time." },
  ],
  place: "Chapter house",
  onTimeline: "On the Timeline",
  stamp: "Wrapped",
  quote: "“Do it again.”",
  cta: "Write your first idea",
  member: "Nothing planned yet. Your officers will add the first one.",
  memberOwner: "An officer",
  fallbackTitle: "Chapter retreat",
} as const;

/** "Fri, Dec 4": the sample's date, two weeks out. */
export function dayOneWhen(today: string): string {
  const d = addDays(today, 14);
  return `${weekdayShort(d)}, ${shortDate(d)}`;
}

/** Initials of the sample owner's name. */
export function dayOneInitials(owner: string): string {
  return owner.split(/\s+/).filter(Boolean).slice(0, 2).map(w => (w[0] ?? "").toUpperCase()).join("") || "?";
}

/**
 * A few ideas to start from, keyed by the words an org's own category slugs and
 * labels tend to use. Only the categories this org actually has get one.
 */
const STARTER_IDEAS: { match: RegExp; titles: string[] }[] = [
  { match: /social|mixer|party/i,                        titles: ["Alumni mixer", "Game night"] },
  { match: /fund|philanthrop|charity/i,                  titles: ["Bake sale", "Charity 5K"] },
  { match: /service|volunteer|community/i,               titles: ["Food bank shift", "Beach cleanup"] },
  { match: /program|professional|career|academic|educ/i, titles: ["Speaker night", "Study hall"] },
  { match: /rush|recruit/i,                              titles: ["Rush info night"] },
  { match: /brotherhood|sisterhood|bond|retreat/i,       titles: ["Camping trip"] },
];

export function starterIdeas(categories: { slug: string; label: string; color?: string | null }[]) {
  const out: { title: string; category: string; color: string | null }[] = [];
  for (const c of categories) {
    const hit = STARTER_IDEAS.find(s => s.match.test(c.slug) || s.match.test(c.label));
    for (const title of hit?.titles ?? []) out.push({ title, category: c.slug, color: c.color ?? null });
  }
  return out.slice(0, 6);
}

/* ── help ──────────────────────────────────────────────────────────────────────── */

/** What entering this lane costs, in words, or null when it costs no new field. */
function costOf(stage: ProgrammingStage): string | null {
  const own = REQUIRED_FIELDS.filter(f => f.gate === stage && f.kind !== "bool");
  if (own.length === 0) return null;
  const names = own.map(f => f.label.toLowerCase());
  return names.length === 1
    ? `A ${names[0]}.`
    : `A ${names.slice(0, -1).join(", a ")} and a ${names[names.length - 1]}.`;
}

export const HELP = {
  title: "How this board works",
  lead: "Four lanes. Each one costs something to enter and buys something in return.",
  /** "Only **Confirmed** and **Done** appear on …": [before, bold, mid, bold, after]. */
  foot: ["Only ", "Confirmed", "and", "Done", "appear on the chapter's timeline. Ideas and plans stay on this board until somebody confirms them."] as const,
} as const;

/** The help screen's four rows, computed from the rules themselves. */
export function helpRows(): { stage: ProgrammingStage; label: string; meaning: string; cost: string }[] {
  return STAGES.map(s => ({
    stage: s,
    label: STAGE_LABELS[s],
    meaning: STAGE_MEANINGS[s],
    cost: costOf(s) ?? (s === "done"
      ? "Nothing new — but it has to come from Confirmed. How it went is asked when you wrap it up."
      : "Nothing."),
  }));
}

/* ── the panel ─────────────────────────────────────────────────────────────────── */

export const PANEL = {
  edit: "Edit",
  delete: "Delete",
  close: "Close event details",
  noDate: "No date set",
  unowned: "Unowned",
  giveOwner: "Give it an owner",
  onTimeline: "On the chapter Timeline",
  offTimeline: "Not visible to the Timeline yet",
  wrapStamp: "WRAPPED",
  wrapK: "Wrap-up",
  notRated: "Not rated",
  noNotes: "No review notes.",
  required: "Required",
  gates: "Gates the board",
  optional: "Optional",
  never: "Never blocks",
  noOptional: "Nothing optional on this event. Attach a field below.",
  notSet: "Not set",
  fieldNote: "This event only — other events keep what they collect. Add, rename or reorder fields in Settings.",
  newField: "New field",
  spending: "Spending",
  spendingNote: "Manual total — linked transactions are tracked separately below.",
  linked: "Linked Transactions",
  logTx: "+ Log transaction",
  loadingTx: "Loading…",
  noTx: "No transactions linked to this event yet.",
  totalExpenses: "Total expenses",
  yes: "Yes",
  no: "No",
} as const;

/** "Nov 22 · 6:30 PM · Hall B · w/ Career Center". `timeText` from formatEventTime. */
export function whenLine(e: { dueDate: string | null; location: string; collab: string | null }, timeText: string | null): string {
  return `${e.dueDate ? shortDate(e.dueDate) : PANEL.noDate}${timeText ? ` · ${timeText}` : ""}${e.location ? ` · ${e.location}` : ""}${e.collab ? ` · w/ ${e.collab}` : ""}`;
}

/** The required list the panel shows: what the next gate checks. */
export const panelRequired = (stage: ProgrammingStage): RequiredField[] =>
  fieldsFor(stage === "idea" ? "planning" : "confirmed");

/** The lane the panel's gate bar is about. */
/**
 * Whether an optional field has an answer. Three of the built-ins are backed by real
 * columns rather than fieldValues, so a naive fieldValues lookup would report a filled
 * description as empty and the counter would drift from what the rows show.
 */
export function hasOptionalAnswer(
  event: { description?: string | null; collab: string | null; attachmentUrl?: string | null; attachmentDocId?: number | null; fieldValues?: Record<string, unknown> | null },
  def: { slug: string },
): boolean {
  if (def.slug === "description") return Boolean(event.description?.trim());
  if (def.slug === "cohost") return Boolean(event.collab?.trim());
  if (def.slug === "attachment") return Boolean(event.attachmentUrl || event.attachmentDocId != null);
  const v = event.fieldValues?.[def.slug];
  if (v == null || v === "") return false;
  // A boolean is answered by existing; `false` is a value, not an empty.
  return true;
}

export const gateTargetOf = (stage: ProgrammingStage): ProgrammingStage => (stage === "idea" ? "planning" : "confirmed");

export const attendanceText = (mandatory: boolean): string =>
  mandatory ? "Required of every member" : "Optional — no attendance taken";

/** A required row's empty value. */
export function requiredEmpty(stage: ProgrammingStage, field: RequiredField): string {
  return stage === "done"
    ? "Never recorded"
    : `Needed to ${field.gate === "planning" ? "start planning" : field.gate === "confirmed" ? "confirm" : "save"}`;
}

/** The toast a locked field answers a tap with. */
export function lockedFieldToast(label: string, done: boolean): string {
  return done
    ? `${label} is part of the record now — a wrapped event can't be edited.`
    : `${label} is locked while the chapter can see this event.`;
}
export const LOCKED_ACTION = "Move to Planning";

/**
 * The stage line under the ladder, as its parts. The web lays these out with
 * the missing fields as buttons; the app joins them.
 */
export interface StageSay {
  label: string;
  meaning: string;
  /** "Needs owner and date to reach Confirmed." — the fields, lowercased, and the lane. */
  gap: { fields: { key: RequiredField["key"]; label: string }[]; next: string } | null;
  ready: string | null;
  /** Confirmed: the locked note, with its link in the middle. */
  locked: boolean;
  done: string | null;
  confirmFirst: boolean;
}

export const STAGE_SAY = {
  ready: "Ready to confirm — that publishes it to the chapter.",
  canMove: (next: string) => `Can move to ${next}.`,
  lockedBefore: "Fields are locked while it's published —",
  lockedLink: "move it back to Planning",
  lockedAfter: "to change them.",
  done: "Fields are part of the record now and can't be changed.",
  confirmFirst: "Wrapping up comes after confirming",
  confirmFirstTail: "— the chapter has to have seen it first.",
} as const;

export function stageSay(event: GateableEvent & { stage: ProgrammingStage }): StageSay {
  const next = nextStageOf(event.stage);
  const missing = next ? missingFor(event, next) : [];
  const at = STAGES.indexOf(event.stage);
  return {
    label: STAGE_LABELS[event.stage],
    meaning: STAGE_MEANINGS[event.stage],
    gap: next && missing.length > 0
      ? { fields: missing.map(f => ({ key: f.key, label: f.label.toLowerCase() })), next: STAGE_LABELS[next] }
      : null,
    ready: next && missing.length === 0 && event.stage === "planning" ? STAGE_SAY.ready : null,
    locked: event.stage === "confirmed",
    done: event.stage === "done" ? STAGE_SAY.done : null,
    confirmFirst: needsConfirmFirst(event, "done") && at < STAGES.indexOf("done"),
  };
}

/** The other "can move" clause: an owned idea. */
export function stageCanMove(event: GateableEvent & { stage: ProgrammingStage }): string | null {
  const next = nextStageOf(event.stage);
  if (!next || event.stage === "confirmed" || event.stage === "planning") return null;
  return missingFor(event, next).length === 0 ? STAGE_SAY.canMove(STAGE_LABELS[next]) : null;
}

/** Is a ladder step locked (ahead, and not enterable)? */
export function stepLocked(event: GateableEvent & { stage: ProgrammingStage }, s: ProgrammingStage): boolean {
  return STAGES.indexOf(s) > STAGES.indexOf(event.stage) && (!canEnter(event, s) || needsConfirmFirst(event, s));
}

/** The panel foot: what it says and, when it can act, the button. */
export function gateBar(
  event: GateableEvent & { stage: ProgrammingStage; successRating: number | null },
): { ready: boolean; text: string; go: { label: string; stage?: ProgrammingStage; field?: RequiredField["key"] } | null } {
  if (event.stage === "done") {
    return { ready: true, text: `Wrapped${event.successRating != null ? ` · rated ${event.successRating}/5` : ""}.`, go: null };
  }
  if (event.stage === "confirmed") return { ready: true, text: "Confirmed and published to the chapter.", go: null };
  const target = gateTargetOf(event.stage);
  const missing = missingFor(event, target);
  const first = missing[0];
  if (!first) {
    return {
      ready: true,
      text: event.stage === "idea" ? "Owned — it can move into Planning." : "Everything's filled — confirming publishes it.",
      go: { label: event.stage === "idea" ? "Start planning" : "Confirm & publish", stage: target },
    };
  }
  return {
    ready: false,
    text: `Needs ${missing.map(f => f.label.toLowerCase()).join(" and ")} to ${event.stage === "idea" ? "start planning" : "confirm"}.`,
    go: { label: first.key === "owner" ? "Add an owner" : `Add ${first.label.toLowerCase()}`, field: first.key },
  };
}

/* ── steps ─────────────────────────────────────────────────────────────────────── */

export const RATING_LABELS: Record<number, string> = { 1: "Rough", 2: "Okay", 3: "Good", 4: "Great", 5: "Legendary" };
export const MAX_WRAP_NOTES = 500;

export const WRAP = {
  title: "Wrap it up",
  sub: "Nothing here is required — but this is the one moment anybody still remembers how it went.",
  eventK: "Event:",
  how: "How did it go?",
  noRating: "No rating yet",
  notes: "Anything worth remembering next time?",
  notesPh: "What worked, what to do differently, who to call again.",
  spent: "Spent",
  spentHint: "optional · the manual total",
  leave: (stage: ProgrammingStage) => `Leave in ${STAGE_LABELS[stage]}`,
  go: "Mark it done",
  saving: "Saving…",
  star: (n: number) => `${n} star${n > 1 ? "s" : ""} — ${RATING_LABELS[n] ?? ""}`,
} as const;

export interface FixCopy { kicker: string; sub: string; go: string; cancel: string }

export function fixCopy(stage: ProgrammingStage): FixCopy {
  if (stage === "planning") {
    return {
      kicker: "One step to start planning",
      sub: "Planning means somebody is accountable for this. That's all it costs.",
      go: "Start planning",
      cancel: "Leave as an idea",
    };
  }
  if (stage === "confirmed") {
    return {
      kicker: "One step to confirm",
      sub: "Confirming publishes this to the whole chapter's calendar, so it needs a day and a place people can plan around.",
      go: "Confirm & publish",
      cancel: "Leave in Planning",
    };
  }
  return {
    kicker: `One step to ${STAGE_LABELS[stage].toLowerCase()}`,
    sub: "This lane needs a little more first.",
    go: `Move to ${STAGE_LABELS[stage]}`,
    cancel: "Cancel",
  };
}

export const FIX = {
  answered: "Answered",
  allClear: "All clear",
  left: (n: number) => `${n} left`,
  pickType: "Pick a type…",
  titlePh: "What to call it",
  placePh: "Where it happens",
  saving: "Saving…",
} as const;

export const DEMOTE = {
  title: "Move it off the Timeline?",
  from: (dueDate: string | null) => (dueDate ? shortDate(dueDate) : "its date"),
  /** "<b>title</b> is on the chapter's timeline for <b>from</b>. Moving it to …". */
  mid: " is on the chapter's timeline for ",
  tail: (date: string) => `. Moving it to ${weekdayLong(date)}, ${shortDate(date)} takes it back to Planning first — confirm it again once the new date's right.`,
  keep: (from: string) => `Keep ${from}`,
  go: (date: string) => `Move to Planning · ${shortDate(date)}`,
  moving: "Moving…",
} as const;

export const IDEA = {
  title: "New idea",
  sub: "Lands in Idea — nobody owns it yet, so it won't publish to the Timeline or the calendar. Just enough to hold the thought.",
  /** The same, as the web lays it out: "Lands in **Idea** — nobody …". */
  subParts: ["Lands in ", "Idea", "— nobody owns it yet, so it won't publish to the Timeline or the calendar. Just enough to hold the thought."] as const,
  titleK: "Title",
  titlePh: "Speaker series, beach cleanup, rush info night…",
  categoryK: "Category",
  preview: "Your idea",
  noDate: "No date yet",
  needsOwner: "Needs an owner",
  cancel: "Cancel",
  go: "Add idea",
  adding: "Adding…",
} as const;

/** What the composer still wants, or "Ready". */
export function ideaRemain(title: string, category: string): string {
  const t = !!title.trim();
  const c = !!category;
  return t && c ? "Ready" : !t && !c ? "Needs a title + a category" : !t ? "Needs a title" : "Needs a category";
}

/* ── toasts and confirms ───────────────────────────────────────────────────────── */

export const SAY = {
  ideaAdded: (title: string) => `“${title}” is on the board as an idea.`,
  confirmFirst: (title: string) => `“${title}” hasn’t been confirmed — the chapter has to have seen it before it can be wrapped.`,
  confirmIt: "Confirm it",
  penciled: (title: string, date: string, miss?: string) =>
    miss ? `“${title}” is penciled in for ${shortDate(date)} — still needs ${miss}.` : `“${title}” is penciled in for ${shortDate(date)}.`,
  demoted: (title: string, date: string) => `“${title}” came off the Timeline — back in Planning for ${shortDate(date)}.`,
  deleteTitle: "Delete this event?",
  deleteMessage: (title: string, dated: boolean) => `"${title}" will be removed from programming${dated ? " and the timeline" : ""}.`,
  deleteGo: "Delete",
  cancel: "Cancel",
  loadFail: "Could not load programming events.",
  saveFail: "Could not save changes.",
  moveFail: "Could not move event.",
  createFail: "Could not create event.",
  ideaFail: "Could not add the idea.",
  deleteFail: "Could not delete event.",
} as const;
