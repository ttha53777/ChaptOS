"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";

const DrawerTrendChart = dynamic(() => import("../components/dashboard/DrawerTrendChart"), {
  ssr: false,
  loading: () => <div className="h-[110px] w-full rounded-lg bg-white/[0.04] animate-pulse" />,
});
import {
  Brother, CalendarEvent, TaskStatus, InstagramType, ActivityEntry, PartyEvent, Deadline, InstagramTask, Transaction,
  treasuryTrend, TREASURY_BALANCE, TREASURY_PROJECTED,
  KPI_SPARKLINES,
  getBrotherStatus, calcHealthScore, deriveNeedsAttention, avg, fmt$, fmtDate, fmtRange, isoWeekBounds,
} from "../data";
import { useThresholds } from "../hooks/useThresholds";
import { useVocab } from "../hooks/useVocab";
import { useFeature } from "../hooks/useFeature";
import { WORKFLOW_FEATURES, type DisabledFeatures } from "@/lib/workflow-features";
import { Sidebar, SvgIcon, NAV_ICONS, isNavVisible } from "../components/Sidebar";
import { BrotherAvatar } from "../components/BrotherAvatar";
import { useChapter } from "../context/ChapterContext";
import { useToast } from "../components/dashboard/Toast";
import { AddDeadlineForm, AddIGTaskForm, AddRevenueForm, LogAttendanceForm, ExcuseForm } from "../components/dashboard/forms";
import type { QuickActionKey } from "../components/dashboard/QuickActionsMenu";
import { TxForm } from "../components/treasury/TxForm";
import { CalendarEventForm, type CalendarDraft } from "../components/timeline/CalendarEventForm";
import { BrotherDrawer } from "../components/dashboard/drawers/BrotherDrawer";
import { Card, Modal, ConfirmDialog, FieldLabel } from "../components/dashboard/primitives";
import { KPI_ICONS, SECTION_IDS, inputDuskCls, btnDuskGhostCls, btnDuskActionCls } from "../components/dashboard/styles";
import { type Announcement } from "../components/dashboard/AnnouncementCard";
import { AnnouncementEditor } from "../components/dashboard/AnnouncementEditor";
import { MobileDashboard } from "../components/dashboard/mobile/MobileDashboard";
import "../components/dashboard/dashboard-ledger.css";
import "../components/dashboard/drawer-ledger.css";
import { BriefingHeader } from "../components/dashboard/ledger/BriefingHeader";
import { BriefingActions } from "../components/dashboard/ledger/BriefingActions";
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

// Minimal service-event shape for the Brother-drawer "Log service hours" picker.
// Mirrors the fields the service page selects from /api/service-events.
type DashServiceEvent = { id: number; title: string; date: string };

// ─── KPI Drawer ───────────────────────────────────────────────────────────────

type KPIDrawerKey = "attendance" | "dues" | "gpa" | "service" | "treasury" | "door";

// `tone` selects the warm dusk accent (info/gold/vio/ok) used for the header icon
// tile and headline stat — mirroring the dashboard's category palette.
const DRAWER_CONFIGS: Record<KPIDrawerKey, { title: string; tone: string; iconKey: string }> = {
  attendance: { title: "Avg Attendance",   tone: "info", iconKey: "attendance" },
  dues:       { title: "Dues",             tone: "gold", iconKey: "dues"       },
  gpa:        { title: "Chapter GPA",      tone: "vio",  iconKey: "gpa"        },
  service:    { title: "Service Hours",    tone: "ok",   iconKey: "service"    },
  treasury:   { title: "Treasury Balance", tone: "vio",  iconKey: "treasury"   },
  door:       { title: "Door Revenue",     tone: "rose", iconKey: "door"       },
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
            <div className="dd-stats c3">
              <div className="dd-stat"><p className="n info">{avgAttendance.toFixed(1)}%</p><p className="l">{v("Meetings")} avg</p></div>
              <div className="dd-stat"><p className="n gold">{belowWatch.length}</p><p className="l">Below 80%</p></div>
              <div className="dd-stat"><p className="n rose">{atRisk.length}</p><p className="l">At risk</p></div>
            </div>
            <div>
              <p className="dd-label">All {v("Member", true)} — Lowest First</p>
              <div className="dd-rows">
                {sorted.map(b => {
                  const tone = b.attendance >= THRESHOLDS.attendanceWatch ? "" : b.attendance >= THRESHOLDS.attendanceAtRisk ? "gold" : "rose";
                  return (
                    <div key={b.id} className="dd-bar-row">
                      <span className="nm">{b.name.split(" ")[0]}</span>
                      <div className="dd-track"><i className={tone} style={{ width: `${b.attendance}%` }} /></div>
                      <span className={`val ${tone}`}>{b.attendance}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="dd-note">
              {atRisk.length > 0
                ? <><b>{atRisk.length} brother{atRisk.length > 1 ? "s" : ""} need{atRisk.length === 1 ? "s" : ""} immediate follow-up.</b>{" "}Attendance goal is 80%+.</>
                : "No brothers are at attendance risk. Chapter goal is 80%+."
              }
            </div>
            <button onClick={() => { onOpenAttendance(); onClose(); }} className="dd-btn-primary">
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
            <div className="dd-stats c3">
              <div className="dd-stat"><p className="n gold">{fmt$(outstandingDues)}</p><p className="l">Total owed</p></div>
              <div className="dd-stat"><p className="n rose">{oweList.length}</p><p className="l">{v("Member", true)} owe</p></div>
              <div className="dd-stat"><p className="n ok">{paidList.length}</p><p className="l">Paid up</p></div>
            </div>
            {oweList.length > 0 && (
              <div>
                <p className="dd-label">Outstanding Balances</p>
                <div className="dd-feed">
                  {oweList.map(b => (
                    <div key={b.id} className="dd-item gold">
                      <div className="who">
                        <p className="t">{b.name}</p>
                        <p className="s">{b.role.split(" · ")[0]}</p>
                      </div>
                      <div className="amt">
                        <span className="m">{fmt$(b.duesOwed)}</span>
                        {isAdmin && (
                          <button onClick={() => openPayDues(b)} className="dd-row-act ok">Pay</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {paidList.length > 0 && (
              <div>
                <p className="dd-label">Paid Up <span className="ct">({paidList.length})</span></p>
                <div className="dd-rows">
                  {paidList.map(b => (
                    <div key={b.id} className="dd-line">
                      <p className="nm">{b.name}</p>
                      <span className="ok">✓ Clear</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {outstandingDues === 0 && (
              <div className="dd-note ok center">All {v("Member", true).toLowerCase()} are paid up.</div>
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
            <div className="dd-stats c3">
              <div className="dd-stat"><p className="n vio">{chapterGPA.toFixed(2)}</p><p className="l">{v("Meetings")} avg</p></div>
              <div className="dd-stat"><p className="n gold">{belowWatch.length}</p><p className="l">Below 3.0</p></div>
              <div className="dd-stat"><p className="n rose">{atRisk.length}</p><p className="l">At risk</p></div>
            </div>
            <div>
              <p className="dd-label">All {v("Member", true)} — Lowest First</p>
              <div className="dd-rows">
                {sorted.map(b => {
                  const tone = b.gpa < THRESHOLDS.gpaAtRisk ? "rose" : b.gpa < THRESHOLDS.gpaWatch ? "gold" : "";
                  const barPct = Math.round(Math.max(5, ((b.gpa - 2.0) / 2.0) * 100));
                  return (
                    <div key={b.id} className="dd-bar-row">
                      <span className="nm">{b.name.split(" ")[0]}</span>
                      <div className="dd-track"><i className={tone} style={{ width: `${barPct}%` }} /></div>
                      <span className={`val ${tone}`}>{b.gpa.toFixed(1)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {atRisk.length > 0 ? (
              <div className="dd-note rose">
                <b>{atRisk.length} brother{atRisk.length > 1 ? "s" : ""} below 2.7 GPA</b> — consider academic check-in or intervention.
              </div>
            ) : belowWatch.length > 0 ? (
              <div className="dd-note gold">
                <b>{belowWatch.length} brother{belowWatch.length > 1 ? "s" : ""} below 3.0</b> — monitor and encourage academic support.
              </div>
            ) : (
              <div className="dd-note ok center">All {v("Member", true).toLowerCase()} meeting academic standards.</div>
            )}
          </>
        );
      }

      case "service": {
        const sorted = [...brotherList].sort((a, b) => a.serviceHours - b.serviceHours);
        const belowGoal = brotherList.filter(b => b.serviceHours < THRESHOLDS.serviceHoursGoal);
        return (
          <>
            <div className="dd-stats c3">
              <div className="dd-stat"><p className="n ok">{totalServiceHrs}h</p><p className="l">Total hours</p></div>
              <div className="dd-stat"><p className="n">{onTrackSvc}</p><p className="l">On track</p></div>
              <div className="dd-stat"><p className="n gold">{belowGoal.length}</p><p className="l">Below goal</p></div>
            </div>
            <div>
              <p className="dd-label">All {v("Member", true)} — Fewest Hours First</p>
              <div className="dd-rows">
                {sorted.map(b => {
                  const isOnTrack = b.serviceHours >= THRESHOLDS.serviceHoursGoal;
                  const barPct = Math.min(100, Math.round((b.serviceHours / THRESHOLDS.serviceHoursGoal) * 100));
                  const tone = isOnTrack ? "ok" : "gold";
                  const remaining = Math.max(0, THRESHOLDS.serviceHoursGoal - b.serviceHours);
                  return (
                    <div key={b.id} className="dd-bar-row act group">
                      <span className="nm">{b.name.split(" ")[0]}</span>
                      <div className="dd-track"><i className={tone} style={{ width: `${barPct}%` }} /></div>
                      <span className={`val ${tone}`}>{b.serviceHours}h</span>
                      <span className={`hint ${isOnTrack ? "ok" : ""}`}>{isOnTrack ? "✓" : `-${remaining}h`}</span>
                      <button onClick={() => addServiceHour(b)} className="dd-row-act">+1h</button>
                    </div>
                  );
                })}
              </div>
            </div>
            {belowGoal.length > 0 ? (
              <div className="dd-note gold">
                <b>{belowGoal.length} brother{belowGoal.length > 1 ? "s" : ""} still need{belowGoal.length === 1 ? "s" : ""} service hours</b> before the semester ends. Goal: {THRESHOLDS.serviceHoursGoal}h each.
              </div>
            ) : (
              <div className="dd-note ok center">All {v("Member", true).toLowerCase()} have met the service hours goal!</div>
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
            <div className="dd-stats c2">
              <div className="dd-stat"><p className="n vio">{fmt$(liveBalance)}</p><p className="l">Current balance</p></div>
              <div className="dd-stat"><p className="n ok">{fmt$(liveProjected)}</p><p className="l">Projected end</p></div>
            </div>
            <div>
              <p className="dd-label">Treasury Trend</p>
              <DrawerTrendChart data={liveTrend} />
            </div>
            <div>
              <p className="dd-label">Monthly Breakdown</p>
              <div className="dd-rows">
                {liveTrend.map((t, i) => {
                  const prev = i > 0 ? liveTrend[i - 1].balance : t.balance;
                  const delta = t.balance - prev;
                  return (
                    <div key={t.month} className="dd-bar-row">
                      <span className="nm" style={{ width: 32 }}>{t.month}</span>
                      <div className="dd-track"><i style={{ width: `${Math.round((t.balance / liveProjected) * 100)}%` }} /></div>
                      <span className="val" style={{ width: 56 }}>{fmt$(t.balance)}</span>
                      {i > 0 && (
                        <span className={`hint ${delta >= 0 ? "ok" : "rose"}`} style={{ width: 52 }}>
                          {delta >= 0 ? "+" : ""}{fmt$(delta)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="dd-note">
              Treasury grew by <b>{fmt$(growth)} ({growthPct}%)</b> this semester. Projected end balance: <b>{fmt$(liveProjected)}</b>.
            </div>
          </>
        );
      }

      case "door": {
        const sortedEvents = [...partyList].sort((a, b) => b.doorRevenue - a.doorRevenue);
        const avgRevenue = partyList.length > 0 ? Math.round(totalDoorRev / partyList.length) : 0;
        return (
          <>
            <div className="dd-stats c3">
              <div className="dd-stat"><p className="n rose">{fmt$(totalDoorRev)}</p><p className="l">Total revenue</p></div>
              <div className="dd-stat"><p className="n">{partyList.length}</p><p className="l">Events</p></div>
              <div className="dd-stat"><p className="n">{fmt$(avgRevenue)}</p><p className="l">Avg/event</p></div>
            </div>
            <div>
              <p className="dd-label">Revenue by Event — Best First</p>
              <div className="dd-feed">
                {sortedEvents.map(e => {
                  const barPct = maxRevenue > 0 ? Math.round((e.doorRevenue / maxRevenue) * 100) : 0;
                  const isTop = bestEvent ? e.id === bestEvent.id : false;
                  return (
                    <div key={e.id} className={`dd-event ${isTop ? "top" : ""}`}>
                      <div className="eh">
                        <p className="t">{isTop && <span className="best">Best</span>}{e.name}</p>
                        <span className="m">{fmt$(e.doorRevenue)}</span>
                      </div>
                      <div className="dd-track"><i className={isTop ? "" : "muted"} style={{ width: `${barPct}%` }} /></div>
                      <div className="meta">
                        <span>{e.date}</span>
                        <span>{e.attendance} attendees</span>
                        {e.notes && <span className="note">{e.notes}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="dd-note rose">
              {bestEvent ? <>Best event: <b>{bestEvent.name}</b> at <b>{fmt$(bestEvent.doorRevenue)}</b>. Avg per event: <b>{fmt$(avgRevenue)}</b>.</> : "No events logged yet."}
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
      <div className={`dash-drawer-backdrop ${isOpen ? "" : "closed"}`} onClick={onClose} />
      <div className={`dash-drawer ${isOpen ? "" : "closed"}`}>
        {cfg && (
          <>
            <div className="dd-head">
              <div className={`dd-icon ${cfg.tone}`}>
                <SvgIcon d={KPI_ICONS[cfg.iconKey] ?? ""} />
              </div>
              <h2 className="dd-title">{drawerTitle}</h2>
              <button onClick={onClose} className="dd-x" aria-label="Close">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="dd-body">
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
  igTaskList: { id: number; title: string; dueDate: string; status: TaskStatus; type: InstagramType }[];
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

  // `tone` drives the top accent hairline + header — warm dusk accents only.
  const WIDGET_CONFIGS: Record<WidgetDrawerKey, { title: string; tone: string }> = {
    health:     { title: `${v("Meetings")} Health Score`, tone: ""     },
    digest:     { title: "Weekly Digest",          tone: ""     },
    deadlines:  { title: "Deadlines",             tone: ""     },
    instagram:  { title: "Instagram",             tone: "rose" },
    activity:   { title: "Activity Feed",         tone: "ok"   },
    parties:    { title: "Party Events",          tone: ""     },
  };

  const cfg = activeKey ? WIDGET_CONFIGS[activeKey] : null;

  const dot: Record<ActivityEntry["type"], string> = {
    success: "ok",
    warning: "gold",
    info:    "info",
  };

  function renderContent() {
    if (!activeKey) return null;

    switch (activeKey) {
      case "health": {
        const scoreTone = health.score >= 80 ? "" : health.score >= 60 ? "watch" : "risk";
        const noteTone  = health.score >= 80 ? "ok" : health.score >= 60 ? "gold" : "rose";
        const METRIC_DESC: Record<string, string> = {
          Attendance: "30% weight — avg chapter attendance percentage",
          GPA:        "25% weight — scaled from 2.0–4.0 range",
          Dues:       "20% weight — % of brothers fully paid up",
          Service:    "15% weight — % of brothers at service hour goal",
          Deadlines:  "10% weight — −15 pts per urgent deadline",
        };
        return (
          <>
            <div className="dd-hero">
              <div className={`ring ${scoreTone}`}><span>{health.score}</span></div>
              <span className={`state ${scoreTone}`}>{health.label}</span>
              <p className="cap">out of 100 · weighted composite</p>
            </div>
            <div>
              <p className="dd-label">Score Breakdown</p>
              <div>
                {Object.entries(health.breakdown).map(([k, val]) => {
                  const tone = val >= 80 ? "ok" : val >= 60 ? "watch" : "risk";
                  return (
                    <div key={k} className="dd-score">
                      <div className="sh">
                        <span className="k">{k}</span>
                        <span className={`pct ${tone}`}>{val}%</span>
                      </div>
                      <div className="track"><i className={tone} style={{ width: `${val}%` }} /></div>
                      <p className="desc">{METRIC_DESC[k] ?? ""}</p>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className={`dd-note ${noteTone}`}>
              {health.score >= 80
                ? "Chapter is performing well across all metrics."
                : health.score >= 60
                ? `Some areas need attention — address urgent deadlines and at-risk ${v("Member", true).toLowerCase()}.`
                : "Immediate action required — multiple metrics are critically low."
              }
            </div>
          </>
        );
      }

      case "digest": {
        const { deadlinesDue, igDue, eventsThisWeek, partiesThisWeek, atRiskCount } = weeklyDigest;
        const total = deadlinesDue.length + igDue.length + eventsThisWeek.length + partiesThisWeek.length;
        const sections: { label: string; tone: string; count: number; rows: { key: string; title: string; meta: string }[] }[] = [
          { label: "Deadlines", tone: "vio", count: deadlinesDue.length,
            rows: deadlinesDue.map(d => ({ key: `d${d.id}`, title: d.title, meta: `${fmtDate(d.dueDate)} · ${d.owner.split(" ")[0]}` })) },
          { label: "Instagram", tone: "rose", count: igDue.length,
            rows: igDue.map(t => ({ key: `i${t.id}`, title: t.title, meta: `${fmtDate(t.dueDate)} · ${t.type}` })) },
          { label: "Events", tone: "info", count: eventsThisWeek.length,
            rows: eventsThisWeek.map(e => ({ key: `e${e.id}`, title: e.title, meta: e.time ? `${fmtDate(e.date)} · ${e.time}` : fmtDate(e.date) })) },
          { label: "Parties", tone: "vio", count: partiesThisWeek.length,
            rows: partiesThisWeek.map(p => ({ key: `p${p.id}`, title: p.name, meta: fmtDate(p.date) })) },
        ];
        return (
          <>
            <div className="flex items-center justify-between">
              <p className="dd-meta" style={{ fontSize: 12 }}>{fmtRange(weekRange.start, weekRange.end)}</p>
              {atRiskCount > 0 && (
                <span className="dd-chip gold">{atRiskCount} at risk</span>
              )}
            </div>
            {digestNarration && (
              <div className="dd-ai">
                <span className="tag">AI</span>
                <p>{digestNarration}</p>
              </div>
            )}
            <div className="dd-stats c4">
              {sections.map(s => (
                <div key={s.label} className="dd-stat"><p className="n">{s.count}</p><p className="l">{s.label}</p></div>
              ))}
            </div>
            {total === 0 ? (
              <div className="dd-note ok center">Nothing on the agenda this week</div>
            ) : (
              sections.map(s => s.rows.length > 0 && (
                <div key={s.label}>
                  <p className="dd-label">{s.label} <span className="ct">({s.rows.length})</span></p>
                  <div className="dd-feed">
                    {s.rows.map(r => (
                      <div key={r.key} className={`dd-feed-row ${s.tone}`}>
                        <p className="t">{r.title}</p>
                        <p className="m">{r.meta}</p>
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
        const statusTone: Record<TaskStatus, string> = {
          "Urgent":   "rose",
          "Due Soon": "gold",
          "Upcoming": "",
          "Complete": "ok",
        };
        return (
          <>
            <div className="dd-stats c4">
              {([["Urgent", byStatus.Urgent.length, "rose"], ["Due Soon", byStatus["Due Soon"].length, "gold"], ["Upcoming", byStatus.Upcoming.length, ""], ["Complete", byStatus.Complete.length, "ok"]] as const).map(([label, count, tone]) => (
                <div key={label} className="dd-stat"><p className={`n ${tone}`}>{count}</p><p className="l">{label}</p></div>
              ))}
            </div>
            {deadlineList.length === 0 ? (
              <p className="dd-empty">No deadlines — click + Add to create one</p>
            ) : (
              (["Urgent", "Due Soon", "Upcoming", "Complete"] as TaskStatus[]).map(status => {
                const items = byStatus[status as keyof typeof byStatus];
                if (!items || items.length === 0) return null;
                const tone = statusTone[status];
                return (
                  <div key={status}>
                    <p className="dd-label">{status} <span className="ct">({items.length})</span></p>
                    <div className="dd-feed">
                      {items.map(d => (
                        <div key={d.id} className={`dd-feed-row stacked ${tone}`}>
                          <div className="min-w-0 flex-1">
                            <p className={`t ${d.status === "Complete" ? "done" : ""}`} style={{ fontWeight: 500 }}>{d.title}</p>
                            <p className="m">{fmtDate(d.dueDate)} · {d.owner.split(" ")[0]}</p>
                          </div>
                          <div className="dd-acts hover-reveal">
                            {d.status !== "Complete" && (
                              <button onClick={() => onCompleteDeadline(d.id)} title="Mark complete" className="dd-act ok">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                              </button>
                            )}
                            <button onClick={() => onEditDeadline(d.id)} title="Edit" className="dd-act">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                            <button onClick={() => onDeleteDeadline(d.id)} title="Delete" className="dd-act danger">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
            <button onClick={() => { onOpenModal("deadline"); onClose(); }} className="dd-btn-ghost">
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
        const statusTone: Record<TaskStatus, string> = {
          "Urgent": "rose", "Due Soon": "gold", "Upcoming": "", "Complete": "ok",
        };
        return (
          <>
            <div className="dd-stats c4">
              {([["Urgent", urgent.length, "rose"], ["Due Soon", dueSoon.length, "gold"], ["Upcoming", upcoming.length, ""], ["Complete", complete.length, "ok"]] as const).map(([label, count, tone]) => (
                <div key={label} className="dd-stat"><p className={`n ${tone}`}>{count}</p><p className="l">{label}</p></div>
              ))}
            </div>
            {igTaskList.length === 0 ? (
              <p className="dd-empty">No IG tasks scheduled</p>
            ) : (
              <div className="dd-feed">
                {[...igTaskList].sort((a, b) => {
                  const order = { Urgent: 0, "Due Soon": 1, Upcoming: 2, Complete: 3 };
                  return (order[a.status] ?? 99) - (order[b.status] ?? 99);
                }).map(t => (
                  <div key={t.id} className="dd-feed-card">
                    <div className="flex items-start justify-between gap-2" style={{ marginBottom: 6 }}>
                      <p className={`flex-1 t ${t.status === "Complete" ? "done" : ""}`} style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "normal" }}>{t.title}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        <div className="dd-acts hover-reveal">
                          {t.status !== "Complete" && (
                            <button onClick={() => onCompleteIG(t.id)} title="Mark complete" className="dd-act ok">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            </button>
                          )}
                          <button onClick={() => onEditIG(t.id)} title="Edit" className="dd-act">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                          <button onClick={() => onDeleteIG(t.id)} title="Delete" className="dd-act danger">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                        <span className={`dd-chip ${statusTone[t.status]}`}>{t.status}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="dd-chip">{t.type}</span>
                      <span className="dd-meta" style={{ fontSize: 10 }}>{fmtDate(t.dueDate)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => { onOpenModal("ig"); onClose(); }} className="dd-btn-ghost">
              + Add IG Task
            </button>
          </>
        );
      }

      case "activity": {
        return (
          <>
            <div className="dd-stats c3">
              {([
                ["Success", activityFeed.filter(e => e.type === "success").length, "ok"],
                ["Warning", activityFeed.filter(e => e.type === "warning").length, "gold"],
                ["Info",    activityFeed.filter(e => e.type === "info").length,    "info"],
              ] as const).map(([label, count, tone]) => (
                <div key={label} className="dd-stat"><p className={`n ${tone}`}>{count}</p><p className="l">{label}</p></div>
              ))}
            </div>
            <div>
              <p className="dd-label">Full History <span className="ct">({activityFeed.length} entries)</span></p>
              {activityFeed.length === 0 ? (
                <p className="dd-empty">No activity yet</p>
              ) : (
                <div className="dd-history">
                  {activityFeed.map(e => (
                    <div key={e.id} className="a">
                      <span className={`dot ${dot[e.type]}`} />
                      <p>{e.message}</p>
                      <time>{e.timestamp}</time>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        );
      }

      case "parties": {
        const sorted = [...partyList].sort((a, b) => b.doorRevenue - a.doorRevenue);
        const avgRevenue = partyList.length > 0 ? Math.round(totalDoorRev / partyList.length) : 0;
        const totalAttendees = partyList.reduce((s, e) => s + e.attendance, 0);
        return (
          <>
            <div className="dd-stats c3">
              <div className="dd-stat"><p className="n vio">{fmt$(totalDoorRev)}</p><p className="l">Total revenue</p></div>
              <div className="dd-stat"><p className="n">{partyList.length}</p><p className="l">Events</p></div>
              <div className="dd-stat"><p className="n">{totalAttendees}</p><p className="l">Attendees</p></div>
            </div>
            <div>
              <p className="dd-label">Events — Best First</p>
              <div className="dd-feed">
                {sorted.map(e => {
                  const barPct = maxRevenue > 0 ? Math.round((e.doorRevenue / maxRevenue) * 100) : 0;
                  const isTop = bestEvent ? e.id === bestEvent.id : false;
                  return (
                    <div key={e.id} className={`dd-event ${isTop ? "top" : ""}`}>
                      <div className="eh">
                        <p className="t">{isTop && <span className="best">Best</span>}{e.name}</p>
                        <span className="m">{fmt$(e.doorRevenue)}</span>
                      </div>
                      <div className="dd-track"><i className={isTop ? "" : "muted"} style={{ width: `${barPct}%` }} /></div>
                      <div className="meta">
                        <span>{e.date}</span>
                        <span>{e.attendance} attendees</span>
                        <span>{fmt$(Math.round(e.doorRevenue / Math.max(1, e.attendance)))} / head</span>
                        {e.notes && <span className="note">{e.notes}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <button onClick={() => { onOpenModal("revenue"); onClose(); }} className="dd-btn-ghost">
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
      <div className={`dash-drawer-backdrop ${isOpen ? "" : "closed"}`} onClick={onClose} />
      <div className={`dash-drawer ${isOpen ? "" : "closed"}`}>
        {cfg && (
          <>
            <div className={`dd-accent ${cfg.tone}`} />
            <div className="dd-head">
              <h2 className="dd-title">{cfg.title}</h2>
              <button onClick={onClose} className="dd-x" aria-label="Close">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="dd-body">
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
      <div className={`dash-drawer-backdrop ${isOpen ? "" : "closed"}`} onClick={onClose} />
      <div className={`dash-drawer ${isOpen ? "" : "closed"}`}>
        {snap && (
          <>
            <div className="dd-head">
              <div className="dd-icon">
                <SvgIcon d={KPI_ICONS["custom"] ?? ""} />
              </div>
              <h2 className="dd-title">{snap.name}</h2>
              <button onClick={onClose} className="dd-x" aria-label="Close">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="dd-body">
              <div className="dd-stats c3">
                <div className="dd-stat"><p className="n ok">{snap.onTrackCount}</p><p className="l">On Track</p></div>
                <div className="dd-stat"><p className="n gold">{snap.totalCount - snap.onTrackCount}</p><p className="l">Not on Track</p></div>
                <div className="dd-stat"><p className="n">{snap.goal}{snap.unit ?? ""}</p><p className="l">Goal</p></div>
              </div>
              <div>
                <p className="dd-label">Summary</p>
                <div className="dd-panel">
                  <div className="dd-kv" style={{ justifyContent: "space-between" }}>
                    <span className="k" style={{ width: "auto" }}>Aggregation</span>
                    <span className="v" style={{ textTransform: "capitalize" }}>{snap.aggregation.replace("_", " ")}</span>
                  </div>
                  <div className="dd-kv" style={{ justifyContent: "space-between" }}>
                    <span className="k" style={{ width: "auto" }}>
                      {snap.aggregation === "avg" ? "Chapter avg" : snap.aggregation === "sum" ? "Chapter total" : "On track"}
                    </span>
                    <span className="v" style={{ color: "var(--vio)", fontFamily: "var(--mono)" }}>
                      {Number.isInteger(snap.headline) ? snap.headline : snap.headline.toFixed(1)}{snap.unit ?? ""}
                    </span>
                  </div>
                  <div className="dd-kv" style={{ justifyContent: "space-between" }}>
                    <span className="k" style={{ width: "auto" }}>Members recorded</span>
                    <span className="v" style={{ fontFamily: "var(--mono)" }}>{snap.totalCount}</span>
                  </div>
                </div>
              </div>
              <p className="dd-meta">
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
  // "Log service hours" modal (opened from the Brother drawer's + control).
  // Logs hours for the drawer's member against a chosen service event, mirroring
  // the service page's self-service flow but on the member's behalf.
  const [logHoursFor,    setLogHoursFor]    = useState<Brother | null>(null);
  const [logHoursEvents, setLogHoursEvents] = useState<DashServiceEvent[]>([]);
  const [logHoursEventId, setLogHoursEventId] = useState<number | null>(null);
  const [logHoursStr,    setLogHoursStr]    = useState("");
  const [logHoursBusy,   setLogHoursBusy]   = useState(false);
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
  // Matches the timeline/settings deadline modal: when the org's Instagram page
  // is visible, the form offers to log the deadline as an Instagram post instead.
  const igEnabled = isNavVisible("Instagram", currentUser?.org?.enabledWorkflows ?? []);
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

  function handleAddDeadline(d: { title: string; dueDate: string; owner: string; status: TaskStatus; isPost: boolean; postType: InstagramType }) {
    const tempId = _nextId++;
    setActiveModal(null);

    // When "This is an Instagram post" is checked, it's logged as an Instagram
    // task instead — same routing as the timeline/settings deadline modal.
    if (d.isPost) {
      const task = { title: d.title, dueDate: d.dueDate, type: d.postType, status: d.status };
      setIgTaskList(prev => [...prev, { id: tempId, ...task }]);
      addActivity(`IG task added: "${task.title}"`, "info");
      persistMutation(
        requestJson<InstagramTask>("/api/instagram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(task),
        }),
        "Instagram post could not be saved. Local changes were reverted.",
        () => setIgTaskList(prev => prev.filter(x => x.id !== tempId)),
        saved => setIgTaskList(prev => prev.map(x => x.id === tempId ? saved : x)),
      );
      return;
    }

    const deadline = { title: d.title, dueDate: d.dueDate, owner: d.owner, status: d.status };
    setDeadlineList(prev => [...prev, { id: tempId, ...deadline }]);
    addActivity(`New deadline added: "${deadline.title}"`, "info");
    persistMutation(
      requestJson<Deadline>("/api/deadlines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deadline),
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

  function handleAddIGTask(t: { title: string; dueDate: string; type: InstagramType; status: TaskStatus }) {
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

  // The shared deadline form always reports isPost/postType; editing an existing
  // deadline ignores them (no in-place conversion to an IG post) and patches only
  // the deadline fields.
  function saveEditDeadline({ title, dueDate, owner, status }: { title: string; dueDate: string; owner: string; status: TaskStatus; isPost: boolean; postType: InstagramType }) {
    if (!editingDeadlineId) return;
    const data = { title, dueDate, owner, status };
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

  function saveEditIG(data: { title: string; dueDate: string; type: InstagramType; status: TaskStatus }) {
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

  // ── Log service hours (Brother drawer +) ────────────────────────────────────
  // Opens a modal to log hours for `b` against a service event. Unlike the old
  // blind +1h PATCH, this writes a ServiceParticipation row so the total is
  // event-attributed and recomputed server-side (see recalc-service-hours).
  function openLogServiceHours(b: Brother) {
    setLogHoursFor(b);
    setLogHoursStr("");
    setLogHoursEventId(null);
    requestJson<DashServiceEvent[]>("/api/service-events")
      .then(events => {
        const sorted = [...events].sort((a, z) => z.date.localeCompare(a.date));
        setLogHoursEvents(sorted);
        setLogHoursEventId(sorted[0]?.id ?? null);
      })
      .catch(() => toast.error("Could not load service events."));
  }

  async function submitLogServiceHours() {
    if (!logHoursFor || logHoursEventId == null) return;
    const hours = Math.max(0, parseFloat(logHoursStr) || 0);
    const b = logHoursFor;
    setLogHoursBusy(true);
    try {
      await requestJson(`/api/service-events/${logHoursEventId}/participation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: [{ brotherId: b.id, hours }] }),
      });
      // serviceHours is recomputed server-side from participations; pull fresh totals.
      const fresh = await requestJson<Brother[]>("/api/brothers");
      setBrotherList(fresh);
      const updated = fresh.find(x => x.id === b.id);
      addActivity(`${b.name} — logged ${hours}h service${updated ? ` (${updated.serviceHours}h total)` : ""}`, "info");
      toast.success("Service hours logged.");
      setLogHoursFor(null);
    } catch {
      toast.error("Could not log service hours.");
    } finally {
      setLogHoursBusy(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="main-route-transition flex h-screen overflow-hidden bg-[#07090f]">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeSection={activeSection}
        onNavClick={scrollToSection}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* No mobile toolbar on the dashboard: the greeting header inside
            MobileDashboard now carries the org label, quick-actions ("+"),
            "My Standing", and the bottom bar's "More" opens the sidebar. The
            desktop ledger (md+) folds these into BriefingActions as before. */}

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
              firstName={currentUser?.name?.split(" ")[0] ?? "there"}
              orgName={currentUser?.org?.name ?? null}
              health={health}
              needsAttention={needsAttention}
              announcement={announcement}
              onEditAnnouncement={() => setAnnouncementEditorOpen(true)}
              onOpenSidebar={() => setSidebarOpen(true)}
              onQuickAction={handleQuickAction}
              quickActionsAdmin={isAdmin || canTreasury || canAttendance}
              enabledWorkflows={currentUser?.org?.enabledWorkflows}
              onOpenStanding={
                selfId !== null && brotherList.some(b => b.id === selfId)
                  ? () => setSelectedBrotherId(selfId)
                  : undefined
              }
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
              actions={
                <BriefingActions
                  onMyStanding={
                    selfId !== null && brotherList.some(b => b.id === selfId)
                      ? () => setSelectedBrotherId(selfId)
                      : undefined
                  }
                  onLogAttendance={canAttendance ? () => openAttendanceLog() : undefined}
                  onQuickAction={handleQuickAction}
                  quickActionsAdmin={isAdmin || canTreasury || canAttendance}
                  enabledWorkflows={currentUser?.org?.enabledWorkflows}
                />
              }
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

            {/* ── Content grid ────────────────────────────────────────────────
                Two real columns on desktop: the left column stacks Needs
                attention → Roster, the right column is the rail (This Week +
                Treasury, then Socials/Instagram/Activity). Stacking each side in
                its own flex column keeps them continuous (no cross-column row
                coupling / gaps). On tablet (≤1279) both columns dissolve via
                `display: contents` and the regions reflow into one column with
                the high-signal This Week + Treasury pair lifted above the Roster
                (see dashboard-ledger.css). DOM order within each column equals
                the on-screen order at every width, so focus order stays correct. */}
            <div className="grid">
              {/* Left column — Needs attention, then Roster */}
              <div className="col col-main">
                {feature("operations", "needs-attention") && (
                  <div className="area-needs">
                  <NeedsAttention
                    items={needsAttention}
                    onMarkDone={completeDeadline}
                    onOpenProfile={(id) => setSelectedBrotherId(id)}
                    onSendReminder={() => setActiveDrawer("dues")}
                    hideButton={isActiveOrgAdmin ? <DashHideButton label="Needs attention" onHide={() => setWidgetHidden("needs-attention", true)} /> : undefined}
                  />
                  </div>
                )}
                {feature("operations", "brother-tracking") && (
                  <div className="area-roster">
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
                    hideButton={isActiveOrgAdmin ? <DashHideButton label="Member tracking" onHide={() => setWidgetHidden("brother-tracking", true)} /> : undefined}
                  />
                  </div>
                )}
              </div>

              {/* Right column — rail: This Week + Treasury (priority), then the rest */}
              <div className="col rail col-rail">
                {/* Priority pair — lifts above the Roster on tablet */}
                <div className="area-priority">
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
                </div>

                {/* Remaining rail — Socials / Instagram / Activity */}
                <div className="area-rail">
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
        <Modal title="Log Expense" tone="dusk" onClose={closeModal}>
          <TxForm lockType="expense" tone="dusk" onSubmit={handleAddTransaction} onCancel={closeModal} />
        </Modal>
      )}
      {activeModal === "event" && (
        <Modal title="New Event" tone="dusk" onClose={closeModal}>
          <CalendarEventForm submitLabel="Add Event" onSubmit={handleAddCalendarEvent} />
        </Modal>
      )}
      {activeModal === "deadline" && (
        <Modal title="Add Deadline" tone="dusk" onClose={closeModal}>
          <AddDeadlineForm brotherNames={brotherNames} onSubmit={handleAddDeadline} igEnabled={igEnabled} />
        </Modal>
      )}
      {activeModal === "revenue" && (
        <Modal title="Log Revenue" tone="dusk" onClose={closeModal}>
          <AddRevenueForm onSubmit={handleAddRevenue} />
        </Modal>
      )}
      {activeModal === "ig" && (
        <Modal title="Add Instagram Task" tone="dusk" onClose={closeModal}>
          <AddIGTaskForm onSubmit={handleAddIGTask} />
        </Modal>
      )}
      {activeModal === "attendance" && selectedEventForAttendance && (
        <Modal title="Log Attendance" tone="dusk" onClose={closeModal}>
          <LogAttendanceForm event={selectedEventForAttendance} bList={brotherList} onSubmit={handleLogAttendance} />
        </Modal>
      )}
      {activeModal === "pick-event-for-excuse" && (
        <Modal title="Select Event to Excuse" tone="dusk" onClose={closeModal}>
          <p className="mb-3 text-[12px] text-[#958d7c]">Pick a required event you (or, if you&rsquo;re an admin, another brother) need an excuse for.</p>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {calendarList.filter(e => e.mandatory).length === 0 && (
              <p className="text-[12px] text-[#6b6354]">No required events found.</p>
            )}
            {calendarList.filter(e => e.mandatory).sort((a, b) => a.date.localeCompare(b.date)).map(e => (
              <button key={e.id} onClick={() => { setSelectedEventForAttendance(e); setActiveModal("excuse"); }}
                className="w-full rounded-lg border border-[rgba(236,231,221,0.08)] bg-[rgba(236,231,221,0.03)] px-3 py-2.5 text-left transition-colors hover:border-[#a78bfa]/30 hover:bg-[#a78bfa]/10">
                <p className="text-[13px] font-medium text-[#ece7dd]">{e.title}</p>
                <p className="text-[11px] text-[#6b6354]">{e.date}{e.location ? ` · ${e.location}` : ""}</p>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {activeModal === "excuse" && selectedEventForAttendance && (
        <Modal title={isAdmin ? "Approve Excuse" : "Submit Excuse"} tone="dusk" onClose={closeModal}>
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
        <Modal title="Select Event to Log" tone="dusk" onClose={closeModal}>
          <p className="mb-3 text-[12px] text-[#958d7c]">Pick a required event to log attendance for.</p>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {calendarList.filter(e => e.mandatory).length === 0 && (
              <p className="text-[12px] text-[#6b6354]">No required events found.</p>
            )}
            {calendarList.filter(e => e.mandatory).sort((a, b) => a.date.localeCompare(b.date)).map(e => (
              <button key={e.id} onClick={() => { setSelectedEventForAttendance(e); setActiveModal("attendance"); }}
                className="w-full rounded-lg border border-[rgba(236,231,221,0.08)] bg-[rgba(236,231,221,0.03)] px-3 py-2.5 text-left transition-colors hover:border-[#a78bfa]/30 hover:bg-[#a78bfa]/10">
                <p className="text-[13px] font-medium text-[#ece7dd]">{e.title}</p>
                <p className="text-[11px] text-[#6b6354]">{e.date}{e.location ? ` · ${e.location}` : ""}</p>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {activeModal === "edit-deadline" && editingDeadlineId !== null && (() => {
        const d = deadlineList.find(x => x.id === editingDeadlineId);
        if (!d) return null;
        return (
          <Modal title="Edit Deadline" tone="dusk" onClose={closeModal}>
            <AddDeadlineForm brotherNames={brotherNames} initial={d} onSubmit={saveEditDeadline} />
          </Modal>
        );
      })()}
      {activeModal === "edit-ig" && editingIgId !== null && (() => {
        const t = igTaskList.find(x => x.id === editingIgId);
        if (!t) return null;
        return (
          <Modal title="Edit Instagram Task" tone="dusk" onClose={closeModal}>
            <AddIGTaskForm initial={t} onSubmit={saveEditIG} />
          </Modal>
        );
      })()}

      {/* ── Pay Dues Modal ──────────────────────────────────────────────────── */}
      {payTarget && (
        <Modal title="Record Payment" tone="dusk" onClose={() => setPayTarget(null)}>
          <div className="space-y-4">
            <div>
              <p className="text-[12px] text-[#958d7c] mb-3">
                {payTarget.name} owes <span className="font-semibold text-[#d9b08b]">{fmt$(payTarget.duesOwed)}</span>
              </p>
              <FieldLabel tone="dusk">Amount Paid ($)</FieldLabel>
              <input
                type="number"
                min="0"
                max={payTarget.duesOwed}
                step="0.01"
                className={inputDuskCls}
                value={payAmountStr}
                onChange={e => setPayAmountStr(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === "Enter") submitPayDues(); }}
              />
              {(() => {
                const amt = parseFloat(payAmountStr) || 0;
                const remaining = Math.max(0, payTarget.duesOwed - amt);
                return amt > 0 ? (
                  <p className="mt-1.5 text-[11px] text-[#6b6354]">
                    Remaining after payment: <span className={remaining === 0 ? "text-[#7fb08a] font-semibold" : "text-[#c9c2b4]"}>{fmt$(remaining)}</span>
                  </p>
                ) : null;
              })()}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPayTarget(null)}
                className={btnDuskGhostCls}
              >
                Cancel
              </button>
              <button
                onClick={submitPayDues}
                disabled={!(parseFloat(payAmountStr) > 0)}
                className={btnDuskActionCls}
              >
                Record Payment
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Log Service Hours Modal ─────────────────────────────────────────── */}
      {logHoursFor && (
        <Modal title="Log Service Hours" tone="dusk" onClose={() => !logHoursBusy && setLogHoursFor(null)}>
          <div className="space-y-4">
            <p className="text-[12px] text-[#958d7c]">
              Logging hours for <span className="font-semibold text-[#ece7dd]">{logHoursFor.name}</span> against a service event.
            </p>
            <div>
              <FieldLabel tone="dusk">Service Event</FieldLabel>
              {logHoursEvents.length === 0 ? (
                <p className="mt-1 text-[12px] text-[#6b6354]">No service events yet. Create one on the Service page first.</p>
              ) : (
                <select
                  className={inputDuskCls}
                  value={logHoursEventId ?? ""}
                  onChange={e => setLogHoursEventId(e.target.value ? Number(e.target.value) : null)}
                >
                  {logHoursEvents.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.title} · {fmtDate(ev.date)}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <FieldLabel tone="dusk">Hours</FieldLabel>
              <input
                type="number"
                min="0"
                step="0.5"
                inputMode="decimal"
                className={inputDuskCls}
                value={logHoursStr}
                placeholder="0"
                autoFocus
                onChange={e => setLogHoursStr(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && logHoursEventId != null && logHoursStr !== "") submitLogServiceHours(); }}
              />
              <p className="mt-1.5 text-[11px] text-[#6b6354]">
                Sets {logHoursFor.name.split(" ")[0]}&apos;s hours for this event. Their total recomputes from all logged events.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setLogHoursFor(null)}
                disabled={logHoursBusy}
                className={btnDuskGhostCls}
              >
                Cancel
              </button>
              <button
                onClick={submitLogServiceHours}
                disabled={logHoursBusy || logHoursEventId == null || logHoursStr === ""}
                className={btnDuskActionCls}
              >
                {logHoursBusy ? "Saving…" : "Log Hours"}
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
        onLogServiceHours={openLogServiceHours}
        isAdmin={isAdmin}
        selfId={selfId}
      />

      {/* ── Confirm Delete Dialog ───────────────────────────────────────────── */}
      {confirmDelete && (
        <ConfirmDialog
          tone="dusk"
          title={confirmDelete.kind === "deadline" ? "Delete Deadline" : "Delete IG Task"}
          message={<>Delete <span className="font-semibold text-[#ece7dd]">{confirmDelete.label}</span>? This cannot be undone.</>}
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
