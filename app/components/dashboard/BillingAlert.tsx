"use client";

import { useRouter } from "next/navigation";
import { useChapter } from "../../context/ChapterContext";
import { useOrgPath } from "../../hooks/useOrgPath";

/**
 * BillingAlert — the dashboard nudge for a subscription that needs attention.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * Billing state used to render on exactly one screen: Settings → Billing, which
 * is org-admin-only, two clicks deep, and has no sidebar entry. This app sends
 * no email of any kind (there is no mail dependency in the repo at all), and the
 * `billing.payment_failed` event is written with no ActivityLog dual-write on
 * purpose — a "your payment failed" line in the members' feed would be noise and
 * an embarrassment.
 *
 * So the whole notification path for a failed card was: Stripe's own dunning
 * emails, if whoever ran scripts/stripe-setup.ts remembered to switch them on in
 * the Dashboard afterwards. Failing that, an admin found out days later by
 * hitting the 402 seat wall while trying to add somebody.
 *
 * This is the in-app half of that. It is a nudge, not a gate — nothing here
 * blocks anything, matching the product commitment in lib/billing/guard.ts that
 * an org which stops paying loses only the ability to GROW.
 *
 * ── Self-gating ──────────────────────────────────────────────────────────────
 *
 * Renders only when the server sends an alert. `org.billingAlert` is computed in
 * /api/auth/me and is null for everyone who isn't an org or platform admin, so
 * the visibility rule lives on the server and a member cannot learn the org's
 * billing state by reading their own props. Deliberately NOT dismissible: unlike
 * the setup checklist this doesn't expire on its own, and hiding it would put us
 * back where we started.
 */

type Alert = NonNullable<NonNullable<ReturnType<typeof useChapter>["currentUser"]>["org"]>["billingAlert"];

const COPY: Record<NonNullable<Alert>, { title: string; body: string; cta: string }> = {
  past_due: {
    title: "Your last payment didn't go through",
    body:
      "Everything still works and nobody has been removed — but you won't be able to add new "
      + "members until the card is sorted. Stripe will retry on its own; updating the card is faster.",
    cta: "Update payment method",
  },
  unpaid: {
    title: "We couldn't collect your last invoice",
    body:
      "Stripe has finished retrying. Nothing has been deleted and every page still works, but "
      + "adding members is blocked until there's a working card on file.",
    cta: "Update payment method",
  },
  canceled: {
    title: "Your subscription has ended",
    body:
      "Nothing was taken away — every member and every record is where you left it. You're above "
      + "the free plan's size, though, so adding anyone new needs a card again.",
    cta: "Start again",
  },
};

export function BillingAlert() {
  const { currentUser } = useChapter();
  const router = useRouter();
  const orgPath = useOrgPath();

  const alert = currentUser?.org?.billingAlert ?? null;
  if (!alert) return null;

  const { title, body, cta } = COPY[alert];

  return (
    <div className="dash-group" style={{ marginBottom: 18 }}>
      <div
        className="dash-card"
        role="status"
        style={{
          position: "relative",
          overflow: "hidden",
          border: "1px solid rgba(224,122,122,.38)",
          borderRadius: 14,
          padding: "18px 20px 18px 23px",
          background: "linear-gradient(180deg, rgba(224,122,122,.08), rgba(224,122,122,.02))",
          boxShadow: "0 0 0 1px rgba(224,122,122,.06), 0 8px 28px -16px rgba(224,122,122,.5)",
        }}
      >
        {/* Accent rail, same idiom as SetupChecklist — rose rather than purple,
            because this one is a problem rather than an invitation. */}
        <span
          aria-hidden
          style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
            background: "linear-gradient(180deg, rgba(224,122,122,.85), rgba(224,122,122,.25))",
          }}
        />
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: "-.01em" }}>{title}</h3>
            <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.55, opacity: .78 }}>{body}</p>
          </div>
          <button
            type="button"
            className="bl-linkish"
            onClick={() => router.push(orgPath("/billing"))}
            style={{
              flex: "0 0 auto", alignSelf: "center",
              border: "1px solid rgba(224,122,122,.45)", borderRadius: 9,
              padding: "8px 14px", fontSize: 13, fontWeight: 550, cursor: "pointer",
              background: "rgba(224,122,122,.10)",
            }}
          >
            {cta}
          </button>
        </div>
      </div>
    </div>
  );
}
