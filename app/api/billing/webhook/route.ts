import { NextRequest } from "next/server";
import { claimEvent, handleStripeEvent, markProcessed } from "@/lib/billing/webhook";
import { logError } from "@/lib/observability";
import { stripe, stripeWebhooksEnabled } from "@/lib/stripe";

/**
 * Stripe webhook — the only genuinely unauthenticated endpoint in this app.
 *
 * ── How it gets past the CSRF gate ───────────────────────────────────────────
 *
 * proxy.ts routes every mutating /api/* request through isSameOrigin(). Stripe
 * posts server-to-server with neither an Origin nor a Sec-Fetch-Site header, and
 * lib/auth/same-origin.ts documents that case as explicitly allowed ("nothing to
 * compare — not a cross-origin browser POST"), so this route needs no exemption.
 *
 * That is a load-bearing dependency on behaviour a security change could
 * plausibly tighten. If isSameOrigin is ever made to fail closed, Stripe starts
 * receiving 403s and retries for three days before giving up — silently, because
 * nothing here would ever run. tests/billing/webhook.test.ts pins it.
 *
 * ── Why the body is read as text ─────────────────────────────────────────────
 *
 * Signature verification hashes the exact bytes Stripe sent. req.json() would
 * reserialise them and every signature would fail.
 *
 * ── Why the work is synchronous ──────────────────────────────────────────────
 *
 * Stripe's docs suggest responding 2xx first and processing after. That pattern
 * comes from long-lived Express servers and does NOT transfer to serverless,
 * where the runtime may freeze the instance the moment the response is returned
 * — the work would simply never finish. So handling happens before responding
 * and is kept small (a couple of writes, at most one Stripe read). If it throws,
 * we return 500 and let Stripe's retry schedule do its job.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!stripeWebhooksEnabled()) {
    // Deployment has no billing configured. 503 rather than 500: this is a
    // deliberate state, and Stripe will retry if it's a misconfiguration.
    return Response.json({ error: "Billing is not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing signature" }, { status: 400 });

  const raw = await req.text();

  let event;
  try {
    event = await stripe().webhooks.constructEventAsync(
      raw,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (e) {
    // Never retryable — a bad signature means the payload isn't from Stripe, or
    // the endpoint secret is wrong. 400 stops the retry schedule.
    logError(e, { route: "/api/billing/webhook", method: "POST", extra: { stage: "verify" } });
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency before any side effect. A replay is a success, not an error —
  // 200 tells Stripe to stop redelivering.
  const fresh = await claimEvent(event.id, event.type).catch(e => {
    logError(e, { route: "/api/billing/webhook", method: "POST", extra: { stage: "claim", eventId: event.id } });
    return null;
  });
  if (fresh === null) {
    // The claim itself failed (DB down). 500 so Stripe redelivers rather than
    // us dropping an event we never recorded.
    return Response.json({ error: "Could not record event" }, { status: 500 });
  }
  if (!fresh) return Response.json({ received: true, duplicate: true });

  try {
    await handleStripeEvent(event);
    await markProcessed(event.id);
    return Response.json({ received: true });
  } catch (e) {
    logError(e, {
      route: "/api/billing/webhook", method: "POST",
      extra: { stage: "handle", eventId: event.id, eventType: event.type },
    });
    // Record the failure and let Stripe retry. claimEvent deliberately lets a
    // retry through when the prior attempt errored — see the note there.
    await markProcessed(event.id, e instanceof Error ? e.message : String(e));
    return Response.json({ error: "Handler failed" }, { status: 500 });
  }
}
