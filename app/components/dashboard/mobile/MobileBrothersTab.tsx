"use client";

import { getBrotherStatus } from "../../../data";
import { BrotherAvatar } from "../../BrotherAvatar";
import { AttBar } from "../widgets";
import { BROTHER_STYLES, inputCls } from "../styles";
import { useThresholds } from "../../../hooks/useThresholds";
import type { MobileActions, MobileBrothersData, StatusFilter } from "./MobileDashboard";

const FILTERS: StatusFilter[] = ["All", "Good", "Watch", "At Risk"];

export function MobileBrothersTab({ brothersData, actions }: {
  brothersData: MobileBrothersData;
  actions: MobileActions;
}) {
  const { filteredBrothers, brotherList, statusCounts, search, statusFilter, selfId, currentUser, avatarRevision } = brothersData;
  const THRESHOLDS = useThresholds();

  return (
    <div className="space-y-3">
      {/* Search — primary on mobile (toolbar search is hidden below sm) */}
      <input
        type="text"
        value={search}
        onChange={e => actions.setSearch(e.target.value)}
        placeholder="Search brothers…"
        className={inputCls}
      />

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => actions.setStatusFilter(f)}
            className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
              statusFilter === f
                ? "bg-white/[0.12] text-white"
                : "border border-white/[0.1] text-slate-400 active:border-white/[0.2]"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Brother card list — tap a row to open the BrotherDrawer */}
      <ul className="overflow-hidden rounded-xl card-premium divide-y divide-white/[0.04]">
        {filteredBrothers.length === 0 ? (
          <li className="py-10 text-center text-sm text-slate-500">No brothers match your filters.</li>
        ) : filteredBrothers.map(b => {
          const status = getBrotherStatus(b, THRESHOLDS);
          return (
            <li
              key={b.id}
              onClick={() => actions.setSelectedBrotherId(b.id)}
              className={`flex items-center gap-2.5 border-l-2 px-4 py-3 transition-colors active:bg-white/[0.06] ${BROTHER_STYLES[status].row}`}
            >
              <BrotherAvatar
                brother={b}
                selfId={selfId}
                selfAvatarUrl={currentUser?.avatarUrl}
                avatarRevision={avatarRevision}
                size="sm"
              />
              <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">{b.name}</p>
              <AttBar pct={b.attendance} />
              <svg className="h-4 w-4 shrink-0 text-slate-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </li>
          );
        })}
      </ul>

      {/* Counts footer */}
      <p className="px-1 text-[11px] text-slate-500">
        {filteredBrothers.length} / {brotherList.length} brothers ·{" "}
        <span className="font-medium text-emerald-400">{statusCounts.Good} good</span> ·{" "}
        <span className="font-medium text-amber-400">{statusCounts.Watch} watch</span> ·{" "}
        <span className="font-medium text-red-400">{statusCounts["At Risk"]} at risk</span>
      </p>
    </div>
  );
}
