"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { WorkflowId } from "@/lib/org-types";

export type QuickActionKey =
  | "expense"
  | "revenue"
  | "excuse"
  | "deadline"
  | "event"
  | "ig";

interface QuickAction {
  key: QuickActionKey;
  label: string;
  icon: ReactNode;
  adminOnly: boolean;
  /** When set, the action is hidden unless the org has this workflow enabled.
   *  e.g. "Log Expense"/"Log Revenue" disappear when the Treasury page is off. */
  workflow?: WorkflowId;
}

const ICON_CLS = "h-3.5 w-3.5 shrink-0";

const ExpenseIcon = (
  <svg className={ICON_CLS} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2" />
    <path d="M12 6v12" />
    <circle cx="12" cy="12" r="10" />
  </svg>
);

const RevenueIcon = (
  <svg className={ICON_CLS} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M14 7h7v7" />
  </svg>
);

const ExcuseIcon = (
  <svg className={ICON_CLS} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M9 14l2 2 4-4" />
  </svg>
);

const DeadlineIcon = (
  <svg className={ICON_CLS} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);

const EventIcon = (
  <svg className={ICON_CLS} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

const IgIcon = (
  <svg className={ICON_CLS} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
  </svg>
);

const QUICK_ACTIONS: QuickAction[] = [
  { key: "expense",  label: "Log Expense",  icon: ExpenseIcon,  adminOnly: true,  workflow: "finance" },
  { key: "revenue",  label: "Log Revenue",  icon: RevenueIcon,  adminOnly: true,  workflow: "finance" },
  { key: "excuse",   label: "Log Excuse",   icon: ExcuseIcon,   adminOnly: false },
  { key: "deadline", label: "Add Deadline", icon: DeadlineIcon, adminOnly: false },
  { key: "event",    label: "New Event",    icon: EventIcon,    adminOnly: false },
  { key: "ig",       label: "Add IG Task",  icon: IgIcon,       adminOnly: false },
];

export function QuickActionsMenu({
  isAdmin,
  onSelect,
  variant = "desktop",
  enabledWorkflows,
}: {
  isAdmin: boolean;
  onSelect: (key: QuickActionKey) => void;
  variant?: "desktop" | "mobile";
  /** The org's enabled workflows. Actions tagged with a `workflow` are hidden
   *  when that workflow isn't enabled (e.g. finance actions when Treasury is
   *  off). Undefined (still loading) shows all — same forgiving default the
   *  sidebar uses to avoid a flash of a half-empty menu. */
  enabledWorkflows?: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = QUICK_ACTIONS.filter(a => {
    if (a.adminOnly && !isAdmin) return false;
    // Hide a workflow-gated action when the org has that workflow disabled.
    // When enabledWorkflows is undefined (still loading) keep the action.
    if (a.workflow && enabledWorkflows && !enabledWorkflows.includes(a.workflow)) return false;
    return true;
  });
  const showDivider = isAdmin && items.some(a => a.adminOnly) && items.some(a => !a.adminOnly);

  function handlePick(key: QuickActionKey) {
    setOpen(false);
    onSelect(key);
  }

  return (
    <div ref={wrapRef} className="relative">
      {variant === "desktop" ? (
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-150 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-200"
        >
          <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13 2L4.5 13.5h6L11 22l8.5-11.5h-6L13 2z" />
          </svg>
          <span>Quick Actions</span>
          <svg className={`h-3 w-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-500"
        >
          <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 w-56 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0f1219]/95 py-1.5 shadow-[0_12px_28px_-8px_rgba(0,0,0,0.8)] backdrop-blur-xl"
        >
          {items.map((a, i) => {
            const prev = items[i - 1];
            const needsDivider = showDivider && prev && prev.adminOnly && !a.adminOnly;
            return (
              <div key={a.key}>
                {needsDivider && <div className="my-1 border-t border-white/[0.05]" />}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handlePick(a.key)}
                  className="group flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] font-medium text-slate-300 transition-colors hover:bg-indigo-500/10 hover:text-white"
                >
                  <span className="text-slate-500 group-hover:text-indigo-300">{a.icon}</span>
                  <span className="flex-1">{a.label}</span>
                  {a.adminOnly && (
                    <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">Admin</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
