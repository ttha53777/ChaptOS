/** Calendar-date arithmetic for the content planner. The rules live in lib/media/calendar (shared with the app). */
import { todayIn } from "./media/calendar";
export { instagramDays, instagramAddDays, postedOn, instagramLane, instagramSummary, instagramGaps, instagramDate, type InstagramLane } from "./media/calendar";

/** Use the org's confirmed zone, with UTC as a deterministic fallback. */
export function instagramToday(timeZone?: string | null, now = new Date()): string {
  return todayIn(timeZone, now);
}
