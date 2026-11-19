// Dashboard wire shapes. Type-only: see lib/api-types/index.ts for the rules.
import type { Announcement, ActivityEntry } from "./activity";
import type { CalendarEvent, LiveCheckIn } from "./calendar";
import type { Doc } from "./docs";
import type { MemberDuesStanding } from "./dues";
import type { Brother } from "./roster";
import type { Poll, Task } from "./tasks";
import type { Reimbursement, TreasuryData } from "./treasury";

/** One custom metric's dashboard numbers (GET /api/metrics/snapshot's row). */
export interface DashboardMetric {
  definitionId: number;
  slug: string;
  name: string;
  unit: string | null;
  aggregation: "avg" | "sum" | "count_on_track";
  headline: number;
  trend: number | null;
  sparkData: number[];
  onTrackCount: number;
  watchCount: number;
  atRiskCount: number;
  totalCount: number;
  goal: number;
  atRiskBelow: number;
  watchBelow: number | null;
  values: number[];
}

/**
 * GET /api/dashboard?today=YYYY-MM-DD — the web dashboard's INPUTS in one round trip.
 * The app derives the page from them with the same lib/dashboard functions the web
 * page runs (standing, health, the plate, the week, the numbers, the phone order), so
 * this carries data, never a rendered decision. Config (thresholds, layout, workflows,
 * vocabulary, permissions, wrap-ups) comes from /api/auth/me, as on the web.
 *
 * A list the viewer's org has switched off, or the viewer may not act on, is empty
 * (or null), never an error.
 */
export interface DashboardResponse {
  /** The date the week and lanes are judged against (the phone's, else the chapter's). */
  today: string;
  /** GET /api/brothers. */
  brothers: Brother[];
  /** GET /api/tasks (every task, as the web dashboard reads them). */
  tasks: Task[];
  /** Open polls the viewer may still vote in. */
  polls: Poll[];
  /** Timeline entries from this week's Monday on, soonest first (at most 60). */
  calendar: CalendarEvent[];
  /** null when Treasury is off. */
  treasury: TreasuryData | null;
  /** Pending and past requests; [] without MANAGE_TREASURY or with Treasury off. */
  reimbursements: Reimbursement[];
  /** The latest few rows. */
  activity: ActivityEntry[];
  /** [] when Docs is off. */
  docs: Doc[];
  announcement: Announcement | null;
  metrics: DashboardMetric[];
  /** Each member's dues position; [] when dues aren't tracked. */
  duesStandings: MemberDuesStanding[];
  liveCheckIn: LiveCheckIn | null;
  /** For the week's digest only. [] when the workflow is off. */
  parties: { id: number; name: string; date: string }[];
  /** For the week's digest and the Media card. [] when the workflow is off. */
  instagram: { id: number; title: string; status: string; dueDate: string; postedDate: string | null }[];
}
