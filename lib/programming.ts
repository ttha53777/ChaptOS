import type { TaskStatus } from "@/app/data";
import type { CalendarCategory } from "@/lib/state/calendar-category";

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

/** Stored title suffix when a programming event has a collab org. */
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

export interface ProgrammingTaskRow {
  id: number;
  title: string;
  date: string;
  location: string | null;
  time: string | null;
  status: string;
  category: string;
}

/** Map a CalendarEvent row to the task shape the Programming page expects. */
export function toProgrammingTask(row: ProgrammingTaskRow) {
  return {
    id:       row.id,
    title:    row.title,
    dueDate:  row.date,
    location: row.location ?? "",
    time:     row.time ?? null,
    status:   (row.status ?? "Upcoming") as TaskStatus,
    type:     categoryToTypeLabel(row.category),
  };
}

export interface ProgrammingTaskInput {
  title:    string;
  dueDate:  string;
  location: string;
  time?:    string | null;
  collab?:  string | null;
  status:   string;
  type:     string;
}

function optionalTime(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Map form/API input to CalendarEvent create/update fields. */
export function fromProgrammingInput(input: ProgrammingTaskInput) {
  return {
    title:     formatProgrammingTitle(input.title, input.collab),
    date:      input.dueDate,
    location:  input.location.trim(),
    time:      optionalTime(input.time),
    status:    input.status,
    category:  typeLabelToCategory(input.type) as CalendarCategory,
    mandatory: false,
  };
}
