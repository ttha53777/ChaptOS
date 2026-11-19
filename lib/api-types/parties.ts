import type { Schedule } from "@/lib/calendar-feed/schedule";

/**
 * Parties (the house ledger): GET /api/parties and its writes (MANAGE_PARTIES).
 *
 * A party is a ledger row with a calendar entry behind it (`attendanceEventId`,
 * category "party"), so it shows on the Timeline and its timing lives there. The
 * door money is Treasury's too: /api/treasury adds every party's doorRevenue and
 * expenses into the balance, so a wrap-up moves the books.
 *
 * Lifecycle: added (completed false, money 0) → the night happens → wrapped up
 * (PATCH with `wrapUp: true`: door + expenses + notes, completed true, and
 * optionally the member roll on the linked calendar entry).
 */
export interface Party {
  id: number;
  name: string;
  /** YYYY-MM-DD; follows the schedule when one is set. */
  date: string;
  partyType: "Open" | "Closed";
  /** "" when unset. */
  theme: string;
  /** "" when unset. */
  collabOrg: string;
  doorRevenue: number;
  /** Head count through the door: a legacy figure, no longer collected (shown when > 0). */
  attendance: number;
  expenses: number;
  /** "" when unset. */
  notes: string;
  completed: boolean;
  completedAt: string | null;
  /** The linked calendar entry (Timeline + roll); null on legacy rows. */
  attendanceEventId: number | null;
  /** The linked entry's mandatory flag: its roll counts toward attendance %. */
  mandatory: boolean;
  /** From the linked calendar entry: structured start/end. */
  schedule: Schedule | null;
  /** The linked entry's time: "21:00" from a schedule, or legacy free text. */
  time: string | null;
}

/** GET /api/parties/attendance-summary: one row per party with a roll this term. */
export interface PartyRollRow {
  partyId: number;
  present: number;
  eligible: number;
}
