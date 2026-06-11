"use client";

import type { ProgrammingTask } from "../../data";
import { fmtDate } from "../../data";
import { programmingPrepScore } from "@/lib/programming";
import { TypeBadge } from "./PrepStatusPill";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function ProgrammingMobileList({
  monthGroups,
  onOpen,
}: {
  monthGroups: [string, ProgrammingTask[]][];
  onOpen: (id: number) => void;
}) {
  if (monthGroups.length === 0) {
    return <p className="py-16 text-center text-slate-500">No events yet.</p>;
  }

  return (
    <div className="space-y-6 lg:hidden">
      {monthGroups.map(([key, items]) => (
        <div key={key}>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{monthLabel(key)}</p>
          <div className="space-y-2">
            {items.map(e => {
              const prep = programmingPrepScore(e);
              return (
                <button
                  key={e.id}
                  onClick={() => onOpen(e.id)}
                  className="w-full rounded-xl border border-white/[0.07] bg-[#10121a] px-4 py-3 text-left transition-colors hover:border-white/[0.12]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-white">{e.title}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{fmtDate(e.dueDate)}{e.location ? ` · ${e.location}` : ""}</p>
                    </div>
                    <TypeBadge type={e.type} />
                  </div>
                  <div className="mt-2.5">
                    <div className="mb-1 flex justify-between text-[10px] text-slate-500">
                      <span>Prep</span>
                      <span>{prep.done}/{prep.total}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${prep.total ? (prep.done / prep.total) * 100 : 0}%` }} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
