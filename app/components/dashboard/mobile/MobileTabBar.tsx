"use client";

import { SvgIcon } from "../../Sidebar";

// The mobile dashboard collapses to three bottom-bar entries. Two switch the
// body (Home / Activity); "More" is an *action* — it opens the app sidebar
// drawer so the rest of the app (Treasury, Parties, Settings…) stays reachable —
// so it carries no active state.
export type MobileTab = "Home" | "Activity";

const TAB_ICONS: Record<MobileTab, string> = {
  Home:     "M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z",
  Activity: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
};
const MORE_ICON = "M4 6h16M4 12h16M4 18h16";

const TABS: MobileTab[] = ["Home", "Activity"];

export function MobileTabBar({ activeTab, onChange, onMore }: {
  activeTab: MobileTab;
  onChange: (t: MobileTab) => void;
  onMore: () => void;
}) {
  return (
    <nav className="dm-frost fixed inset-x-0 bottom-0 z-30 flex border-t border-[var(--line)] px-3 pb-safe pt-1.5 md:hidden">
      {TABS.map(t => {
        const active = activeTab === t;
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-[10.5px] font-semibold transition-colors ${
              active ? "text-[var(--ink)]" : "text-[var(--faint)] active:text-[var(--ink-soft)]"
            }`}
          >
            <SvgIcon d={TAB_ICONS[t]} className={`h-[22px] w-[22px] ${active ? "text-[var(--vio)]" : ""}`} />
            {t}
          </button>
        );
      })}
      <button
        onClick={onMore}
        className="flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-[10.5px] font-semibold text-[var(--faint)] transition-colors active:text-[var(--ink-soft)]"
      >
        <SvgIcon d={MORE_ICON} className="h-[22px] w-[22px]" />
        More
      </button>
    </nav>
  );
}
