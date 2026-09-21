"use client";

/**
 * Billing — what this org pays us.
 *
 * The route name is not incidental: lib/services/billing-service.ts defaults
 * both the Checkout `success_url`/`cancel_url` and the Billing Portal
 * `return_url` to `/<slug>/billing`, so this page is where Stripe puts people
 * down. Renaming it strands every redirect.
 *
 * Firewalled from Treasury by the same logic the service is — this is the
 * platform subscription, not the chapter's own money. Nothing here reads a
 * Transaction or a DuesPayment.
 *
 * Automatic billing follows headcount. Selected plans reserve capacity and
 * start billing immediately, even while the roster is inside the free band.
 */

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "../../components/Sidebar";
import { Modal, LoadingSpinner } from "../../components/dashboard/primitives";
import { btnDuskActionCls, btnDuskGhostCls, btnDuskPrimaryCls, inputDuskCls } from "../../components/dashboard/styles";
import { useToast } from "../../components/dashboard/Toast";
import { useChapter } from "../../context/ChapterContext";
import { useIsOrgAdmin } from "../../hooks/useIsOrgAdmin";
import { useOrgPath } from "../../hooks/useOrgPath";
import { ApiError, apiErrorMessage, requestJson } from "../../lib/api";
import type { BillingSummary, QuoteResult } from "@/lib/services/billing-service";
import { BillingMode, type SelectedPlan } from "@/lib/state/billing-mode";
import { selectedBand } from "@/lib/billing/plans";
import type { ChangePlanInput } from "@/lib/validation/billing";
import { SubscriptionStatus } from "@/lib/state/subscription-status";
import { SalesLeadKind } from "@/lib/state/sales-lead";
import "../../components/dashboard/dashboard-ledger.css";
import "./billing-ledger.css";

// ─── Status presentation ──────────────────────────────────────────────────────
// Tone maps onto the dusk accent tokens. Mirrors the platform-admin StatusPill
// in app/admin/orgs/page.tsx so one org reads the same in both places.

type Tone = "ok" | "vio" | "gold" | "rose" | "muted";

const STATUS_TONE: Record<string, Tone> = {
  [SubscriptionStatus.Active]:       "ok",
  [SubscriptionStatus.Trialing]:     "ok",
  [SubscriptionStatus.Free]:         "muted",
  [SubscriptionStatus.PastDue]:      "rose",
  [SubscriptionStatus.Unpaid]:       "rose",
  [SubscriptionStatus.Canceled]:     "muted",
  [SubscriptionStatus.QuotePending]: "gold",
};

const STATUS_LABEL: Record<string, string> = {
  [SubscriptionStatus.Active]:       "Active",
  [SubscriptionStatus.Trialing]:     "Trial",
  [SubscriptionStatus.Free]:         "Free plan",
  [SubscriptionStatus.PastDue]:      "Payment failed",
  [SubscriptionStatus.Unpaid]:       "Unpaid",
  [SubscriptionStatus.Canceled]:     "Canceled",
  [SubscriptionStatus.QuotePending]: "Quote pending",
};

function StatusPill({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "muted";
  return <span className={`bl-pill bl-pill-${tone}`}>{STATUS_LABEL[status] ?? status}</span>;
}

/** "August 30, 2026" — the renewal date, in the reader's locale. */
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { currentUser } = useChapter();
  const isOrgAdmin = useIsOrgAdmin();
  const orgPath = useOrgPath();
  const toast = useToast();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"checkout" | "portal" | "sync" | "plan" | null>(null);
  const [planChoice, setPlanChoice] = useState<SelectedPlan | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [quoteKind, setQuoteKind] = useState<"quote" | "multi_org" | null>(null);
  const [returned, setReturned] = useState<"success" | "cancelled" | null>(null);

  const load = useCallback(async () => {
    try {
      setSummary(await requestJson<BillingSummary>("/api/billing"));
      setLoadError(null);
    } catch (err) {
      // A 403 here means the membership says admin but the server disagrees —
      // show the same calm wall rather than a red error.
      if (err instanceof ApiError && err.status === 403) setLoadError(null);
      else setLoadError(apiErrorMessage(err, "Couldn't load billing right now."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return; // wait for /api/auth/me — isOrgAdmin is false until it lands
    if (!isOrgAdmin) { setLoading(false); return; }
    void load();
  }, [currentUser, isOrgAdmin, load]);

  /**
   * Handle the Stripe return leg, then strip the param so a refresh doesn't
   * replay the banner. Same shape as the settings `?section=` handler: read
   * window.location directly rather than useSearchParams, which would push the
   * whole subtree behind a Suspense boundary.
   *
   * On success the webhook may not have landed yet — checkout.session.completed
   * and our own /api/billing read race. So this re-fetches once after a beat
   * instead of asserting the subscription is active; until then the summary can
   * legitimately still read "free".
   *
   * The re-fetch now repairs rather than hopes: GET /api/billing runs
   * refreshIfStale, which pulls the subscription straight from Stripe whenever
   * the row looks like it lost a delivery (a customer id with no subscription id
   * is exactly that shape). So this covers both a slow webhook and one that
   * never arrives at all — the case that used to leave a paying org walled with
   * no way out. See refreshFromStripe in lib/billing/sync.ts.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const param = new URLSearchParams(window.location.search).get("checkout");
    if (param !== "success" && param !== "cancelled") return;
    setReturned(param);
    window.history.replaceState({}, "", window.location.pathname);
    if (param !== "success") return;
    const t = setTimeout(() => { void requestJson("/api/billing/sync", { method: "POST" }).then(load).catch(() => load()); }, 2500);
    return () => clearTimeout(t);
  }, [load]);

  // Redirect out to a Stripe-hosted page. Both endpoints answer 201 { url }.
  async function goToStripe(kind: "checkout" | "portal", plan?: SelectedPlan) {
    setBusy(kind);
    try {
      const { url } = await requestJson<{ url: string }>(`/api/billing/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan ? { plan } : {}),
      });
      window.location.href = url;
    } catch (err) {
      setBusy(null);
      toast.error(apiErrorMessage(err, "Couldn't reach Stripe. Try again in a moment."));
    }
  }

  async function updatePlan(input: ChangePlanInput) {
    setBusy("plan");
    try {
      const result = await requestJson<{ scheduled: boolean }>("/api/billing/plan", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      setPlanChoice(null);
      setCancelConfirm(false);
      await load();
      toast.success(result.scheduled ? "Plan change scheduled for renewal." : "Billing updated.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't change the plan. Recheck billing before retrying."));
    } finally {
      setBusy(null);
    }
  }

  async function recount() {
    setBusy("sync");
    try {
      await requestJson("/api/billing/sync", { method: "POST" });
      await load();
      toast.success("Member count rechecked.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't recheck the member count."));
    } finally {
      setBusy(null);
    }
  }

  // ── Shell ───────────────────────────────────────────────────────────────────

  const shell = (body: React.ReactNode) => (
    <div className="flex h-screen overflow-hidden bg-[#0f0d0a]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="Settings" onNavClick={() => {}} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="toolbar-frosted dash-toolbar bl-toolbar-bar relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.05] px-4 sm:px-6 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="tb-icon-btn flex h-8 w-8 items-center justify-center rounded-lg text-[#958d7c] hover:bg-white/[0.07]"
            aria-label="Open menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="bl-crumb truncate">Billing</span>
        </header>
        <main className="page-ambient flex-1 overflow-y-auto">
          <div className="dash dash-billing" data-dashboard-theme="dusk">{body}</div>
        </main>
      </div>
    </div>
  );

  if (loading) {
    return shell(
      <div className="bl-loading"><LoadingSpinner /></div>,
    );
  }

  // Billing is org-admin authority, not a permission bit — a Treasurer runs the
  // chapter's money, but the platform subscription belongs to whoever holds the
  // account. Show that plainly instead of a 403.
  if (!isOrgAdmin) {
    return shell(
      <>
        <BillingHead />
        <section className="bl-wall">
          <h2>An org admin handles this</h2>
          <p>
            The subscription belongs to whoever set this organization up. Nothing about your
            access depends on it — you can keep using every page either way.
          </p>
          <p className="bl-wall-sub">
            If something needs paying, ask an admin to open Settings → Billing.
          </p>
        </section>
      </>,
    );
  }

  if (loadError || !summary) {
    return shell(
      <>
        <BillingHead />
        <section className="bl-wall">
          <h2>Couldn&rsquo;t load billing</h2>
          <p>{loadError ?? "No billing information came back."}</p>
          <button className={btnDuskActionCls} onClick={() => { setLoading(true); void load(); }}>
            Try again
          </button>
        </section>
      </>,
    );
  }

  const s = summary;
  // "Is there something to MANAGE?" — not "have they ever paid?". A cancelled
  // subscription is gone from Stripe's side, so sending someone to the portal
  // shows them an empty page, while the thing they actually want (start again)
  // sits behind the branch this flag used to hide. Cancelled orgs get the
  // Subscribe path back.
  const cancelled = s.status === SubscriptionStatus.Canceled;
  const hasSubscription = s.hasSubscription;
  const selected = s.billingMode === BillingMode.Selected;
  const inTrouble = s.status === SubscriptionStatus.PastDue || s.status === SubscriptionStatus.Unpaid;
  const overCeiling = s.members > s.selfServeMax || s.blockedBy === "quote";

  return shell(
    <>
      <BillingHead />

      {/* ── Stripe return leg ── */}
      {returned === "success" && (
        <div className="bl-note bl-note-ok" role="status">
          <b>Checkout returned.</b> We&rsquo;re checking your subscription with Stripe. Paid capacity
          becomes available once payment is confirmed.
        </div>
      )}
      {returned === "cancelled" && (
        <div className="bl-note bl-note-muted" role="status">
          <b>Checkout cancelled.</b> Your existing billing settings remain in place.
        </div>
      )}

      {/* ── The state that needs acting on, first ── */}
      {inTrouble && (
        <div className="bl-note bl-note-rose" role="alert">
          <b>Your last payment didn&rsquo;t go through.</b> Everything still works and nobody has
          been removed — but you won&rsquo;t be able to add new members until the card is sorted.
          Stripe will retry on its own; updating the card is faster.
        </div>
      )}
      {s.cancelAtPeriodEnd && (
        <div className="bl-note bl-note-gold" role="status">
          <b>Cancels on {fmtDate(s.currentPeriodEnd)}.</b>{" "}
          After that this org goes back to the free plan, which tops out at{" "}
          {s.bands[0]?.range ?? "the free band"}. Your records stay put either way. You can resume
          any time before then.
        </div>
      )}
      {cancelled && (
        <div className="bl-note bl-note-muted" role="status">
          <b>Your subscription has ended.</b> Nothing was taken away — every member, every
          record and every export is exactly where you left it. The free plan tops out at{" "}
          {s.bands[0]?.range ?? "four members"}, so adding anyone past that needs a card again.
          You can start again below; it picks up from your current headcount.
        </div>
      )}
      {!s.canAddMember && !inTrouble && !cancelled && (
        <div className="bl-note bl-note-vio" role="status">
          <b>You&rsquo;ve reached the limit for this plan.</b>{" "}
          {overCeiling
            ? "Past 120 members we price it per-org rather than off a table — that takes a short conversation."
            : s.blockedBy === "upgrade"
              ? "Choose a larger plan below to approve more members. Your existing members keep access."
              : "Choose a plan now or set up automatic billing below to approve more members."}
        </div>
      )}

      {/* ── Summary ── */}
      <section className="bl-summary" aria-label="Current plan">
        <div className="bl-measure">
          <p className="k">Plan</p>
          <p className="v">{s.tierLabel}</p>
          <p className="note">{selected ? "Selected plan · fixed capacity" : "Automatic · follows member count"}</p>
        </div>
        <div className="bl-measure">
          <p className="k">Monthly</p>
          <p className="v">{s.priceLabel}</p>
          {/* The band price is what this headcount COSTS, which is not the same
              as what the org is being charged — an org past the free band with
              no subscription sees a number it isn't paying yet. Say which. */}
          <p className="note">
            {s.priceCents === null
              ? "priced per org"
              : !hasSubscription && s.priceCents > 0
                ? "what you'd pay — not billed yet"
                : "per month, per org"}
          </p>
        </div>
        <div className="bl-measure">
          <p className="k">People counted</p>
          <p className="v">{s.members}{selected && <span className="bl-capacity"> / {s.capacity}</span>}</p>
          <p className="note">
            <button className="bl-linkish" onClick={() => void recount()} disabled={busy === "sync"}>
              {busy === "sync" ? "rechecking…" : "recheck"}
            </button>
          </p>
        </div>
        <div className="bl-measure">
          <p className="k">Status</p>
          <p className="v"><StatusPill status={s.status} /></p>
          <p className="note">
            {s.cancelAtPeriodEnd
              ? `ends ${fmtDate(s.currentPeriodEnd)}`
              : s.currentPeriodEnd ? `renews ${fmtDate(s.currentPeriodEnd)}` : "no renewal date"}
          </p>
        </div>
      </section>

      {s.scheduledPlan && (
        <div className="bl-note bl-note-gold" role="status">
          <b>{s.bands.find(b => b.id === s.scheduledPlan)?.label} starts {fmtDate(s.planChangeAt)}.</b>{" "}
          Your current capacity remains available until then. Existing members stay if you exceed the new limit;
          further approvals will wait until there is room.
          <button className="bl-linkish" disabled={busy !== null} onClick={() => void updatePlan({ action: "cancel_change" })}>
            Cancel scheduled change
          </button>
        </div>
      )}
      {s.billingEnabled && s.members <= s.selfServeMax && (
        <section className="bl-plans" aria-label="Choose a plan now">
          <h2 className="bl-h3">Choose a plan now</h2>
          <p className="bl-lede">Get capacity ready before your next members join. Pay monthly, even with fewer than five members. Your plan stays the same as the roster changes.</p>
          <div className="bl-plan-grid">
            {(["standard", "pro"] as const).map(plan => {
              const option = selectedBand(plan);
              const current = selected && s.selectedPlan === plan && hasSubscription;
              const downgrade = hasSubscription && option.priceCents! < (s.priceCents ?? 0);
              const tooSmall = s.members > option.upTo! && !(selected && downgrade);
              return <article className={`bl-plan${current ? " is-current" : ""}`} key={plan}>
                <h3>{option.label}{current && <span className="bl-you">your plan</span>}</h3>
                <p className="bl-plan-price">{s.bands.find(b => b.id === plan)?.priceLabel}<span>/month</span></p>
                <p>Up to {option.upTo} active members</p>
                <p className="bl-fine">{downgrade ? "Starts at your next renewal. Existing members keep access." : "Monthly subscription. No automatic plan upgrades."}</p>
                <button className={btnDuskActionCls}
                  disabled={busy !== null || current || tooSmall || inTrouble || s.cancelAtPeriodEnd || Boolean(s.scheduledPlan)}
                  onClick={() => setPlanChoice(plan)}>
                  {current ? "Current plan" : tooSmall ? "Below your member count" : downgrade ? `Switch to ${option.label}` : `Choose ${option.label}`}
                </button>
              </article>;
            })}
          </div>
        </section>
      )}

      {/* ── Actions ── */}
      <section className="bl-actions" aria-label="Billing actions">
        {!s.billingEnabled ? (
          <div className="bl-disabled">
            <h3>Billing isn&rsquo;t switched on here</h3>
            <p>
              This deployment has no payment keys configured, so there&rsquo;s nothing to pay and
              no card to add. Member limits still apply.
            </p>
          </div>
        ) : overCeiling && !hasSubscription ? (
          <div className="bl-act">
            <div className="t">
              <h3>Let&rsquo;s talk</h3>
              <p>
                Above {s.selfServeMax} people we price per organization instead of off the table.
                Send us the details and we&rsquo;ll come back with a number.
              </p>
            </div>
            <button className={btnDuskActionCls} onClick={() => setQuoteKind(SalesLeadKind.Quote)}>
              Request a quote
            </button>
          </div>
        ) : hasSubscription ? (
          <div className="bl-act">
            <div className="t">
              <h3>Payment &amp; invoices</h3>
              <p>
                Cards, receipts, invoice history and cancellation all live in Stripe&rsquo;s own
                portal — we don&rsquo;t store your card details.
              </p>
            </div>
            <button className={btnDuskActionCls} onClick={() => void goToStripe("portal")} disabled={busy !== null}>
              {busy === "portal" ? "Opening…" : inTrouble ? "Update payment method" : "Manage billing"}
            </button>
          </div>
        ) : (
          <div className="bl-act">
            <div className="t">
              <h3>Or use automatic billing</h3>
              {/* Two genuinely different situations, and conflating them would be
                  a lie in one of them. An org still inside the free band pays
                  nothing on checkout (Stripe bills quantity × the $0 tier), so
                  adding a card early is free. An org already past it — which is
                  every org that grew before billing existed — starts paying at
                  its current band the moment checkout completes. Don't promise
                  "nothing is charged" to the second group. */}
              {s.priceCents === 0 ? (
                <p>
                  You can do this before you need it. Nothing is charged while you&rsquo;re at{" "}
                  {s.bands[0]?.range ?? "the free tier"} — the card sits there until the day you
                  add the person who crosses the line.
                </p>
              ) : (
                <p>
                  You&rsquo;re at {s.members} people, which is the {s.tierLabel} band. Adding a
                  card starts a {s.priceLabel}/month subscription now, and unblocks adding people
                  again.
                </p>
              )}
            </div>
            <button className={btnDuskActionCls} onClick={() => void goToStripe("checkout")} disabled={busy !== null}>
              {busy === "checkout" ? "Opening…" : s.priceCents === 0 ? "Add a card" : `Subscribe — ${s.priceLabel}/mo`}
            </button>
          </div>
        )}

        {hasSubscription && overCeiling && s.billingEnabled && (
          <div className="bl-act bl-act-soft">
            <div className="t"><h3>Need more than {s.selfServeMax} members?</h3><p>Request a custom quote for more capacity.</p></div>
            <button className={btnDuskGhostCls} onClick={() => setQuoteKind(SalesLeadKind.Quote)}>Request a quote</button>
          </div>
        )}
        {hasSubscription && s.billingEnabled && (
          <div className="bl-act bl-act-soft">
            <div className="t"><h3>{s.cancelAtPeriodEnd ? "Keep your subscription" : "Cancel at renewal"}</h3>
              <p>{s.cancelAtPeriodEnd ? "Resume to keep your current billing after this period." : "Paid capacity remains until the end of this period. Your members and records stay."}</p>
            </div>
            <button className={btnDuskGhostCls} disabled={busy !== null}
              onClick={() => s.cancelAtPeriodEnd ? void updatePlan({ action: "resume" }) : setCancelConfirm(true)}>
              {s.cancelAtPeriodEnd ? "Resume subscription" : "Cancel subscription"}
            </button>
          </div>
        )}

        {s.groupPlanEligible && (
          <div className="bl-act bl-act-soft">
            <div className="t">
              <h3>You run more than one org</h3>
              <p>
                Right now that&rsquo;s a separate invoice each. If it should be one relationship
                instead, say so and we&rsquo;ll work something out.
              </p>
            </div>
            <button className={btnDuskGhostCls} onClick={() => setQuoteKind(SalesLeadKind.MultiOrg)}>
              Ask about a group plan
            </button>
          </div>
        )}
      </section>

      {/* ── Bands ── */}
      <section className="bl-bands" aria-label="Price bands">
        <h3 className="bl-h3">How the price works</h3>
        <p className="bl-lede">
          Automatic billing follows your active member count. Selected plans keep the capacity you
          purchase until you change plans. Every plan includes every feature.
        </p>
        <table className="bl-table">
          <thead>
            <tr><th>Plan</th><th>People</th><th>Monthly</th></tr>
          </thead>
          <tbody>
            {s.bands.map(b => (
              <tr key={b.id} className={b.id === s.tier ? "is-current" : undefined}>
                <td>
                  {b.label}
                  {b.id === s.tier && <span className="bl-you">you</span>}
                </td>
                <td>{b.range}</td>
                <td className="num">{b.priceLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="bl-fine">
          Counted: active roster members. Archived members and support accounts don&rsquo;t count.{" "}
          <a href="/pricing">More on pricing</a> · <a href="/help/member-limit">what happens at the limit</a>
        </p>
      </section>

      {planChoice && (
        <Modal title={`Choose ${selectedBand(planChoice).label}`} tone="dusk" onClose={() => { if (!busy) setPlanChoice(null); }} maxWidthClass="max-w-lg">
          <div className="bl-plan-confirm">
            <p><b>{s.bands.find(b => b.id === planChoice)?.priceLabel}/month</b> for up to {selectedBand(planChoice).upTo} active members.</p>
            <p>{!hasSubscription
              ? "Your first monthly payment is due in Stripe Checkout today. The subscription renews monthly until you cancel."
              : selectedBand(planChoice).priceCents! < (s.priceCents ?? 0)
                ? `The lower price and capacity start at renewal on ${fmtDate(s.currentPeriodEnd)}. No mid-cycle refund. If you exceed the new capacity, existing members stay and further approvals are blocked.`
                : "This change takes effect after payment. Stripe charges any prorated difference to your saved payment method now. The plan renews monthly until you cancel."}</p>
            <p>Removing members won&rsquo;t lower this selected plan. You control future plan changes.</p>
            <div className="bl-confirm-actions">
              <button className={btnDuskGhostCls} disabled={busy !== null} onClick={() => setPlanChoice(null)}>Go back</button>
              <button className={btnDuskActionCls} disabled={busy !== null}
                onClick={() => hasSubscription ? void updatePlan({ action: "select", plan: planChoice }) : void goToStripe("checkout", planChoice)}>
                {busy ? "Working…" : hasSubscription ? "Confirm plan change" : "Continue to payment"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {cancelConfirm && (
        <Modal title="Cancel at renewal?" tone="dusk" onClose={() => { if (!busy) setCancelConfirm(false); }} maxWidthClass="max-w-lg">
          <div className="bl-plan-confirm">
            <p>Your subscription ends on {fmtDate(s.currentPeriodEnd)}. This replaces any scheduled plan change.</p>
            <p>Your members and records stay. After that date, approving members above the free allowance requires a subscription.</p>
            <div className="bl-confirm-actions">
              <button className={btnDuskGhostCls} disabled={busy !== null} onClick={() => setCancelConfirm(false)}>Keep subscription</button>
              <button className={btnDuskActionCls} disabled={busy !== null} onClick={() => void updatePlan({ action: "cancel" })}>
                {busy ? "Working…" : "Confirm cancellation"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {quoteKind && (
        <QuoteModal
          kind={quoteKind}
          members={s.members}
          defaultName={currentUser?.name ?? ""}
          defaultEmail={currentUser?.email ?? ""}
          onClose={() => setQuoteKind(null)}
          onSent={() => { setQuoteKind(null); void load(); }}
        />
      )}

      <p className="bl-back">
        <a href={orgPath("/settings")}>← Back to settings</a>
      </p>
    </>,
  );
}

function BillingHead() {
  return (
    <section className="bl-head">
      <p className="kicker">Billing</p>
      <h1>What this org <em>pays us</em>.</h1>
      <p className="bl-lede">
        Separate from your chapter&rsquo;s own money — nothing here touches dues, budgets or
        reimbursements.
      </p>
    </section>
  );
}

// ─── Quote / group-plan request ───────────────────────────────────────────────

/**
 * Records a SalesLead server-side FIRST, then hands back a prefilled mail draft.
 *
 * That ordering is the point, and the copy reflects it: the request is already
 * saved by the time this shows compose links, so closing the window loses
 * nothing. Don't reword this into "send us an email" — that was the old
 * /contact behaviour, where an unsent draft meant a lead that never existed.
 */
function QuoteModal({ kind, members, defaultName, defaultEmail, onClose, onSent }: {
  kind: "quote" | "multi_org";
  members: number;
  defaultName: string;
  defaultEmail: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<QuoteResult | null>(null);

  const isGroup = kind === SalesLeadKind.MultiOrg;

  async function submit() {
    setSending(true);
    try {
      setResult(await requestJson<QuoteResult>("/api/billing/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name: name || undefined, email: email || undefined, message: message || undefined }),
      }));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't send that just now."));
      setSending(false);
    }
  }

  return (
    <Modal
      title={isGroup ? "Ask about a group plan" : "Request a quote"}
      tone="dusk"
      onClose={result ? onSent : onClose}
      maxWidthClass="max-w-lg"
    >
      {result ? (
        <div className="bl-quote-done">
          <p>
            <b>Got it.</b> Your request is saved — you don&rsquo;t need to send anything for us to
            see it. We usually come back within a day.
          </p>
          <p className="bl-quote-sub">
            If you&rsquo;d rather also mail us directly, here&rsquo;s the same thing as a draft:
          </p>
          <div className="bl-quote-links">
            <a className={btnDuskGhostCls} href={result.draft.mailto}>Mail app</a>
            <a className={btnDuskGhostCls} href={result.draft.gmail} target="_blank" rel="noreferrer">Gmail</a>
            <a className={btnDuskGhostCls} href={result.draft.outlook} target="_blank" rel="noreferrer">Outlook</a>
            <a className={btnDuskGhostCls} href={result.draft.outlookSchool} target="_blank" rel="noreferrer">Outlook (school)</a>
          </div>
          <button className={btnDuskPrimaryCls} onClick={onSent}>Done</button>
        </div>
      ) : (
        <div className="bl-quote-form">
          <p className="bl-quote-intro">
            {isGroup
              ? "Tell us roughly how many orgs you're running and we'll work out something sensible."
              : `We'll price it around your ${members} people and whatever else matters.`}
          </p>
          <label className="bl-field">
            <span>Your name</span>
            <input className={inputDuskCls} value={name} onChange={e => setName(e.target.value)} />
          </label>
          <label className="bl-field">
            <span>Reply-to email</span>
            <input className={inputDuskCls} type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          <label className="bl-field">
            <span>Anything we should know <em>(optional)</em></span>
            <textarea className={inputDuskCls} rows={4} value={message} onChange={e => setMessage(e.target.value)} />
          </label>
          <button className={btnDuskPrimaryCls} onClick={() => void submit()} disabled={sending || !email.trim()}>
            {sending ? "Sending…" : "Send request"}
          </button>
        </div>
      )}
    </Modal>
  );
}
