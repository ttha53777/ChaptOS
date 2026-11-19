// Timeline, attendance and excuse wire shapes. Type-only: see lib/api-types/index.ts for the rules.
import type { Schedule } from "@/lib/calendar-feed/schedule";
import type { EventDetail } from "@/lib/event-details";

/** One "More details" entry on an event (lib/event-details.ts). Members never receive checklist/budget. */
export type { EventDetail };
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

/** One member who has checked in, as shown in the live band's "last in" stack. */
export type LiveArrival = {
  brotherId: number;
  name:      string;
  avatarUrl: string | null;
  /** When they were marked present, ISO. */
  at:        string;
};

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
  /** Set when an officer cancelled the window instead of closing it: state is
   *  "closed", nothing was recorded, and presentCount is how many check-ins were
   *  thrown out. closedByName is who cancelled it. */
  cancelledAt:   string | null;
  msRemaining:   number;
  presentCount:  number;
  eligibleCount: number;
  /** The newest arrivals, newest first, at most four — the faces under the
   *  tally. Carried here so no client fetches the whole roster to show them. */
  recent:        LiveArrival[];
  me: {
    checkedIn:   boolean;
    checkedInAt: string | null;
    excuse:      { status: ExcuseStatus; reason: string } | null;
  };
};

/**
 * GET /api/attendance/[eventId] — who came to a required event, for every member (the
 * web timeline's Attendance block). Only the active semester's records. An excuse's
 * `reason` is null unless the caller manages attendance or wrote it. Semester-exempt
 * members are in no bucket (their ids are in `exempt`). With no active semester every
 * list is empty.
 */
export interface EventAttendance {
  attended: { brotherId: number; brotherName: string; at: string }[];
  excused: { brotherId: number; brotherName: string; reason: string | null; isRetroactive: boolean }[];
  unexcused: { brotherId: number; brotherName: string }[];
  exempt: number[];
  /** Members can still tap themselves in, so the lists are still filling. */
  checkInOpen: boolean;
}

/** PATCH /api/calendar/[id]/details — the event's details after the claim (member view). */
export interface EventDetailsUpdated {
  details: EventDetail[];
}

/** GET /api/attendance/mine — the events the caller was marked present at. */
export interface MyAttendance {
  attendedEventIds: number[];
}

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

/** One follow-up from a meeting's summary. */
export interface MeetingActionItem {
  /** Stable within one summary; PATCH /api/calendar/[id]/action-items addresses items by it. */
  id: string;
  text: string;
  /** The owner as the minutes wrote them ("Dev"), or null when nobody was named. */
  owner: string | null;
  /** The roster member that name resolved to, when it resolved to exactly one. */
  brotherId: number | null;
  /** YYYY-MM-DD, only when the minutes gave a date. */
  due: string | null;
  done: boolean;
}

/** The structured summary. PATCH /api/calendar/[id]/action-items answers this. */
export interface MeetingSummaryBody {
  gist: string;
  decisions: string[];
  actions: MeetingActionItem[];
}

/**
 * GET /api/calendar/[id]/summary — what any member may read of a meeting's
 * minutes: the saved summary and its action items. Never the minutes body.
 *
 * A member may tick an action item whose `brotherId` is theirs; with
 * `canTickAll` (MANAGE_EVENTS) they may tick any.
 */
export interface MeetingSummary {
  eventId: number;
  title: string;
  date: string;
  /** null when nobody has summarized the minutes yet. */
  summary: MeetingSummaryBody | null;
  /** ISO, when the summary was made; null with no summary. */
  summarizedAt: string | null;
  canTickAll: boolean;
}

/** An upcoming entry exactly as the subscribed calendar will show it. */
export interface CalendarFeedPreviewEntry {
  title: string;
  location: string;
  schedule: Schedule;
  /** A dated task rather than an event. */
  deadline: boolean;
  timeUnconfirmed: boolean;
}

/** GET /api/calendar/subscription?summary=1 — the dashboard invite's "is the feed on". Never the URL. */
export interface CalendarFeedLive {
  live: boolean;
}

/**
 * GET /api/calendar/subscription?view=member — the "Add to Calendar" sheet.
 * Admins get extra audit fields without `view=member`; the app always sends it.
 */
export interface CalendarSubscriptionView {
  enabled: boolean;
  /** The feed is rolled out to this org at all. */
  available: boolean;
  /** The webcal-able .ics URL, only while the feed is on. Treat it as a secret. */
  url: string | null;
  orgName: string;
  preview: CalendarFeedPreviewEntry[];
  timeZone: string | null;
  admin: boolean;
  validated: boolean;
  status: { state: "unknown" | "retrying" | "publishing" | "current"; updatedAt: string | null };
  generation: number;
}

/* ── Meetings (the phone's Meetings page and its officer tools) ─────────────── */

/** GET /api/attendance/summary — per required event, how the roll stands (?category=chapter). */
export interface AttendanceSummaryRow {
  calendarEventId: number;
  present: number;
  eligible: number;
  /** Approved excuses (exempt members aside). */
  excused: number;
  /** Who the roll will cover: roster minus exempt minus excused. Once taken, `eligible` is the denominator. */
  expected: number;
}

/** GET /api/excuses — every excuse (or ?status=pending), oldest first. MANAGE_ATTENDANCE. */
export interface ExcuseListItem {
  id: number;
  brotherId: number;
  brotherName: string;
  calendarEventId: number;
  eventTitle: string;
  eventDate: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  isRetroactive: boolean;
  rejectionNote: string | null;
}

/** PATCH /api/excuses/[id] — the decision as recorded. */
export interface ExcuseDecided {
  id: number;
  brotherId: number;
  status: "pending" | "approved" | "rejected";
  attendance: number | null;
}

/** GET /api/calendar/[id]/delete-preview — what deleting the event takes with it. */
export interface EventDeletePreview {
  attendance: number;
  excuses: number;
  party: { name: string; doorRevenue: number; expenses: number; completed: boolean } | null;
  serviceMembers: number;
  programming: boolean;
  fundraiser: { supplies: number; wrapped: boolean } | null;
  /** A party ledger needs MANAGE_PARTIES to delete; null = nothing blocks it. */
  blocked: "MANAGE_PARTIES" | null;
}

/** GET /api/calendar/agenda-templates — a standing agenda a new meeting can start from. MANAGE_EVENTS. */
export interface AgendaTemplate {
  id: number;
  name: string;
  description: string;
  category: string;
  body: string;
  isDefault: boolean;
  uses: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: { id: number; name: string } | null;
}

/** PATCH /api/calendar/[id] — the saved meeting. The app reads only the minutes' side of it,
 *  to autosave minutes without re-reading the calendar. 409 once the notes are shared. */
export interface MinutesSaved {
  id: number;
  description: string | null;
  notesUpdatedAt: string | null;
  notesContentRevision: number;
  notesInitialized: boolean;
}

/** POST /api/ai/summarize-meeting — the meeting's fresh summary (parse notesSummaryData before reading). */
export interface MeetingSummarized {
  id: number;
  notesSummary: string | null;
  notesSummaryData: unknown;
  notesSummaryAt: string | null;
  notesSummaryRevision: number | null;
  notesContentRevision: number;
}
