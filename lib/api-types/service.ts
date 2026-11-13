// Service-hours wire shapes. Type-only: see lib/api-types/index.ts for the rules.
import type { Schedule } from "@/lib/calendar-feed/schedule";

/** GET /api/service-events — one service event, soonest first. */
export interface ServiceEvent {
  id: number;
  organizationId: number;
  title: string;
  /** YYYY-MM-DD. */
  date: string;
  /** "" when unset. */
  location: string;
  /** "" when unset. */
  notes: string;
  /** The Timeline entry it mirrors; null for events made before the mirror. */
  calendarEventId: number | null;
  createdAt: string;
  /** From the linked Timeline entry; null when unscheduled or unlinked. */
  schedule: Schedule | null;
  time: string | null;
}

/**
 * One member's hours at one service event.
 *
 * GET /api/service-participation (every row in the org — filter `brotherId` to
 * the signed-in member for "my hours"), GET /api/service-events/[id]/participation,
 * and POST|DELETE /api/service-events/[id]/participation/me (both answer the
 * event's rows after the change).
 */
export interface ServiceParticipationRow {
  id: number;
  organizationId: number;
  serviceEventId: number;
  brotherId: number;
  hours: number;
  createdAt: string;
  updatedAt: string;
  /** `name` is this org's display name for them. */
  brother: { id: number; name: string; avatarUrl: string | null };
}
