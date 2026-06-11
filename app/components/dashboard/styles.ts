import type { BrotherStatus, TaskStatus } from "../../data";

export const BROTHER_STYLES: Record<BrotherStatus, { badge: string; row: string }> = {
  "Good":    { badge: "bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-500/25", row: "border-l-emerald-400" },
  "Watch":   { badge: "bg-amber-500/15 text-amber-400 ring-1 ring-inset ring-amber-500/25",       row: "border-l-amber-400"   },
  "At Risk": { badge: "bg-red-500/15 text-red-400 ring-1 ring-inset ring-red-500/25",             row: "border-l-red-500"     },
};

export const TASK_STYLES: Record<TaskStatus, string> = {
  "Urgent":   "bg-red-500/15 text-red-400 ring-1 ring-inset ring-red-500/25",
  "Due Soon": "bg-amber-500/15 text-amber-400 ring-1 ring-inset ring-amber-500/25",
  "Upcoming": "bg-slate-500/15 text-slate-400 ring-1 ring-inset ring-slate-500/20",
  "Complete": "bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-500/25",
};

export const KPI_ICONS: Record<string, string> = {
  attendance: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  dues:       "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  gpa:        "M12 14l9-5-9-5-9 5 9 5z M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z",
  service:    "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
  treasury:   "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  door:       "M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z",
  custom:     "M16 8v8m-4-5v5m-4-2v2M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
};

export const SECTION_IDS: Record<string, string> = {
  Dashboard: "sec-dashboard",
  Brothers:  "sec-brothers",
  Deadlines: "sec-deadlines",
  Instagram: "sec-instagram",
  Treasury:  "sec-treasury",
  Parties:   "sec-parties",
};

export const inputCls = "w-full rounded-lg border border-white/[0.08] bg-[#0a0d14] px-3 py-2 text-[13px] text-white placeholder:text-slate-500 focus:border-indigo-500/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/15";

/** Frosted header CTA — matches Brothers, Instagram, Treasury toolbar buttons */
export const headerActionBtnCls =
  "flex h-8 items-center gap-1.5 rounded-full border border-indigo-500/20 bg-white/[0.04] px-3.5 text-[12px] font-semibold text-indigo-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all hover:border-indigo-400/35 hover:bg-indigo-500/[0.08] hover:text-white";

export const tooltipStyle = {
  background: "rgba(20, 25, 37, 0.95)",
  backdropFilter: "blur(8px)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  boxShadow: "0 8px 24px -8px rgba(0,0,0,0.6)",
  fontSize: 11,
  color: "#cbd5e1",
};
