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
 * ── The conversion flow, which is less obvious than it looks ─────────────────
 *
 * The seat guard blocks on `current + 1`, but Checkout bills at the CURRENT
 * headcount. So an org sitting at 4 members is blocked from adding a 5th, goes
 * to Checkout at quantity 4 — which is $0 under the free band — and only starts
 * paying once the 5th member lands and the seat sync pushes the new quantity.
 *
 * The consequence for this page: the "add a payment method" button has to be
 * offered WHILE THE ORG IS STILL FREE. Gating it behind "already paying" would
 * make the wall unclearable. The copy says plainly that nothing is charged
 * until the fifth person.
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
  const [busy, setBusy] = useState<"checkout" | "portal" | "sync" | null>(null);
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
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const param = new URLSearchParams(window.location.search).get("checkout");
    if (param !== "success" && param !== "cancelled") return;
    setReturned(param);
    window.history.replaceState({}, "", window.location.pathname);
    if (param !== "success") return;
    const t = setTimeout(() => { void load(); }, 2500);
    return () => clearTimeout(t);
  }, [load]);

  // Redirect out to a Stripe-hosted page. Both endpoints answer 201 { url }.
  async function goToStripe(kind: "checkout" | "portal") {
    setBusy(kind);
    try {
      const { url } = await requestJson<{ url: string }>(`/api/billing/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      window.location.href = url;
    } catch (err) {
      setBusy(null);
      toast.error(apiErrorMessage(err, "Couldn't reach Stripe. Try again in a moment."));
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
  const band = s.bands.find(b => b.id === s.tier);
  const hasSubscription = s.status !== SubscriptionStatus.Free;
  const inTrouble = s.status === SubscriptionStatus.PastDue || s.status === SubscriptionStatus.Unpaid;
  const overCeiling = s.members > s.selfServeMax || s.blockedBy === "quote";

  return shell(
    <>
      <BillingHead />

      {/* ── Stripe return leg ── */}
      {returned === "success" && (
        <div className="bl-note bl-note-ok" role="status">
          <b>Payment method saved.</b> Stripe is confirming it now — this page will catch up in a
          few seconds. Nothing else is needed from you.
        </div>
      )}
      {returned === "cancelled" && (
        <div className="bl-note bl-note-muted" role="status">
          <b>Checkout cancelled.</b> Nothing was charged and nothing changed.
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
      {!s.canAddMember && !inTrouble && (
        <div className="bl-note bl-note-vio" role="status">
          <b>You&rsquo;ve reached the limit for this plan.</b>{" "}
          {overCeiling
            ? "Past 120 members we price it per-org rather than off a table — that takes a short conversation."
            : "Adding one more person needs a payment method on file. Nothing you already have is affected."}
        </div>
      )}

      {/* ── Summary ── */}
      <section className="bl-summary" aria-label="Current plan">
        <div className="bl-measure">
          <p className="k">Plan</p>
          <p className="v">{s.tierLabel}</p>
          <p className="note">{band?.range ?? "—"}</p>
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
          <p className="v">{s.members}</p>
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
        ) : overCeiling ? (
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
              <h3>Add a payment method</h3>
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
          One price per organization, by how many people are on it. Every feature is included at
          every price — there is nothing behind a higher tier.
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
          Counted: everyone on the roster plus anyone with a membership here, each person once.
          Placeholder records don&rsquo;t count.{" "}
          <a href="/pricing">More on pricing</a> · <a href="/help/member-limit">what happens at the limit</a>
        </p>
      </section>

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
