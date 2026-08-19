/**
 * Phase 0 measurement readout — the RLS wrapper's call count, latency
 * percentiles, and wire-statement counts for this server process.
 *
 * Deliberately NOT behind buildContext: reading it must not itself issue the
 * scoped queries being measured, or the numbers would include the observer.
 * Access is gated instead on the instrumentation flag plus a hard
 * non-production check, so this cannot be reached on a deployed app even if
 * PERF_INSTRUMENT were set there by accident. It exposes only aggregate
 * counters — no org data, no row contents.
 *
 *   GET  /api/admin/perf   → snapshot
 *   POST /api/admin/perf   → reset counters (for before/after runs)
 */
import { active, snapshot, wireSnapshot, reset, resetWire } from "@/lib/db/perf-metrics";

function unavailable(): Response {
  return new Response("Not found", { status: 404 });
}

function gated(): boolean {
  return process.env.NODE_ENV !== "production" && active();
}

export async function GET() {
  if (!gated()) return unavailable();

  const run = snapshot();
  const wire = wireSnapshot();

  return Response.json({
    run: {
      ...run,
      avgMs: run.calls === 0 ? 0 : Number((run.totalMs / run.calls).toFixed(2)),
    },
    wire,
    // The headline ratio. Under the current design every scoped call opens its
    // own transaction, so this sits at ~1.00. Batching work is what should
    // drive it down; if it stays at 1.00 after a batching change, that change
    // did not do what it claimed.
    beginsPerCall: run.calls === 0 ? 0 : Number((wire.begin / run.calls).toFixed(3)),
  });
}

export async function POST() {
  if (!gated()) return unavailable();
  reset();
  resetWire();
  return Response.json({ ok: true });
}
