"use client";

export type MobileTab = "Overview" | "Tasks" | "Money" | "Logs";

const TABS: MobileTab[] = ["Overview", "Tasks", "Money", "Logs"];

export function MobileTabBar({ activeTab, onChange }: {
  activeTab: MobileTab;
  onChange: (t: MobileTab) => void;
}) {
  return (
    <div className="flex gap-1 px-3 pb-2">
      {TABS.map(t => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`flex-1 rounded-lg px-2 py-2.5 text-[12px] font-medium transition-colors ${
            activeTab === t
              ? "bg-white/[0.12] text-white"
              : "text-slate-400 active:bg-white/[0.05]"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
