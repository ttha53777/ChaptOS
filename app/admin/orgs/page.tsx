"use client";

import { useEffect, useState } from "react";

// /admin/orgs — PlatformAdmin audit page.
// Lists every organization in the system, newest first. Read-only.
// Gated server-side by /api/admin/orgs which calls requireAdmin().

interface OrgRow {
  id:          number;
  name:        string;
  slug:        string;
  orgType:     string | null;
  createdAt:   string;
  founderName: string | null;
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
              <Td>{o.founderName ?? <span className="text-white/30">—</span>}</Td>
              <Td>{formatDate(o.createdAt)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
