import { NextRequest } from "next/server";
import { z } from "zod";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { logTiming } from "@/lib/observability";

// POST /api/ai/interview/event — operational beacon for the /create interview's
// degradation paths. Returns 204 and writes one structured log line.
//
// WHY THIS EXISTS: the interview has two drivers, and when the AI concierge
// fails it hands off to a deterministic scripted spine that is a materially
// worse interview. Every one of those handoffs was silent — same bridge line for
// all of them, nothing logged on either side — so there was no way to know how
// many founders got the degraded path, or why. Worse, the most likely cause
// (the client's fetch deadline expiring before the model answers) is invisible
// to the server by construction: that request is abandoned client-side, so the
// route never learns it failed. Only the client can report it.
//
// PRE-AUTH by design, same posture as the interview route itself: the /create
// flow runs entirely before sign-in, so there is no session and no
// buildContext(). Bounded by an IP rate limit and a tiny fixed-shape body.
//
// WHAT IT MAY CARRY: reason codes and counters. NOTHING the founder typed, no
// org name, no transcript, no IP in the log line. The sessionId is a random
// per-mount value whose only job is correlating events within one interview; it
// is not stored anywhere and outlives nothing. This is operational logging in
// the same category as the server logs already inventoried in
// docs/trust-and-privacy-source-of-truth.md — it is deliberately NOT product
// analytics, and must not grow into it.
//
// Nothing here writes to the database. A failure to record telemetry must never
// affect the interview, so the client fires this and ignores the outcome.

const MINUTE_LIMIT = 60;

/** Why the interview left the concierge. The first six mirror the client's fetch
    outcomes; the last three are decisions the client makes on a SUCCESSFUL
    response (the model quit with fields outstanding, the turn cap tripped, or it
    returned no next question). Keep in sync with the mirror in
    app/create/_components/interview-ai.ts. */
export const FALLBACK_REASONS = [
  "timeout",
  "http-429",
  "http-error",
  "disabled",
  "null-result",
  "network",
  "model-done-early",
  "turn-cap",
  "no-next",
] as const;

export type FallbackReason = (typeof FALLBACK_REASONS)[number];

export const interviewEventInput = z.object({
  reason: z.enum(FALLBACK_REASONS),
  /** Which driver was speaking: the opening turn, a mid-interview concierge
      turn, or the scripted spine's one model call (the typed-metric parse). */
  stage: z.enum(["boot", "concierge", "metrics"]),
  /** Concierge turns elapsed when it fired — distinguishes "died immediately"
      from "died at turn 9", which need different fixes. */
  turn: z.number().int().min(0).max(64),
  /** Random per-mount id. Correlates events within one interview; carries no
      identity and is never persisted. */
  sessionId: z.string().trim().min(8).max(64),
  /** Wall-clock ms the failed call took. The whole point of the timeout case:
      it tells us whether the deadline is too tight or the model is actually
      down. */
  elapsedMs: z.number().int().min(0).max(120_000).optional(),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(`interview-event:${clientIp(req)}`, MINUTE_LIMIT, 60_000);
  if (!rl.ok) return tooManyRequests(rl);

  const body = await req.json().catch(() => null);
  const parsed = interviewEventInput.safeParse(body);
  // A malformed beacon is not worth a round trip of error handling — the client
  // ignores the response either way. Swallow it rather than logging junk.
  if (!parsed.success) return new Response(null, { status: 204 });

  const { reason, stage, turn, sessionId, elapsedMs } = parsed.data;
  logTiming({
    route: "/api/ai/interview/event",
    method: "POST",
    message: "interview-fallback",
    extra: { reason, stage, turn, sessionId, ...(elapsedMs === undefined ? {} : { elapsedMs }) },
  });

  return new Response(null, { status: 204 });
}
