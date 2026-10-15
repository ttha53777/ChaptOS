// Timeline, attendance and excuse wire shapes. Type-only: see lib/api-types/index.ts for the rules.
import type { Schedule } from "@/lib/calendar-feed/schedule";
import type { EventDetail } from "@/lib/event-details";
import type { CheckInStatus, ExcuseStatus } from "@/lib/state";

// Per-org timeline event type — the client view of a CalendarEventType row.
// Drives the timeline's labels/colors/legend and the add-event picker.
/** GET /api/calendar/event-types. */
export interface CalEventType {
  id: number;
  slug: string;
  label: string;
  color: string;              // light ("ivory") hex
  colorDark: string | null;   // dark ("dusk") hex; falls back to color
  workflowId: string | null;  // gates picker visibility; null = always available
  builtin: boolean;
  creatable: boolean;         // false = managed elsewhere (deadline)
  hidden: boolean;
  mandatoryDefault: boolean;
  displayOrder: number;
  /** Blank "More details" a new event of this type opens with (lib/event-details.ts). */
  detailTemplate?: EventDetail[] | null;
}

/** GET /api/calendar. */
export interface CalendarEvent {
  schedule?: Schedule | null;
  id: number;
  /** The party ledger attached to this calendar event. */
  partyEventId?: number | null;
  /** The attached party ledger's theme / collab org; null when unset or not a party. */
  partyTheme?: string | null;
  partyCollabOrg?: string | null;
  title: string;
  date: string;
  time?: string | null;
  category: string; // a CalEventType slug (per-org); see CalEventType above
  mandatory: boolean;
  description?: string | null;
  /** The agenda exactly as copied in from a template at creation; null when the notes started blank. */
  notesSeed?: string | null;
  agendaTemplateId?: number | null;
  location?: string | null;
  notesSummary?: string | null;
  /** Structured summary (lib/meeting-summary.ts); parse before reading. */
  notesSummaryData?: unknown;
  notesSummaryAt?: string | null;
  notesUpdatedAt?: string | null;
  notesContentRevision?: number;
  notesSummaryRevision?: number | null;
  notesCollaborationEnabled?: boolean;
  notesInitialized?: boolean;
  /** When this calendar row was created by promoting a programming event, the id of
   *  that ProgrammingEvent — lets the timeline deep-link into the Programming page. */
  programmingEventId?: number | null;
  /** "More details" (lib/event-details.ts). Members never receive checklist/budget. */
  details?: EventDetail[];
}

/**
 * GET /api/attendance/live, POST|DELETE /api/attendance/[eventId]/check-in
 * (each answers `LiveCheckIn | null`).
 *
 * An officer opens the window from the room; members tap themselves present
 * while it is open; closing it writes the absences.
 */
export type LiveCheckIn = {
  event: {
    id: number;
    title: string;
    date: string;
    time: string | null;
    schedule?: unknown;
    location: string | null;
    mandatory: boolean;
  };
  state:         CheckInStatus;
  openedAt:      string;
  closedAt:      string | null;
  closedByName:  string | null;
  msRemaining:   number;
  presentCount:  number;
  eligibleCount: number;
  me: {
    checkedIn:   boolean;
    checkedInAt: string | null;
    excuse:      { status: ExcuseStatus; reason: string } | null;
  };
};

/** GET /api/excuses/mine — the caller's own excuses for the active semester, newest first. */
export interface MyExcuseItem {
  id:              number;
  calendarEventId: number;
  eventTitle:      string;
  eventDate:       string;
  reason:          string;
  status:          string;
  submittedAt:     string;
  decidedAt:       string | null;
  rejectionNote:   string | null;
}
