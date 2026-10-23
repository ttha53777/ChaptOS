// Simple fundraiser wire shapes. Type-only: see lib/api-types/index.ts for the rules.
// Money is dollars on the wire (the DB keeps integer cents). Scheduling fields
// come from the mirrored CalendarEvent.

export type FundraiserKind = "bake" | "drink" | "wash" | "raffle" | "other";

export interface FundraiserSupply {
  id: number;
  name: string;
  cost: number;
  position: number;
}

/** GET /api/fundraisers (array), GET|POST|PATCH /api/fundraisers/[id], wrap/reopen. */
export interface Fundraiser {
  id: number;
  calendarEventId: number;
  name: string;
  /** YYYY-MM-DD. */
  date: string;
  /** Local HH:MM in the event's zone; null when all-day. */
  startTime: string | null;
  endTime: string | null;
  place: string | null;
  kind: FundraiserKind;
  goal: number | null;
  supplies: FundraiserSupply[];
  /** Sum of the shopping list. */
  spent: number;
  /** The wrap-up total; null until wrapped. */
  cameIn: number | null;
  /** cameIn − spent; null until wrapped. Negative = came up short. */
  made: number | null;
  /** ISO; null until wrapped. */
  wrappedAt: string | null;
  createdAt: string;
}
