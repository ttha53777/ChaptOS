import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { summarizePartyAttendance } from "@/lib/services/party-service";
import { logError } from "@/lib/observability";

// Present/eligible member counts per party that has roll logged, for the active
// semester. Feeds the "Avg attendance" glance metric and the per-row N/M figure.
// Returns [] when there is no active semester or no rolled parties.
export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try { return Response.json(await summarizePartyAttendance(ctx)); }
  catch (e) {
    logError(e, { route: "/api/parties/attendance-summary", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
