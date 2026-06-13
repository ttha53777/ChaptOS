"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";

const DrawerTrendChart = dynamic(() => import("../components/dashboard/DrawerTrendChart"), {
  ssr: false,
  loading: () => <div className="h-[110px] w-full rounded-lg bg-white/[0.04] animate-pulse" />,
});
import {
  Brother, CalendarEvent, TaskStatus, ActivityEntry, PartyEvent, Deadline, InstagramTask, Transaction,
  treasuryTrend, TREASURY_BALANCE, TREASURY_PROJECTED,
  KPI_SPARKLINES,
  getBrotherStatus, calcHealthScore, deriveNeedsAttention, avg, fmt$, fmtDate, fmtRange, isoWeekBounds,
} from "../data";
import { useThresholds } from "../hooks/useThresholds";
import { useVocab } from "../hooks/useVocab";
import { useFeature } from "../hooks/useFeature";
import { WORKFLOW_FEATURES, type DisabledFeatures } from "@/lib/workflow-features";
import { Sidebar, SvgIcon, NAV_ICONS } from "../components/Sidebar";
import { BrotherAvatar } from "../components/BrotherAvatar";
import { UserAvatar } from "../components/UserAvatar";
import { useChapter } from "../context/ChapterContext";
import { useToast } from "../components/dashboard/Toast";
import { AddDeadlineForm, AddIGTaskForm, AddRevenueForm, LogAttendanceForm, ExcuseForm } from "../components/dashboard/forms";
import { QuickActionsMenu, type QuickActionKey } from "../components/dashboard/QuickActionsMenu";
import { TxForm } from "../components/treasury/TxForm";
import { CalendarEventForm, type CalendarDraft } from "../components/timeline/CalendarEventForm";
import { BrotherDrawer } from "../components/dashboard/drawers/BrotherDrawer";
import { Card, Modal, TaskBadge, ConfirmDialog, FieldLabel } from "../components/dashboard/primitives";
import { KPI_ICONS, SECTION_IDS, inputCls } from "../components/dashboard/styles";
import { type Announcement } from "../components/dashboard/AnnouncementCard";
import { AnnouncementEditor } from "../components/dashboard/AnnouncementEditor";
import { MobileDashboard } from "../components/dashboard/mobile/MobileDashboard";
import "../components/dashboard/dashboard-ledger.css";
import { BriefingHeader } from "../components/dashboard/ledger/BriefingHeader";
import { HealthDial } from "../components/dashboard/ledger/HealthDial";
import { PinnedAnnouncement } from "../components/dashboard/ledger/PinnedAnnouncement";
import { LedgerStrip, Measure } from "../components/dashboard/ledger/LedgerStrip";
import { LedgerSparkline } from "../components/dashboard/ledger/LedgerSparkline";
import { NeedsAttention } from "../components/dashboard/ledger/NeedsAttention";
import { RosterTable } from "../components/dashboard/ledger/RosterTable";
import { ThisWeek } from "../components/dashboard/ledger/ThisWeek";
import { TreasuryRail } from "../components/dashboard/ledger/TreasuryRail";
import { SocialsRail } from "../components/dashboard/ledger/SocialsRail";
import { InstagramRail } from "../components/dashboard/ledger/InstagramRail";
import { ActivityRail } from "../components/dashboard/ledger/ActivityRail";
import { DashHideButton } from "../components/dashboard/ledger/DashHideButton";
import { orgFetch, requestJson } from "../lib/api";
import type { MetricSnapshot } from "@/lib/metrics";

// ─── Activity ID counter (module-level, reset-safe) ───────────────────────────

let _nextId = Date.now();

// ─── KPI Drawer ───────────────────────────────────────────────────────────────

type KPIDrawerKey = "attendance" | "dues" | "gpa" | "service" | "treasury" | "door";

const DRAWER_CONFIGS: Record<KPIDrawerKey, { title: string; accent: string; iconKey: string; iconBg: string; iconColor: string }> = {
  attendance: { title: "Avg Attendance",   accent: "text-blue-400",    iconKey: "attendance", iconBg: "bg-blue-500/10",    iconColor: "text-blue-400"    },
  dues:       { title: "Dues",             accent: "text-amber-400",   iconKey: "dues",       iconBg: "bg-amber-500/10",   iconColor: "text-amber-400"   },
  gpa:        { title: "Chapter GPA",      accent: "text-violet-400",  iconKey: "gpa",        iconBg: "bg-violet-500/10",  iconColor: "text-violet-400"  },
  service:    { title: "Service Hours",    accent: "text-emerald-400", iconKey: "service",    iconBg: "bg-emerald-500/10", iconColor: "text-emerald-400" },
  treasury:   { title: "Treasury Balance", accent: "text-indigo-400",  iconKey: "treasury",   iconBg: "bg-indigo-500/10",  iconColor: "text-indigo-400"  },
  door:       { title: "Door Revenue",     accent: "text-pink-400",    iconKey: "door",       iconBg: "bg-pink-500/10",    iconColor: "text-pink-400"    },
};

function KPIDetailDrawer({
  activeKey, onClose,
  brotherList, partyList,
  openPayDues, addServiceHour,
  avgAttendance, outstandingDues, chapterGPA,
  totalServiceHrs, onTrackSvc,
  totalDoorRev, maxRevenue, bestEvent,
  liveBalance, liveProjected, liveTrend,
  onOpenModal, onOpenAttendance,
  isAdmin = true,
}: {
  activeKey: KPIDrawerKey | null;
  onClose: () => void;
  brotherList: Brother[];
  partyList: PartyEvent[];
  openPayDues: (b: Brother) => void;
  addServiceHour: (b: Brother) => void;
  avgAttendance: number;
  outstandingDues: number;
  chapterGPA: number;
  totalServiceHrs: number;
  onTrackSvc: number;
  totalDoorRev: number;
  maxRevenue: number;
  bestEvent: PartyEvent | null;
  liveBalance: number;
  liveProjected: number;
  liveTrend: { month: string; balance: number }[];
  onOpenModal: (key: "deadline" | "revenue" | "ig") => void;
  onOpenAttendance: () => void;
  isAdmin?: boolean;
}) {
  const THRESHOLDS = useThresholds();
  const v = useVocab();
  const isOpen = activeKey !== null;
  const cfg = activeKey ? DRAWER_CONFIGS[activeKey] : null;
  // DRAWER_CONFIGS is a module const built before vocab exists; resolve the
  // org-specific titles here at render time. Keys without an override fall back
  // to the static cfg.title.
  const titleOverride: Partial<Record<KPIDrawerKey, string>> = {
    dues: v("Dues"),
    gpa:  `${v("Meetings")} GPA`,
  };
  const drawerTitle = activeKey ? (titleOverride[activeKey] ?? cfg?.title) : cfg?.title;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  function renderContent() {
    if (!activeKey) return null;

    switch (activeKey) {
      case "attendance": {
        const sorted = [...brotherList].sort((a, b) => a.attendance - b.attendance);
        const belowWatch = brotherList.filter(b => b.attendance < THRESHOLDS.attendanceWatch);
        const atRisk = brotherList.filter(b => b.attendance < THRESHOLDS.attendanceAtRisk);
        return (
          <>
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-blue-400 tabular-nums">{avgAttendance.toFixed(1)}%</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{v("Meetings")} avg</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-amber-400 tabular-nums">{belowWatch.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Below 80%</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-red-400 tabular-nums">{atRisk.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">At risk</p>
              </div>
            </div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">All {v("Member", true)} — Lowest First</p>
            <div className="space-y-1.5 mb-5">
              {sorted.map(b => {
                const bar = b.attendance >= THRESHOLDS.attendanceWatch ? "bg-emerald-400" : b.attendance >= THRESHOLDS.attendanceAtRisk ? "bg-amber-400" : "bg-red-400";
                const col = b.attendance >= THRESHOLDS.attendanceWatch ? "text-white" : b.attendance >= THRESHOLDS.attendanceAtRisk ? "text-amber-400" : "text-red-400";
                return (
                  <div key={b.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.03] transition-colors">
                    <span className="w-24 shrink-0 truncate text-[12px] font-medium text-slate-300">{b.name.split(" ")[0]}</span>
                    <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                      <div className={`h-full rounded-full ${bar}`} style={{ width: `${b.attendance}%` }} />
                    </div>
                    <span className={`w-9 shrink-0 text-right tabular-nums text-[12px] font-semibold ${col}`}>{b.attendance}%</span>
                  </div>
                );
              })}
            </div>
            <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-3 py-2.5 mb-3">
              <p className="text-[11px] text-indigo-300">
                {atRisk.length > 0
                  ? <><span className="font-semibold">{atRisk.length} brother{atRisk.length > 1 ? "s" : ""} need{atRisk.length === 1 ? "s" : ""} immediate follow-up.</span>{" "}Attendance goal is 80%+.</>
                  : "No brothers are at attendance risk. Chapter goal is 80%+."
                }
              </p>
            </div>
            <button onClick={() => { onOpenAttendance(); onClose(); }} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors">
              Log Attendance
            </button>
          </>
        );
      }

      case "dues": {
        const oweList = brotherList.filter(b => b.duesOwed > 0);
        const paidList = brotherList.filter(b => b.duesOwed === 0);
        return (
          <>
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[17px] font-bold text-amber-400 tabular-nums">{fmt$(outstandingDues)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Total owed</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-red-400 tabular-nums">{oweList.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{v("Member", true)} owe</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-emerald-400 tabular-nums">{paidList.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Paid up</p>
              </div>
            </div>
            {oweList.length > 0 && (
              <>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Outstanding Balances</p>
                <div className="space-y-2 mb-5">
                  {oweList.map(b => (
                    <div key={b.id} className="flex items-center justify-between gap-3 rounded-lg bg-amber-500/[0.07] px-3 py-2.5 border border-amber-500/20">
                      <div>
                        <p className="text-[13px] font-semibold text-white">{b.name}</p>
                        <p className="text-[11px] text-slate-500">{b.role.split(" · ")[0]}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[14px] font-bold text-amber-400 tabular-nums">{fmt$(b.duesOwed)}</span>
                        {isAdmin && (
                          <button onClick={() => openPayDues(b)} className="rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/25 hover:bg-emerald-500/25 transition-colors">Pay</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {paidList.length > 0 && (
              <>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Paid Up ({paidList.length})</p>
                <div className="space-y-1 mb-4">
                  {paidList.map(b => (
                    <div key={b.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 hover:bg-white/[0.02] transition-colors">
                      <p className="text-[12px] text-slate-400">{b.name}</p>
                      <span className="text-[11px] text-emerald-400 font-medium">✓ Clear</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {outstandingDues === 0 && (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-3 text-center">
                <p className="text-[12px] text-emerald-400 font-medium">All {v("Member", true).toLowerCase()} are paid up.</p>
              </div>
            )}
          </>
        );
      }

      case "gpa": {
        const sorted = [...brotherList].sort((a, b) => a.gpa - b.gpa);
        const belowWatch = brotherList.filter(b => b.gpa < THRESHOLDS.gpaWatch);
        const atRisk = brotherList.filter(b => b.gpa < THRESHOLDS.gpaAtRisk);
        return (
          <>
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-violet-400 tabular-nums">{chapterGPA.toFixed(2)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{v("Meetings")} avg</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-amber-400 tabular-nums">{belowWatch.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Below 3.0</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-red-400 tabular-nums">{atRisk.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">At risk</p>
              </div>
            </div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">All {v("Member", true)} — Lowest First</p>
            <div className="space-y-1.5 mb-5">
              {sorted.map(b => {
                const col = b.gpa < THRESHOLDS.gpaAtRisk ? "text-red-400" : b.gpa < THRESHOLDS.gpaWatch ? "text-amber-400" : "text-white";
                const bar = b.gpa < THRESHOLDS.gpaAtRisk ? "bg-red-400" : b.gpa < THRESHOLDS.gpaWatch ? "bg-amber-400" : "bg-violet-400";
                const barPct = Math.round(Math.max(5, ((b.gpa - 2.0) / 2.0) * 100));
                return (
                  <div key={b.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.03] transition-colors">
                    <span className="w-24 shrink-0 truncate text-[12px] font-medium text-slate-300">{b.name.split(" ")[0]}</span>
                    <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                      <div className={`h-full rounded-full ${bar}`} style={{ width: `${barPct}%` }} />
                    </div>
                    <span className={`w-9 shrink-0 text-right tabular-nums text-[12px] font-semibold ${col}`}>{b.gpa.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
            {atRisk.length > 0 ? (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5">
                <p className="text-[11px] text-red-300">
                  <span className="font-semibold">{atRisk.length} brother{atRisk.length > 1 ? "s" : ""} below 2.7 GPA</span> — consider academic check-in or intervention.
                </p>
              </div>
            ) : belowWatch.length > 0 ? (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5">
                <p className="text-[11px] text-amber-300">
                  <span className="font-semibold">{belowWatch.length} brother{belowWatch.length > 1 ? "s" : ""} below 3.0</span> — monitor and encourage academic support.
                </p>
              </div>
            ) : (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 text-center">
                <p className="text-[12px] text-emerald-400 font-medium">All {v("Member", true).toLowerCase()} meeting academic standards.</p>
              </div>
            )}
          </>
        );
      }

      case "service": {
        const sorted = [...brotherList].sort((a, b) => a.serviceHours - b.serviceHours);
        const belowGoal = brotherList.filter(b => b.serviceHours < THRESHOLDS.serviceHoursGoal);
        return (
          <>
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-emerald-400 tabular-nums">{totalServiceHrs}h</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Total hours</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-white tabular-nums">{onTrackSvc}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">On track</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-amber-400 tabular-nums">{belowGoal.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Below goal</p>
              </div>
            </div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">All {v("Member", true)} — Fewest Hours First</p>
            <div className="space-y-1.5 mb-5">
              {sorted.map(b => {
                const isOnTrack = b.serviceHours >= THRESHOLDS.serviceHoursGoal;
                const barPct = Math.min(100, Math.round((b.serviceHours / THRESHOLDS.serviceHoursGoal) * 100));
                const bar = isOnTrack ? "bg-emerald-400" : "bg-amber-400";
                const col = isOnTrack ? "text-white" : "text-amber-400";
                const remaining = Math.max(0, THRESHOLDS.serviceHoursGoal - b.serviceHours);
                return (
                  <div key={b.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.03] transition-colors group">
                    <span className="w-20 shrink-0 truncate text-[12px] font-medium text-slate-300">{b.name.split(" ")[0]}</span>
                    <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                      <div className={`h-full rounded-full ${bar}`} style={{ width: `${barPct}%` }} />
                    </div>
                    <span className={`w-8 shrink-0 text-right tabular-nums text-[12px] font-semibold ${col}`}>{b.serviceHours}h</span>
                    {isOnTrack
                      ? <span className="text-[10px] text-emerald-500 w-10 shrink-0 text-right">✓</span>
                      : <span className="text-[10px] text-slate-600 w-10 shrink-0 text-right">-{remaining}h</span>
                    }
                    <button onClick={() => addServiceHour(b)} className="opacity-100 md:opacity-0 md:group-hover:opacity-100 shrink-0 rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 hover:bg-indigo-500/15 hover:text-indigo-400 transition-all">+1h</button>
                  </div>
                );
              })}
            </div>
            {belowGoal.length > 0 ? (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5">
                <p className="text-[11px] text-amber-300">
                  <span className="font-semibold">{belowGoal.length} brother{belowGoal.length > 1 ? "s" : ""} still need{belowGoal.length === 1 ? "s" : ""} service hours</span> before the semester ends. Goal: {THRESHOLDS.serviceHoursGoal}h each.
                </p>
              </div>
            ) : (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 text-center">
                <p className="text-[12px] text-emerald-400 font-medium">All {v("Member", true).toLowerCase()} have met the service hours goal!</p>
              </div>
            )}
          </>
        );
      }

      case "treasury": {
        const firstMonth = liveTrend[0];
        const lastMonth  = liveTrend[liveTrend.length - 1];
        const growth = lastMonth.balance - firstMonth.balance;
        const growthPct = Math.round((growth / firstMonth.balance) * 100);
        return (
          <>
            <div className="grid grid-cols-2 gap-2 mb-5">
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-indigo-400 tabular-nums">{fmt$(liveBalance)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Current balance</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-emerald-400 tabular-nums">{fmt$(liveProjected)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Projected end</p>
              </div>
            </div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Treasury Trend</p>
            <div className="mb-5">
              <DrawerTrendChart data={liveTrend} />
            </div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Monthly Breakdown</p>
            <div className="space-y-1.5 mb-5">
              {liveTrend.map((t, i) => {
                const prev = i > 0 ? liveTrend[i - 1].balance : t.balance;
                const delta = t.balance - prev;
                return (
                  <div key={t.month} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                    <span className="text-[12px] font-medium text-slate-300 w-8 shrink-0">{t.month}</span>
                    <div className="flex-1 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                      <div className="h-full rounded-full bg-indigo-400" style={{ width: `${Math.round((t.balance / liveProjected) * 100)}%` }} />
                    </div>
                    <span className="tabular-nums text-[12px] font-semibold text-white w-14 shrink-0 text-right">{fmt$(t.balance)}</span>
                    {i > 0 && (
                      <span className={`tabular-nums text-[10px] w-14 shrink-0 text-right ${delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {delta >= 0 ? "+" : ""}{fmt$(delta)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-3 py-2.5">
              <p className="text-[11px] text-indigo-300">
                Treasury grew by <span className="font-semibold">{fmt$(growth)} ({growthPct}%)</span> this semester. Projected end balance: <span className="font-semibold">{fmt$(liveProjected)}</span>.
              </p>
            </div>
          </>
        );
      }

      case "door": {
        const sortedEvents = [...partyList].sort((a, b) => b.doorRevenue - a.doorRevenue);
        const avgRevenue = partyList.length > 0 ? Math.round(totalDoorRev / partyList.length) : 0;
        return (
          <>
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[17px] font-bold text-pink-400 tabular-nums">{fmt$(totalDoorRev)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Total revenue</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-white tabular-nums">{partyList.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Events</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[17px] font-bold text-slate-300 tabular-nums">{fmt$(avgRevenue)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Avg/event</p>
              </div>
            </div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Revenue by Event — Best First</p>
            <div className="space-y-2.5 mb-5">
              {sortedEvents.map(e => {
                const barPct = maxRevenue > 0 ? Math.round((e.doorRevenue / maxRevenue) * 100) : 0;
                const isTop = bestEvent ? e.id === bestEvent.id : false;
                return (
                  <div key={e.id} className={`rounded-lg px-3 py-2.5 ${isTop ? "bg-pink-500/[0.08] border border-pink-500/20" : "bg-white/[0.03] border border-white/[0.05]"}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className={`text-[12px] font-semibold flex items-center gap-1.5 ${isTop ? "text-pink-300" : "text-slate-300"}`}>
                        {isTop && <span className="text-[10px] bg-pink-500/20 text-pink-400 rounded px-1 py-0.5">Best</span>}
                        {e.name}
                      </p>
                      <span className="tabular-nums text-[13px] font-bold text-white shrink-0 ml-2">{fmt$(e.doorRevenue)}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-white/[0.07] mb-1.5">
                      <div className={`h-full rounded-full ${isTop ? "bg-pink-400" : "bg-white/[0.25]"}`} style={{ width: `${barPct}%` }} />
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[10px] text-slate-500">{e.date}</span>
                      <span className="text-[10px] text-slate-500">{e.attendance} attendees</span>
                      {e.notes && <span className="text-[10px] text-slate-600 truncate">{e.notes}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="rounded-lg bg-pink-500/10 border border-pink-500/20 px-3 py-2.5">
              <p className="text-[11px] text-pink-300">
                {bestEvent ? <>Best event: <span className="font-semibold">{bestEvent.name}</span> at <span className="font-semibold">{fmt$(bestEvent.doorRevenue)}</span>. Avg per event: <span className="font-semibold">{fmt$(avgRevenue)}</span>.</> : "No events logged yet."}
              </p>
            </div>
          </>
        );
      }

      default:
        return null;
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] transition-opacity duration-200 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      {/* Drawer panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-[#0c0e14] border-l border-white/[0.07] shadow-2xl transition-transform duration-300 ease-in-out sm:w-[400px] ${isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"}`}
      >
        {cfg && (
          <>
            <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.07] px-5">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.iconBg}`}>
                <SvgIcon d={KPI_ICONS[cfg.iconKey] ?? ""} className={`h-4 w-4 ${cfg.iconColor}`} />
              </div>
              <h2 className={`flex-1 text-[15px] font-semibold ${cfg.accent}`}>{drawerTitle}</h2>
              <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.07] hover:text-white transition-colors">
                <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {renderContent()}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Widget Drawer ────────────────────────────────────────────────────────────

type WidgetDrawerKey = "health" | "digest" | "deadlines" | "instagram" | "activity" | "parties";

function WidgetDetailDrawer({
  activeKey, onClose,
  weeklyDigest, weekRange, digestNarration,
  deadlineList, igTaskList, activityFeed, partyList,
  health,
  maxRevenue, bestEvent, totalDoorRev,
  onOpenModal,
  onCompleteDeadline, onDeleteDeadline, onEditDeadline,
  onCompleteIG, onDeleteIG, onEditIG,
}: {
  activeKey: WidgetDrawerKey | null;
  onClose: () => void;
  weeklyDigest: {
    deadlinesDue: Deadline[];
    igDue: InstagramTask[];
    eventsThisWeek: CalendarEvent[];
    partiesThisWeek: PartyEvent[];
    atRiskCount: number;
  };
  weekRange: { start: string; end: string };
  digestNarration: string | null;
  deadlineList: { id: number; title: string; dueDate: string; owner: string; status: TaskStatus }[];
  igTaskList: { id: number; title: string; dueDate: string; owner: string; status: TaskStatus; type: string }[];
  activityFeed: ActivityEntry[];
  partyList: PartyEvent[];
  health: { score: number; label: "Healthy" | "Needs Attention" | "Critical"; breakdown: Record<string, number> };
  maxRevenue: number;
  bestEvent: PartyEvent | null;
  totalDoorRev: number;
  onOpenModal: (key: "deadline" | "revenue" | "ig" | "attendance") => void;
  onCompleteDeadline: (id: number) => void;
  onDeleteDeadline:   (id: number) => void;
  onEditDeadline:     (id: number) => void;
  onCompleteIG:       (id: number) => void;
  onDeleteIG:         (id: number) => void;
  onEditIG:           (id: number) => void;
}) {
  const v = useVocab();
  const isOpen = activeKey !== null;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const WIDGET_CONFIGS: Record<WidgetDrawerKey, { title: string; accent: string; bar: string }> = {
    health:     { title: `${v("Meetings")} Health Score`, accent: "text-white",      bar: "bg-indigo-500"    },
    digest:     { title: "Weekly Digest",          accent: "text-white",      bar: "bg-indigo-500/70" },
    deadlines:  { title: "Deadlines",             accent: "text-white",      bar: "bg-indigo-500/60" },
    instagram:  { title: "Instagram",             accent: "text-white",      bar: "bg-pink-500/60"   },
    activity:   { title: "Activity Feed",         accent: "text-white",      bar: "bg-emerald-500/50"},
    parties:    { title: "Party Events",          accent: "text-white",      bar: "bg-indigo-500/60" },
  };

  const cfg = activeKey ? WIDGET_CONFIGS[activeKey] : null;

  const dot: Record<ActivityEntry["type"], string> = {
    success: "bg-emerald-400",
    warning: "bg-amber-400",
    info:    "bg-blue-400",
  };

  function renderContent() {
    if (!activeKey) return null;

    switch (activeKey) {
      case "health": {
        const ringColor = health.score >= 80 ? "text-emerald-400" : health.score >= 60 ? "text-amber-400" : "text-red-400";
        const circleBg  = health.score >= 80 ? "bg-emerald-500/15" : health.score >= 60 ? "bg-amber-500/15" : "bg-red-500/15";
        const METRIC_DESC: Record<string, string> = {
          Attendance: "30% weight — avg chapter attendance percentage",
          GPA:        "25% weight — scaled from 2.0–4.0 range",
          Dues:       "20% weight — % of brothers fully paid up",
          Service:    "15% weight — % of brothers at service hour goal",
          Deadlines:  "10% weight — −15 pts per urgent deadline",
        };
        return (
          <>
            <div className="flex flex-col items-center py-6 mb-6 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className={`flex h-20 w-20 items-center justify-center rounded-full ${circleBg} mb-3`}>
                <span className={`text-[32px] font-bold tabular-nums leading-none ${ringColor}`}>{health.score}</span>
              </div>
              <span className={`text-[16px] font-bold ${ringColor}`}>{health.label}</span>
              <p className="mt-1 text-[11px] text-slate-500">out of 100 · weighted composite</p>
            </div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Score Breakdown</p>
            <div className="space-y-4 mb-6">
              {Object.entries(health.breakdown).map(([k, v]) => {
                const barColor = v >= 80 ? "bg-emerald-400" : v >= 60 ? "bg-amber-400" : "bg-red-400";
                const textColor = v >= 80 ? "text-emerald-400" : v >= 60 ? "text-amber-400" : "text-red-400";
                return (
                  <div key={k}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[12px] font-semibold text-white">{k}</span>
                      <span className={`tabular-nums text-[13px] font-bold ${textColor}`}>{v}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/[0.07] mb-1">
                      <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${v}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-600">{METRIC_DESC[k] ?? ""}</p>
                  </div>
                );
              })}
            </div>
            <div className={`rounded-lg px-3 py-2.5 border ${
              health.score >= 80
                ? "bg-emerald-500/10 border-emerald-500/20"
                : health.score >= 60
                ? "bg-amber-500/10 border-amber-500/20"
                : "bg-red-500/10 border-red-500/20"
            }`}>
              <p className={`text-[11px] ${health.score >= 80 ? "text-emerald-300" : health.score >= 60 ? "text-amber-300" : "text-red-300"}`}>
                {health.score >= 80
                  ? "Chapter is performing well across all metrics."
                  : health.score >= 60
                  ? `Some areas need attention — address urgent deadlines and at-risk ${v("Member", true).toLowerCase()}.`
                  : "Immediate action required — multiple metrics are critically low."
                }
              </p>
            </div>
          </>
        );
      }

      case "digest": {
        const { deadlinesDue, igDue, eventsThisWeek, partiesThisWeek, atRiskCount } = weeklyDigest;
        const total = deadlinesDue.length + igDue.length + eventsThisWeek.length + partiesThisWeek.length;
        const sections: { label: string; left: string; count: number; rows: { key: string; title: string; meta: string }[] }[] = [
          { label: "Deadlines", left: "border-l-indigo-400", count: deadlinesDue.length,
            rows: deadlinesDue.map(d => ({ key: `d${d.id}`, title: d.title, meta: `${fmtDate(d.dueDate)} · ${d.owner.split(" ")[0]}` })) },
          { label: "Instagram", left: "border-l-pink-400", count: igDue.length,
            rows: igDue.map(t => ({ key: `i${t.id}`, title: t.title, meta: `${fmtDate(t.dueDate)} · ${t.type}` })) },
          { label: "Events", left: "border-l-blue-400", count: eventsThisWeek.length,
            rows: eventsThisWeek.map(e => ({ key: `e${e.id}`, title: e.title, meta: e.time ? `${fmtDate(e.date)} · ${e.time}` : fmtDate(e.date) })) },
          { label: "Parties", left: "border-l-violet-400", count: partiesThisWeek.length,
            rows: partiesThisWeek.map(p => ({ key: `p${p.id}`, title: p.name, meta: fmtDate(p.date) })) },
        ];
        return (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[12px] font-medium text-slate-400">{fmtRange(weekRange.start, weekRange.end)}</p>
              {atRiskCount > 0 && (
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-400">{atRiskCount} at risk</span>
              )}
            </div>
            {digestNarration && (
              <div className="mb-5 flex items-start gap-2 rounded-lg border border-indigo-500/20 bg-indigo-500/[0.06] px-3 py-2.5">
                <span className="mt-px shrink-0 rounded bg-indigo-500/20 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider text-indigo-300">AI</span>
                <p className="text-[12px] leading-relaxed text-slate-300">{digestNarration}</p>
              </div>
            )}
            <div className="grid grid-cols-4 gap-2 mb-5">
              {sections.map(s => (
                <div key={s.label} className="rounded-lg bg-white/[0.04] px-2 py-2.5 text-center">
                  <p className="text-[18px] font-bold tabular-nums text-white">{s.count}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            {total === 0 ? (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-6 text-center">
                <p className="text-[12px] text-emerald-400 font-medium">Nothing on the agenda this week</p>
              </div>
            ) : (
              sections.map(s => s.rows.length > 0 && (
                <div key={s.label} className="mb-5">
                  <div className="mb-2 flex items-center gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{s.label}</p>
                    <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">{s.rows.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {s.rows.map(r => (
                      <div key={r.key} className={`flex items-center justify-between gap-2 rounded-md border-l-[2.5px] bg-white/[0.03] px-2.5 py-1.5 ${s.left}`}>
                        <p className="min-w-0 flex-1 truncate text-[12px] leading-snug text-slate-300">{r.title}</p>
                        <p className="shrink-0 text-[11px] text-slate-500">{r.meta}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </>
        );
      }

      case "deadlines": {
        const byStatus = {
          Urgent:   deadlineList.filter(d => d.status === "Urgent"),
          "Due Soon": deadlineList.filter(d => d.status === "Due Soon"),
          Upcoming: deadlineList.filter(d => d.status === "Upcoming"),
          Complete: deadlineList.filter(d => d.status === "Complete"),
        };
        const statusStyles: Record<TaskStatus, { left: string; bg: string }> = {
          "Urgent":   { left: "border-l-red-500",   bg: "bg-red-500/10"    },
          "Due Soon": { left: "border-l-amber-400", bg: "bg-amber-500/10"  },
          "Upcoming": { left: "border-l-white/20",  bg: "bg-white/[0.03]"  },
          "Complete": { left: "border-l-emerald-400", bg: "bg-emerald-500/10"},
        };
        return (
          <>
            <div className="grid grid-cols-4 gap-1.5 mb-5">
              {([["Urgent", byStatus.Urgent.length, "text-red-400"], ["Due Soon", byStatus["Due Soon"].length, "text-amber-400"], ["Upcoming", byStatus.Upcoming.length, "text-slate-300"], ["Complete", byStatus.Complete.length, "text-emerald-400"]] as const).map(([label, count, color]) => (
                <div key={label} className="rounded-lg bg-white/[0.04] px-2 py-2 text-center">
                  <p className={`text-[16px] font-bold tabular-nums ${color}`}>{count}</p>
                  <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">{label}</p>
                </div>
              ))}
            </div>
            {deadlineList.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-slate-500">No deadlines — click + Add to create one</p>
            ) : (
              (["Urgent", "Due Soon", "Upcoming", "Complete"] as TaskStatus[]).map(status => {
                const items = byStatus[status as keyof typeof byStatus];
                if (!items || items.length === 0) return null;
                const { left, bg } = statusStyles[status];
                return (
                  <div key={status} className="mb-5">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{status} ({items.length})</p>
                    <div className="space-y-1.5">
                      {items.map(d => (
                        <div key={d.id} className={`group flex items-start justify-between gap-2 rounded-md border-l-[2.5px] px-3 py-2 ${left} ${bg}`}>
                          <div className="min-w-0 flex-1">
                            <p className={`text-[12px] font-medium ${d.status === "Complete" ? "line-through text-slate-500" : "text-white"}`}>{d.title}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{fmtDate(d.dueDate)} · {d.owner.split(" ")[0]}</p>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                            {d.status !== "Complete" && (
                              <button onClick={() => onCompleteDeadline(d.id)} title="Mark complete" className="flex h-6 w-6 items-center justify-center rounded hover:bg-emerald-500/20 text-slate-500 hover:text-emerald-400 transition-colors">
                                <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                              </button>
                            )}
                            <button onClick={() => onEditDeadline(d.id)} title="Edit" className="flex h-6 w-6 items-center justify-center rounded hover:bg-indigo-500/20 text-slate-500 hover:text-indigo-400 transition-colors">
                              <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                            <button onClick={() => onDeleteDeadline(d.id)} title="Delete" className="flex h-6 w-6 items-center justify-center rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors">
                              <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
            <button onClick={() => { onOpenModal("deadline"); onClose(); }} className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-[13px] font-medium text-slate-300 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-300 transition-colors">
              + Add Deadline
            </button>
          </>
        );
      }

      case "instagram": {
        const urgent   = igTaskList.filter(t => t.status === "Urgent");
        const dueSoon  = igTaskList.filter(t => t.status === "Due Soon");
        const upcoming = igTaskList.filter(t => t.status === "Upcoming");
        const complete = igTaskList.filter(t => t.status === "Complete");
        const typeColors: Record<string, string> = {
          "Feed Post":    "bg-pink-500/15 text-pink-400",
          "Reel":         "bg-purple-500/15 text-purple-400",
          "Story + Feed": "bg-indigo-500/15 text-indigo-400",
          "Carousel":     "bg-blue-500/15 text-blue-400",
          "Story":        "bg-slate-500/15 text-slate-400",
        };
        return (
          <>
            <div className="grid grid-cols-4 gap-1.5 mb-5">
              {([["Urgent", urgent.length, "text-red-400"], ["Due Soon", dueSoon.length, "text-amber-400"], ["Upcoming", upcoming.length, "text-slate-300"], ["Complete", complete.length, "text-emerald-400"]] as const).map(([label, count, color]) => (
                <div key={label} className="rounded-lg bg-white/[0.04] px-2 py-2 text-center">
                  <p className={`text-[16px] font-bold tabular-nums ${color}`}>{count}</p>
                  <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">{label}</p>
                </div>
              ))}
            </div>
            {igTaskList.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-slate-500">No IG tasks scheduled</p>
            ) : (
              <div className="space-y-2 mb-5">
                {[...igTaskList].sort((a, b) => {
                  const order = { Urgent: 0, "Due Soon": 1, Upcoming: 2, Complete: 3 };
                  return (order[a.status] ?? 99) - (order[b.status] ?? 99);
                }).map(t => (
                  <div key={t.id} className="group rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className={`text-[12px] font-semibold flex-1 ${t.status === "Complete" ? "line-through text-slate-500" : "text-white"}`}>{t.title}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          {t.status !== "Complete" && (
                            <button onClick={() => onCompleteIG(t.id)} title="Mark complete" className="flex h-6 w-6 items-center justify-center rounded hover:bg-emerald-500/20 text-slate-500 hover:text-emerald-400 transition-colors">
                              <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            </button>
                          )}
                          <button onClick={() => onEditIG(t.id)} title="Edit" className="flex h-6 w-6 items-center justify-center rounded hover:bg-indigo-500/20 text-slate-500 hover:text-indigo-400 transition-colors">
                            <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                          <button onClick={() => onDeleteIG(t.id)} title="Delete" className="flex h-6 w-6 items-center justify-center rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors">
                            <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                        <TaskBadge status={t.status} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${typeColors[t.type] ?? "bg-slate-500/15 text-slate-400"}`}>{t.type}</span>
                      <span className="text-[10px] text-slate-500">{fmtDate(t.dueDate)}</span>
                      <span className="text-[10px] text-slate-500">{t.owner.split(" ")[0]}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => { onOpenModal("ig"); onClose(); }} className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-[13px] font-medium text-slate-300 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-300 transition-colors">
              + Add IG Task
            </button>
          </>
        );
      }

      case "activity": {
        return (
          <>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {([
                ["Success", activityFeed.filter(e => e.type === "success").length, "text-emerald-400"],
                ["Warning", activityFeed.filter(e => e.type === "warning").length, "text-amber-400"],
                ["Info",    activityFeed.filter(e => e.type === "info").length,    "text-blue-400"],
              ] as const).map(([label, count, color]) => (
                <div key={label} className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                  <p className={`text-[18px] font-bold tabular-nums ${color}`}>{count}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Full History ({activityFeed.length} entries)</p>
            {activityFeed.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-slate-500">No activity yet</p>
            ) : (
              <div className="space-y-0 divide-y divide-white/[0.04] rounded-lg border border-white/[0.06] overflow-hidden">
                {activityFeed.map(e => (
                  <div key={e.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot[e.type]}`} />
                    <p className="flex-1 text-[12px] leading-snug text-slate-300">{e.message}</p>
                    <span className="shrink-0 text-[10px] text-slate-500">{e.timestamp}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        );
      }

      case "parties": {
        const sorted = [...partyList].sort((a, b) => b.doorRevenue - a.doorRevenue);
        const avgRevenue = partyList.length > 0 ? Math.round(totalDoorRev / partyList.length) : 0;
        const totalAttendees = partyList.reduce((s, e) => s + e.attendance, 0);
        return (
          <>
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[17px] font-bold text-indigo-400 tabular-nums">{fmt$(totalDoorRev)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Total revenue</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-white tabular-nums">{partyList.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Events</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-slate-300 tabular-nums">{totalAttendees}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Attendees</p>
              </div>
            </div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Events — Best First</p>
            <div className="space-y-2.5 mb-5">
              {sorted.map(e => {
                const barPct = maxRevenue > 0 ? Math.round((e.doorRevenue / maxRevenue) * 100) : 0;
                const isTop = bestEvent ? e.id === bestEvent.id : false;
                return (
                  <div key={e.id} className={`rounded-lg px-3 py-2.5 ${isTop ? "bg-indigo-500/[0.08] border border-indigo-500/20" : "bg-white/[0.03] border border-white/[0.05]"}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className={`text-[12px] font-semibold flex items-center gap-1.5 ${isTop ? "text-indigo-300" : "text-slate-300"}`}>
                        {isTop && <span className="text-[10px] bg-indigo-500/20 text-indigo-400 rounded px-1 py-0.5">Best</span>}
                        {e.name}
                      </p>
                      <span className="tabular-nums text-[13px] font-bold text-white shrink-0 ml-2">{fmt$(e.doorRevenue)}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-white/[0.07] mb-1.5">
                      <div className={`h-full rounded-full ${isTop ? "bg-indigo-400" : "bg-white/[0.25]"}`} style={{ width: `${barPct}%` }} />
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[10px] text-slate-500">{e.date}</span>
                      <span className="text-[10px] text-slate-500">{e.attendance} attendees</span>
                      <span className="text-[10px] text-slate-500">{fmt$(Math.round(e.doorRevenue / Math.max(1, e.attendance)))} / head</span>
                      {e.notes && <span className="text-[10px] text-slate-600 truncate">{e.notes}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={() => { onOpenModal("revenue"); onClose(); }} className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-[13px] font-medium text-slate-300 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-300 transition-colors">
              + Log Revenue
            </button>
          </>
        );
      }

      default:
        return null;
    }
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] transition-opacity duration-200 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-[#0c0e14] border-l border-white/[0.07] shadow-2xl transition-transform duration-300 ease-in-out sm:w-[400px] ${isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"}`}
      >
        {cfg && (
          <>
            <div className={`h-[3px] ${cfg.bar}`} />
            <div className="flex h-13 shrink-0 items-center gap-3 border-b border-white/[0.07] px-5 py-3.5">
              <h2 className={`flex-1 text-[15px] font-semibold ${cfg.accent}`}>{cfg.title}</h2>
              <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.07] hover:text-white transition-colors">
                <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {renderContent()}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Custom Metric Detail Drawer ──────────────────────────────────────────────

function CustomMetricDetailDrawer({
  snap,
  onClose,
}: {
  snap: MetricSnapshot | null;
  onClose: () => void;
}) {
  const isOpen = snap !== null;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] transition-opacity duration-200 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-[#0c0e14] border-l border-white/[0.07] shadow-2xl transition-transform duration-300 ease-in-out sm:w-[420px] ${isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"}`}
      >
        {snap && (
          <>
            <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.07] px-5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
                <SvgIcon d={KPI_ICONS["custom"] ?? ""} className="h-4 w-4 text-indigo-400" />
              </div>
              <h2 className="flex-1 truncate text-[15px] font-semibold text-white">{snap.name}</h2>
              <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.07] hover:text-white transition-colors">
                <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-center">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">On Track</p>
                  <p className="text-[18px] font-bold text-emerald-400 tabular-nums">{snap.onTrackCount}</p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-center">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Not on Track</p>
                  <p className="text-[18px] font-bold text-amber-400 tabular-nums">{snap.totalCount - snap.onTrackCount}</p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-center">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Goal</p>
                  <p className="text-[18px] font-bold text-white tabular-nums">{snap.goal}{snap.unit ?? ""}</p>
                </div>
              </div>
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Summary</p>
                <div className="space-y-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-slate-400">Aggregation</span>
                    <span className="text-[12px] font-medium text-white capitalize">{snap.aggregation.replace("_", " ")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-slate-400">
                      {snap.aggregation === "avg" ? "Chapter avg" : snap.aggregation === "sum" ? "Chapter total" : "On track"}
                    </span>
                    <span className="text-[12px] font-semibold text-indigo-300 tabular-nums">
                      {Number.isInteger(snap.headline) ? snap.headline : snap.headline.toFixed(1)}{snap.unit ?? ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-slate-400">Members recorded</span>
                    <span className="text-[12px] font-medium text-white tabular-nums">{snap.totalCount}</span>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-slate-600">
                Open a member&apos;s profile drawer and switch to the Metrics tab to view or update individual values.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  // Org-wide member-status cutoffs (shared via OrganizationConfig). Named
  // THRESHOLDS so the many inline `THRESHOLDS.x` references below read the org
  // value without per-line edits.
  const THRESHOLDS = useThresholds();
  const v = useVocab();
  // Per-section visibility for the dashboard's toggleable widgets. Each is keyed
  // under the always-on "operations" workflow; a section is shown unless an admin
  // hid it. The mobile layout reads the same flags via its own useFeature() calls.
  const feature = useFeature();
  // ── UI state ──────────────────────────────────────────────────────────────
  const [search,         setSearch]         = useState("");
  const [statusFilter,   setStatusFilter]   = useState("All");
  const [sortKey,        setSortKey]        = useState<keyof Brother | null>(null);
  const [sortDir,        setSortDir]        = useState<"asc" | "desc">("asc");
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [activeModal,    setActiveModal]    = useState<"deadline" | "revenue" | "ig" | "attendance" | "pick-event" | "edit-deadline" | "edit-ig" | "expense" | "excuse" | "event" | "pick-event-for-excuse" | null>(null);
  const [selectedEventForAttendance, setSelectedEventForAttendance] = useState<CalendarEvent | null>(null);
  const [calendarList,   setCalendarList]   = useState<CalendarEvent[]>([]);
  const [editingDeadlineId, setEditingDeadlineId] = useState<number | null>(null);
  const [editingIgId,       setEditingIgId]       = useState<number | null>(null);
  const [activeDrawer,   setActiveDrawer]   = useState<KPIDrawerKey | null>(null);
  const [widgetDrawer,   setWidgetDrawer]   = useState<WidgetDrawerKey | null>(null);
  const [editingAttId,      setEditingAttId]      = useState<number | null>(null);
  const [editAttVal,        setEditAttVal]        = useState("");
  const [selectedBrotherId, setSelectedBrotherId] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [announcementEditorOpen, setAnnouncementEditorOpen] = useState(false);
  const [customMetricSnapshots, setCustomMetricSnapshots] = useState<MetricSnapshot[]>([]);
  const [activeCustomMetricId, setActiveCustomMetricId] = useState<number | null>(null);
  const [activeSection,  setActiveSection]  = useState("Dashboard");
  const [confirmDelete, setConfirmDelete] = useState<{ kind: "deadline" | "ig"; id: number; label: string } | null>(null);
  const [payTarget,    setPayTarget]    = useState<Brother | null>(null);
  const [payAmountStr, setPayAmountStr] = useState("");
  const mainRef = useRef<HTMLElement>(null);
  const attendanceReqRef = useRef<AbortController | null>(null);
  const welcomeToastShownRef = useRef(false);
  const toast = useToast();

  // ── Data state ─────────────────────────────────────────────────────────────
  const { currentUser, brotherList, setBrotherList, deadlineList, setDeadlineList, igTaskList, setIgTaskList, partyList, setPartyList, activityFeed, setActivityFeed, treasuryData, setTransactionList, isLoading, loadError, mutationError, setMutationError, refreshChapterData, setDisabledFeaturesLocal, avatarRevision, can } = useChapter();
  const isAdmin = currentUser?.isAdmin ?? false;
  // Granular permission gates for new UI checks. Existing `isAdmin` is kept
  // unchanged for prop-chains into QuickActionsMenu / KPIDrawer / Modal title
  // copy — those flow through multiple sub-components and are best refactored
  // incrementally. New gates below prefer can(...) so officers (Treasurer,
  // Social Chair, etc.) see actions matching their role without admin.
  const canTreasury    = can("MANAGE_TREASURY");
  const canBrothers    = can("MANAGE_BROTHERS");
  const canAttendance  = can("MANAGE_ATTENDANCE");
  const selfId  = currentUser?.id ?? null;

  // Whether the viewer is an admin of the *active* org. This — not a permission
  // bit — is what gates the inline "hide widget" affordance, because the server
  // (setDisabledFeatures) authorizes on isOrgAdmin/isPlatformAdmin, not on
  // MANAGE_SETTINGS. Resolved the same way /api/auth/me does. Platform admins
  // pass because /me marks their active membership isOrgAdmin.
  const isActiveOrgAdmin =
    currentUser?.memberships?.find(m => m.organizationId === currentUser.orgId)?.isOrgAdmin ?? false;

  // The dashboard's currently-hidden widgets, intersected with the registry so a
  // stale/unknown id never leaks into the tray. Drives the "Hidden widgets" tray.
  const hiddenOps = useMemo(() => {
    const disabled = new Set((currentUser?.org?.disabledFeatures as DisabledFeatures | undefined)?.operations ?? []);
    return WORKFLOW_FEATURES.operations.filter(f => disabled.has(f.id));
  }, [currentUser?.org?.disabledFeatures]);

  // Hide or re-show a dashboard widget by rewriting the org's disabledFeatures
  // map (operations workflow). Optimistic: we patch local state first so the
  // widget appears/disappears on the very next render (no network wait), then
  // PATCH in the background and roll back only if it fails. This avoids the
  // round-trip + full refreshChapterData() refetch the slow path would incur.
  // Sending only disabledFeatures leaves enabledWorkflows/vocab/thresholds
  // untouched (each setter is independent server-side). Admin-gated at the call
  // sites; the server re-checks isOrgAdmin regardless.
  const setWidgetHidden = useCallback(async (featureId: string, hidden: boolean) => {
    const current = (currentUser?.org?.disabledFeatures ?? {}) as DisabledFeatures;
    const ops = new Set(current.operations ?? []);
    if (hidden) ops.add(featureId); else ops.delete(featureId);
    const next: DisabledFeatures = { ...current };
    if (ops.size) next.operations = [...ops]; else delete next.operations;

    // Optimistic local update — instant visual change.
    setDisabledFeaturesLocal(next as Record<string, string[]>);
    try {
      await requestJson("/api/orgs/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabledFeatures: next }),
      });
    } catch {
      // Roll back to the pre-toggle map and surface the error.
      setDisabledFeaturesLocal(current as Record<string, string[]>);
      setMutationError("Couldn't update the dashboard. Try again.");
    }
  }, [currentUser?.org?.disabledFeatures, setDisabledFeaturesLocal, setMutationError]);

  // Welcome toast after sign-in. /auth/callback redirects linked users to
  // /?toast=welcome; once the org name resolves we show a one-time toast and
  // strip the param from the URL (replaceState, no navigation/Suspense needed).
  const orgName = currentUser?.org?.name ?? null;
  useEffect(() => {
    if (welcomeToastShownRef.current || !orgName) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("toast") !== "welcome") return;
    welcomeToastShownRef.current = true;
    toast.success(`Welcome to ${orgName}`);
    params.delete("toast");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [orgName, toast]);

  // ── Treasury — live from DB, fall back to hardcoded constants while loading ─
  const liveBalance   = treasuryData?.balance   ?? TREASURY_BALANCE;
  const liveProjected = treasuryData?.projected ?? TREASURY_PROJECTED;
  const liveTrend     = treasuryData?.trend     ?? treasuryTrend;

  // ── Activity logger ────────────────────────────────────────────────────────
  const addActivity = useCallback((message: string, type: ActivityEntry["type"]) => {
    const optimisticId = _nextId++;
    setActivityFeed(prev => [{ id: optimisticId, message, timestamp: "just now", type }, ...prev]);
    requestJson<ActivityEntry>("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, type }),
    })
      .then(saved => {
        setMutationError(null);
        setActivityFeed(prev => prev.map(e => e.id === optimisticId ? { ...saved, timestamp: "just now" } : e));
      })
      .catch(error => {
        console.error(error);
        setActivityFeed(prev => prev.filter(e => e.id !== optimisticId));
        setMutationError("Activity could not be saved to the database.");
      });
  }, [setActivityFeed, setMutationError]);

  function persistMutation<T>(
    operation: Promise<T>,
    errorMessage: string,
    rollback?: () => void,
    onSuccess?: (value: T) => void,
  ) {
    operation
      .then(value => {
        setMutationError(null);
        onSuccess?.(value);
      })
      .catch(error => {
        console.error(error);
        rollback?.();
        setMutationError(errorMessage);
      });
  }

  // ── Health score ───────────────────────────────────────────────────────────
  // Drives the briefing HealthDial (score + ATT/GPA/DUES/SVC/DDL breakdown) and
  // the health detail drawer.
  const health = useMemo(() => calcHealthScore(brotherList, deadlineList, THRESHOLDS), [brotherList, deadlineList, THRESHOLDS]);

  // ── Announcement (pinned single record) ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    requestJson<Announcement | null>("/api/announcement")
      .then(data => { if (!cancelled) setAnnouncement(data); })
      .catch(() => { /* placeholder renders on null — non-fatal */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    requestJson<MetricSnapshot[]>("/api/metrics/snapshot")
      .then(data => { if (!cancelled) setCustomMetricSnapshots(data); })
      .catch(() => { /* non-fatal — dashboard renders without custom metrics */ });
    return () => { cancelled = true; };
  }, []);

  // ── Scroll spy ────────────────────────────────────────────────────────────
  useEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl) return;

    function updateActive() {
      const el = mainRef.current;
      if (!el) return;
      const mainRect = el.getBoundingClientRect();
      const detectY = mainRect.top + el.clientHeight * 0.25;
      let current = "Dashboard";
      for (const [label, id] of Object.entries(SECTION_IDS)) {
        const section = document.getElementById(id);
        if (!section) continue;
        if (section.getBoundingClientRect().top <= detectY) current = label;
      }
      setActiveSection(current);
    }

    mainEl.addEventListener("scroll", updateActive, { passive: true });
    updateActive();
    return () => mainEl.removeEventListener("scroll", updateActive);
  }, []);

  // ── Scroll to section requested by sidebar cross-page nav ─────────────────
  useEffect(() => {
    const target = sessionStorage.getItem("scrollTo");
    if (!target) return;
    sessionStorage.removeItem("scrollTo");
    // small delay so the page has painted before we scroll
    const t = setTimeout(() => scrollToSection(target), 80);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Scroll-to helpers ──────────────────────────────────────────────────────
  function scrollToSection(label: string) {
    const id = SECTION_IDS[label];
    if (!id) return;
    const el = document.getElementById(id);
    if (!el || !mainRef.current) return;
    const mainRect = mainRef.current.getBoundingClientRect();
    const elRect   = el.getBoundingClientRect();
    const offset   = mainRef.current.scrollTop + (elRect.top - mainRect.top) - 16;
    mainRef.current.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
    setActiveSection(label);
  }

  // ── Brother profile save ───────────────────────────────────────────────────
  function updateBrother(id: number, updates: Omit<Brother, "id">) {
    const prev = brotherList.find(b => b.id === id);
    if (!prev) return;
    setBrotherList(list => list.map(b => b.id === id ? { ...b, ...updates } : b));
    addActivity(`${updates.name || prev.name} profile updated`, "info");
    persistMutation(
      requestJson<Brother>(`/api/brothers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }),
      "Brother profile update failed. Local changes were reverted.",
      () => setBrotherList(list => list.map(b => b.id === id ? prev : b)),
    );
  }

  // ── Fetch calendar events once for attendance event picker ────────────────
  useEffect(() => {
    const controller = new AbortController();
    orgFetch("/api/calendar", { signal: controller.signal })
      .then(r => {
        // 401 here means the fetch raced the session cookie on a hard
        // navigation. ChapterContext's redirect handler covers the real
        // unauth case; treating this as an error just spams the console.
        if (r.status === 401) return null;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: CalendarEvent[] | null) => { if (data) setCalendarList(data); })
      .catch(err => { if (err.name !== "AbortError") console.error("Failed to load calendar", err); });
    return () => controller.abort();
  }, []);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const avgAttendance   = useMemo(() => avg(brotherList.map(b => b.attendance)), [brotherList]);
  const outstandingDues = useMemo(() => brotherList.reduce((s, b) => s + b.duesOwed, 0), [brotherList]);
  const chapterGPA      = useMemo(() => avg(brotherList.map(b => b.gpa)), [brotherList]);
  const belowAttCount   = useMemo(() => brotherList.filter(b => b.attendance < THRESHOLDS.attendanceWatch).length, [brotherList, THRESHOLDS]);
  const owingCount      = useMemo(() => brotherList.filter(b => b.duesOwed > 0).length, [brotherList]);
  const belowGpaCount   = useMemo(() => brotherList.filter(b => b.gpa < THRESHOLDS.gpaWatch).length, [brotherList, THRESHOLDS]);
  const totalServiceHrs = useMemo(() => brotherList.reduce((s, b) => s + b.serviceHours, 0), [brotherList]);
  const totalDoorRev    = useMemo(() => partyList.reduce((s, e) => s + e.doorRevenue, 0), [partyList]);
  const onTrackSvc      = useMemo(() => brotherList.filter(b => b.serviceHours >= THRESHOLDS.serviceHoursGoal).length, [brotherList, THRESHOLDS]);
  const maxRevenue      = useMemo(() => partyList.length ? Math.max(...partyList.map(e => e.doorRevenue)) : 0, [partyList]);
  const bestEvent       = useMemo(() => partyList.length ? partyList.reduce((a, b) => b.doorRevenue > a.doorRevenue ? b : a) : null, [partyList]);

  const statusCounts = useMemo(() => ({
    Good:      brotherList.filter(b => getBrotherStatus(b, THRESHOLDS) === "Good").length,
    Watch:     brotherList.filter(b => getBrotherStatus(b, THRESHOLDS) === "Watch").length,
    "At Risk": brotherList.filter(b => getBrotherStatus(b, THRESHOLDS) === "At Risk").length,
  }), [brotherList, THRESHOLDS]);

  // ── Needs-attention queue ───────────────────────────────────────────────────
  // Overdue deadlines, outstanding dues (aggregated), and at-risk members.
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const needsAttention = useMemo(
    () => deriveNeedsAttention(brotherList, deadlineList, THRESHOLDS, todayISO),
    [brotherList, deadlineList, THRESHOLDS, todayISO],
  );

  // ── Weekly Digest ──────────────────────────────────────────────────────────
  // Forward-looking "this week's agenda" for the current calendar week (Mon–Sun).
  const weekRange = useMemo(() => isoWeekBounds(new Date()), []);
  const weeklyDigest = useMemo(() => {
    const { start, end } = weekRange;
    const inWeek = (iso: string) => iso >= start && iso <= end; // zero-padded ISO compares chronologically
    return {
      deadlinesDue:    deadlineList.filter(d => inWeek(d.dueDate)),
      igDue:           igTaskList.filter(t => inWeek(t.dueDate)),
      eventsThisWeek:  calendarList.filter(e => e.mandatory && inWeek(e.date)),
      partiesThisWeek: partyList.filter(p => inWeek(p.date)),
      atRiskCount:     statusCounts["At Risk"],
    };
  }, [weekRange, deadlineList, igTaskList, calendarList, partyList, statusCounts]);
  const digestTotal =
    weeklyDigest.deadlinesDue.length + weeklyDigest.igDue.length +
    weeklyDigest.eventsThisWeek.length + weeklyDigest.partiesThisWeek.length;

  // ── AI narration (gpt-4o-mini via /api/ai/digest) ──────────────────────────
  // A stable content key identifies this exact weekly-digest state. Narration is
  // generated once per key: cached client-side in localStorage and server-side
  // in-memory, so a plain reload makes zero API calls. The key only changes when
  // the week's items/counts change, which triggers a single fresh generation.
  const digestKey = useMemo(() => {
    const ids = (arr: { id: number }[]) => arr.map(x => x.id).sort((a, b) => a - b).join(",");
    return [
      "v2", // bump when the AI prompt/length changes, to invalidate cached narrations
      weekRange.start, weekRange.end,
      `d:${ids(weeklyDigest.deadlinesDue)}`,
      `i:${ids(weeklyDigest.igDue)}`,
      `e:${ids(weeklyDigest.eventsThisWeek)}`,
      `p:${ids(weeklyDigest.partiesThisWeek)}`,
      `r:${weeklyDigest.atRiskCount}`,
    ].join("|");
  }, [weekRange, weeklyDigest]);

  const [digestNarration, setDigestNarration] = useState<string | null>(null);
  const [digestNarrationLoading, setDigestNarrationLoading] = useState(false);

  useEffect(() => {
    if (digestTotal === 0) { setDigestNarration(null); return; }

    const cacheKey = `chaptos_digest_narration:${digestKey}`;
    try {
      const stored = localStorage.getItem(cacheKey);
      if (stored) { setDigestNarration(stored); return; } // persisted — no API call
    } catch { /* localStorage unavailable — fall through to fetch */ }

    const controller = new AbortController();
    setDigestNarrationLoading(true);
    setDigestNarration(null);
    orgFetch("/api/ai/digest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        key: digestKey,
        weekRange,
        deadlines: weeklyDigest.deadlinesDue.map(d => ({ title: d.title, dueDate: d.dueDate })),
        instagram: weeklyDigest.igDue.map(t => ({ title: t.title, dueDate: t.dueDate })),
        events:    weeklyDigest.eventsThisWeek.map(e => ({ title: e.title, date: e.date })),
        parties:   weeklyDigest.partiesThisWeek.map(p => ({ name: p.name, date: p.date })),
        atRiskCount: weeklyDigest.atRiskCount,
      }),
    })
      .then(r => r.ok ? r.json() : null)
      .then((data: { narration?: string | null } | null) => {
        const text = data?.narration ?? null;
        setDigestNarration(text);
        if (text) { try { localStorage.setItem(cacheKey, text); } catch { /* ignore */ } }
      })
      .catch(() => { /* network/abort — leave narration absent, card still renders */ })
      .finally(() => setDigestNarrationLoading(false));

    return () => controller.abort();
  }, [digestKey, digestTotal, weekRange, weeklyDigest]);

  // ── Filtered/sorted brothers ───────────────────────────────────────────────
  const filteredBrothers = useMemo((): Brother[] => {
    let result = brotherList.filter(b => {
      const q = search.toLowerCase();
      return (b.name.toLowerCase().includes(q) || b.role.toLowerCase().includes(q)) &&
             (statusFilter === "All" || getBrotherStatus(b, THRESHOLDS) === statusFilter);
    });
    if (sortKey) {
      result = [...result].sort((a, b) => {
        const av = a[sortKey] as number, bv = b[sortKey] as number;
        return sortDir === "asc" ? av - bv : bv - av;
      });
    }
    return result;
  }, [brotherList, search, statusFilter, sortKey, sortDir, THRESHOLDS]);

  function toggleSort(key: keyof Brother) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  // ── Chart data ─────────────────────────────────────────────────────────────
  const partyChartData = useMemo(() => partyList.map(e => ({
    name: e.name.length > 12 ? e.name.slice(0, 11) + "…" : e.name,
    revenue: e.doorRevenue,
  })), [partyList]);

  const statusChartData = useMemo(() => [
    { name: "Good",    count: statusCounts.Good,       fill: "#34d399" },
    { name: "Watch",   count: statusCounts.Watch,      fill: "#fbbf24" },
    { name: "At Risk", count: statusCounts["At Risk"], fill: "#f87171" },
  ], [statusCounts]);

  const svcChartData = useMemo(() => [...brotherList]
    .sort((a, b) => b.serviceHours - a.serviceHours)
    .map(b => ({ name: b.name.split(" ")[0], hours: b.serviceHours })),
  [brotherList]);

  const brotherNames = useMemo(() => brotherList.map(b => b.name), [brotherList]);

  // ── Inline attendance edit ─────────────────────────────────────────────────
  function startAttEdit(b: Brother) {
    setEditingAttId(b.id);
    setEditAttVal(String(b.attendance));
  }

  function saveAttEdit(b: Brother) {
    const val = Math.min(100, Math.max(0, Math.round(Number(editAttVal))));
    if (!isNaN(val) && val !== b.attendance) {
      setBrotherList(prev => prev.map(x => x.id === b.id ? { ...x, attendance: val } : x));
      addActivity(`${b.name} attendance updated to ${val}%`, "info");
      persistMutation(
        requestJson<Brother>(`/api/brothers/${b.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attendance: val }),
        }),
        "Attendance update failed. Local changes were reverted.",
        () => setBrotherList(prev => prev.map(x => x.id === b.id ? b : x)),
      );
    }
    setEditingAttId(null);
  }

  // ── Quick Action handlers ──────────────────────────────────────────────────
  function handleAddCalendarEvent(draft: CalendarDraft) {
    const tempId = _nextId++;
    const optimistic: CalendarEvent = { id: tempId, ...draft };
    setCalendarList(prev => [...prev, optimistic]);
    addActivity(`New event added: "${draft.title}"`, "info");
    setActiveModal(null);
    requestJson<CalendarEvent>("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    })
      .then(saved => {
        setCalendarList(prev => prev.map(e => e.id === tempId ? saved : e));
        setMutationError(null);
      })
      .catch(error => {
        console.error(error);
        setCalendarList(prev => prev.filter(e => e.id !== tempId));
        setMutationError("Calendar event could not be saved. Local changes were reverted.");
      });
  }

  async function handleAddTransaction(data: Omit<Transaction, "id" | "createdAt" | "updatedAt" | "deletedAt">) {
    const optimisticId = -Date.now();
    const optimistic: Transaction = { ...data, id: optimisticId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setTransactionList(prev => [optimistic, ...prev]);
    const label = data.type === "expense" ? "Expense" : "Revenue";
    addActivity(`${label} logged: ${data.category} — ${fmt$(data.amount)}`, data.type === "expense" ? "warning" : "success");
    setActiveModal(null);
    try {
      const saved = await requestJson<Transaction>("/api/transactions", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      setTransactionList(prev => prev.map(t => t.id === optimisticId ? saved : t));
      setMutationError(null);
      // Refresh chapter data so treasury KPIs update.
      refreshChapterData().catch(() => undefined);
    } catch (e) {
      console.error(e);
      setTransactionList(prev => prev.filter(t => t.id !== optimisticId));
      setMutationError("Transaction could not be saved. Please try again.");
    }
  }

  function handleAddDeadline(d: { title: string; dueDate: string; owner: string; status: TaskStatus }) {
    const tempId = _nextId++;
    setDeadlineList(prev => [...prev, { id: tempId, ...d }]);
    addActivity(`New deadline added: "${d.title}"`, "info");
    setActiveModal(null);
    persistMutation(
      requestJson<Deadline>("/api/deadlines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      }),
      "Deadline could not be saved. Local changes were reverted.",
      () => setDeadlineList(prev => prev.filter(x => x.id !== tempId)),
      saved => setDeadlineList(prev => prev.map(x => x.id === tempId ? saved : x)),
    );
  }

  function handleAddRevenue(e: { name: string; date: string; doorRevenue: number; attendance: number; notes: string }) {
    const tempId = _nextId++;
    setPartyList(prev => [...prev, { id: tempId, theme: "", collabOrg: "", expenses: 0, partyType: "Open", completed: false, completedAt: null, ...e }]);
    addActivity(`Revenue logged: ${e.name} — ${fmt$(e.doorRevenue)}`, "success");
    setActiveModal(null);
    persistMutation(
      requestJson<PartyEvent>("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(e),
      }),
      "Revenue entry could not be saved. Local changes were reverted.",
      () => setPartyList(prev => prev.filter(x => x.id !== tempId)),
      saved => setPartyList(prev => prev.map(x => x.id === tempId ? saved : x)),
    );
  }

  function handleAddIGTask(t: { title: string; dueDate: string; owner: string; type: string; status: TaskStatus }) {
    const tempId = _nextId++;
    setIgTaskList(prev => [...prev, { id: tempId, ...t }]);
    addActivity(`IG task added: "${t.title}"`, "info");
    setActiveModal(null);
    persistMutation(
      requestJson<InstagramTask>("/api/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(t),
      }),
      "Instagram task could not be saved. Local changes were reverted.",
      () => setIgTaskList(prev => prev.filter(x => x.id !== tempId)),
      saved => setIgTaskList(prev => prev.map(x => x.id === tempId ? saved : x)),
    );
  }

  // ── Deadline CRUD ─────────────────────────────────────────────────────────
  function completeDeadline(id: number) {
    const d = deadlineList.find(x => x.id === id);
    if (!d || d.status === "Complete") return;
    setDeadlineList(prev => prev.map(x => x.id === id ? { ...x, status: "Complete" } : x));
    addActivity(`"${d.title}" marked complete`, "success");
    persistMutation(
      requestJson<Deadline>(`/api/deadlines/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Complete" }),
      }),
      "Deadline update failed. Local changes were reverted.",
      () => setDeadlineList(prev => prev.map(x => x.id === id ? d : x)),
    );
  }

  function deleteDeadline(id: number) {
    const d = deadlineList.find(x => x.id === id);
    if (!d) return;
    setConfirmDelete({ kind: "deadline", id, label: d.title });
  }

  function confirmDeleteDeadline(id: number) {
    const d = deadlineList.find(x => x.id === id);
    if (!d) return;
    setDeadlineList(prev => prev.filter(x => x.id !== id));
    addActivity(`Deadline removed: "${d.title}"`, "info");
    persistMutation(
      requestJson<void>(`/api/deadlines/${id}`, { method: "DELETE" }),
      "Deadline delete failed. Local changes were reverted.",
      () => setDeadlineList(prev => [...prev, d].sort((a, b) => a.id - b.id)),
    );
  }

  function openEditDeadline(id: number) {
    setEditingDeadlineId(id);
    setActiveModal("edit-deadline");
  }

  function saveEditDeadline(data: { title: string; dueDate: string; owner: string; status: TaskStatus }) {
    if (!editingDeadlineId) return;
    const previous = deadlineList.find(x => x.id === editingDeadlineId);
    setDeadlineList(prev => prev.map(x => x.id === editingDeadlineId ? { ...x, ...data } : x));
    addActivity(`Deadline updated: "${data.title}"`, "info");
    persistMutation(
      requestJson<Deadline>(`/api/deadlines/${editingDeadlineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
      "Deadline update failed. Local changes were reverted.",
      previous ? () => setDeadlineList(prev => prev.map(x => x.id === previous.id ? previous : x)) : undefined,
    );
    setEditingDeadlineId(null);
    setActiveModal(null);
  }

  // ── IG Task CRUD ──────────────────────────────────────────────────────────
  function completeIG(id: number) {
    const t = igTaskList.find(x => x.id === id);
    if (!t || t.status === "Complete") return;
    setIgTaskList(prev => prev.map(x => x.id === id ? { ...x, status: "Complete" } : x));
    addActivity(`IG task "${t.title}" marked complete`, "success");
    persistMutation(
      requestJson<InstagramTask>(`/api/instagram/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Complete" }),
      }),
      "Instagram task update failed. Local changes were reverted.",
      () => setIgTaskList(prev => prev.map(x => x.id === id ? t : x)),
    );
  }

  function deleteIG(id: number) {
    const t = igTaskList.find(x => x.id === id);
    if (!t) return;
    setConfirmDelete({ kind: "ig", id, label: t.title });
  }

  function confirmDeleteIG(id: number) {
    const t = igTaskList.find(x => x.id === id);
    if (!t) return;
    setIgTaskList(prev => prev.filter(x => x.id !== id));
    addActivity(`IG task removed: "${t.title}"`, "info");
    persistMutation(
      requestJson<void>(`/api/instagram/${id}`, { method: "DELETE" }),
      "Instagram task delete failed. Local changes were reverted.",
      () => setIgTaskList(prev => [...prev, t].sort((a, b) => a.id - b.id)),
    );
  }

  function openEditIG(id: number) {
    setEditingIgId(id);
    setActiveModal("edit-ig");
  }

  function saveEditIG(data: { title: string; dueDate: string; owner: string; type: string; status: TaskStatus }) {
    if (!editingIgId) return;
    const previous = igTaskList.find(x => x.id === editingIgId);
    setIgTaskList(prev => prev.map(x => x.id === editingIgId ? { ...x, ...data } : x));
    addActivity(`IG task updated: "${data.title}"`, "info");
    persistMutation(
      requestJson<InstagramTask>(`/api/instagram/${editingIgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
      "Instagram task update failed. Local changes were reverted.",
      previous ? () => setIgTaskList(prev => prev.map(x => x.id === previous.id ? previous : x)) : undefined,
    );
    setEditingIgId(null);
    setActiveModal(null);
  }

  async function handleLogAttendance(attendedIds: number[], eventId: number) {
    // Abort any in-flight attendance request before starting a new one
    attendanceReqRef.current?.abort();
    const controller = new AbortController();
    attendanceReqRef.current = controller;
    try {
      const updated = await requestJson<Brother[]>("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarEventId: eventId, attendedIds }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setBrotherList(updated);
      addActivity(`Attendance logged — ${attendedIds.length} present`, "info");
      setActiveModal(null);
      setSelectedEventForAttendance(null);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setMutationError("Attendance log failed. Please try again.");
    }
  }

  function openAttendanceLog(event?: CalendarEvent) {
    if (event) {
      setSelectedEventForAttendance(event);
      setActiveModal("attendance");
    } else {
      // Refresh calendar list so newly-added events show up
      orgFetch("/api/calendar")
        .then(r => r.ok ? r.json() : Promise.reject())
        .then((data: CalendarEvent[]) => setCalendarList(data))
        .catch(() => undefined);
      setActiveModal("pick-event");
    }
  }

  function closeModal() { setActiveModal(null); }

  function handleQuickAction(key: QuickActionKey) {
    if (key === "expense"  && !canTreasury) return;
    if (key === "revenue"  && !canTreasury) return;
    if (key === "excuse") {
      // Refresh calendar so the picker shows the latest mandatory events.
      orgFetch("/api/calendar")
        .then(r => r.ok ? r.json() : Promise.reject())
        .then((data: CalendarEvent[]) => setCalendarList(data))
        .catch(() => undefined);
      setActiveModal("pick-event-for-excuse");
      return;
    }
    setActiveModal(key);
  }

  function openPayDues(b: Brother) {
    setPayTarget(b);
    setPayAmountStr(String(b.duesOwed));
  }

  function submitPayDues() {
    if (!payTarget) return;
    const amount = Math.max(0, parseFloat(payAmountStr) || 0);
    const newOwed = Math.max(0, payTarget.duesOwed - amount);
    const b = payTarget;
    setPayTarget(null);
    setPayAmountStr("");
    setBrotherList(prev => prev.map(x => x.id === b.id ? { ...x, duesOwed: newOwed } : x));
    addActivity(
      newOwed === 0
        ? `${b.name} dues fully paid`
        : `${b.name} paid ${fmt$(amount)} — ${fmt$(newOwed)} remaining`,
      "success",
    );
    persistMutation(
      requestJson<Brother>(`/api/brothers/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duesOwed: newOwed }),
      }),
      "Dues update failed. Local changes were reverted.",
      () => setBrotherList(prev => prev.map(x => x.id === b.id ? b : x)),
    );
  }

  function addServiceHour(b: Brother, hours = 1) {
    const newHrs = b.serviceHours + hours;
    setBrotherList(prev => prev.map(x => x.id === b.id ? { ...x, serviceHours: newHrs } : x));
    addActivity(`${b.name} — service hours updated to ${newHrs}h`, "info");
    persistMutation(
      requestJson<Brother>(`/api/brothers/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceHours: newHrs }),
      }),
      "Service hour update failed. Local changes were reverted.",
      () => setBrotherList(prev => prev.map(x => x.id === b.id ? b : x)),
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden bg-[#07090f]">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeSection={activeSection}
        onNavClick={scrollToSection}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* ── Toolbar ─────────────────────────────────────────────────────── */}
        <header className="toolbar-frosted dash-toolbar relative z-20 flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.05] px-3 sm:gap-3 sm:px-5">
          <button onClick={() => setSidebarOpen(true)} className="tb-icon-btn flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.07] lg:hidden">
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="min-w-0 flex-1">
            <p className="tb-title text-[14px] font-semibold leading-tight text-white">Operations Dashboard</p>
            <p className="tb-org hidden text-[11px] leading-tight text-slate-400 sm:block">{currentUser?.org?.name ?? "ChaptOS"}</p>
          </div>

          {/* My Standing — opens the member's own record in the existing Brother
              drawer (dues / attendance / service / excuse history). Only shown when
              the signed-in user has a roster record to open. */}
          {selfId !== null && brotherList.some(b => b.id === selfId) && (
            <button onClick={() => setSelectedBrotherId(selfId)} className="tb-btn inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-150 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-200 focus:outline-none">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3.5 w-3.5 text-slate-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="hidden sm:inline">My Standing</span>
            </button>
          )}

          {/* Quick Actions */}
          <div className="tb-actions hidden items-center gap-1.5 lg:flex">
            <QuickActionsMenu isAdmin={isAdmin || canTreasury || canAttendance} onSelect={handleQuickAction} enabledWorkflows={currentUser?.org?.enabledWorkflows} />
            {canAttendance && (
              <button onClick={() => openAttendanceLog()}
                className="tb-btn rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-150 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-200">
                Log Att.
              </button>
            )}
          </div>

          {/* Mobile: quick actions menu */}
          <div className="lg:hidden">
            <QuickActionsMenu isAdmin={isAdmin || canTreasury || canAttendance} onSelect={handleQuickAction} variant="mobile" enabledWorkflows={currentUser?.org?.enabledWorkflows} />
          </div>

          <p className="tb-date hidden text-[11px] text-slate-500 xl:block shrink-0">{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>

          <div className="tb-search-wrap relative hidden sm:block">
            <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input type="text" placeholder="Search brothers…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-36 rounded-lg border border-white/[0.08] bg-white/[0.03] py-1.5 pl-8 pr-3 text-[13px] text-white placeholder:text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors focus:border-indigo-500/60 focus:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-indigo-500/15 sm:w-44" />
          </div>

          <button onClick={() => window.print()} className="tb-btn inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-150 hover:border-white/[0.16] hover:bg-white/[0.06] focus:outline-none">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-slate-400">
              <path fillRule="evenodd" d="M11.5 4.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0ZM4.25 8.5a3.25 3.25 0 0 0-3.25 3.25v.5A1.75 1.75 0 0 0 2.75 14h10.5A1.75 1.75 0 0 0 15 12.25v-.5A3.25 3.25 0 0 0 11.75 8.5h-7.5Z" clipRule="evenodd" />
            </svg>
            <span className="hidden sm:inline">Export</span>
          </button>
          <UserAvatar />
        </header>

        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <main ref={mainRef} className="page-ambient flex-1 overflow-y-auto">
          {/* Loading/error banner — shared by desktop and mobile views */}
          {(isLoading || loadError || mutationError) && (
            <div className="mx-auto max-w-[1400px] px-4 pt-6 sm:px-6">
              <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-[12px] ${
                loadError || mutationError
                  ? "border-red-500/25 bg-red-500/10 text-red-200"
                  : "border-indigo-500/20 bg-indigo-500/10 text-indigo-200"
              }`}>
                <span>
                  {loadError ?? mutationError ?? "Syncing chapter data from the database..."}
                </span>
                {loadError ? (
                  <button onClick={() => void refreshChapterData()} className="rounded-lg border border-red-300/20 px-2.5 py-1 font-semibold text-red-100 hover:bg-red-500/15">
                    Retry
                  </button>
                ) : mutationError ? (
                  <button onClick={() => setMutationError(null)} className="rounded-lg border border-red-300/20 px-2.5 py-1 font-semibold text-red-100 hover:bg-red-500/15">
                    Dismiss
                  </button>
                ) : null}
              </div>
            </div>
          )}

          {/* ── Mobile view (below md) — Summary + tabs ─────────────────────── */}
          <div className="md:hidden">
            <MobileDashboard
              announcement={announcement}
              onEditAnnouncement={() => setAnnouncementEditorOpen(true)}
              kpis={{
                avgAttendance, belowAttCount,
                outstandingDues, owingCount,
                chapterGPA, belowGpaCount,
                totalServiceHrs, onTrackSvc, brotherCount: brotherList.length,
                liveBalance, liveProjected,
                totalDoorRev, bestEvent,
              }}
              brothersData={{
                filteredBrothers, brotherList, statusCounts,
                search, statusFilter, selfId, currentUser, avatarRevision, isAdmin,
              }}
              tasksData={{ weeklyDigest, weekRange, digestNarration, deadlineList, igTaskList, activityFeed }}
              moneyData={{
                liveBalance, liveProjected, liveTrend, totalDoorRev, partyList,
                partyChartData, statusChartData, svcChartData,
                goodCount: statusCounts.Good, brotherCount: brotherList.length,
                onTrackSvc, serviceHoursGoal: THRESHOLDS.serviceHoursGoal, maxRevenue, bestEvent,
              }}
              actions={{
                setSearch, setStatusFilter, setSelectedBrotherId,
                setActiveDrawer, setWidgetDrawer, setActiveModal,
                openPayDues, addServiceHour,
                completeDeadline, openEditDeadline, deleteDeadline,
                completeIG, openEditIG, deleteIG,
              }}
            />
          </div>

          {/* ── Desktop view (md and up) — "Chapter Ledger" redesign ──────── */}
          {/* Warm editorial pane, scoped under `.dash` (dashboard-ledger.css). The
              sidebar, toolbar (warmed separately at md+), drawers, and modals are
              outside this wrapper and keep their own styling. */}
          <div className="dash hidden md:block" data-dashboard-theme="dusk">

            {/* ── Briefing + health dial ──────────────────────────────────── */}
            <BriefingHeader
              firstName={currentUser?.name?.split(" ")[0] ?? "there"}
              weekStart={weekRange.start}
              weekEnd={weekRange.end}
              digest={digestNarration}
              digestLoading={digestNarrationLoading}
              health={feature("operations", "health") ? (
                <div className="dash-group">
                  <HealthDial
                    score={health.score}
                    label={health.label}
                    breakdown={health.breakdown}
                    onExpand={() => setWidgetDrawer("health")}
                  />
                  {isActiveOrgAdmin && <DashHideButton label="Health widget" onHide={() => setWidgetHidden("health", true)} />}
                </div>
              ) : null}
            />

            {/* ── Pinned announcement ─────────────────────────────────────── */}
            {feature("operations", "announcement") && (
              <PinnedAnnouncement
                announcement={announcement}
                onEdit={() => setAnnouncementEditorOpen(true)}
                hideButton={isActiveOrgAdmin ? <DashHideButton label="Announcement" onHide={() => setWidgetHidden("announcement", true)} /> : undefined}
              />
            )}

            {/* ── Ledger strip ────────────────────────────────────────────── */}
            {(feature("operations", "kpi-attendance") || feature("operations", "kpi-dues") ||
              feature("operations", "kpi-gpa") || feature("operations", "kpi-service") ||
              feature("operations", "kpi-treasury") || customMetricSnapshots.length > 0) && (
              <LedgerStrip>
                {feature("operations", "kpi-attendance") && (
                  <Measure
                    label="Attendance"
                    value={avgAttendance.toFixed(1)}
                    unit="%"
                    note={`${belowAttCount} below ${THRESHOLDS.attendanceWatch}%`}
                    noteWarn={belowAttCount > 0}
                    spark={<LedgerSparkline data={KPI_SPARKLINES.attendance} stroke="var(--gold)" />}
                    onClick={() => setActiveDrawer("attendance")}
                    hideButton={isActiveOrgAdmin ? <DashHideButton label="Attendance KPI" onHide={() => setWidgetHidden("kpi-attendance", true)} /> : undefined}
                  />
                )}
                {feature("operations", "kpi-dues") && (
                  <Measure
                    label="Dues outstanding"
                    unitLeading="$"
                    value={outstandingDues.toLocaleString()}
                    note={`${owingCount} ${owingCount === 1 ? "brother" : "brothers"} owe`}
                    noteWarn={owingCount > 0}
                    spark={<LedgerSparkline data={KPI_SPARKLINES.dues} stroke="var(--ok)" />}
                    onClick={() => setActiveDrawer("dues")}
                    hideButton={isActiveOrgAdmin ? <DashHideButton label="Dues KPI" onHide={() => setWidgetHidden("kpi-dues", true)} /> : undefined}
                  />
                )}
                {feature("operations", "kpi-gpa") && (
                  <Measure
                    label="Chapter GPA"
                    value={chapterGPA.toFixed(2)}
                    note={`${belowGpaCount} below ${THRESHOLDS.gpaWatch.toFixed(1)}`}
                    spark={<LedgerSparkline data={KPI_SPARKLINES.gpa} stroke="var(--vio)" />}
                    onClick={() => setActiveDrawer("gpa")}
                    hideButton={isActiveOrgAdmin ? <DashHideButton label="GPA KPI" onHide={() => setWidgetHidden("kpi-gpa", true)} /> : undefined}
                  />
                )}
                {feature("operations", "kpi-service") && (
                  <Measure
                    label="Service"
                    value={`${totalServiceHrs}`}
                    unit="h"
                    note={`${onTrackSvc} of ${brotherList.length} on track`}
                    spark={<LedgerSparkline data={KPI_SPARKLINES.service} stroke="var(--vio)" />}
                    onClick={() => setActiveDrawer("service")}
                    hideButton={isActiveOrgAdmin ? <DashHideButton label="Service Hours KPI" onHide={() => setWidgetHidden("kpi-service", true)} /> : undefined}
                  />
                )}
                {feature("operations", "kpi-treasury") && (
                  <Measure
                    label="Treasury"
                    unitLeading="$"
                    value={liveBalance.toLocaleString()}
                    note={`proj. ${fmt$(liveProjected)}`}
                    spark={<LedgerSparkline data={KPI_SPARKLINES.treasury} stroke="var(--ok)" />}
                    onClick={() => setActiveDrawer("treasury")}
                    hideButton={isActiveOrgAdmin ? <DashHideButton label="Treasury KPI" onHide={() => setWidgetHidden("kpi-treasury", true)} /> : undefined}
                  />
                )}
                {customMetricSnapshots.map(snap => {
                  const fmtHeadline = Number.isInteger(snap.headline) ? String(snap.headline) : snap.headline.toFixed(1);
                  const headline =
                    snap.aggregation === "count_on_track"
                      ? `${snap.headline} / ${snap.totalCount}`
                      : snap.unit
                      ? `${fmtHeadline}${snap.unit}`
                      : fmtHeadline;
                  const note =
                    snap.aggregation === "count_on_track"
                      ? `${snap.onTrackCount} on track`
                      : `Goal ${snap.goal}${snap.unit ?? ""}`;
                  return (
                    <Measure
                      key={snap.definitionId}
                      label={snap.name}
                      value={headline}
                      note={note}
                      onClick={() => setActiveCustomMetricId(snap.definitionId)}
                    />
                  );
                })}
              </LedgerStrip>
            )}

            {/* ── Two-column grid ─────────────────────────────────────────── */}
            <div className="grid">
              {/* Left column */}
              <div className="col">
                {feature("operations", "needs-attention") && (
                  <NeedsAttention
                    items={needsAttention}
                    onMarkDone={completeDeadline}
                    onOpenProfile={(id) => setSelectedBrotherId(id)}
                    onSendReminder={() => setActiveDrawer("dues")}
                    hideButton={isActiveOrgAdmin ? <DashHideButton label="Needs attention" onHide={() => setWidgetHidden("needs-attention", true)} /> : undefined}
                  />
                )}
                {feature("operations", "brother-tracking") && (
                  <RosterTable
                    brothers={filteredBrothers}
                    statusCounts={statusCounts}
                    statusFilter={statusFilter}
                    onFilter={setStatusFilter}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    onRowClick={(id) => setSelectedBrotherId(id)}
                    thresholds={THRESHOLDS}
                    selfId={selfId}
                    selfAvatarUrl={currentUser?.avatarUrl}
                    avatarRevision={avatarRevision}
                    canBrothers={canBrothers}
                    onPayDues={openPayDues}
                    onAddServiceHour={addServiceHour}
                    hideButton={isActiveOrgAdmin ? <DashHideButton label="Member tracking" onHide={() => setWidgetHidden("brother-tracking", true)} /> : undefined}
                  />
                )}
              </div>

              {/* Right rail */}
              <div className="col">
                <ThisWeek
                  events={weeklyDigest.eventsThisWeek}
                  deadlines={weeklyDigest.deadlinesDue}
                  weekStart={weekRange.start}
                  weekEnd={weekRange.end}
                  today={todayISO}
                  onAll={() => setWidgetDrawer("deadlines")}
                  onAddDeadline={() => setActiveModal("deadline")}
                />
                <TreasuryRail balance={liveBalance} projected={liveProjected} trend={liveTrend} />
                <SocialsRail
                  parties={partyList}
                  totalDoorRev={totalDoorRev}
                  maxRevenue={maxRevenue}
                  bestEvent={bestEvent}
                  today={todayISO}
                  onAdd={() => setActiveModal("revenue")}
                  onAll={() => setWidgetDrawer("parties")}
                />
                <InstagramRail
                  tasks={igTaskList.filter(t => t.status !== "Complete")}
                  today={todayISO}
                  onAdd={() => setActiveModal("ig")}
                  onAll={() => setWidgetDrawer("instagram")}
                />
                <ActivityRail entries={activityFeed} onAll={() => setWidgetDrawer("activity")} />
              </div>
            </div>

            {/* ── Hidden widgets tray (admin un-hide path) ────────────────── */}
            {isActiveOrgAdmin && hiddenOps.length > 0 && (
              <div className="hidden-tray">
                <p className="lbl">Hidden widgets</p>
                <div className="chips">
                  {hiddenOps.map(f => (
                    <button key={f.id} onClick={() => setWidgetHidden(f.id, false)} title={`Show ${f.label}`}>{f.label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Footer ──────────────────────────────────────────────────── */}
            <footer>{currentUser?.org?.name ?? "ChaptOS"} · Backed by seeded chapter data</footer>

          </div>
        </main>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {activeModal === "expense" && isAdmin && (
        <Modal title="Log Expense" onClose={closeModal}>
          <TxForm lockType="expense" onSubmit={handleAddTransaction} onCancel={closeModal} />
        </Modal>
      )}
      {activeModal === "event" && (
        <Modal title="New Event" onClose={closeModal}>
          <CalendarEventForm submitLabel="Add Event" onSubmit={handleAddCalendarEvent} />
        </Modal>
      )}
      {activeModal === "deadline" && (
        <Modal title="Add Deadline" onClose={closeModal}>
          <AddDeadlineForm brotherNames={brotherNames} onSubmit={handleAddDeadline} />
        </Modal>
      )}
      {activeModal === "revenue" && (
        <Modal title="Log Revenue" onClose={closeModal}>
          <AddRevenueForm onSubmit={handleAddRevenue} />
        </Modal>
      )}
      {activeModal === "ig" && (
        <Modal title="Add Instagram Task" onClose={closeModal}>
          <AddIGTaskForm brotherNames={brotherNames} onSubmit={handleAddIGTask} />
        </Modal>
      )}
      {activeModal === "attendance" && selectedEventForAttendance && (
        <Modal title="Log Attendance" onClose={closeModal}>
          <LogAttendanceForm event={selectedEventForAttendance} bList={brotherList} onSubmit={handleLogAttendance} />
        </Modal>
      )}
      {activeModal === "pick-event-for-excuse" && (
        <Modal title="Select Event to Excuse" onClose={closeModal}>
          <p className="mb-3 text-[12px] text-slate-400">Pick a required event you (or, if you&rsquo;re an admin, another brother) need an excuse for.</p>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {calendarList.filter(e => e.mandatory).length === 0 && (
              <p className="text-[12px] text-slate-500">No required events found.</p>
            )}
            {calendarList.filter(e => e.mandatory).sort((a, b) => a.date.localeCompare(b.date)).map(e => (
              <button key={e.id} onClick={() => { setSelectedEventForAttendance(e); setActiveModal("excuse"); }}
                className="w-full rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:border-indigo-500/30 hover:bg-indigo-500/10">
                <p className="text-[13px] font-medium text-white">{e.title}</p>
                <p className="text-[11px] text-slate-500">{e.date}{e.location ? ` · ${e.location}` : ""}</p>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {activeModal === "excuse" && selectedEventForAttendance && (
        <Modal title={isAdmin ? "Approve Excuse" : "Submit Excuse"} onClose={closeModal}>
          <ExcuseForm
            event={selectedEventForAttendance}
            bList={brotherList}
            isAdmin={isAdmin}
            selfBrotherId={selfId}
            onDone={({ excuseStatus }) => {
              const eventTitle = selectedEventForAttendance.title;
              if (excuseStatus === "approved") {
                addActivity(`Excuse approved for ${eventTitle}`, "success");
              } else {
                addActivity(`Excuse submitted for review (${eventTitle})`, "info");
              }
              setSelectedEventForAttendance(null);
              setActiveModal(null);
              // Refresh chapter data so attendance numbers reflect the new approval.
              refreshChapterData().catch(() => undefined);
            }}
          />
        </Modal>
      )}
      {activeModal === "pick-event" && (
        <Modal title="Select Event to Log" onClose={closeModal}>
          <p className="mb-3 text-[12px] text-slate-400">Pick a required event to log attendance for.</p>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {calendarList.filter(e => e.mandatory).length === 0 && (
              <p className="text-[12px] text-slate-500">No required events found.</p>
            )}
            {calendarList.filter(e => e.mandatory).sort((a, b) => a.date.localeCompare(b.date)).map(e => (
              <button key={e.id} onClick={() => { setSelectedEventForAttendance(e); setActiveModal("attendance"); }}
                className="w-full rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:border-indigo-500/30 hover:bg-indigo-500/10">
                <p className="text-[13px] font-medium text-white">{e.title}</p>
                <p className="text-[11px] text-slate-500">{e.date}{e.location ? ` · ${e.location}` : ""}</p>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {activeModal === "edit-deadline" && editingDeadlineId !== null && (() => {
        const d = deadlineList.find(x => x.id === editingDeadlineId);
        if (!d) return null;
        return (
          <Modal title="Edit Deadline" onClose={closeModal}>
            <AddDeadlineForm brotherNames={brotherNames} initial={d} onSubmit={saveEditDeadline} />
          </Modal>
        );
      })()}
      {activeModal === "edit-ig" && editingIgId !== null && (() => {
        const t = igTaskList.find(x => x.id === editingIgId);
        if (!t) return null;
        return (
          <Modal title="Edit Instagram Task" onClose={closeModal}>
            <AddIGTaskForm brotherNames={brotherNames} initial={t} onSubmit={saveEditIG} />
          </Modal>
        );
      })()}

      {/* ── Pay Dues Modal ──────────────────────────────────────────────────── */}
      {payTarget && (
        <Modal title="Record Payment" onClose={() => setPayTarget(null)}>
          <div className="space-y-4">
            <div>
              <p className="text-[12px] text-slate-400 mb-3">
                {payTarget.name} owes <span className="font-semibold text-amber-400">{fmt$(payTarget.duesOwed)}</span>
              </p>
              <FieldLabel>Amount Paid ($)</FieldLabel>
              <input
                type="number"
                min="0"
                max={payTarget.duesOwed}
                step="0.01"
                className={inputCls}
                value={payAmountStr}
                onChange={e => setPayAmountStr(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === "Enter") submitPayDues(); }}
              />
              {(() => {
                const amt = parseFloat(payAmountStr) || 0;
                const remaining = Math.max(0, payTarget.duesOwed - amt);
                return amt > 0 ? (
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Remaining after payment: <span className={remaining === 0 ? "text-emerald-400 font-semibold" : "text-slate-300"}>{fmt$(remaining)}</span>
                  </p>
                ) : null;
              })()}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPayTarget(null)}
                className="rounded-lg border border-white/[0.08] px-4 py-1.5 text-[13px] text-slate-400 hover:border-white/[0.16] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitPayDues}
                disabled={!(parseFloat(payAmountStr) > 0)}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Record Payment
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Announcement Editor ─────────────────────────────────────────────── */}
      {announcementEditorOpen && (
        <AnnouncementEditor
          current={announcement}
          onClose={() => setAnnouncementEditorOpen(false)}
          onSave={(saved) => {
            setAnnouncement(saved);
            setAnnouncementEditorOpen(false);
          }}
        />
      )}

      {/* ── Widget Detail Drawer ────────────────────────────────────────────── */}
      <WidgetDetailDrawer
        activeKey={widgetDrawer}
        onClose={() => setWidgetDrawer(null)}
        weeklyDigest={weeklyDigest}
        weekRange={weekRange}
        digestNarration={digestNarration}
        deadlineList={deadlineList}
        igTaskList={igTaskList}
        activityFeed={activityFeed}
        partyList={partyList}
        health={health}
        maxRevenue={maxRevenue}
        bestEvent={bestEvent}
        totalDoorRev={totalDoorRev}
        onOpenModal={setActiveModal}
        onCompleteDeadline={completeDeadline}
        onDeleteDeadline={deleteDeadline}
        onEditDeadline={openEditDeadline}
        onCompleteIG={completeIG}
        onDeleteIG={deleteIG}
        onEditIG={openEditIG}
      />

      {/* ── Brother Detail Drawer ───────────────────────────────────────────── */}
      <BrotherDrawer
        brotherId={selectedBrotherId}
        brotherList={brotherList}
        onClose={() => setSelectedBrotherId(null)}
        onSave={updateBrother}
        onPayDues={openPayDues}
        onAddServiceHours={addServiceHour}
        isAdmin={isAdmin}
        selfId={selfId}
      />

      {/* ── Confirm Delete Dialog ───────────────────────────────────────────── */}
      {confirmDelete && (
        <ConfirmDialog
          title={confirmDelete.kind === "deadline" ? "Delete Deadline" : "Delete IG Task"}
          message={<>Delete <span className="font-semibold text-white">{confirmDelete.label}</span>? This cannot be undone.</>}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            if (confirmDelete.kind === "deadline") confirmDeleteDeadline(confirmDelete.id);
            else confirmDeleteIG(confirmDelete.id);
            setConfirmDelete(null);
          }}
        />
      )}

      {/* ── KPI Detail Drawer ───────────────────────────────────────────────── */}
      <KPIDetailDrawer
        activeKey={activeDrawer}
        onClose={() => setActiveDrawer(null)}
        brotherList={brotherList}
        partyList={partyList}
        openPayDues={openPayDues}
        addServiceHour={addServiceHour}
        avgAttendance={avgAttendance}
        outstandingDues={outstandingDues}
        chapterGPA={chapterGPA}
        totalServiceHrs={totalServiceHrs}
        onTrackSvc={onTrackSvc}
        totalDoorRev={totalDoorRev}
        maxRevenue={maxRevenue}
        bestEvent={bestEvent}
        liveBalance={liveBalance}
        liveProjected={liveProjected}
        liveTrend={liveTrend}
        onOpenModal={setActiveModal}
        onOpenAttendance={openAttendanceLog}
        isAdmin={isAdmin}
      />
      <CustomMetricDetailDrawer
        snap={customMetricSnapshots.find(s => s.definitionId === activeCustomMetricId) ?? null}
        onClose={() => setActiveCustomMetricId(null)}
      />
    </div>
  );
}
