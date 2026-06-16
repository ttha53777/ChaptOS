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
  success: "var(--ok)",
  warning: "var(--gold)",
  info:    "var(--vio)",
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
      <div className="sc-empty" style={{ borderStyle: "solid", borderColor: "var(--gold-bg)", background: "var(--gold-bg)" }}>
        <div className="t" style={{ color: "var(--gold)" }}>Officer access required</div>
        <div className="h">The activity log is restricted to chapter officers.</div>
      </div>
    );
  }

  return (
    <div className="sc-stack-tight">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`sc-btn sc-btn-sm ${filter === f.id ? "sc-btn-accent" : "sc-btn-ghost"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-8 text-center sc-note">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="sc-empty"><div className="t">No activity recorded yet</div></div>
      ) : (
        <div className="sc-card">
          <div className="max-h-[60vh] overflow-y-auto">
            {rows.map(r => (
              <div key={r.id} className="sc-row" style={{ alignItems: "flex-start" }}>
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: DOT[r.type] }} />
                <p className="flex-1 text-[12.5px] leading-snug" style={{ color: "var(--ink-soft)" }}>{r.message}</p>
                <span className="shrink-0 text-[10.5px] whitespace-nowrap" style={{ color: "var(--faint)", fontFamily: "var(--mono)" }}>
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
