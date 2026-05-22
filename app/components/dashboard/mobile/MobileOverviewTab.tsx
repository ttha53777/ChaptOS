"use client";

import { Card } from "../primitives";
import { ActivityFeed } from "../widgets";
import type { MobileActions, MobileTasksData } from "./MobileDashboard";

export function MobileOverviewTab({ tasksData, actions }: {
  tasksData: MobileTasksData;
  actions: MobileActions;
}) {
  const { alerts, urgentCount, activityFeed } = tasksData;

  return (
    <div className="space-y-4">
      {/* Needs Attention — tap to open the full attention drawer */}
      <Card
        style={{ background: "linear-gradient(to bottom, #ef444410 0%, #10121a 50%)" }}
        className="overflow-hidden transition-colors active:border-white/[0.14]"
        onClick={() => actions.setWidgetDrawer("attention")}
      >
        <div className="h-[3px] bg-red-500/70" />
        <div className="px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-white">Needs Attention</h2>
            <div className="flex items-center gap-2">
              {urgentCount > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">{urgentCount} critical</span>}
              <button onClick={() => actions.setWidgetDrawer("attention")} className="flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-slate-400 active:bg-red-500/15 active:text-red-400 transition-colors">
                All
                <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
          {alerts.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-slate-500">All clear — no issues detected</p>
          ) : (
            <div className="space-y-1.5">
              {alerts.slice(0, 5).map((alert, i) => {
                const left = alert.level === "high" ? "border-l-red-500" : alert.level === "medium" ? "border-l-amber-400" : "border-l-white/20";
                const bg   = alert.level === "high" ? "bg-red-500/10"    : alert.level === "medium" ? "bg-amber-500/10"    : "bg-white/[0.03]";
                return (
                  <div key={i} className={`flex items-start rounded-md border-l-[2.5px] px-2.5 py-1.5 ${left} ${bg}`}>
                    <p className="text-[12px] leading-snug text-slate-300">{alert.message}</p>
                  </div>
                );
              })}
              {alerts.length > 5 && <p className="pt-1 text-center text-[11px] text-slate-500">+{alerts.length - 5} more</p>}
            </div>
          )}
        </div>
      </Card>

      {/* Recent activity (reuses the shared widget) */}
      <ActivityFeed entries={activityFeed} onExpand={() => actions.setWidgetDrawer("activity")} />
    </div>
  );
}
