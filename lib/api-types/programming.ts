import type { Schedule } from "@/lib/calendar-feed/schedule";
import type { Doc } from "./docs";

/**
 * Programming (the events pipeline): GET /api/programming and its writes.
 *
 * An event moves through four gated lanes (lib/state/programming-stage):
 *   idea       title + type; belongs to the chapter
 *   planning   + an owner (one person OR one role)
 *   confirmed  + date + location; PUBLISHED: mirrored onto the calendar/Timeline,
 *              and its title/date/time/location/type/attendance/collab are frozen
 *   done       only from confirmed; carries the wrap-up (rating, spend, notes)
 */

export type ProgrammingStage = "idea" | "planning" | "confirmed" | "done";

/** An event's owner, resolved server-side: a person, or a role and its holders today. */
export type ProgrammingOwner =
  | { kind: "brother"; id: number; name: string; initials: string }
  | { kind: "role"; id: number; name: string; holders: string[] }
  | null;

export interface ProgrammingEvent {
  /** Structured when; legacy rows may carry none. */
  schedule?: Schedule | null;
  id: number;
  title: string;
  /** YYYY-MM-DD; null while an idea/plan has no day yet. */
  dueDate: string | null;
  /** "" when unset. */
  location: string;
  time: string | null;
  status: string;
  /** CalendarEventType slug. */
  category: string;
  /** The type's display label. */
  type: string;
  stage: ProgrammingStage;
  mandatory: boolean;
  collab: string | null;
  owner: ProgrammingOwner;
  /** A pre-migration free-text owner that matched nobody; read-only, NOT an owner. */
  ownerNote: string | null;
  description: string | null;
  attachmentUrl: string | null;
  attachmentDocId: number | null;
  /** Answers to the org's optional fields, keyed by field slug. */
  fieldValues: Record<string, string | number | boolean | null>;
  detachedFields: string[];
  spendingCents: number;
  /** 1–5 once wrapped and rated. */
  successRating: number | null;
  wrapUpNotes: string | null;
  /** The calendar mirror while published. */
  calendarEventId?: number | null;
}

/** GET /api/roles: identity fields for chips and owner pickers (permissions only with MANAGE_ROLES). */
export interface RoleChip {
  id: number;
  name: string;
  color: string | null;
  rank: number;
  memberCount: number;
  permissions?: number;
  isSystem?: boolean;
}

/** A link attached to one programming event (GET/POST /api/programming/[id]/docs): a Doc row without the library's author name. */
export type ProgrammingDoc = Omit<Doc, "createdByName">;
