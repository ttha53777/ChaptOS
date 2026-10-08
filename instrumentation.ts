/**
 * Next.js instrumentation hook. `register()` runs once when a server instance
 * boots, before it handles requests (Next 16 stable file convention).
 *
 * Used only to start Sentry.
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
        // Bearer credentials appear in subscription paths. Drop the complete
        // event, including breadcrumbs/context, rather than partially redacting.
        beforeSend(event) {
          return JSON.stringify(event).includes("/api/calendar/feeds/") ? null : event;
        },
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      });
    } catch (e) {
      // A monitoring failure must never stop a server from booting.
      // eslint-disable-next-line no-console
      console.error("[instrumentation] Sentry init failed", e);
    }
  }

  // No boot-time role maintenance. A sweep used to rewrite system-role
  // permission bits here on every start, which reverted each chapter's edits to
  // those roles and created President/Treasurer/Social/PR roles in orgs whose
  // template never had them. A new permission bit now ships with a one-time
  // migration instead (see the PERMISSIONS comment in lib/permissions.ts).
}
