"use client";

import { fmt$ } from "../../../data";
import { SvgIcon } from "../../Sidebar";
import { useVocab } from "../../../hooks/useVocab";
import { MobileTasksTab } from "./MobileTasksTab";
import { MobileMoneyTab } from "./MobileMoneyTab";
import { MobileBrothersTab } from "./MobileBrothersTab";
import type { MobileActions, MobileBrothersData, MobileMoneyData, MobileTasksData } from "./MobileDashboard";

export type ActivityGroup = "Tasks" | "Money" | "People";

export function MobileActivityHub({
  activeGroup, onSelectGroup, onBack,
  tasksData, moneyData, brothersData, actions,
}: {
  activeGroup: ActivityGroup | null;
  onSelectGroup: (g: ActivityGroup) => void;
  onBack: () => void;
  tasksData: MobileTasksData;
  moneyData: MobileMoneyData;
  brothersData: MobileBrothersData;
  actions: MobileActions;
}) {
  const v = useVocab();

  // Drill-in view: a back affordance over the existing full tab body, unchanged.
  if (activeGroup) {
    return (
      <div className="space-y-3">
        <button
          onClick={onBack}
          className="-ml-1 flex items-center gap-1 text-[13px] font-medium text-[var(--muted)] active:text-[var(--ink)]"
        >
          <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Activity
        </button>
        {activeGroup === "Tasks"  && <MobileTasksTab    tasksData={tasksData}     actions={actions} />}
        {activeGroup === "Money"  && <MobileMoneyTab    moneyData={moneyData}     actions={actions} />}
        {activeGroup === "People" && <MobileBrothersTab brothersData={brothersData} actions={actions} />}
      </div>
    );
  }

  // Hub menu: glanceable summary cards that drill into each group.
  const dueCount =
    tasksData.deadlineList.filter(d => d.status !== "Complete").length +
    tasksData.igTaskList.filter(t => t.status !== "Complete").length;
  const atRisk = brothersData.statusCounts["At Risk"];

  const cards: {
    group: ActivityGroup; label: string; sub: string; icon: string;
    iconBg: string; stat: string; statCls: string;
  }[] = [
    {
      group: "Tasks", label: "Tasks", sub: "Deadlines & Instagram",
      icon: "M9 11l3 3 8-8M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11",
      iconBg: "bg-[var(--gold-bg)] text-[var(--gold)]",
      stat: dueCount > 0 ? `${dueCount} due` : "All clear",
      statCls: dueCount > 0 ? "bg-[var(--gold-bg)] text-[var(--gold)]" : "bg-[var(--ok-bg)] text-[var(--ok)]",
    },
    {
      group: "Money", label: v("Treasury"), sub: "Balance, door & parties",
      icon: "M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
      iconBg: "bg-[var(--ok-bg)] text-[var(--ok)]",
      stat: fmt$(moneyData.liveBalance),
      statCls: "bg-[rgba(236,231,221,0.06)] text-[var(--ink-soft)]",
    },
    {
      group: "People", label: v("Member", true), sub: "Roster & standing",
      icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
      iconBg: "bg-[var(--vio-bg)] text-[var(--vio)]",
      stat: atRisk > 0 ? `${atRisk} at risk` : `${brothersData.brotherList.length} active`,
      statCls: atRisk > 0 ? "bg-[var(--rose-bg)] text-[var(--rose)]" : "bg-[rgba(236,231,221,0.06)] text-[var(--ink-soft)]",
    },
  ];

  return (
    <div className="space-y-2.5">
      <h1 className="dm-serif px-1 pb-1 text-[23px] text-[var(--ink)]">Activity</h1>
      {cards.map(c => (
        <button
          key={c.group}
          onClick={() => onSelectGroup(c.group)}
          className="dm-card flex w-full items-center gap-3.5 rounded-2xl px-4 py-4 text-left"
        >
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${c.iconBg}`} aria-hidden>
            <SvgIcon d={c.icon} className="h-[22px] w-[22px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15.5px] font-semibold text-[var(--ink)]">{c.label}</span>
            <span className="block truncate text-[12.5px] text-[var(--muted)]">{c.sub}</span>
          </span>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${c.statCls}`}>{c.stat}</span>
          <svg className="h-4 w-4 shrink-0 text-[var(--faint)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      ))}
    </div>
  );
}
