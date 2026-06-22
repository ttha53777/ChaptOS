/**
 * Recalc handlers — side effects that used to be called inline from route
 * handlers now run as event subscribers.
 *
 * Failures are logged via dispatchHandlers' isolation; they do not roll back
 * the originating write. Recalc is eventually-consistent: if a recalc fails,
 * subsequent attendance writes will refresh the affected brother's ratio.
 */

import { on } from "../dispatch";
import { recalcBrotherAttendance, recalcAllBrothersInSemester } from "@/lib/attendance";

on("excuse.approved", async (ctx, { metadata }) => {
  await recalcBrotherAttendance(ctx.db, metadata.brotherId, metadata.semesterId);
});

on("excuse.submitted", async (ctx, { metadata }) => {
  // Submit-flow auto-approves for admins; that path needs the recalc.
  // Pending submissions don't change attendance math.
  if (metadata.autoApproved) {
    await recalcBrotherAttendance(ctx.db, metadata.brotherId, metadata.semesterId);
  }
});

on("attendance.recorded", async (ctx, { metadata }) => {
  await recalcAllBrothersInSemester(ctx.db, metadata.semesterId);
});
