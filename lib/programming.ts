import type { TaskStatus } from "@/app/data";
import type { FieldValues } from "@/lib/event-fields";
import { resolveOwner, type OwnerRef, type OwnerRow } from "@/lib/event-owner";
import { STAGES, type ProgrammingStage } from "@/lib/state/programming-stage";

/**
 * Which of an org's CalendarEventType rows the Programming (events) page
 * manages. No fixed category list anymore — programming runs on the org's own
 * event types: everything creatable from the timeline except Chapter (owned by
 * the meetings workflow). Party/deadline fall out via `creatable: false`
 * (they're synthesized from their own pages). Covers built-ins (service) and
 * customs alike, so an org's added types flow through the pipeline.
 *
 * `hidden` types stay managed: a retired type's existing events must keep
 * listing on the board — creation-time gating is the service's job.
 */
export interface ProgrammingTypeLike {
  slug: string;
  creatable: boolean;
}

export function isProgrammingManagedType(type: ProgrammingTypeLike): boolean {
  return type.creatable && type.slug !== "chapter";
}

/** slug → display label lookup, with the slug itself as the fallback. */
export function makeLabelResolver(types: readonly { slug: string; label: string }[]): (slug: string) => string {
  const bySlug = new Map(types.map(t => [t.slug, t.label]));
  return slug => bySlug.get(slug) ?? slug;
}

/** Stored title suffix when a programming event has a collab org (legacy rows). */
const COLLAB_TITLE_RE = /^(.+?) × \((.+)\)$/;

export function parseProgrammingTitle(stored: string): { title: string; collab: string | null } {
  const match = stored.match(COLLAB_TITLE_RE);
  if (!match) return { title: stored, collab: null };
  return { title: match[1].trim(), collab: match[2].trim() };
}

/** Resolve display title + collab from row fields (prefers collabOrg column). */
export function resolveProgrammingDisplay(row: { title: string; collabOrg?: string | null }) {
  const collab = row.collabOrg?.trim() || parseProgrammingTitle(row.title).collab;
  const title  = row.collabOrg?.trim()
    ? row.title.trim()
    : parseProgrammingTitle(row.title).title;
  return { title, collab: collab || null };
}

/** A ProgrammingEvent row (now the owning record) as selected by the service. */
export interface ProgrammingTaskRow extends OwnerRow {
  id: number;
  title: string;
  date: string | null;
  location: string | null;
  time: string | null;
  status: string;
  stage: string;
  category: string;
  mandatory: boolean;
  description: string | null;
  collabOrg: string;
  ownerNote: string | null;
  attachmentUrl: string | null;
  attachmentDocId: number | null;
  spendingCents: number;
  successRating: number | null;
  wrapUpNotes: string | null;
  calendarEventId: number | null;
  _count?: { docs: number };
}

export interface ProgrammingTaskDto {
  id: number;
  title: string;
  dueDate: string | null;
  location: string;
  time: string | null;
  status: TaskStatus;
  /** The CalendarEventType slug — the stable identifier the API speaks. */
  category: string;
  /** Display label resolved from the org's event types (falls back to the slug). */
  type: string;
  stage: ProgrammingStage;
  mandatory: boolean;
  collab: string | null;
  /** Resolved person-or-role owner; null when the event is unowned. */
  owner: OwnerRef;
  /**
   * A pre-migration free-text owner that matched no roster row. Read-only and
   * surfaced only so nobody's note is silently lost; it is NOT an owner and does
   * not satisfy the Planning gate. Dropped in a follow-up once re-owned by hand.
   */
  ownerNote: string | null;
  description: string | null;
  attachmentUrl: string | null;
  attachmentDocId: number | null;
  /** Answers to the org's optional fields, already sanitized against live defs. */
  fieldValues: FieldValues;
  spendingCents: number;
  successRating: number | null;
  wrapUpNotes: string | null;
  calendarEventId?: number | null;
}

/**
 * Map a ProgrammingEvent row to the task shape the Programming page expects.
 *
 * `nameFor` resolves a brotherId to this org's name for that person; `values`
 * is the row's fieldValues already run through sanitizeFieldValues (which needs
 * the org's live definitions, so the service does it and passes the result in —
 * this module stays pure).
 */
export function toProgrammingTask(
  row: ProgrammingTaskRow,
  labelFor: (slug: string) => string,
  nameFor: (brotherId: number) => string | null,
  values: FieldValues,
): ProgrammingTaskDto {
  const { title, collab } = resolveProgrammingDisplay({
    title: row.title,
    collabOrg: row.collabOrg,
  });
  return {
    id:              row.id,
    title,
    dueDate:         row.date,
    location:        row.location ?? "",
    time:            row.time ?? null,
    status:          (row.status ?? "Upcoming") as TaskStatus,
    category:        row.category,
    type:            labelFor(row.category),
    stage:           row.stage as ProgrammingStage,
    mandatory:       row.mandatory ?? false,
    collab,
    owner:           resolveOwner(row, nameFor),
    ownerNote:       row.ownerNote ?? null,
    description:     row.description ?? null,
    attachmentUrl:   row.attachmentUrl ?? null,
    attachmentDocId: row.attachmentDocId ?? null,
    fieldValues:     values,
    spendingCents:   row.spendingCents ?? 0,
    successRating:   row.successRating ?? null,
    wrapUpNotes:     row.wrapUpNotes ?? null,
    calendarEventId: row.calendarEventId ?? null,
  };
}

export interface ProgrammingTaskInput {
  title:    string;
  dueDate?: string | null;
  location?: string | null;
  time?:    string | null;
  collab?:  string | null;
  /** Owner is set by id, either a roster member or a role — never a name string. */
  ownerBrotherId?: number | null;
  ownerRoleId?: number | null;
  status?:  string;
  /** CalendarEventType slug — validated against the org's rows in the service. */
  category: string;
  mandatory?: boolean;
}

function optionalTime(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Map form/API input to ProgrammingEvent create fields (always starts at Idea). */
export function fromProgrammingInput(input: ProgrammingTaskInput) {
  return {
    title:     input.title.trim(),
    date:      optionalTime(input.dueDate),
    location:  input.location?.trim() || null,
    time:      optionalTime(input.time),
    status:    input.status ?? "Upcoming",
    category:  input.category,
    stage:     "idea",
    mandatory: input.mandatory ?? false,
    ownerBrotherId: input.ownerBrotherId ?? null,
    ownerRoleId:    input.ownerRoleId ?? null,
    collabOrg: input.collab?.trim() ?? "",
  };
}

/** Calendar-relevant subset of a programming row, for mirroring to CalendarEvent. */
export function toCalendarFields(row: {
  title: string;
  collabOrg: string;
  date: string | null;
  location: string | null;
  time: string | null;
  description: string | null;
  status: string;
  category: string;
  mandatory: boolean;
}) {
  const { title } = resolveProgrammingDisplay({ title: row.title, collabOrg: row.collabOrg });
  return {
    title,
    date:        row.date ?? "",
    location:    row.location,
    time:        row.time,
    description: row.description,
    status:      row.status,
    category:    row.category,
    mandatory:   row.mandatory,
  };
}

// ─── The lane gates ─────────────────────────────────────────────────────────
// An event's readiness IS its own fields. There is no separate prep list; what
// gates a lane is whether the event can answer the questions that lane implies.
//
// This replaced four booleans (roomStatus / flyerPosted / socialsMeeting /
// itineraryNotNeeded) that were one org's ops list applied to every org on the
// platform, and that were self-attested besides — "flyer posted" is true because
// somebody clicked it. A date and a location are facts, and Confirmed publishes
// to the whole chapter's calendar, so that is what it should cost.

export interface RequiredField {
  key: "title" | "category" | "owner" | "date" | "location" | "mandatory";
  label: string;
  /** The earliest lane that demands this field. */
  gate: ProgrammingStage;
  /**
   * Which editor satisfies it. Lets the fix-step build itself from this table
   * instead of switching on `key`, and lets the help screen drop `bool` — see
   * `hint` below for why that matters.
   */
  kind: "text" | "type" | "person" | "date" | "bool";
  /** One line on why the lane asks for this. Shown in the fix-step. */
  hint: string;
}

/**
 * The required set, in gate order. Each lane boundary now costs something and
 * buys something:
 *
 *   Idea      title + category   — belongs to the chapter
 *   Planning  + an owner         — belongs to SOMEBODY
 *   Confirmed + date + location  — locked in, and PUBLISHED to the Timeline
 *   Done      (through Confirmed) — wrapped
 *
 * "+ an owner" is what makes Idea→Planning a real decision rather than a
 * decorative drag: before this, Planning already published to the chapter and
 * already required a date, so the two lanes meant the same thing.
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
 * `owner`), and having one gate definition means the two can't drift into
 * disagreeing about what "owned" means. `ownerNote` is deliberately not consulted
 * — a pre-migration string that matched nobody is a note, not an owner.
 */
export function hasRequiredField(event: GateableEvent, key: RequiredField["key"]): boolean {
  switch (key) {
    case "title":    return Boolean(event.title?.trim());
    case "category": return Boolean(event.category?.trim());
    case "owner":
      return Boolean(event.owner) || event.ownerBrotherId != null || event.ownerRoleId != null;
    case "date":     return Boolean(event.date ?? event.dueDate);
    case "location": return Boolean(event.location?.trim());
    // A boolean is always answered — false is a VALUE (attendance optional), not
    // an empty. Checking truthiness here would make every optional-attendance
    // event unconfirmable.
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
 * Done is the one gate that isn't about fields, so missingFor() can't state it.
 *
 * A complete Planning event already satisfies every FIELD Confirmed needs, so
 * without this guard the stage control takes it straight to Done — publishing it
 * to the chapter Timeline (Done publishes too) with a toast that only says
 * "wrapped". Nobody is ever told the chapter can now see it.
 *
 * "Wrapped" means an event happened, and an event the chapter was never told
 * about didn't happen to them. So Done is reachable only from Confirmed.
 */
export function needsConfirmFirst(event: { stage: ProgrammingStage | string }, stage: ProgrammingStage): boolean {
  return stage === "done" && event.stage !== "confirmed";
}

// ─── Page derivations (on-deck hero, attention rail, glance strip) ───────────
// Pure helpers over the task list the events page already holds. The page passes
// `today` (todayStr()) so these stay deterministic and unit-testable.

/**
 * Structural subset these helpers actually read — satisfied by both ProgrammingTaskDto
 * and the page's ProgrammingTask (whose `time` is `string | null | undefined`, so we
 * deliberately don't depend on it here).
 */
export interface ProgrammingTaskLike {
  id: number;
  dueDate: string | null;
  stage: ProgrammingStage;
  owner: OwnerRef;
  location: string;
  successRating: number | null;
  spendingCents: number;
}

/** Soonest dated, not-done event on or after `today`. Null if none (hero hides). */
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
 *
 * Ported from the mock's `blocker()`. Two rules that are easy to get wrong:
 *
 *  - **Confirmed and Done are settled** and return nothing. They are published;
 *    there is no gap left to name, and printing "published to the chapter" on
 *    every one of them buries the cards that do need a person.
 *  - **An OWNED idea is unremarkable.** An idea is allowed to sit unscheduled
 *    indefinitely — that is what a backlog is for. The only thing worth saying
 *    about one is that nobody has picked it up.
 *
 * Unlike the prep version this replaced, a dateless event still appears: an
 * unowned idea with no date is exactly the card that goes stale unnoticed. Rose
 * is reserved for a gap inside the 14-day window, where it is about to matter.
 */
export function eventsNeedingAttention<T extends ProgrammingTaskLike>(tasks: T[], today: string): AttentionEntry<T>[] {
  return tasks
    .filter(t => t.stage === "idea" || t.stage === "planning")
    .filter(t => t.dueDate == null || t.dueDate >= today)
    .map((task): AttentionEntry<T> | null => {
      const urgent = task.dueDate != null && daysBetween(today, task.dueDate) <= URGENT_WINDOW_DAYS;
      const tone: "rose" | "gold" = urgent ? "rose" : "gold";
      if (task.stage === "idea") {
        return task.owner ? null : { task, reason: "owner", missing: [], tone };
      }
      // Only the two confirm-gate fields a Planning event can actually be
      // missing. title/category are guaranteed on a persisted event and absent
      // from this structural type, so the full missingFor would name them every
      // time; `mandatory` is always answered.
      const missing = CONFIRM_GATE_FIELDS.filter(f => !hasRequiredField(task, f.key));
      if (missing.length === 0) return null;
      return { task, reason: "fields", missing, tone };
    })
    .filter((e): e is AttentionEntry<T> => e !== null)
    .sort((a, b) => {
      // Dated first (soonest wins); undated ideas sort last — they're real, but
      // nothing about them is late yet.
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
  /**
   * Of the next 14 days' events, how many can't be confirmed yet. Replaces
   * `next14NeedRoom` — same job (what's about to be late), but measured against
   * fields the org actually agreed matter rather than one org's room-booking form.
   */
  next14Unready: number;
  avgSuccess: number | null;
  doneCount: number;
  spendCents: number;
}

/** Glance-strip measures over the whole slate. */
export function eventsTermStats(tasks: ProgrammingTaskLike[], today: string): EventsTermStats {
  const byStage: Record<ProgrammingStage, number> = { idea: 0, planning: 0, confirmed: 0, done: 0 };
  for (const t of tasks) byStage[t.stage] = (byStage[t.stage] ?? 0) + 1;

  const horizon = addDays(today, 14);
  const inWindow = tasks.filter(
    t => t.stage !== "done" && t.dueDate != null && t.dueDate >= today && t.dueDate <= horizon,
  );
  // Checked field-by-field rather than through canEnter: a ProgrammingTaskLike
  // carries only what the page holds, and title/category are guaranteed present
  // on any persisted event — running the full gate here would count every event
  // as unready because those two keys are absent from the structural type.
  const next14Unready = inWindow.filter(
    t => !hasRequiredField(t, "owner") || !hasRequiredField(t, "location") || !hasRequiredField(t, "date"),
  ).length;

  const rated = tasks.filter(t => t.stage === "done" && t.successRating != null);
  const avgSuccess = rated.length
    ? rated.reduce((sum, t) => sum + (t.successRating as number), 0) / rated.length
    : null;

  return {
    total: tasks.length,
    byStage,
    next14: inWindow.length,
    next14Unready,
    avgSuccess,
    doneCount: byStage.done,
    spendCents: tasks.reduce((sum, t) => sum + (t.spendingCents ?? 0), 0),
  };
}

/** Add `n` days to a YYYY-MM-DD string, returning YYYY-MM-DD (UTC-safe). */
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, both YYYY-MM-DD (UTC-safe; negative = past). */
function daysBetween(from: string, to: string): number {
  const ms = new Date(to + "T00:00:00Z").getTime() - new Date(from + "T00:00:00Z").getTime();
  return Math.round(ms / 86_400_000);
}
