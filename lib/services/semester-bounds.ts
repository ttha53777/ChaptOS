import type { RequestContext } from "@/lib/context";
import { getActiveSemester } from "@/lib/attendance";
import { ValidationError } from "@/lib/errors";

/**
 * Semester-boundary guards for dated items (events, deadlines, service events,
 * programming tasks). All dates are stored as zero-padded YYYY-MM-DD strings, so
 * lexicographic comparison against the active semester's startDate/endDate is
 * correct and timezone-safe.
 *
 * Errors carry a `details.code` discriminator so the frontend can tell apart
 * "no active semester" (route the user to semester setup) from "date out of
 * range" (inline error).
 */

/** Throw if the org has no active semester. Returns the active semester otherwise. */
export async function requireActiveSemester(ctx: RequestContext) {
  const semester = await getActiveSemester(ctx.orgId);
  if (!semester) {
    throw new ValidationError(
      "No active semester. Set up a semester before creating dated items.",
      { code: "NO_ACTIVE_SEMESTER" },
    );
  }
  return semester;
}

/**
 * Assert a YYYY-MM-DD date falls within the active semester (inclusive of both
 * bounds). A null/undefined date is treated as "no date" and only triggers the
 * no-active-semester guard — useful for dateless programming Ideas, which must
 * still be blocked when no semester exists but carry no date to range-check.
 */
export async function assertWithinActiveSemester(
  ctx: RequestContext,
  date: string | null | undefined,
) {
  const semester = await requireActiveSemester(ctx);
  if (date == null) return;
  if (date < semester.startDate || date > semester.endDate) {
    throw new ValidationError(
      `Date must be within the current semester (${semester.startDate} to ${semester.endDate}).`,
      {
        code: "DATE_OUTSIDE_SEMESTER",
        semester: { label: semester.label, startDate: semester.startDate, endDate: semester.endDate },
        provided: date,
      },
    );
  }
}
