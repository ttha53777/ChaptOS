import type { RequestContext } from "@/lib/context";
import { NotFoundError } from "@/lib/errors";
import { duesToday } from "@/lib/dues-ledger";
import { deriveHomePlate } from "@/lib/home-plate";
// A read model: it composes other aggregates' READ functions into one payload
// for the app's Today tab, so a phone on cell data pays one round trip instead
// of five. It never writes and never calls a service that emits, which is the
// coupling the service→service rule exists to stop.
import { listCalendar } from "@/lib/services/calendar-service"; // lint-modules:ignore (read-model composition)
import { listTasks } from "@/lib/services/task-service"; // lint-modules:ignore (read-model composition)
import { listPolls } from "@/lib/services/poll-service"; // lint-modules:ignore (read-model composition)
import { getLiveCheckIn } from "@/lib/services/attendance-service"; // lint-modules:ignore (read-model composition)
import { getMemberDuesBook } from "@/lib/services/dues-charge-service"; // lint-modules:ignore (read-model composition)

/** How many Timeline entries "Up next" carries. */
const UP_NEXT_COUNT = 3;

/**
 * GET /api/home. `today` is the phone's local date; without it, the chapter's.
 *
 * Reads run two at a time: the pg pool is 2 connections per instance, so a
 * wider fan-out would only queue (see the scoped-query pool notes).
 */
export async function getHome(ctx: RequestContext, today?: string) {
  const day = today ?? duesToday((await ctx.db.organization.findFirst({ select: { timeZone: true } }))?.timeZone);

  const [upNext, tasks] = await Promise.all([
    listCalendar(ctx, { upcoming: { from: day, take: UP_NEXT_COUNT } }),
    listTasks(ctx, { mine: true }),
  ]);
  const [polls, liveCheckIn] = await Promise.all([
    listPolls(ctx, { mine: true, status: "open" }),
    getLiveCheckIn(ctx),
  ]);
  // Off the roster here (a platform admin visiting) → no dues row, not a 404.
  const dues = await getMemberDuesBook(ctx, ctx.actorId).then(
    book => book.standing,
    e => { if (e instanceof NotFoundError) return null; throw e; },
  );

  return { today: day, upNext, plate: deriveHomePlate({ today: day, tasks, polls, dues }), liveCheckIn };
}
