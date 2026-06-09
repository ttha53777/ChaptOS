"use client";

import dynamic from "next/dynamic";
import { fmt$ } from "../../../data";
import { SvgIcon } from "../../Sidebar";
import { Card } from "../primitives";
import { KPI_ICONS } from "../styles";
import { useFeature } from "../../../hooks/useFeature";
import type { MobileActions, MobileMoneyData } from "./MobileDashboard";

// Same dynamic, ssr:false import as the desktop dashboard. Because this tab only
// mounts when active, the mobile Recharts instance is created lazily on open and
// torn down on leave — avoiding a hidden zero-size mount.
const DashboardCharts = dynamic(() => import("../DashboardCharts"), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-1 gap-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-[148px] rounded-xl border border-white/[0.06] bg-[#10121a] animate-pulse" />
      ))}
    </div>
  ),
});

export function MobileMoneyTab({ moneyData, actions }: {
  moneyData: MobileMoneyData;
  actions: MobileActions;
}) {
  const {
    liveBalance, liveProjected, liveTrend, totalDoorRev, partyList,
    partyChartData, statusChartData, svcChartData, goodCount, brotherCount,
    onTrackSvc, serviceHoursGoal, maxRevenue, bestEvent,
  } = moneyData;
  const feature = useFeature();

  return (
    <div className="space-y-4">
      {/* Treasury + Door summary rows — tap to open the KPI detail drawers */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => actions.setActiveDrawer("treasury")} className="flex flex-col gap-1 rounded-xl card-premium px-3 py-2.5 text-left active:border-white/[0.14]">
          <div className="flex items-center gap-1 text-slate-500">
            <SvgIcon d={KPI_ICONS.treasury ?? ""} className="h-3.5 w-3.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wide">Treasury</span>
          </div>
          <span className="text-[17px] font-bold tabular-nums text-indigo-400">{fmt$(liveBalance)}</span>
          <span className="text-[10px] text-slate-500">projected {fmt$(liveProjected)}</span>
        </button>
        <button onClick={() => actions.setActiveDrawer("door")} className="flex flex-col gap-1 rounded-xl card-premium px-3 py-2.5 text-left active:border-white/[0.14]">
          <div className="flex items-center gap-1 text-slate-500">
            <SvgIcon d={KPI_ICONS.door ?? ""} className="h-3.5 w-3.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wide">Door Rev</span>
          </div>
          <span className="text-[17px] font-bold tabular-nums text-pink-400">{fmt$(totalDoorRev)}</span>
          <span className="text-[10px] text-slate-500">{bestEvent ? `best ${fmt$(bestEvent.doorRevenue)}` : "—"}</span>
        </button>
      </div>

      {/* Party Events */}
      <Card
        style={{ background: "linear-gradient(to bottom, #818cf810 0%, #10121a 50%)" }}
        className="overflow-hidden transition-colors active:border-white/[0.14]"
        onClick={() => actions.setWidgetDrawer("parties")}
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
          <h2 className="text-[13px] font-semibold text-white">Party Events</h2>
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-bold text-white">{fmt$(totalDoorRev)}</p>
            <button onClick={(e) => { e.stopPropagation(); actions.setActiveModal("revenue"); }} className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-400 active:bg-indigo-500/25 transition-colors">+ Add</button>
          </div>
        </div>
        <div className="space-y-3 px-4 py-4">
          {partyList.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-slate-500">No events logged — tap + Add to log revenue</p>
          ) : partyList.map(e => {
            const barPct = maxRevenue > 0 ? Math.round((e.doorRevenue / maxRevenue) * 100) : 0;
            const isTop  = bestEvent ? e.id === bestEvent.id : false;
            return (
              <div key={e.id} className="flex items-center gap-3">
                <div className="w-20 shrink-0">
                  <p className={`truncate text-[12px] font-medium ${isTop ? "text-indigo-400" : "text-slate-300"}`}>{e.name}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                    <div className={`h-full rounded-full transition-all duration-500 ${isTop ? "bg-indigo-400" : "bg-white/[0.18]"}`} style={{ width: `${barPct}%` }} />
                  </div>
                </div>
                <span className="w-12 shrink-0 tabular-nums text-right text-[12px] font-semibold text-white">{fmt$(e.doorRevenue)}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Charts — mount only while this tab is open */}
      {feature("operations", "charts") && (
        <DashboardCharts
          liveBalance={liveBalance}
          liveProjected={liveProjected}
          liveTrend={liveTrend}
          totalDoorRev={totalDoorRev}
          partyCount={partyList.length}
          partyChartData={partyChartData}
          brotherCount={brotherCount}
          goodCount={goodCount}
          statusChartData={statusChartData}
          onTrackSvc={onTrackSvc}
          serviceHoursGoal={serviceHoursGoal}
          svcChartData={svcChartData}
        />
      )}
    </div>
  );
}
