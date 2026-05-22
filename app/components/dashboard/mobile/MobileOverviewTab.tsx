"use client";

import { fmtRange } from "../../../data";
import { Card } from "../primitives";
import { MobileBrothersTab } from "./MobileBrothersTab";
import type { MobileActions, MobileBrothersData, MobileTasksData } from "./MobileDashboard";

export function MobileOverviewTab({ tasksData, brothersData, actions }: {
  tasksData: MobileTasksData;
  brothersData: MobileBrothersData;
  actions: MobileActions;
}) {
  const { weeklyDigest, weekRange } = tasksData;
  const digestTotal =
    weeklyDigest.deadlinesDue.length + weeklyDigest.igDue.length +
    weeklyDigest.eventsThisWeek.length + weeklyDigest.partiesThisWeek.length;

  return (
    <div className="space-y-4">
      {/* Weekly Digest — tap to open the full digest drawer */}
      <Card
        style={{ background: "linear-gradient(to bottom, #818cf810 0%, #10121a 50%)" }}
        className="overflow-hidden transition-colors active:border-white/[0.14]"
        onClick={() => actions.setWidgetDrawer("digest")}
      >
        <div className="h-[3px] bg-indigo-500/70" />
        <div className="px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-[13px] font-semibold text-white">Weekly Digest</h2>
              <p className="text-[11px] text-slate-500">{fmtRange(weekRange.start, weekRange.end)}</p>
            </div>
            <div className="flex items-center gap-2">
              {weeklyDigest.atRiskCount > 0 && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-400">{weeklyDigest.atRiskCount} at risk</span>}
              <button onClick={() => actions.setWidgetDrawer("digest")} className="flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-slate-400 active:bg-indigo-500/15 active:text-indigo-300 transition-colors">
                All
                <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
          {digestTotal === 0 ? (
            <p className="py-4 text-center text-[12px] text-slate-500">Nothing on the agenda this week</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {([
                ["Deadlines", weeklyDigest.deadlinesDue.length,    "text-indigo-300"],
                ["Instagram", weeklyDigest.igDue.length,           "text-pink-300"],
                ["Events",    weeklyDigest.eventsThisWeek.length,  "text-blue-300"],
                ["Parties",   weeklyDigest.partiesThisWeek.length, "text-violet-300"],
              ] as const).map(([label, count, color]) => (
                <div key={label} className={`flex items-center justify-between rounded-md px-2.5 py-1.5 ${count > 0 ? "bg-white/[0.04]" : "bg-white/[0.015]"}`}>
                  <span className={`text-[11px] ${count > 0 ? "text-slate-300" : "text-slate-600"}`}>{label}</span>
                  <span className={`text-[13px] font-bold tabular-nums ${count > 0 ? color : "text-slate-700"}`}>{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Brothers list (reuses the shared brothers tab body) */}
      <MobileBrothersTab brothersData={brothersData} actions={actions} />
    </div>
  );
}
