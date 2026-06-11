"use client";

import type { ProgrammingTask } from "../../data";
import { fmtDate } from "../../data";
import type { SheetColumn } from "../grid/SheetGrid";
import { SheetTextCell } from "../grid/SheetGrid";
import { TypeBadge } from "./PrepStatusPill";

type ApiPatch = Record<string, unknown>;

/**
 * Column config for the Programming matrix. The grid surfaces the core planning
 * fields — Type, Event, Date, Time, Location, Doc, Collab — while the rest of an
 * event's prep state (room, itinerary, spending, flyer, socials, success) lives
 * in the inspector panel. Grid chrome lives in SheetGrid.
 */
export function programmingColumns({
  onPatch,
  onDocs,
}: {
  onPatch: (id: number, patch: ApiPatch) => Promise<void>;
  onDocs: (id: number) => void;
}): SheetColumn<ProgrammingTask>[] {
  return [
    {
      key: "type",
      label: "Type",
      kind: "badge",
      width: "w-36",
      accent: true,
      render: e => <TypeBadge type={e.type} />,
    },
    {
      key: "title",
      label: "Event",
      kind: "text",
      width: "w-56",
      render: (e, canManage) => (
        <SheetTextCell
          value={e.title}
          display={<span className="font-medium text-white">{e.title}</span>}
          canManage={canManage}
          required
          className="font-medium"
          onCommit={next => onPatch(e.id, { title: next })}
        />
      ),
    },
    {
      key: "date",
      label: "Date",
      kind: "date",
      width: "w-36",
      render: (e, canManage) => (
        <SheetTextCell
          value={e.dueDate}
          display={<span className="whitespace-nowrap text-slate-400">{fmtDate(e.dueDate)}</span>}
          canManage={canManage}
          type="date"
          required
          className="tabular-nums"
          onCommit={next => onPatch(e.id, { dueDate: next })}
        />
      ),
    },
    {
      key: "time",
      label: "Time",
      kind: "time",
      width: "w-28",
      render: (e, canManage) => (
        <SheetTextCell
          value={e.time ?? ""}
          display={<span className="text-slate-400">{e.time || "—"}</span>}
          canManage={canManage}
          placeholder="7:00 PM"
          className="tabular-nums"
          onCommit={next => onPatch(e.id, { time: next || null })}
        />
      ),
    },
    {
      key: "location",
      label: "Location",
      kind: "text",
      width: "w-48",
      render: (e, canManage) => (
        <SheetTextCell
          value={e.location}
          display={<span className="truncate text-slate-400">{e.location || "—"}</span>}
          canManage={canManage}
          onCommit={next => onPatch(e.id, { location: next })}
        />
      ),
    },
    {
      key: "docs",
      label: "Doc",
      kind: "link",
      width: "w-20",
      align: "center",
      render: e => (
        <button
          onClick={() => onDocs(e.id)}
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold tabular-nums transition-colors ${
            e.docCount > 0
              ? "border-indigo-500/30 bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25"
              : "border-white/[0.10] bg-white/[0.05] text-slate-400 hover:border-indigo-500/30 hover:text-indigo-300"
          }`}
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h6M9 8h2M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
          </svg>
          {e.docCount > 0 ? e.docCount : "File"}
        </button>
      ),
    },
    {
      key: "collab",
      label: "Collab?",
      kind: "text",
      width: "w-36",
      render: (e, canManage) => (
        <SheetTextCell
          value={e.collab ?? ""}
          display={<span className="text-slate-400">{e.collab || "—"}</span>}
          canManage={canManage}
          placeholder="—"
          onCommit={next => onPatch(e.id, { collab: next || null })}
        />
      ),
    },
  ];
}
