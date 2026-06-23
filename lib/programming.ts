import type { ProgrammingChecklistItem, TaskStatus } from "@/app/data";
import { fmtDate } from "@/app/data";
import type { RoomStatus } from "@/lib/state/programming-prep";
import type { ProgrammingStage } from "@/lib/state/programming-stage";

/** Calendar categories managed by the Programming (events) workflow page. */
export const PROGRAMMING_CATEGORIES = ["program", "social", "fundy", "service"] as const;
export type ProgrammingCategory = (typeof PROGRAMMING_CATEGORIES)[number];

export const PROGRAMMING_TYPE_LABELS = ["Program", "Social", "Fundraiser", "Community Service"] as const;
export type ProgrammingTypeLabel = (typeof PROGRAMMING_TYPE_LABELS)[number];

const TYPE_TO_CATEGORY: Record<ProgrammingTypeLabel, ProgrammingCategory> = {
  Program:            "program",
  Social:             "social",
  Fundraiser:         "fundy",
  "Community Service": "service",
};

const CATEGORY_TO_TYPE: Record<ProgrammingCategory, ProgrammingTypeLabel> = {
  program: "Program",
  social:  "Social",
  fundy:   "Fundraiser",
  service: "Community Service",
};

export function isProgrammingCategory(category: string): category is ProgrammingCategory {
  return (PROGRAMMING_CATEGORIES as readonly string[]).includes(category);
}

export function typeLabelToCategory(type: string): ProgrammingCategory {
  const cat = TYPE_TO_CATEGORY[type as ProgrammingTypeLabel];
  if (!cat) throw new Error(`Unknown programming type: ${type}`);
  return cat;
}

export function categoryToTypeLabel(category: string): ProgrammingTypeLabel {
  if (!isProgrammingCategory(category)) throw new Error(`Not a programming category: ${category}`);
  return CATEGORY_TO_TYPE[category];
}

/** Stored title suffix when a programming event has a collab org (legacy rows). */
const COLLAB_TITLE_RE = /^(.+?) × \((.+)\)$/;

export function formatProgrammingTitle(title: string, collab?: string | null): string {
  const base = title.trim();
  const org = collab?.trim();
  if (!org) return base;
  return `${base} × (${org})`;
}

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

/** Meta line shown on programming cards (type · location · time · date). */
export function programmingTaskMeta(task: {
  type?: string;
  location: string;
  time?: string | null;
  dueDate: string | null;
}): string {
  return [task.type, task.location, task.time, task.dueDate ? fmtDate(task.dueDate) : null]
    .filter(Boolean)
    .join(" · ");
}

/** A ProgrammingEvent row (now the owning record) as selected by the service. */
export interface ProgrammingTaskRow {
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
  owner: string;
  itineraryUrl: string | null;
  attachmentUrl: string | null;
  attachmentDocId: number | null;
  roomStatus: string;
  itineraryNotNeeded?: boolean;
  flyerPosted: boolean;
  socialsMeeting: boolean;
  spendingCents: number;
  successRating: number | null;
  wrapUpNotes: string | null;
  calendarEventId: number | null;
  _count?: { docs: number };
  checklist?: { id: number; label: string; done: boolean; sortOrder: number }[];
}

export interface ProgrammingTaskDto {
  id: number;
  title: string;
  dueDate: string | null;
  location: string;
  time: string | null;
  status: TaskStatus;
  type: string;
  stage: ProgrammingStage;
  mandatory: boolean;
  collab: string | null;
  owner: string;
  description: string | null;
  attachmentUrl: string | null;
  attachmentDocId: number | null;
  roomStatus: RoomStatus;
  itineraryNotNeeded: boolean;
  flyerPosted: boolean;
  socialsMeeting: boolean;
  spendingCents: number;
  successRating: number | null;
  wrapUpNotes: string | null;
  checklist: ProgrammingChecklistItem[];
  calendarEventId?: number | null;
}

/** Map a ProgrammingEvent row to the task shape the Programming page expects. */
export function toProgrammingTask(row: ProgrammingTaskRow): ProgrammingTaskDto {
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
    type:            categoryToTypeLabel(row.category),
    stage:           row.stage as ProgrammingStage,
    mandatory:       row.mandatory ?? false,
    collab,
    owner:           row.owner ?? "",
    description:     row.description ?? null,
    attachmentUrl:   row.attachmentUrl ?? null,
    attachmentDocId: row.attachmentDocId ?? null,
    roomStatus:      (row.roomStatus ?? "not_submitted") as RoomStatus,
    itineraryNotNeeded: row.itineraryNotNeeded ?? false,
    flyerPosted:     row.flyerPosted ?? false,
    socialsMeeting:  row.socialsMeeting ?? false,
    spendingCents:   row.spendingCents ?? 0,
    successRating:   row.successRating ?? null,
    wrapUpNotes:     row.wrapUpNotes ?? null,
    checklist:       (row.checklist ?? []).map(c => ({
      id: c.id, label: c.label, done: c.done, sortOrder: c.sortOrder,
    })),
    calendarEventId: row.calendarEventId ?? null,
  };
}

export interface ProgrammingTaskInput {
  title:    string;
  dueDate?: string | null;
  location?: string | null;
  time?:    string | null;
  collab?:  string | null;
  owner?:   string;
  status?:  string;
  type:     string;
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
    category:  typeLabelToCategory(input.type),
    stage:     "idea",
    mandatory: input.mandatory ?? false,
    owner:     input.owner?.trim() ?? "",
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

/**
 * Prep readiness for an event, as a four-part checklist:
 * room confirmed · flyer/attachment present · flyer posted · socials meeting held.
 * Drives the inspector prep bar, the board card prep rings, and the on-deck hero meter.
 */
export interface PrepCheck { key: "room" | "attachment" | "flyer" | "socials"; label: string; done: boolean; }

export function programmingPrepChecks(event: {
  roomStatus: RoomStatus;
  attachmentUrl: string | null;
  attachmentDocId: number | null;
  itineraryNotNeeded?: boolean;
  flyerPosted: boolean;
  socialsMeeting: boolean;
}): PrepCheck[] {
  return [
    { key: "room",       label: "Room",        done: event.roomStatus === "confirmed" || event.roomStatus === "na" },
    { key: "attachment", label: "Itinerary",   done: Boolean(event.attachmentUrl?.trim() || event.attachmentDocId) || Boolean(event.itineraryNotNeeded) },
    { key: "flyer",      label: "Flyer",       done: event.flyerPosted },
    { key: "socials",    label: "Socials mtg", done: event.socialsMeeting },
  ];
}

export function programmingPrepScore(event: {
  roomStatus: RoomStatus;
  attachmentUrl: string | null;
  attachmentDocId: number | null;
  itineraryNotNeeded?: boolean;
  flyerPosted: boolean;
  socialsMeeting: boolean;
}): { done: number; total: number } {
  const checks = programmingPrepChecks(event);
  return { done: checks.filter(c => c.done).length, total: checks.length };
}

/** Whether an upcoming event needs officer attention. */
export function programmingNeedsAttention(event: {
  dueDate: string | null;
  roomStatus: RoomStatus;
  attachmentUrl: string | null;
  attachmentDocId: number | null;
}, todayStr: string): boolean {
  if (event.dueDate && event.dueDate < todayStr) return false;
  return (
    event.roomStatus === "not_submitted" ||
    !Boolean(event.attachmentUrl?.trim() || event.attachmentDocId)
  );
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
  roomStatus: RoomStatus;
  attachmentUrl: string | null;
  attachmentDocId: number | null;
  flyerPosted: boolean;
  socialsMeeting: boolean;
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

export interface AttentionEntry<T> { task: T; reason: "room" | "flyer" | "prep"; tone: "rose" | "gold"; }

/**
 * Upcoming, not-done events that still need work before their date, soonest first.
 * Room-not-booked is the hard blocker (rose); a missing flyer or incomplete prep is
 * a softer nudge (gold). Mirrors programmingNeedsAttention but annotated for the rail.
 */
export function eventsNeedingAttention<T extends ProgrammingTaskLike>(tasks: T[], today: string): AttentionEntry<T>[] {
  return tasks
    .filter(t => t.stage !== "done" && t.dueDate != null && t.dueDate >= today)
    .map((task): AttentionEntry<T> | null => {
      if (task.roomStatus === "not_submitted") return { task, reason: "room", tone: "rose" };
      if (!task.flyerPosted) return { task, reason: "flyer", tone: "gold" };
      const { done, total } = programmingPrepScore(task);
      if (done < total) return { task, reason: "prep", tone: "gold" };
      return null;
    })
    .filter((e): e is AttentionEntry<T> => e !== null)
    .sort((a, b) => (a.task.dueDate as string).localeCompare(b.task.dueDate as string));
}

export interface EventsTermStats {
  total: number;
  byStage: Record<ProgrammingStage, number>;
  next14: number;
  next14NeedRoom: number;
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
  const next14NeedRoom = inWindow.filter(t => t.roomStatus === "not_submitted").length;

  const rated = tasks.filter(t => t.stage === "done" && t.successRating != null);
  const avgSuccess = rated.length
    ? rated.reduce((sum, t) => sum + (t.successRating as number), 0) / rated.length
    : null;

  return {
    total: tasks.length,
    byStage,
    next14: inWindow.length,
    next14NeedRoom,
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
