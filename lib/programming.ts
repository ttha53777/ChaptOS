import type { Schedule } from "@/lib/calendar-feed/schedule";
import type { TaskStatus } from "@/app/data";
import type { FieldValues } from "@/lib/event-fields";
import { resolveOwner, type OwnerRef, type OwnerRow } from "@/lib/event-owner";
import type { ProgrammingStage } from "@/lib/state/programming-stage";

/**
 * Which of an org's CalendarEventType rows the Programming (events) page
 * manages. No fixed category list anymore — programming runs on the org's own
 * event types: everything creatable from the timeline, Chapter and Party
 * included (a confirmed Party gets its ledger on the Parties page, the same
 * way a Service event gets its sign-up sheet). Deadlines fall out via
 * `creatable: false`. Covers built-ins and customs alike, so an org's added
 * types flow through the pipeline.
 *
 * `hidden` types stay managed: a retired type's existing events must keep
 * listing on the board — creation-time gating is the service's job.
 */
export interface ProgrammingTypeLike {
  slug: string;
  creatable: boolean;
}

export function isProgrammingManagedType(type: ProgrammingTypeLike): boolean {
  return type.creatable;
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
  schedule?: unknown;
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
  schedule?: Schedule | null;
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
  /**
   * Slugs THIS event has opted out of, from the org's enabled set. The sheet
   * subtracts these to get the fields it renders; the pill row needs them to
   * show which are attached, so they travel on the DTO rather than being
   * resolved away server-side.
   */
  detachedFields: string[];
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
  detachedFields: string[] = [],
): ProgrammingTaskDto {
  const { title, collab } = resolveProgrammingDisplay({
    title: row.title,
    collabOrg: row.collabOrg,
  });
  return {
    id:              row.id,
    title,
    schedule: row.schedule as Schedule | null,
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
    detachedFields,
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

// ─── The lane gates and page derivations ─────────────────────────────────────
// Moved to lib/programme/board.ts — a pure module the app shares — and
// re-exported here so server and web importers didn't move.
export {
  REQUIRED_FIELDS, hasRequiredField, fieldsFor, missingFor, canEnter, needsConfirmFirst,
  needsWrapUp, nextOnDeckEvent, eventsNeedingAttention, attentionLabel, eventsTermStats,
} from "@/lib/programme/board";
export type {
  RequiredField, GateableEvent, ProgrammingTaskLike, AttentionEntry, EventsTermStats,
} from "@/lib/programme/board";

/** What /api/auth/me ships per wrap-up candidate — just enough to name it and judge it. */
export interface WrapUpCandidate {
  id: number;
  title: string;
  dueDate: string | null;
  schedule: Schedule | null;
  stage: "confirmed";
}
