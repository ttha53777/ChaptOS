"use client";

import { useCallback, useEffect, useState } from "react";

// /admin/orgs — PlatformAdmin audit page.
//
// Lists every organization in the system, newest first, and below it the two
// billing dead-letter queues that until now nothing anywhere could read: Stripe
// subscriptions we failed to cancel while deleting an org (someone is still
// being charged for a chapter that no longer exists) and webhook deliveries that
// errored (a billing event Stripe has since stopped retrying).
//
// Mostly read-only. The two write actions are narrow and deliberately grant no
// power an org admin doesn't already have over their own org: "sync" runs the
// same pull-then-push as the customer's own billing page, and the orphan actions
// only close out a subscription belonging to a deleted org.
//
// Gated server-side by /api/admin/orgs and /api/admin/billing-health, both of
// which call requireAdmin().

interface OrgBilling {
  status:            string;
  tier:              string;
  members:           number;
  priceLabel:        string;
  currentPeriodEnd:  string | null;
  cancelAtPeriodEnd: boolean;
  seatSyncPending:   boolean;
  nearLimit:         boolean;
}

interface OrgRow {
  id:          number;
  name:        string;
  slug:        string;
  orgType:     string | null;
  createdAt:   string;
  founderName: string | null;
  billing:     OrgBilling;
}

interface OrphanRow {
  id:                   number;
  stripeSubscriptionId: string;
  stripeCustomerId:     string | null;
  organizationId:       number;
  orgName:              string | null;
  orgSlug:              string | null;
  lastError:            string | null;
  failedAt:             string;
}

interface FailedEventRow {
  id:         string;
  type:       string;
  receivedAt: string;
  error:      string | null;
}

interface Health {
  orphans:        OrphanRow[];
  failedEvents:   FailedEventRow[];
  billingEnabled: boolean;
}

type Status =
  | { kind: "loading" }
  | { kind: "ready"; orgs: OrgRow[] }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

export default function AdminOrgsPage() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [health, setHealth] = useState<Health | null>(null);

  // Health loads independently of the org table: it is the part of this page
  // that can be *urgent*, and a failure to load the 200-row audit list must not
  // hide an indefinite charge to a deleted org.
  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/billing-health", { credentials: "same-origin" });
      if (!res.ok) return;
      setHealth(await res.json());
    } catch { /* the org table is still useful without it */ }
  }, []);

  useEffect(() => { void loadHealth(); }, [loadHealth]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/orgs", { credentials: "same-origin" });
        if (cancelled) return;
        if (res.status === 401 || res.status === 403) {
          setStatus({ kind: "forbidden" });
          return;
        }
        if (!res.ok) {
          setStatus({ kind: "error", message: `HTTP ${res.status}` });
          return;
        }
        const data = await res.json();
        setStatus({ kind: "ready", orgs: data.orgs ?? [] });
      } catch (e) {
        if (!cancelled) setStatus({ kind: "error", message: (e as Error).message });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-[#07090f] text-white px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-col gap-1">
          <h1 className="text-[20px] font-semibold tracking-tight">Organizations</h1>
          <p className="text-[13px] text-white/40">
            Cross-tenant audit view. Newest first, up to 200.
          </p>
        </header>

        {status.kind === "loading" && (
          <p className="text-[13px] text-white/40">Loading…</p>
        )}

        {status.kind === "forbidden" && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/8 px-4 py-3">
            <p className="text-[13px] text-red-400">
              This page is restricted to platform administrators.
            </p>
          </div>
        )}

        {status.kind === "error" && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/8 px-4 py-3">
            <p className="text-[13px] text-red-400">Failed to load: {status.message}</p>
          </div>
        )}

        {status.kind === "ready" && (
          status.orgs.length === 0 ? (
            <p className="text-[13px] text-white/40">No organizations yet.</p>
          ) : (
            <OrgTable orgs={status.orgs} />
          )
        )}

        {health && <BillingHealth health={health} onChanged={loadHealth} />}
      </div>
    </div>
  );
}

function OrgTable({ orgs }: { orgs: OrgRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
      <table className="w-full text-[13px]">
        <thead className="bg-white/[0.02] text-white/50 uppercase text-[11px] tracking-wider">
          <tr>
            <Th>Name</Th>
            <Th>Slug</Th>
            <Th>Type</Th>
            <Th>Members</Th>
            <Th>Plan</Th>
            <Th>Status</Th>
            <Th>Founder</Th>
            <Th>Created</Th>
            <Th>{""}</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {orgs.map((o) => (
            <tr key={o.id} className="hover:bg-white/[0.02]">
              <Td>{o.name}</Td>
              <Td className="font-mono text-white/70">{o.slug}</Td>
              <Td>{o.orgType ?? "—"}</Td>
              <Td>
                <span className={o.billing.nearLimit ? "text-amber-300" : ""}>
                  {o.billing.members}
                </span>
                {o.billing.nearLimit && (
                  <span className="ml-1.5 text-[11px] text-amber-300/60" title="Approaching the self-serve ceiling">
                    near limit
                  </span>
                )}
              </Td>
              <Td>
                {o.billing.priceLabel}
                <span className="ml-1.5 text-white/30">{o.billing.tier}</span>
              </Td>
              <Td>
                <StatusPill status={o.billing.status} />
                {o.billing.seatSyncPending && (
                  <span className="ml-1.5 text-[11px] text-amber-300/60" title="A seat count push to Stripe is still owed">
                    sync owed
                  </span>
                )}
              </Td>
              <Td>{o.founderName ?? <span className="text-white/30">—</span>}</Td>
              <Td>{formatDate(o.createdAt)}</Td>
              <Td><SyncButton orgId={o.id} /></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Force a billing reconcile for one org.
 *
 * The same pull-then-push an org admin can run from their own billing page, just
 * reachable from the table that shows the problem. Before this, repairing an org
 * meant setting the active_org_id cookie to it and using the customer's own
 * buttons — an undocumented trick that left no sign support had been there.
 *
 * The repair it exists for: an org whose checkout.session.completed was lost,
 * sitting at `free` after paying and walled by the seat gate.
 */
function SyncButton({ orgId }: { orgId: number }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");

  async function run() {
    setState("busy");
    try {
      const res = await fetch("/api/admin/orgs", {
        method:      "POST",
        credentials: "same-origin",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ orgId }),
      });
      const body = await res.json().catch(() => ({}));
      // `pending` means the local write landed but Stripe didn't take the push —
      // reporting that as success would be the same lie the seatSyncPendingAt
      // flag exists to prevent.
      setState(res.ok && !body?.pending ? "done" : "failed");
    } catch {
      setState("failed");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={state === "busy"}
      title="Pull Stripe's state in, push the seat count back out"
      className={
        "rounded border px-2 py-1 text-[11px] transition-colors "
        + (state === "done"   ? "border-emerald-400/25 bg-emerald-400/8 text-emerald-300"
        :  state === "failed" ? "border-red-400/25 bg-red-400/8 text-red-300"
        :  "border-white/10 bg-white/[0.03] text-white/55 hover:text-white/85 hover:border-white/20")
      }
    >
      {state === "busy" ? "syncing…" : state === "done" ? "synced" : state === "failed" ? "retry" : "sync"}
    </button>
  );
}

/**
 * The two dead-letter queues.
 *
 * Both tables have been written to since billing shipped and read by nothing.
 * An orphaned subscription is the expensive one: a live Stripe subscription
 * whose organization row is gone, so someone keeps being charged and the only
 * record that says so is the row rendered here.
 */
function BillingHealth({ health, onChanged }: { health: Health; onChanged: () => void }) {
  const { orphans, failedEvents } = health;
  if (orphans.length === 0 && failedEvents.length === 0) {
    return (
      <section className="mt-10">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">Billing health</h2>
        <p className="text-[13px] text-white/40">
          No orphaned subscriptions and no failed webhook deliveries.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-10 flex flex-col gap-8">
      <h2 className="text-[15px] font-semibold tracking-tight">Billing health</h2>

      {orphans.length > 0 && (
        <div>
          <h3 className="mb-1 text-[13px] font-medium text-red-300">
            Orphaned subscriptions ({orphans.length})
          </h3>
          <p className="mb-3 text-[12px] text-white/40">
            We failed to cancel these in Stripe while deleting their org. Each one is
            probably still charging somebody for a chapter that no longer exists.
          </p>
          <div className="overflow-x-auto rounded-xl border border-red-500/15">
            <table className="w-full text-[13px]">
              <thead className="bg-white/[0.02] text-white/50 uppercase text-[11px] tracking-wider">
                <tr>
                  <Th>Org</Th><Th>Subscription</Th><Th>Failed</Th><Th>Last error</Th><Th>{""}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {orphans.map(o => (
                  <tr key={o.id} className="hover:bg-white/[0.02]">
                    <Td>
                      {o.orgName ?? <span className="text-white/30">—</span>}
                      <span className="ml-1.5 font-mono text-white/30">{o.orgSlug ?? `#${o.organizationId}`}</span>
                    </Td>
                    <Td className="font-mono text-white/70">{o.stripeSubscriptionId}</Td>
                    <Td className="whitespace-nowrap">{formatDate(o.failedAt)}</Td>
                    <Td className="max-w-[22ch] truncate text-white/45" title={o.lastError ?? ""}>
                      {o.lastError ?? "—"}
                    </Td>
                    <Td><OrphanActions id={o.id} enabled={health.billingEnabled} onDone={onChanged} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {failedEvents.length > 0 && (
        <div>
          <h3 className="mb-1 text-[13px] font-medium text-amber-300">
            Failed webhook deliveries ({failedEvents.length})
          </h3>
          <p className="mb-3 text-[12px] text-white/40">
            Handling threw. Stripe retries for about three days and then stops, so anything
            older than that never landed. A delivery that later succeeded drops off this list
            on its own. Fixing the org state is usually a “sync” on its row above.
          </p>
          <div className="overflow-x-auto rounded-xl border border-amber-500/15">
            <table className="w-full text-[13px]">
              <thead className="bg-white/[0.02] text-white/50 uppercase text-[11px] tracking-wider">
                <tr><Th>Event</Th><Th>Type</Th><Th>Received</Th><Th>Error</Th></tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {failedEvents.map(e => (
                  <tr key={e.id} className="hover:bg-white/[0.02]">
                    <Td className="font-mono text-white/70">{e.id}</Td>
                    <Td>{e.type}</Td>
                    <Td className="whitespace-nowrap">{formatDate(e.receivedAt)}</Td>
                    <Td className="max-w-[30ch] truncate text-white/45" title={e.error ?? ""}>{e.error ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Cancel retries the Stripe call that failed during deletion — that is the one
 * that stops the money. Resolve just closes the row, for a subscription already
 * cancelled by hand in the Dashboard.
 */
function OrphanActions({ id, enabled, onDone }: { id: number; enabled: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState<"cancel" | "resolve" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function act(action: "cancel" | "resolve") {
    setBusy(action); setErr(null);
    try {
      const res = await fetch("/api/admin/billing-health", {
        method:      "POST",
        credentials: "same-origin",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ id, action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok === false) setErr(body?.error ?? `HTTP ${res.status}`);
      else onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => void act("cancel")}
        disabled={busy !== null || !enabled}
        title={enabled ? "Retry the Stripe cancellation" : "Billing is not configured on this deployment"}
        className="rounded border border-red-400/25 bg-red-400/8 px-2 py-1 text-[11px] text-red-300 disabled:opacity-40"
      >
        {busy === "cancel" ? "cancelling…" : "cancel in Stripe"}
      </button>
      <button
        type="button"
        onClick={() => void act("resolve")}
        disabled={busy !== null}
        title="Mark handled without calling Stripe"
        className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-white/55 hover:text-white/85 disabled:opacity-40"
      >
        {busy === "resolve" ? "…" : "mark done"}
      </button>
      {err && <span className="text-[11px] text-red-300/70" title={err}>failed</span>}
    </div>
  );
}

/** Colour maps to how much attention the state deserves, not to the word itself. */
function StatusPill({ status }: { status: string }) {
  const tone =
    status === "active" || status === "trialing" ? "text-emerald-300 border-emerald-400/20 bg-emerald-400/8"
    : status === "past_due" || status === "unpaid" ? "text-red-300 border-red-400/20 bg-red-400/8"
    : status === "quote_pending" ? "text-amber-300 border-amber-400/20 bg-amber-400/8"
    : "text-white/45 border-white/10 bg-white/[0.03]";
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[11px] ${tone}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 text-left font-medium">{children}</th>;
}
// `title` is threaded through because the health tables truncate long Stripe
// error strings and the full text has to stay reachable on hover.
function Td({ children, className = "", title }: { children: React.ReactNode; className?: string; title?: string }) {
  return <td className={`px-4 py-2.5 ${className}`} title={title}>{children}</td>;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
