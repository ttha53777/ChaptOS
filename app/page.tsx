"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Brother, CalendarEvent, TaskStatus, ActivityEntry, PartyEvent, Deadline, InstagramTask,
  treasuryTrend, TREASURY_BALANCE, TREASURY_PROJECTED, THRESHOLDS,
  KPI_SPARKLINES,
  getBrotherStatus, calcHealthScore, avg, fmt$, fmtDate,
} from "./data";
import { Sidebar, SvgIcon, NAV_ICONS } from "./components/Sidebar";
import { UserAvatar } from "./components/UserAvatar";
import { useChapter } from "./context/ChapterContext";
import { AddDeadlineForm, AddIGTaskForm, AddRevenueForm, LogAttendanceForm } from "./components/dashboard/forms";
import { BrotherDrawer } from "./components/dashboard/drawers/BrotherDrawer";
import { Card, Modal, StatusBadge, TaskBadge, ConfirmDialog } from "./components/dashboard/primitives";
import { BROTHER_STYLES, KPI_ICONS, SECTION_IDS, tooltipStyle } from "./components/dashboard/styles";
import { ActivityFeed, AttBar, ChartWidget, HealthScoreWidget, KPICard, SortTh } from "./components/dashboard/widgets";

// ─── Activity ID counter (module-level, reset-safe) ───────────────────────────

let _nextId = Date.now();

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = typeof body?.error === "string" ? `: ${body.error}` : "";
    } catch {
      // The status code is enough when the API does not return JSON.
    }
    throw new Error(`${url} returned ${response.status}${detail}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

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
  payDues, addServiceHour,
  avgAttendance, outstandingDues, chapterGPA,
  totalServiceHrs, onTrackSvc,
  totalDoorRev, maxRevenue, bestEvent,
  liveBalance, liveProjected, liveTrend,
  onOpenModal, onOpenAttendance,
}: {
  activeKey: KPIDrawerKey | null;
  onClose: () => void;
  brotherList: Brother[];
  partyList: PartyEvent[];
  payDues: (b: Brother) => void;
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
}) {
  const isOpen = activeKey !== null;
  const cfg = activeKey ? DRAWER_CONFIGS[activeKey] : null;

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
                <p className="text-[10px] text-slate-500 mt-0.5">Chapter avg</p>
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
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">All Brothers — Lowest First</p>
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
                <p className="text-[10px] text-slate-500 mt-0.5">Brothers owe</p>
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
                        <button onClick={() => payDues(b)} className="rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/25 hover:bg-emerald-500/25 transition-colors">Pay</button>
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
                <p className="text-[12px] text-emerald-400 font-medium">All brothers are paid up.</p>
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
                <p className="text-[10px] text-slate-500 mt-0.5">Chapter avg</p>
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
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">All Brothers — Lowest First</p>
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
                <p className="text-[12px] text-emerald-400 font-medium">All brothers meeting academic standards.</p>
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
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">All Brothers — Fewest Hours First</p>
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
                    <button onClick={() => addServiceHour(b)} className="opacity-0 group-hover:opacity-100 shrink-0 rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 hover:bg-indigo-500/15 hover:text-indigo-400 transition-all">+1h</button>
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
                <p className="text-[12px] text-emerald-400 font-medium">All brothers have met the service hours goal!</p>
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
              <ResponsiveContainer width="100%" height={110}>
                <AreaChart data={liveTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="drawerTGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818cf8" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "#475569" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v / 1000}k`} />
                  <Tooltip formatter={(v) => [fmt$(Number(v ?? 0)), "Balance"]} contentStyle={tooltipStyle} cursor={{ stroke: "#818cf8", strokeWidth: 1, strokeDasharray: "4 4" }} />
                  <Area type="monotone" dataKey="balance" stroke="#818cf8" strokeWidth={2} fill="url(#drawerTGrad)" dot={{ r: 3, fill: "#818cf8", stroke: "#131720", strokeWidth: 2 }} activeDot={{ r: 4, fill: "#818cf8", stroke: "#131720", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
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
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-[#131720] border-l border-white/[0.07] shadow-2xl transition-transform duration-300 ease-in-out sm:w-[400px] ${isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"}`}
      >
        {cfg && (
          <>
            <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.07] px-5">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.iconBg}`}>
                <SvgIcon d={KPI_ICONS[cfg.iconKey] ?? ""} className={`h-4 w-4 ${cfg.iconColor}`} />
              </div>
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

// ─── Widget Drawer ────────────────────────────────────────────────────────────

type WidgetDrawerKey = "health" | "attention" | "deadlines" | "instagram" | "activity" | "parties";

function WidgetDetailDrawer({
  activeKey, onClose,
  alerts, urgentCount,
  deadlineList, igTaskList, activityFeed, partyList,
  health,
  maxRevenue, bestEvent, totalDoorRev,
  onOpenModal,
  onCompleteDeadline, onDeleteDeadline, onEditDeadline,
  onCompleteIG, onDeleteIG, onEditIG,
}: {
  activeKey: WidgetDrawerKey | null;
  onClose: () => void;
  alerts: { message: string; level: "high" | "medium" | "low" }[];
  urgentCount: number;
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
  const isOpen = activeKey !== null;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const WIDGET_CONFIGS: Record<WidgetDrawerKey, { title: string; accent: string; bar: string }> = {
    health:     { title: "Chapter Health Score", accent: "text-white",      bar: "bg-indigo-500"    },
    attention:  { title: "Needs Attention",       accent: "text-red-400",    bar: "bg-red-500/70"    },
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
                  ? "Some areas need attention — address urgent deadlines and at-risk brothers."
                  : "Immediate action required — multiple metrics are critically low."
                }
              </p>
            </div>
          </>
        );
      }

      case "attention": {
        const high   = alerts.filter(a => a.level === "high");
        const medium = alerts.filter(a => a.level === "medium");
        const low    = alerts.filter(a => a.level === "low");
        const groups = [
          { label: "Critical", items: high,   left: "border-l-red-500",    bg: "bg-red-500/10",    badge: "bg-red-600 text-white"         },
          { label: "Warning",  items: medium, left: "border-l-amber-400",  bg: "bg-amber-500/10",  badge: "bg-amber-500/20 text-amber-400" },
          { label: "Low",      items: low,    left: "border-l-white/20",   bg: "bg-white/[0.03]",  badge: "bg-white/[0.08] text-slate-400" },
        ] as const;
        return (
          <>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {([["Critical", high.length, "text-red-400"], ["Warning", medium.length, "text-amber-400"], ["Low", low.length, "text-slate-400"]] as const).map(([label, count, color]) => (
                <div key={label} className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                  <p className={`text-[18px] font-bold tabular-nums ${color}`}>{count}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
            {alerts.length === 0 ? (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-6 text-center">
                <p className="text-[12px] text-emerald-400 font-medium">All clear — no issues detected</p>
              </div>
            ) : (
              groups.map(({ label, items, left, bg, badge }) => items.length > 0 && (
                <div key={label} className="mb-5">
                  <div className="mb-2 flex items-center gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${badge}`}>{items.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {items.map((alert, i) => (
                      <div key={i} className={`flex items-start rounded-md border-l-[2.5px] px-2.5 py-1.5 ${left} ${bg}`}>
                        <p className="text-[12px] leading-snug text-slate-300">{alert.message}</p>
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
                          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-[#131720] border-l border-white/[0.07] shadow-2xl transition-transform duration-300 ease-in-out sm:w-[400px] ${isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"}`}
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  // ── UI state ──────────────────────────────────────────────────────────────
  const [search,         setSearch]         = useState("");
  const [statusFilter,   setStatusFilter]   = useState("All");
  const [sortKey,        setSortKey]        = useState<keyof Brother | null>(null);
  const [sortDir,        setSortDir]        = useState<"asc" | "desc">("asc");
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [activeModal,    setActiveModal]    = useState<"deadline" | "revenue" | "ig" | "attendance" | "pick-event" | "edit-deadline" | "edit-ig" | null>(null);
  const [selectedEventForAttendance, setSelectedEventForAttendance] = useState<CalendarEvent | null>(null);
  const [calendarList,   setCalendarList]   = useState<CalendarEvent[]>([]);
  const [editingDeadlineId, setEditingDeadlineId] = useState<number | null>(null);
  const [editingIgId,       setEditingIgId]       = useState<number | null>(null);
  const [activeDrawer,   setActiveDrawer]   = useState<KPIDrawerKey | null>(null);
  const [widgetDrawer,   setWidgetDrawer]   = useState<WidgetDrawerKey | null>(null);
  const [editingAttId,      setEditingAttId]      = useState<number | null>(null);
  const [editAttVal,        setEditAttVal]        = useState("");
  const [selectedBrotherId, setSelectedBrotherId] = useState<number | null>(null);
  const [healthDelta,    setHealthDelta]    = useState<number | null>(null);
  const [activeSection,  setActiveSection]  = useState("Dashboard");
  const [confirmDelete, setConfirmDelete] = useState<{ kind: "deadline" | "ig"; id: number; label: string } | null>(null);
  const deltaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const attendanceReqRef = useRef<AbortController | null>(null);

  // ── Data state ─────────────────────────────────────────────────────────────
  const { brotherList, setBrotherList, deadlineList, setDeadlineList, igTaskList, setIgTaskList, partyList, setPartyList, activityFeed, setActivityFeed, treasuryData, isLoading, loadError, mutationError, setMutationError, refreshChapterData } = useChapter();

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
  const prevScoreRef = useRef<number | null>(null);
  const health = useMemo(() => calcHealthScore(brotherList, deadlineList), [brotherList, deadlineList]);

  useEffect(() => {
    if (prevScoreRef.current !== null && prevScoreRef.current !== health.score) {
      const delta = health.score - prevScoreRef.current;
      setHealthDelta(delta);
      if (deltaTimerRef.current) clearTimeout(deltaTimerRef.current);
      deltaTimerRef.current = setTimeout(() => setHealthDelta(null), 3000);
    }
    prevScoreRef.current = health.score;
  }, [health.score]);

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
    fetch("/api/calendar", { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: CalendarEvent[]) => setCalendarList(data))
      .catch(err => { if (err.name !== "AbortError") console.error("Failed to load calendar", err); });
    return () => controller.abort();
  }, []);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const avgAttendance   = useMemo(() => avg(brotherList.map(b => b.attendance)), [brotherList]);
  const outstandingDues = useMemo(() => brotherList.reduce((s, b) => s + b.duesOwed, 0), [brotherList]);
  const chapterGPA      = useMemo(() => avg(brotherList.map(b => b.gpa)), [brotherList]);
  const totalServiceHrs = useMemo(() => brotherList.reduce((s, b) => s + b.serviceHours, 0), [brotherList]);
  const totalDoorRev    = useMemo(() => partyList.reduce((s, e) => s + e.doorRevenue, 0), [partyList]);
  const onTrackSvc      = useMemo(() => brotherList.filter(b => b.serviceHours >= THRESHOLDS.serviceHoursGoal).length, [brotherList]);
  const maxRevenue      = useMemo(() => partyList.length ? Math.max(...partyList.map(e => e.doorRevenue)) : 0, [partyList]);
  const bestEvent       = useMemo(() => partyList.length ? partyList.reduce((a, b) => b.doorRevenue > a.doorRevenue ? b : a) : null, [partyList]);

  const statusCounts = useMemo(() => ({
    Good:      brotherList.filter(b => getBrotherStatus(b) === "Good").length,
    Watch:     brotherList.filter(b => getBrotherStatus(b) === "Watch").length,
    "At Risk": brotherList.filter(b => getBrotherStatus(b) === "At Risk").length,
  }), [brotherList]);

  // ── Filtered/sorted brothers ───────────────────────────────────────────────
  const filteredBrothers = useMemo((): Brother[] => {
    let result = brotherList.filter(b => {
      const q = search.toLowerCase();
      return (b.name.toLowerCase().includes(q) || b.role.toLowerCase().includes(q)) &&
             (statusFilter === "All" || getBrotherStatus(b) === statusFilter);
    });
    if (sortKey) {
      result = [...result].sort((a, b) => {
        const av = a[sortKey] as number, bv = b[sortKey] as number;
        return sortDir === "asc" ? av - bv : bv - av;
      });
    }
    return result;
  }, [brotherList, search, statusFilter, sortKey, sortDir]);

  function toggleSort(key: keyof Brother) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  // ── Alerts ─────────────────────────────────────────────────────────────────
  const alerts = useMemo(() => {
    const out: { message: string; level: "high" | "medium" | "low" }[] = [];
    brotherList.forEach(b => {
      if (getBrotherStatus(b) === "At Risk")
        out.push({ message: `${b.name} — ${b.attendance}% att, GPA ${b.gpa}`, level: "high" });
    });
    deadlineList.filter(d => d.status === "Urgent").forEach(d =>
      out.push({ message: `"${d.title}" due ${fmtDate(d.dueDate)}`, level: "high" })
    );
    igTaskList.filter(t => t.status === "Urgent").forEach(t =>
      out.push({ message: `IG: "${t.title}" due ${fmtDate(t.dueDate)}`, level: "high" })
    );
    brotherList.filter(b => b.duesOwed > 0).forEach(b =>
      out.push({ message: `${b.name} owes ${fmt$(b.duesOwed)}`, level: "medium" })
    );
    deadlineList.filter(d => d.status === "Due Soon").forEach(d =>
      out.push({ message: `"${d.title}" due ${fmtDate(d.dueDate)}`, level: "medium" })
    );
    brotherList
      .filter(b => b.serviceHours < THRESHOLDS.serviceHoursGoal && getBrotherStatus(b) !== "At Risk")
      .forEach(b => out.push({ message: `${b.name} — ${b.serviceHours}h / ${THRESHOLDS.serviceHoursGoal}h service`, level: "low" }));
    return out;
  }, [brotherList, deadlineList, igTaskList]);

  const urgentCount = alerts.filter(a => a.level === "high").length;

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
      fetch("/api/calendar")
        .then(r => r.ok ? r.json() : Promise.reject())
        .then((data: CalendarEvent[]) => setCalendarList(data))
        .catch(() => undefined);
      setActiveModal("pick-event");
    }
  }

  function closeModal() { setActiveModal(null); }

  function payDues(b: Brother) {
    setBrotherList(prev => prev.map(x => x.id === b.id ? { ...x, duesOwed: 0 } : x));
    addActivity(`${b.name} marked dues paid`, "success");
    persistMutation(
      requestJson<Brother>(`/api/brothers/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duesOwed: 0 }),
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
    <div className="flex h-screen overflow-hidden bg-[#0d1117]">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeSection={activeSection}
        onNavClick={scrollToSection}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* ── Toolbar ─────────────────────────────────────────────────────── */}
        <header className="toolbar-frosted relative z-10 flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.05] px-3 sm:gap-3 sm:px-5">
          <button onClick={() => setSidebarOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.07] lg:hidden">
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight text-white">Operations Dashboard</p>
            <p className="hidden text-[11px] leading-tight text-slate-400 sm:block">Lambda Phi Epsilon · ChaptOS</p>
          </div>

          {/* Quick Actions */}
          <div className="hidden items-center gap-1.5 lg:flex">
            {([
              ["deadline",   "+ Deadline"],
            ] as const).map(([key, label]) => (
              <button key={key} onClick={() => setActiveModal(key)}
                className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-150 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-200">
                {label}
              </button>
            ))}
            <button onClick={() => openAttendanceLog()}
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-150 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-200">
              Log Att.
            </button>
          </div>

          {/* Mobile: single add button */}
          <button className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 lg:hidden" onClick={() => setActiveModal("deadline")}>
            <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>

          <p className="hidden text-[11px] text-slate-500 xl:block shrink-0">{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>

          <div className="relative hidden sm:block">
            <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input type="text" placeholder="Search brothers…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-36 rounded-lg border border-white/[0.08] bg-white/[0.03] py-1.5 pl-8 pr-3 text-[13px] text-white placeholder:text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors focus:border-indigo-500/60 focus:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-indigo-500/15 sm:w-44" />
          </div>

          <button onClick={() => window.print()} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-150 hover:border-white/[0.16] hover:bg-white/[0.06] focus:outline-none">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-slate-400">
              <path fillRule="evenodd" d="M11.5 4.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0ZM4.25 8.5a3.25 3.25 0 0 0-3.25 3.25v.5A1.75 1.75 0 0 0 2.75 14h10.5A1.75 1.75 0 0 0 15 12.25v-.5A3.25 3.25 0 0 0 11.75 8.5h-7.5Z" clipRule="evenodd" />
            </svg>
            <span className="hidden sm:inline">Export</span>
          </button>
          <UserAvatar />
        </header>

        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <main ref={mainRef} className="page-ambient flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 sm:px-6">
            {(isLoading || loadError || mutationError) && (
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
            )}

            {/* ── Health Score ────────────────────────────────────────────── */}
            <section id="sec-dashboard" aria-label="Dashboard overview">
              <HealthScoreWidget score={health.score} label={health.label} breakdown={health.breakdown} delta={healthDelta} onExpand={() => setWidgetDrawer("health")} />
            </section>

            {/* ── KPI Cards ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <KPICard label="Avg Attendance" value={`${avgAttendance.toFixed(1)}%`}
                trend={`${brotherList.filter(b => b.attendance < THRESHOLDS.attendanceWatch).length} below threshold`}
                iconKey="attendance" sparkData={KPI_SPARKLINES.attendance}
                iconBg="bg-blue-500/10" iconColor="text-blue-400" strokeColor="#60a5fa" glowColor="#60a5fa"
                onClick={() => setActiveDrawer("attendance")} />
              <KPICard label="Dues" value={fmt$(outstandingDues)}
                trend={`${brotherList.filter(b => b.duesOwed > 0).length} brothers owe`}
                iconKey="dues" sparkData={KPI_SPARKLINES.dues}
                accent={outstandingDues > 0 ? "text-amber-400" : "text-white"}
                iconBg="bg-amber-500/10" iconColor="text-amber-400" strokeColor="#fbbf24" glowColor="#fbbf24"
                onClick={() => setActiveDrawer("dues")} />
              <KPICard label="Chapter GPA" value={chapterGPA.toFixed(2)}
                trend={`${brotherList.filter(b => b.gpa < THRESHOLDS.gpaWatch).length} below 3.0`}
                iconKey="gpa" sparkData={KPI_SPARKLINES.gpa}
                iconBg="bg-violet-500/10" iconColor="text-violet-400" strokeColor="#a78bfa" glowColor="#a78bfa"
                onClick={() => setActiveDrawer("gpa")} />
              <KPICard label="Service Hours" value={`${totalServiceHrs}h`}
                trend={`${onTrackSvc} of ${brotherList.length} on track`}
                iconKey="service" sparkData={KPI_SPARKLINES.service}
                iconBg="bg-emerald-500/10" iconColor="text-emerald-400" strokeColor="#34d399" glowColor="#34d399"
                onClick={() => setActiveDrawer("service")} />
              <KPICard label="Treasury" value={fmt$(liveBalance)}
                trend={`projected ${fmt$(liveProjected)}`}
                iconKey="treasury" sparkData={KPI_SPARKLINES.treasury}
                iconBg="bg-indigo-500/10" iconColor="text-indigo-400" strokeColor="#818cf8" glowColor="#818cf8"
                onClick={() => setActiveDrawer("treasury")} />
              <KPICard label="Door Revenue" value={fmt$(totalDoorRev)}
                trend={bestEvent ? `best ${fmt$(bestEvent.doorRevenue)}` : "—"}
                iconKey="door" sparkData={KPI_SPARKLINES.door}
                iconBg="bg-pink-500/10" iconColor="text-pink-400" strokeColor="#f472b6" glowColor="#f472b6"
                onClick={() => setActiveDrawer("door")} />
            </div>

            {/* ── Charts ─────────────────────────────────────────────────── */}
            <div id="sec-treasury" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ChartWidget title="Treasury Trend" stat={fmt$(liveBalance)} caption="Jan – May 2026" accentColor="#818cf8">
                <ResponsiveContainer width="100%" height={96}>
                  <AreaChart data={liveTrend} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                    <defs>
                      <linearGradient id="tGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#818cf8" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#818cf8" stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v / 1000}k`} />
                    <Tooltip formatter={(v) => [fmt$(Number(v ?? 0)), "Balance"]} contentStyle={tooltipStyle} cursor={{ stroke: "#818cf8", strokeWidth: 1, strokeDasharray: "4 4" }} />
                    <Area type="monotone" dataKey="balance" stroke="#818cf8" strokeWidth={2} fill="url(#tGrad)" dot={false} activeDot={{ r: 4, fill: "#818cf8", stroke: "#141925", strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartWidget>

              <ChartWidget title="Door Revenue" stat={fmt$(totalDoorRev)} caption={`${partyList.length} events`} accentColor="#f472b6">
                <ResponsiveContainer width="100%" height={96}>
                  <BarChart data={partyChartData} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#475569" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v}`} />
                    <Tooltip formatter={(v) => [fmt$(Number(v ?? 0)), "Revenue"]} contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                    <Bar dataKey="revenue" fill="#818cf8" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartWidget>

              <ChartWidget title="Status Mix" stat={`${statusCounts.Good} / ${brotherList.length} Good`} caption={`${brotherList.length} brothers`} accentColor="#34d399">
                <ResponsiveContainer width="100%" height={96}>
                  <BarChart data={statusChartData} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip formatter={(v) => [v, "Brothers"]} contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {statusChartData.map((entry, idx) => <Cell key={`sc-${idx}`} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartWidget>

              <ChartWidget title="Service Hours" stat={`${onTrackSvc} / ${brotherList.length} on track`} caption={`Goal: ${THRESHOLDS.serviceHoursGoal}h`} accentColor="#34d399">
                <ResponsiveContainer width="100%" height={96}>
                  <BarChart data={svcChartData} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#475569" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v) => [`${v}h`, "Service"]} contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                    <Bar dataKey="hours" fill="#34d399" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartWidget>
            </div>

            {/* ── Main grid: table + right panel ─────────────────────────── */}
            <div id="sec-brothers" className="grid grid-cols-1 gap-4 xl:grid-cols-3">

              {/* Brother Tracking Table */}
              <Card style={{ background: "linear-gradient(to bottom, #ffffff08 0%, #141925 45%)" }} className="overflow-hidden xl:col-span-2">
                <div className="border-b border-white/[0.07] px-5 py-3.5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-[14px] font-semibold text-white">Brother Tracking</h2>
                      <p className="text-[11px] text-slate-500">Click a row to view profile · Edit att. inline · Pay dues · +1h</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(["All", "Good", "Watch", "At Risk"] as const).map(f => (
                        <button key={f} onClick={() => setStatusFilter(f)}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all duration-150 ${statusFilter === f ? "bg-white/[0.12] text-white" : "border border-white/[0.1] text-slate-400 hover:border-white/[0.2] hover:text-slate-200"}`}>
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                        <th className="py-2.5 pl-5 pr-3 text-left text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-500">Brother</th>
                        <th className="hidden px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-500 sm:table-cell">Role</th>
                        {([["attendance","Att."],["duesOwed","Dues"],["gpa","GPA"],["serviceHours","Svc"]] as [keyof Brother, string][]).map(([k, label]) => (
                          <SortTh key={k} label={label} colKey={k} active={sortKey === k} dir={sortDir} onClick={() => toggleSort(k)} />
                        ))}
                        <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-500">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {filteredBrothers.length === 0 ? (
                        <tr><td colSpan={7} className="py-10 text-center text-sm text-slate-500">No brothers match your filters.</td></tr>
                      ) : filteredBrothers.map(b => {
                        const status = getBrotherStatus(b);
                        return (
                          <tr key={b.id} onClick={() => setSelectedBrotherId(b.id)} className="cursor-pointer transition-colors hover:bg-white/[0.03] active:bg-white/[0.06]">
                            <td className={`border-l-2 py-3 pl-4 pr-3 ${BROTHER_STYLES[status].row}`}>
                              <p className="text-[13px] font-semibold text-white">{b.name}</p>
                            </td>
                            <td className="hidden max-w-[160px] px-3 py-3 sm:table-cell">
                              <p className="truncate text-[12px] text-slate-400">{b.role}</p>
                            </td>
                            {/* Attendance — read-only ratio */}
                            <td className="px-3 py-3">
                              <AttBar pct={b.attendance} />
                            </td>
                            {/* Dues — Pay button */}
                            <td className="px-3 py-3">
                              {b.duesOwed > 0 ? (
                                <div className="flex items-center gap-2">
                                  <span className="tabular-nums text-[13px] font-medium text-amber-400">{fmt$(b.duesOwed)}</span>
                                  <button onClick={e => { e.stopPropagation(); payDues(b); }} className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/25 hover:bg-emerald-500/25 transition-colors">Pay</button>
                                </div>
                              ) : (
                                <span className="tabular-nums text-[13px] font-medium text-slate-600">—</span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <span className={`tabular-nums text-[13px] font-semibold ${b.gpa < THRESHOLDS.gpaAtRisk ? "text-red-400" : b.gpa < THRESHOLDS.gpaWatch ? "text-amber-400" : "text-white"}`}>
                                {b.gpa.toFixed(1)}
                              </span>
                            </td>
                            {/* Service hours — +1h button */}
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                <span className={`tabular-nums text-[13px] font-medium ${b.serviceHours < THRESHOLDS.serviceHoursGoal ? "text-amber-400" : "text-white"}`}>
                                  {b.serviceHours}h
                                </span>
                                <button onClick={e => { e.stopPropagation(); addServiceHour(b); }} className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 ring-1 ring-inset ring-white/[0.1] hover:bg-indigo-500/15 hover:text-indigo-400 hover:ring-indigo-500/25 transition-colors">
                                  +1h
                                </button>
                              </div>
                            </td>
                            <td className="px-3 py-3"><StatusBadge status={status} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-white/[0.06] bg-white/[0.02] px-5 py-2.5">
                  <p className="text-[11px] text-slate-500">
                    {filteredBrothers.length} / {brotherList.length} brothers ·{" "}
                    <span className="font-medium text-emerald-400">{statusCounts.Good} good</span> ·{" "}
                    <span className="font-medium text-amber-400">{statusCounts.Watch} watch</span> ·{" "}
                    <span className="font-medium text-red-400">{statusCounts["At Risk"]} at risk</span>
                  </p>
                </div>
              </Card>

              {/* Right panel */}
              <div className="space-y-4 self-start sticky top-5 max-h-[calc(100vh-6rem)] overflow-y-auto">
                {/* Needs Attention */}
                <Card style={{ background: "linear-gradient(to bottom, #ef444410 0%, #141925 50%)" }} className="overflow-hidden cursor-pointer hover:border-white/[0.14] transition-colors" onClick={() => setWidgetDrawer("attention")}>
                  <div className="h-[3px] bg-red-500/70" />
                  <div className="px-4 py-3">
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-[13px] font-semibold text-white">Needs Attention</h2>
                      <div className="flex items-center gap-2">
                        {urgentCount > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">{urgentCount} critical</span>}
                        <button onClick={() => setWidgetDrawer("attention")} className="flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-slate-400 hover:bg-red-500/15 hover:text-red-400 transition-colors">
                          All
                          <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        </button>
                      </div>
                    </div>
                    {alerts.length === 0 ? (
                      <p className="py-4 text-center text-[12px] text-slate-500">All clear — no issues detected</p>
                    ) : (
                      <div className="space-y-1.5">
                        {alerts.slice(0, 8).map((alert, i) => {
                          const left = alert.level === "high" ? "border-l-red-500" : alert.level === "medium" ? "border-l-amber-400" : "border-l-white/20";
                          const bg   = alert.level === "high" ? "bg-red-500/10"    : alert.level === "medium" ? "bg-amber-500/10"    : "bg-white/[0.03]";
                          return (
                            <div key={i} className={`flex items-start rounded-md border-l-[2.5px] px-2.5 py-1.5 ${left} ${bg}`}>
                              <p className="text-[12px] leading-snug text-slate-300">{alert.message}</p>
                            </div>
                          );
                        })}
                        {alerts.length > 8 && <p className="pt-1 text-center text-[11px] text-slate-500">+{alerts.length - 8} more</p>}
                      </div>
                    )}
                  </div>
                </Card>

                {/* Deadlines */}
                <Card id="sec-deadlines" style={{ background: "linear-gradient(to bottom, #818cf810 0%, #141925 50%)" }} className="overflow-hidden cursor-pointer hover:border-white/[0.14] transition-colors" onClick={() => setWidgetDrawer("deadlines")}>
                  <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                    <h2 className="text-[13px] font-semibold text-white">Deadlines</h2>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">{deadlineList.length} tasks</span>
                      <button onClick={() => setWidgetDrawer("deadlines")} className="flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-slate-400 hover:bg-indigo-500/15 hover:text-indigo-300 transition-colors">
                        All
                        <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setActiveModal("deadline"); }} className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-400 hover:bg-indigo-500/25 transition-colors">+ Add</button>
                    </div>
                  </div>
                  <div className="divide-y divide-white/[0.05]">
                    {deadlineList.length === 0 ? (
                      <p className="px-4 py-6 text-center text-[12px] text-slate-500">No deadlines — click + Add to create one</p>
                    ) : deadlineList.map(d => (
                      <div key={d.id} onClick={e => e.stopPropagation()} className="group flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-white/[0.03]">
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-[12px] font-medium ${d.status === "Complete" ? "line-through text-slate-500" : "text-white"}`}>{d.title}</p>
                          <p className="text-[11px] text-slate-500">{fmtDate(d.dueDate)} · {d.owner.split(" ")[0]}</p>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          {d.status !== "Complete" && (
                            <button onClick={() => completeDeadline(d.id)} title="Mark complete" className="flex h-6 w-6 items-center justify-center rounded hover:bg-emerald-500/20 text-slate-600 hover:text-emerald-400 transition-colors">
                              <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            </button>
                          )}
                          <button onClick={() => openEditDeadline(d.id)} title="Edit" className="flex h-6 w-6 items-center justify-center rounded hover:bg-indigo-500/20 text-slate-600 hover:text-indigo-400 transition-colors">
                            <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                          <button onClick={() => deleteDeadline(d.id)} title="Delete" className="flex h-6 w-6 items-center justify-center rounded hover:bg-red-500/20 text-slate-600 hover:text-red-400 transition-colors">
                            <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                        <TaskBadge status={d.status} />
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Instagram */}
                <Card id="sec-instagram" style={{ background: "linear-gradient(to bottom, #f472b610 0%, #141925 50%)" }} className="overflow-hidden cursor-pointer hover:border-white/[0.14] transition-colors" onClick={() => setWidgetDrawer("instagram")}>
                  <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                    <h2 className="text-[13px] font-semibold text-white">Instagram</h2>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">{igTaskList.length} posts</span>
                      <button onClick={() => setWidgetDrawer("instagram")} className="flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-slate-400 hover:bg-pink-500/15 hover:text-pink-400 transition-colors">
                        All
                        <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setActiveModal("ig"); }} className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-400 hover:bg-indigo-500/25 transition-colors">+ Add</button>
                    </div>
                  </div>
                  <div className="divide-y divide-white/[0.05]">
                    {igTaskList.length === 0 ? (
                      <p className="px-4 py-6 text-center text-[12px] text-slate-500">No IG tasks scheduled</p>
                    ) : igTaskList.map(t => (
                      <div key={t.id} onClick={e => e.stopPropagation()} className="group flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-white/[0.03]">
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-[12px] font-medium ${t.status === "Complete" ? "line-through text-slate-500" : "text-white"}`}>{t.title}</p>
                          <p className="text-[11px] text-slate-500">{fmtDate(t.dueDate)} · {t.type}</p>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          {t.status !== "Complete" && (
                            <button onClick={() => completeIG(t.id)} title="Mark complete" className="flex h-6 w-6 items-center justify-center rounded hover:bg-emerald-500/20 text-slate-600 hover:text-emerald-400 transition-colors">
                              <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            </button>
                          )}
                          <button onClick={() => openEditIG(t.id)} title="Edit" className="flex h-6 w-6 items-center justify-center rounded hover:bg-indigo-500/20 text-slate-600 hover:text-indigo-400 transition-colors">
                            <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                          <button onClick={() => deleteIG(t.id)} title="Delete" className="flex h-6 w-6 items-center justify-center rounded hover:bg-red-500/20 text-slate-600 hover:text-red-400 transition-colors">
                            <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                        <TaskBadge status={t.status} />
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>

            {/* ── Bottom row: Activity Feed + Party Events ────────────────── */}
            <div id="sec-parties" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ActivityFeed entries={activityFeed} onExpand={() => setWidgetDrawer("activity")} />

              <Card style={{ background: "linear-gradient(to bottom, #818cf810 0%, #141925 50%)" }} className="overflow-hidden cursor-pointer hover:border-white/[0.14] transition-colors" onClick={() => setWidgetDrawer("parties")}>
                <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3.5">
                  <div>
                    <h2 className="text-[13px] font-semibold text-white">Party Events</h2>
                    <p className="text-[11px] text-slate-500">Door revenue by event</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-[16px] font-bold text-white">{fmt$(totalDoorRev)}</p>
                    <button onClick={() => setWidgetDrawer("parties")} className="flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-slate-400 hover:bg-indigo-500/15 hover:text-indigo-300 transition-colors">
                      All
                      <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </button>
                    <button onClick={() => setActiveModal("revenue")} className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-400 hover:bg-indigo-500/25 transition-colors">+ Add</button>
                  </div>
                </div>
                <div className="space-y-3 px-5 py-4">
                  {partyList.length === 0 ? (
                    <p className="py-4 text-center text-[12px] text-slate-500">No events logged — click + Add to log revenue</p>
                  ) : partyList.map(e => {
                    const barPct = Math.round((e.doorRevenue / maxRevenue) * 100);
                    const isTop  = bestEvent ? e.id === bestEvent.id : false;
                    return (
                      <div key={e.id} className="flex items-center gap-3">
                        <div className="w-24 shrink-0">
                          <p className={`truncate text-[12px] font-medium ${isTop ? "text-indigo-400" : "text-slate-300"}`}>{e.name}</p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                            <div className={`h-full rounded-full transition-all duration-500 ${isTop ? "bg-indigo-400" : "bg-white/[0.18]"}`} style={{ width: `${barPct}%` }} />
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="hidden text-[10px] text-slate-500 sm:block">{e.attendance}</span>
                          <span className="w-12 tabular-nums text-right text-[12px] font-semibold text-white">{fmt$(e.doorRevenue)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>

            {/* ── Footer ─────────────────────────────────────────────────── */}
            <div className="border-t border-white/[0.06] pt-4 text-center">
              <p className="text-[10px] text-slate-700">Lambda Phi Epsilon · ChaptOS · Prototype backed by seeded chapter data</p>
            </div>

          </div>
        </main>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
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

      {/* ── Widget Detail Drawer ────────────────────────────────────────────── */}
      <WidgetDetailDrawer
        activeKey={widgetDrawer}
        onClose={() => setWidgetDrawer(null)}
        alerts={alerts}
        urgentCount={urgentCount}
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
        onPayDues={payDues}
        onAddServiceHours={addServiceHour}
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
        payDues={payDues}
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
      />
    </div>
  );
}
