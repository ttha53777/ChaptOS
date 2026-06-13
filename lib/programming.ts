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
  description: string | null;
  collabOrg: string;
  owner: string;
  itineraryUrl: string | null;
  attachmentUrl: string | null;
  attachmentDocId: number | null;
  roomStatus: string;
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
  collab: string | null;
  owner: string;
  description: string | null;
  attachmentUrl: string | null;
  attachmentDocId: number | null;
  roomStatus: RoomStatus;
  flyerPosted: boolean;
  socialsMeeting: boolean;
  spendingCents: number;
  successRating: number | null;
  wrapUpNotes: string | null;
  checklist: ProgrammingChecklistItem[];
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
    collab,
    owner:           row.owner ?? "",
    description:     row.description ?? null,
    attachmentUrl:   row.attachmentUrl ?? null,
    attachmentDocId: row.attachmentDocId ?? null,
    roomStatus:      (row.roomStatus ?? "not_submitted") as RoomStatus,
    flyerPosted:     row.flyerPosted ?? false,
    socialsMeeting:  row.socialsMeeting ?? false,
    spendingCents:   row.spendingCents ?? 0,
    successRating:   row.successRating ?? null,
    wrapUpNotes:     row.wrapUpNotes ?? null,
    checklist:       (row.checklist ?? []).map(c => ({
      id: c.id, label: c.label, done: c.done, sortOrder: c.sortOrder,
    })),
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
    mandatory: false,
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

/** Prep checklist progress for mobile progress bar. */
export function programmingPrepScore(event: {
  roomStatus: RoomStatus;
  attachmentUrl: string | null;
  attachmentDocId: number | null;
  flyerPosted: boolean;
}): { done: number; total: number } {
  const checks = [
    event.roomStatus === "confirmed" || event.roomStatus === "na",
    Boolean(event.attachmentUrl?.trim() || event.attachmentDocId),
    event.flyerPosted,
  ];
  return { done: checks.filter(Boolean).length, total: checks.length };
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
