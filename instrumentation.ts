/**
 * Next.js instrumentation hook. `register()` runs once when a server instance
 * boots, before it handles requests (Next 16 stable file convention).
 *
 * We use it to self-heal stale system-role permission bits. `Role.permissions`
 * is written at seed/create time, so when a new capability bit is added to
 * lib/permissions.ts, existing orgs' system roles keep the old bitfield and a
 * non-admin President silently 403s on the new feature. Re-running the idempotent
 * system-role seed on every boot keeps "President can do everything the app can"
 * true without a human remembering to run a script — the right posture for a
 * student org whose officers rotate yearly.
 *
 * Runs on the privileged client because it's a cross-org maintenance sweep with
 * no tenant context — the same posture as provisionOrg (see lib/prisma-privileged.ts).
 * The normal exemption "import prismaPrivileged only from org-service" is widened
 * here deliberately: this is infra, not a request path, and the sweep must span
 * every org regardless of RLS org-scoping.
 */
export async function register() {
  // ── Sentry ────────────────────────────────────────────────────────────────
  //
  // Before anything else, and outside the nodejs-only guard below, because the
  // Edge runtime needs monitoring too.
  //
  // lib/observability.ts has always had the forwarding call, but forwarding is
  // worthless without an init: captureException on an uninitialised SDK silently
  // does nothing. Installing @sentry/nextjs and setting SENTRY_DSN was therefore
  // not sufficient, which mattered because every Stripe-side failure in this app
  // is deliberately logged-and-swallowed — reconcileSeats, refreshFromStripe,
  // getBillingSummary, applySubscription's unattributable-subscription drop,
  // deleteOrg's cancel. Without this, all of them were stdout lines nobody was
  // paged on.
  //
  // Still entirely optional: no DSN, no init, and the JSON-to-stdout path is
  // unchanged.
  if (process.env.SENTRY_DSN) {
    try {
      const Sentry = await import("@sentry/nextjs");
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        // Errors only. This app has no tracing budget and no performance
        // dashboards; sampling traces would cost quota and tell us nothing we
        // don't already get from logTiming's structured lines.
        tracesSampleRate: 0,
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      });
    } catch (e) {
      // A monitoring failure must never stop a server from booting.
      // eslint-disable-next-line no-console
      console.error("[instrumentation] Sentry init failed", e);
    }
  }

  // Only run in the Node.js server runtime — never in the Edge runtime, where
  // pg / the privileged client isn't available.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Dynamic import so Edge/browser bundles never pull in pg via this module.
  const { prismaPrivileged } = await import("@/lib/prisma-privileged");
  const { refreshSystemRolePermissions } = await import("@/lib/seed-roles");
  const { logError } = await import("@/lib/observability");

  try {
    const { orgsTouched } = await refreshSystemRolePermissions(prismaPrivileged);
    // eslint-disable-next-line no-console
    console.log(`[instrumentation] refreshed system-role permissions across ${orgsTouched} org(s)`);
  } catch (e) {
    // Never block boot on a maintenance sweep failure — log and continue. The
    // one-time backfill migration is the durable safety net; this hook just keeps
    // things current on subsequent deploys.
    logError(e, { route: "instrumentation.register", method: "refreshSystemRolePermissions" });
  }
}
