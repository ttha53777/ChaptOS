"use client";

import React, { useCallback, useEffect, useState } from "react";
import { orgFetch } from "../../../lib/api";

type ActivityType = "success" | "warning" | "info";

interface ActivityRow {
  id: number;
  message: string;
  type: ActivityType;
  timestamp: string;
  actorId: number | null;
}

type Filter = "all" | ActivityType;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all",     label: "All" },
  { id: "info",    label: "Info" },
  { id: "success", label: "Success" },
  { id: "warning", label: "Warning" },
];

const DOT: Record<ActivityType, string> = {
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  info:    "bg-blue-400",
};

function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

async function requestActivity(filter: Filter): Promise<{ rows?: ActivityRow[]; forbidden?: boolean; error?: string }> {
  const url = filter === "all" ? "/api/activity/full" : `/api/activity/full?type=${filter}`;
  const res = await orgFetch(url);
  if (res.status === 403) return { forbidden: true };
  if (!res.ok) return { error: `Request failed (${res.status})` };
  const rows = await res.json() as ActivityRow[];
  return { rows };
}

export function ActivityLogSection({
  onError,
}: {
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async (f: Filter) => {
    setLoading(true);
    const result = await requestActivity(f);
    if (result.forbidden) {
      setForbidden(true);
      setRows([]);
    } else if (result.error) {
      onError(result.error);
      setRows([]);
    } else if (result.rows) {
      setForbidden(false);
      setRows(result.rows);
    }
    setLoading(false);
  }, [onError]);

  useEffect(() => { load(filter); }, [filter, load]);

  if (forbidden) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-6 text-center">
          <p className="text-[13px] font-medium text-amber-300">Officer access required</p>
          <p className="mt-1 text-[12px] text-amber-300/70">
            The activity log is restricted to chapter officers.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all ${
              filter === f.id
                ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-500/20"
                : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-8 text-center text-[11px] text-slate-600">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] py-8 text-center text-[11px] text-slate-600">
          No activity recorded yet.
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-white/[0.04]">
            {rows.map(r => (
              <div key={r.id} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03]">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${DOT[r.type]}`} />
                <p className="flex-1 text-[12.5px] leading-snug text-slate-300">{r.message}</p>
                <span className="shrink-0 text-[10.5px] text-slate-500 whitespace-nowrap">
                  {formatAbsolute(r.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
