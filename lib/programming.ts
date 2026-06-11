import type { TaskStatus } from "@/app/data";
import { fmtDate } from "@/app/data";
import type { CalendarCategory } from "@/lib/state/calendar-category";
import type { RoomStatus } from "@/lib/state/programming-prep";

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
  dueDate: string;
}): string {
  return [task.type, task.location, task.time, fmtDate(task.dueDate)].filter(Boolean).join(" · ");
}

export interface ProgrammingTaskRow {
  id: number;
  title: string;
  date: string;
  location: string | null;
  time: string | null;
  status: string;
  category: string;
  description?: string | null;
  programmingEvent?: {
    id: number;
    owner: string;
    collabOrg: string;
    itineraryUrl: string | null;
    roomStatus: string;
    flyerPosted: boolean;
    socialsMeeting: boolean;
    spendingCents: number;
    successRating: number | null;
    wrapUpNotes: string | null;
    _count?: { docs: number };
  } | null;
}

export interface ProgrammingTaskDto {
  id: number;
  title: string;
  dueDate: string;
  location: string;
  time: string | null;
  status: TaskStatus;
  type: string;
  collab: string | null;
  owner: string;
  description: string | null;
  itineraryUrl: string | null;
  roomStatus: RoomStatus;
  flyerPosted: boolean;
  socialsMeeting: boolean;
  spendingCents: number;
  successRating: number | null;
  wrapUpNotes: string | null;
  docCount: number;
}

/** Map a CalendarEvent row to the task shape the Programming page expects. */
export function toProgrammingTask(row: ProgrammingTaskRow): ProgrammingTaskDto {
  const ext = row.programmingEvent;
  const { title, collab } = resolveProgrammingDisplay({
    title: row.title,
    collabOrg: ext?.collabOrg,
  });
  return {
    id:              row.id,
    title,
    dueDate:         row.date,
    location:        row.location ?? "",
    time:            row.time ?? null,
    status:          (row.status ?? "Upcoming") as TaskStatus,
    type:            categoryToTypeLabel(row.category),
    collab,
    owner:           ext?.owner ?? "",
    description:     row.description ?? null,
    itineraryUrl:    ext?.itineraryUrl ?? null,
    roomStatus:      (ext?.roomStatus ?? "not_submitted") as RoomStatus,
    flyerPosted:     ext?.flyerPosted ?? false,
    socialsMeeting:  ext?.socialsMeeting ?? false,
    spendingCents:   ext?.spendingCents ?? 0,
    successRating:   ext?.successRating ?? null,
    wrapUpNotes:     ext?.wrapUpNotes ?? null,
    docCount:        ext?._count?.docs ?? 0,
  };
}

export interface ProgrammingTaskInput {
  title:    string;
  dueDate:  string;
  location: string;
  time?:    string | null;
  collab?:  string | null;
  owner?:   string;
  status:   string;
  type:     string;
}

function optionalTime(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Map form/API input to CalendarEvent and ProgrammingEvent create fields. */
export function fromProgrammingInput(input: ProgrammingTaskInput) {
  const collabOrg = input.collab?.trim() ?? "";
  return {
    calendarEvent: {
      title:     input.title.trim(),
      date:      input.dueDate,
      location:  input.location.trim(),
      time:      optionalTime(input.time),
      status:    input.status,
      category:  typeLabelToCategory(input.type) as CalendarCategory,
      mandatory: false,
    },
    programmingEvent: {
      owner:     input.owner?.trim() ?? "",
      collabOrg,
    },
  };
}

/** Prep checklist progress for mobile progress bar. */
export function programmingPrepScore(event: {
  roomStatus: RoomStatus;
  itineraryUrl: string | null;
  flyerPosted: boolean;
  socialsMeeting: boolean;
  docCount: number;
}): { done: number; total: number } {
  const checks = [
    event.roomStatus === "confirmed" || event.roomStatus === "na",
    Boolean(event.itineraryUrl?.trim()),
    event.flyerPosted,
    event.socialsMeeting,
    event.docCount > 0,
  ];
  return { done: checks.filter(Boolean).length, total: checks.length };
}

/** Whether an upcoming event needs officer attention. */
export function programmingNeedsAttention(event: {
  dueDate: string;
  roomStatus: RoomStatus;
  itineraryUrl: string | null;
  docCount: number;
}, todayStr: string): boolean {
  if (event.dueDate < todayStr) return false;
  return (
    event.roomStatus === "not_submitted" ||
    !event.itineraryUrl?.trim() ||
    event.docCount === 0
  );
}
