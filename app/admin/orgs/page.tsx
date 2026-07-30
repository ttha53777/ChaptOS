"use client";

import { useEffect, useState } from "react";

// /admin/orgs — PlatformAdmin audit page.
// Lists every organization in the system, newest first. Read-only.
// Gated server-side by /api/admin/orgs which calls requireAdmin().

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

type Status =
  | { kind: "loading" }
  | { kind: "ready"; orgs: OrgRow[] }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

export default function AdminOrgsPage() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

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
            </tr>
          ))}
        </tbody>
      </table>
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
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 ${className}`}>{children}</td>;
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
