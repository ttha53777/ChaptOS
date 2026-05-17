"use client";

import React, { useState, useEffect } from "react";
import { Sidebar } from "../components/Sidebar";
import { GeneralSection } from "./sections/GeneralSection";
import { ThresholdsSection } from "./sections/ThresholdsSection";
import { SemestersSection } from "./sections/SemestersSection";
import { AccountsSection } from "./sections/AccountsSection";

// ─── Nav config ───────────────────────────────────────────────────────────────

type SectionId = "general" | "thresholds" | "semesters" | "accounts";

interface NavItem {
  id: SectionId;
  label: string;
  description: string;
  group: "Chapter" | "System";
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "general",
    label: "General",
    description: "Data controls, quick actions, and chapter info",
    group: "Chapter",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  },
  {
    id: "thresholds",
    label: "Thresholds",
    description: "Attendance, GPA, and service hour cutoffs",
    group: "Chapter",
    icon: "M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z",
  },
  {
    id: "semesters",
    label: "Semesters",
    description: "Create semesters and set the active one",
    group: "Chapter",
    icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  },
  {
    id: "accounts",
    label: "Accounts",
    description: "Manage brother Google account links",
    group: "System",
    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  },
];

const GROUPS: Array<"Chapter" | "System"> = ["Chapter", "System"];

// ─── Settings nav item ────────────────────────────────────────────────────────

function SettingsNavItem({
  item, isActive, onClick,
}: {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-all duration-150 ${
        isActive
          ? "bg-gradient-to-r from-indigo-500/15 to-indigo-500/[0.04] text-indigo-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ring-1 ring-inset ring-indigo-500/15"
          : "text-white/45 hover:bg-white/[0.04] hover:text-white/80"
      }`}
    >
      <svg
        className="h-4 w-4 shrink-0 opacity-75"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.8}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
      </svg>
      <span className="truncate">{item.label}</span>
      {isActive && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" aria-hidden="true" />}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeId, setActiveId] = useState<SectionId>("general");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  // Mobile nav: show as horizontal scrollable strip on small screens
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!statusMsg) return;
    const t = setTimeout(() => setStatusMsg(null), 4000);
    return () => clearTimeout(t);
  }, [statusMsg]);

  useEffect(() => {
    if (!pageError) return;
    const t = setTimeout(() => setPageError(null), 6000);
    return () => clearTimeout(t);
  }, [pageError]);

  const activeItem = NAV_ITEMS.find(n => n.id === activeId)!;

  function selectSection(id: SectionId) {
    setActiveId(id);
    setMobileNavOpen(false);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0d1117]">
      {/* Main app sidebar — unchanged */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeSection="Settings"
        onNavClick={() => {}}
      />

      {/* Settings area: inner nav + content panel */}
      <div className="flex min-w-0 flex-1 overflow-hidden">

        {/* ── Settings left nav (lg+: always visible, <lg: hidden) ── */}
        <nav
          aria-label="Settings navigation"
          className="hidden lg:flex w-[230px] shrink-0 flex-col border-r border-white/[0.05] bg-[#0d1117] px-3 py-5"
        >
          {GROUPS.map(group => {
            const items = NAV_ITEMS.filter(n => n.group === group);
            return (
              <div key={group} className="mb-5">
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/25">{group}</p>
                <div className="space-y-0.5">
                  {items.map(item => (
                    <SettingsNavItem
                      key={item.id}
                      item={item}
                      isActive={activeId === item.id}
                      onClick={() => selectSection(item.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* ── Content column ── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

          {/* Top bar: hamburger (main sidebar) + mobile settings nav toggle */}
          <header className="toolbar-frosted relative z-10 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.05] px-4 sm:px-6">
            {/* Main sidebar toggle (mobile) */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.07] lg:hidden"
              aria-label="Open menu"
            >
              <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold leading-tight text-white">{activeItem.label}</p>
              <p className="hidden text-[11px] leading-tight text-slate-400 sm:block">{activeItem.description}</p>
            </div>

            {/* Mobile settings nav toggle */}
            <button
              onClick={() => setMobileNavOpen(v => !v)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 text-[12px] font-medium text-slate-400 hover:bg-white/[0.08] lg:hidden"
              aria-label="Settings sections"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 4.75A.75.75 0 0 1 2.75 4h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75ZM2 8a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8Zm0 3.25a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1-.75-.75Z" />
              </svg>
              Sections
            </button>
          </header>

          {/* Mobile nav dropdown */}
          {mobileNavOpen && (
            <div className="relative z-20 border-b border-white/[0.06] bg-[#0d1117] px-3 py-3 lg:hidden">
              <div className="flex flex-wrap gap-1">
                {NAV_ITEMS.map(item => (
                  <button
                    key={item.id}
                    onClick={() => selectSection(item.id)}
                    className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all ${
                      activeId === item.id
                        ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-500/20"
                        : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Toast */}
          {(pageError || statusMsg) && (
            <div className="px-6 pt-4">
              <div
                className={`rounded-xl border px-4 py-3 text-[12px] ${
                  pageError
                    ? "border-red-500/25 bg-red-500/10 text-red-200"
                    : "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                }`}
              >
                {pageError ?? statusMsg}
              </div>
            </div>
          )}

          {/* Scrollable content */}
          <main className="page-ambient flex-1 overflow-y-auto">
            <div className="mx-auto max-w-2xl px-6 py-8">
              {activeId === "general" && (
                <GeneralSection onStatus={setStatusMsg} onError={setPageError} />
              )}
              {activeId === "thresholds" && (
                <ThresholdsSection onStatus={setStatusMsg} />
              )}
              {activeId === "semesters" && (
                <SemestersSection onStatus={setStatusMsg} onError={setPageError} />
              )}
              {activeId === "accounts" && (
                <AccountsSection onStatus={setStatusMsg} onError={setPageError} />
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
