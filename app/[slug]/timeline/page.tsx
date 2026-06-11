"use client";

import React, { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import { Sidebar } from "../../components/Sidebar";
import { BrotherAvatar } from "../../components/BrotherAvatar";
import { UserAvatar } from "../../components/UserAvatar";
import { CalendarEvent, CalEventCategory, CalLayer } from "../../data";
import { useChapter } from "../../context/ChapterContext";
import { Modal, ConfirmDialog } from "../../components/dashboard/primitives";
import { headerActionBtnCls, inputCls } from "../../components/dashboard/styles";
import { requestJson } from "../../lib/api";
import { pad, toDateStr, daysFromToday } from "../../lib/dates";
import { CalendarEventForm, type CalendarDraft } from "../../components/timeline/CalendarEventForm";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const _now = new Date();
const TODAY = { year: _now.getFullYear(), month: _now.getMonth(), day: _now.getDate() };

interface PendingExcuse {
  id:              number;
  brotherId:       number;
  brotherName:     string;
  calendarEventId: number;
  eventTitle:      string;
  eventDate:       string;
  reason:          string;
  status:          string;
  submittedAt:     string;
  isRetroactive:   boolean;
  rejectionNote:   string | null;
}

const LAYERS: { id: CalLayer; label: string; activeClasses: string; iconPath: string }[] = [
  {
    id: "all",
    label: "All",
    activeClasses: "border-white/20 bg-white/[0.08] text-white shadow-sm",
    iconPath: "M4 6h16M4 10h16M4 14h16M4 18h16",
  },
  {
    id: "mandatory",
    label: "Mandatory",
    activeClasses: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 shadow-sm shadow-emerald-900/20",
    iconPath: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    id: "deadlines",
    label: "Deadlines",
    activeClasses: "border-red-500/40 bg-red-500/10 text-red-300 shadow-sm shadow-red-900/20",
    iconPath: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    id: "parties",
    label: "Parties",
    activeClasses: "border-indigo-500/40 bg-indigo-500/10 text-indigo-300 shadow-sm shadow-indigo-900/20",
    iconPath: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  },
  {
    id: "service",
    label: "Service",
    activeClasses: "border-teal-500/40 bg-teal-500/10 text-teal-300 shadow-sm shadow-teal-900/20",
    iconPath: "M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z",
  },
];

const CAT_META: Record<CalEventCategory, {
  label: string;
  dot: string;
  dotGlow: string;
  ring: string;
  text: string;
  bg: string;
  border: string;
  borderL: string;
  cardBg: string;
  accentBar: string;
  heroBg: string;
  iconPath: string;
}> = {
  chapter: {
    label: "Chapter",
    dot: "bg-emerald-400",
    dotGlow: "shadow-emerald-500/60",
    ring: "ring-emerald-500/25",
    text: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/25",
    borderL: "border-l-emerald-500",
    cardBg: "bg-emerald-500/[0.04]",
    accentBar: "bg-emerald-500",
    heroBg: "from-emerald-500/20",
    iconPath: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  },
  social: {
    label: "Social",
    dot: "bg-violet-400",
    dotGlow: "shadow-violet-500/60",
    ring: "ring-violet-500/25",
    text: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/25",
    borderL: "border-l-violet-500",
    cardBg: "bg-violet-500/[0.04]",
    accentBar: "bg-violet-500",
    heroBg: "from-violet-500/20",
    iconPath: "M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  fundy: {
    label: "Fundraiser",
    dot: "bg-amber-400",
    dotGlow: "shadow-amber-500/60",
    ring: "ring-amber-500/25",
    text: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
    borderL: "border-l-amber-500",
    cardBg: "bg-amber-500/[0.04]",
    accentBar: "bg-amber-500",
    heroBg: "from-amber-500/20",
    iconPath: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  program: {
    label: "Program",
    dot: "bg-sky-400",
    dotGlow: "shadow-sky-500/60",
    ring: "ring-sky-500/25",
    text: "text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/25",
    borderL: "border-l-sky-500",
    cardBg: "bg-sky-500/[0.04]",
    accentBar: "bg-sky-500",
    heroBg: "from-sky-500/20",
    iconPath: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  },
  party: {
    label: "Party",
    dot: "bg-indigo-400",
    dotGlow: "shadow-indigo-500/60",
    ring: "ring-indigo-500/25",
    text: "text-indigo-400",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/25",
    borderL: "border-l-indigo-500",
    cardBg: "bg-indigo-500/[0.04]",
    accentBar: "bg-indigo-500",
    heroBg: "from-indigo-500/20",
    iconPath: "M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3",
  },
  deadline: {
    label: "Deadline",
    dot: "bg-red-400",
    dotGlow: "shadow-red-500/60",
    ring: "ring-red-500/25",
    text: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/25",
    borderL: "border-l-red-500",
    cardBg: "bg-red-500/[0.04]",
    accentBar: "bg-red-500",
    heroBg: "from-red-500/20",
    iconPath: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  service: {
    label: "Community Service",
    dot: "bg-teal-400",
    dotGlow: "shadow-teal-500/60",
    ring: "ring-teal-500/25",
    text: "text-teal-400",
    bg: "bg-teal-500/10",
    border: "border-teal-500/25",
    borderL: "border-l-teal-500",
    cardBg: "bg-teal-500/[0.04]",
    accentBar: "bg-teal-500",
    heroBg: "from-teal-500/20",
    iconPath: "M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function filterByLayer(events: CalendarEvent[], layer: CalLayer): CalendarEvent[] {
  switch (layer) {
    case "all":       return events;
    case "mandatory": return events.filter(e => e.mandatory);
    case "deadlines": return events.filter(e => e.category === "deadline");
    case "parties":   return events.filter(e => e.category === "party");
    case "service":   return events.filter(e => e.category === "service");
  }
}

function fmtDow(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return DAY_NAMES[d.getDay()].toUpperCase();
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

interface MonthGroup {
  id: string;
  monthLabel: string;
  year: number;
  isCurrentMonth: boolean;
  events: CalendarEvent[];
}

function buildMonthGroups(events: CalendarEvent[]): MonthGroup[] {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));

  const map: Record<string, MonthGroup> = {};
  for (const e of sorted) {
    const [yr, mo] = e.date.split("-").map(Number);
    const key = `${yr}-${pad(mo)}`;
    if (!map[key]) {
      map[key] = {
        id: key,
        monthLabel: MONTH_NAMES[mo - 1],
        year: yr,
        isCurrentMonth: yr === TODAY.year && mo === TODAY.month + 1,
        events: [],
      };
    }
    map[key].events.push(e);
  }

  return Object.values(map).sort((a, b) => a.id.localeCompare(b.id));
}

// ─── TodayMarker ──────────────────────────────────────────────────────────────

function TodayMarker() {
  return (
    <div className="relative my-3 flex items-center gap-3">
      <div className="h-px flex-1 bg-indigo-500/30" />
      <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-indigo-500/40 bg-indigo-500/15 px-3 py-1">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
        <span className="text-[10px] font-bold tracking-widest text-indigo-300 uppercase">Today</span>
      </div>
      <div className="h-px flex-1 bg-indigo-500/30" />
    </div>
  );
}

// ─── EventCard ────────────────────────────────────────────────────────────────

function EventCard({
  event, onSelect, selected, showTodayMarkerBefore,
}: {
  event: CalendarEvent;
  onSelect: (e: CalendarEvent) => void;
  selected: boolean;
  showTodayMarkerBefore: boolean;
}) {
  const m           = CAT_META[event.category];
  const todayStr    = toDateStr(TODAY.year, TODAY.month, TODAY.day);
  const isPast      = event.date < todayStr;
  const isToday     = event.date === todayStr;
  const isMandatory = event.mandatory;
  const [, , d]     = event.date.split("-").map(Number);
  const dow         = fmtDow(event.date);
  const diff        = daysFromToday(event.date);

  const daysChip = isToday
    ? { label: "Today", cls: `${m.bg} ${m.text} ring-1 ring-inset ${m.ring}` }
    : diff === 1
    ? { label: "Tomorrow", cls: "bg-amber-500/15 text-amber-400 ring-1 ring-inset ring-amber-500/25" }
    : diff > 0 && diff <= 2
    ? { label: `In ${diff}d`, cls: "bg-red-500/15 text-red-400 ring-1 ring-inset ring-red-500/25" }
    : diff > 0 && diff <= 7
    ? { label: `In ${diff}d`, cls: "bg-amber-500/15 text-amber-400 ring-1 ring-inset ring-amber-500/25" }
    : diff > 0
    ? { label: `In ${diff}d`, cls: "bg-white/[0.04] text-slate-500" }
    : isPast
    ? { label: `${Math.abs(diff)}d ago`, cls: "bg-white/[0.03] text-slate-600" }
    : null;

  return (
    <>
      {showTodayMarkerBefore && <TodayMarker />}
      <div
        onClick={() => onSelect(event)}
        className={`group mb-2 flex min-h-[72px] cursor-pointer overflow-hidden rounded-xl border transition-all duration-150 hover:translate-x-0.5 ${
          selected
            ? `${m.border} ${m.cardBg} shadow-lg ring-1 ${m.ring}`
            : isPast
            ? "border-white/[0.04] bg-[#0c0e14] hover:border-white/[0.08] hover:bg-[#10121a] hover:shadow-md"
            : "border-white/[0.07] bg-[#10121a] hover:border-white/[0.12] hover:bg-[#141820] hover:shadow-lg"
        }`}
      >
        {/* Left accent bar */}
        <div className={`w-[3px] shrink-0 self-stretch rounded-l-xl ${m.accentBar} ${isPast && !selected ? "opacity-20" : "opacity-90"}`} />

        <div className="flex flex-1 items-center gap-4 px-4 py-3.5">
          {/* Date column */}
          <div className={`flex w-14 shrink-0 flex-col items-center text-center ${isPast ? "opacity-40" : ""}`}>
            <span className={`text-[10px] font-semibold uppercase tracking-widest ${isToday ? m.text : "text-slate-500"}`}>{dow}</span>
            <span className={`text-[22px] font-black tabular-nums leading-none ${isPast ? "text-slate-600" : isToday ? m.text : "text-slate-100"}`}>{d}</span>
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <p className={`flex-1 text-[14px] font-semibold leading-snug ${isPast ? "text-slate-500" : "text-white"}`}>
                {event.title}
              </p>
              {daysChip && (
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold tabular-nums ${daysChip.cls}`}>
                  {daysChip.label}
                </span>
              )}
            </div>

            <div className={`mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] ${isPast ? "text-slate-600" : "text-slate-400"}`}>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${m.text} ${m.bg} ring-1 ring-inset ${m.ring}`}>
                {m.label}
              </span>
              {isMandatory && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
                  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Required
                </span>
              )}
              {event.time && (
                <span className="flex items-center gap-1">
                  <svg className="h-3 w-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {event.time}
                </span>
              )}
              {event.location && (
                <span className="flex items-center gap-1">
                  <svg className="h-3 w-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {event.location}
                </span>
              )}
            </div>
          </div>

          {/* Right side — completion dot for past, nothing for future */}
          {isPast && (
            <div className="shrink-0">
              <div className="h-2 w-2 rounded-full bg-white/[0.08]" />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── MonthDivider ─────────────────────────────────────────────────────────────

function MonthDivider({
  group, collapsed, onToggle,
}: {
  group: MonthGroup;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="mb-3 flex w-full cursor-pointer items-center gap-4 text-left"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`text-[26px] font-black tracking-tight leading-none ${group.isCurrentMonth ? "text-white" : "text-slate-500"}`}>
            {group.monthLabel}
          </span>
          <span className={`text-[14px] font-semibold ${group.isCurrentMonth ? "text-indigo-400" : "text-slate-600"}`}>
            {group.year}
          </span>
          {group.isCurrentMonth && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[9px] font-bold tracking-wider text-indigo-300 uppercase">
              <span className="h-1 w-1 animate-pulse rounded-full bg-indigo-400" />
              Now
            </span>
          )}
        </div>
        <div className={`mt-1.5 h-px ${group.isCurrentMonth ? "bg-indigo-500/30" : "bg-white/[0.06]"}`} />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
          group.isCurrentMonth ? "bg-indigo-500/20 text-indigo-400" : "bg-white/[0.04] text-slate-600"
        }`}>
          {group.events.length}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
            collapsed ? "-rotate-90" : ""
          } ${group.isCurrentMonth ? "text-indigo-500" : "text-slate-600"}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </button>
  );
}

// ─── EventDetail ──────────────────────────────────────────────────────────────

type AttendanceDetail = {
  excused:   { brotherId: number; brotherName: string; reason: string; isRetroactive: boolean }[];
  unexcused: { brotherId: number; brotherName: string }[];
  attended:  { brotherId: number; brotherName: string }[];
};

function EventDetail({
  event,
  onClose,
  canEdit,
  canDelete,
  canLogAttendance,
  onEdit,
  onDelete,
  brotherList,
  selfBrotherId,
}: {
  event: CalendarEvent;
  onClose: () => void;
  canEdit: boolean;
  /** Admin-only delete. */
  canDelete: boolean;
  /** Admin-only attendance logging. */
  canLogAttendance: boolean;
  onEdit: () => void;
  onDelete: () => void;
  brotherList: { id: number; name: string }[];
  selfBrotherId: number | null;
}) {
  const m          = CAT_META[event.category];
  const isDeadline = event.category === "deadline";
  const todayStr   = toDateStr(TODAY.year, TODAY.month, TODAY.day);
  const isPast     = event.date < todayStr;
  const isToday    = event.date === todayStr;
  const [, mo, d]  = event.date.split("-").map(Number);
  const dow        = fmtDow(event.date);
  const diff       = daysFromToday(event.date);

  const [attDetail,     setAttDetail]     = useState<AttendanceDetail | null>(null);
  const [attLoading,    setAttLoading]    = useState(false);
  const [excuseOpen,    setExcuseOpen]    = useState(false);
  const [excuseBrother, setExcuseBrother] = useState("");
  const [excuseReason,  setExcuseReason]  = useState("");
  const [excuseSubmitting, setExcuseSubmitting] = useState(false);
  const [logAttOpen,    setLogAttOpen]    = useState(false);
  const [logAttended,   setLogAttended]   = useState<Set<number>>(new Set());
  const [logSubmitting, setLogSubmitting] = useState(false);
  const [logError,      setLogError]      = useState<string | null>(null);

  useEffect(() => {
    if (!event.mandatory) return;
    const controller = new AbortController();
    setAttDetail(null);
    setAttLoading(true);
    fetch(`/api/attendance/${event.id}`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: AttendanceDetail) => setAttDetail(data))
      .catch(err => { if (err.name !== "AbortError") console.error("Failed to load attendance", err); })
      .finally(() => setAttLoading(false));
    return () => controller.abort();
  }, [event.id, event.mandatory]);

  useEffect(() => {
    setExcuseOpen(false);
    setExcuseBrother("");
    setExcuseReason("");
    setLogAttOpen(false);
    setLogAttended(new Set());
    setLogError(null);
  }, [event.id]);

  async function submitExcuse(e: React.FormEvent) {
    e.preventDefault();
    if (!excuseReason.trim()) return;
    // Admins must pick a brother; non-admins submit for themselves (server enforces this).
    if (canLogAttendance && !excuseBrother) return;
    setExcuseSubmitting(true);
    try {
      const res = await fetch("/api/excuses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarEventId: event.id,
          // Server ignores brotherId for non-admins, but we send self's id when known for clarity.
          brotherId: canLogAttendance ? Number(excuseBrother) : selfBrotherId ?? undefined,
          reason: excuseReason.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Excuse submission failed", err);
        return;
      }
      const updated = await requestJson<AttendanceDetail>(`/api/attendance/${event.id}`);
      setAttDetail(updated);
      setExcuseOpen(false);
      setExcuseBrother("");
      setExcuseReason("");
    } catch (err) {
      console.error("Excuse submission error", err);
    } finally {
      setExcuseSubmitting(false);
    }
  }

  function openLogAtt() {
    const excusedIds = new Set((attDetail?.excused ?? []).map(e => e.brotherId));
    const alreadyAttended = new Set((attDetail?.attended ?? []).map(e => e.brotherId));
    const eligible = brotherList.filter(b => !excusedIds.has(b.id));
    setLogAttended(alreadyAttended.size > 0 ? alreadyAttended : new Set(eligible.map(b => b.id)));
    setLogError(null);
    setLogAttOpen(true);
  }

  async function submitLogAtt(e: React.FormEvent) {
    e.preventDefault();
    if (logSubmitting) return;
    setLogSubmitting(true);
    setLogError(null);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarEventId: event.id, attendedIds: Array.from(logAttended) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setLogError(typeof err?.error === "string" ? err.error : "Failed to log attendance.");
        return;
      }
      const updated = await requestJson<AttendanceDetail>(`/api/attendance/${event.id}`);
      setAttDetail(updated);
      setLogAttOpen(false);
    } catch {
      setLogError("Failed to log attendance. Please try again.");
    } finally {
      setLogSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Top bar: back + edit/delete */}
      <div className="flex items-center justify-between">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-slate-400 transition-all hover:bg-white/[0.06] hover:text-white cursor-pointer"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        {canEdit && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={onEdit}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
              title="Edit event"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            {canDelete && (
              <button
                onClick={onDelete}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
                title="Delete event"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Hero banner */}
      <div className={`relative overflow-hidden rounded-xl border ${m.border}`}>
        <div className={`absolute inset-0 bg-gradient-to-br ${m.heroBg} to-transparent`} />
        <div className={`absolute left-0 top-0 h-full w-[3px] ${m.accentBar}`} />
        <div className="relative px-4 pb-4 pt-3.5">
          {/* Category + mandatory chips */}
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.text} ${m.bg} ring-1 ring-inset ${m.ring}`}>
              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={m.iconPath} />
              </svg>
              {m.label}
            </span>
            {event.mandatory && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/25">
                <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Required
              </span>
            )}
          </div>
          {/* Title */}
          <p className="text-[17px] font-bold leading-snug text-white">{event.title}</p>
          {/* Date */}
          <div className="mt-2.5 flex items-center gap-2">
            <span className={`text-[13px] font-bold tabular-nums ${m.text}`}>{dow} {d} {MONTH_NAMES[mo - 1]}</span>
            <span className="text-[11px] text-slate-500">
              {isToday ? "Today" : isPast ? `${Math.abs(diff)}d ago` : diff === 1 ? "Tomorrow" : `In ${diff}d`}
            </span>
          </div>
        </div>
      </div>

      {/* Meta info — consistent stacked rows */}
      {(event.time || event.location || event.description || isDeadline) && (
        <div className="space-y-1.5">
          {event.time && (
            <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
              <svg className="h-3.5 w-3.5 shrink-0 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-[12px] text-slate-300">{event.time}</span>
            </div>
          )}
          {event.location && (
            <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
              <svg className="h-3.5 w-3.5 shrink-0 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-[12px] text-slate-300">{event.location}</span>
            </div>
          )}
          {event.description && (
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] leading-relaxed text-slate-400">
              {event.description}
            </div>
          )}
          {isDeadline && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-400" />
              <span className="text-[11px] font-semibold text-red-400">Submit by this date</span>
            </div>
          )}
        </div>
      )}

      {/* Attendance — mandatory events only */}
      {event.mandatory && (
        <div className="overflow-hidden rounded-xl border border-white/[0.07]">
          {/* Attendance header */}
          <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
            <p className="text-[11px] font-semibold text-slate-400">Attendance</p>
            {!logAttOpen && !excuseOpen && (
              <div className="flex items-center gap-2">
                {canLogAttendance && (
                  <>
                    <button
                      onClick={openLogAtt}
                      className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      {attDetail?.attended && attDetail.attended.length > 0 ? "Edit" : "Log"}
                    </button>
                    <span className="text-slate-700">·</span>
                  </>
                )}
                <button
                  onClick={() => setExcuseOpen(true)}
                  className="text-[11px] font-medium text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Excuse
                </button>
              </div>
            )}
          </div>

          {/* Attendance summary — vertical stacked list instead of truncating 3-col grid */}
          {!logAttOpen && !excuseOpen && (
            attLoading ? (
              <div className="flex items-center gap-2 px-3 py-3">
                <div className="h-1 w-1 animate-pulse rounded-full bg-slate-600" />
                <p className="text-[11px] text-slate-600">Loading…</p>
              </div>
            ) : !attDetail || (attDetail.excused.length === 0 && attDetail.unexcused.length === 0 && attDetail.attended.length === 0) ? (
              <p className="px-3 py-3 text-[11px] text-slate-600">
                {isPast ? "No attendance recorded." : "No attendance logged yet."}
              </p>
            ) : (
              <div className="divide-y divide-white/[0.04] px-3 py-1">
                {/* Attended */}
                {attDetail.attended.length > 0 && (
                  <div className="py-2.5">
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Attended</span>
                      <span className="ml-auto text-[10px] tabular-nums text-emerald-600">{attDetail.attended.length}</span>
                    </div>
                    <div className="space-y-0.5">
                      {attDetail.attended.map(e => (
                        <p key={e.brotherId} className="text-[11px] text-slate-300">{e.brotherName}</p>
                      ))}
                    </div>
                  </div>
                )}
                {/* Excused */}
                {attDetail.excused.length > 0 && (
                  <div className="py-2.5">
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">Excused</span>
                      <span className="ml-auto text-[10px] tabular-nums text-amber-600">{attDetail.excused.length}</span>
                    </div>
                    <div className="space-y-0.5">
                      {attDetail.excused.map(e => (
                        <p key={e.brotherId} className="text-[11px] text-slate-300" title={e.reason}>{e.brotherName}</p>
                      ))}
                    </div>
                  </div>
                )}
                {/* Unexcused / Absent */}
                {attDetail.unexcused.length > 0 && (
                  <div className="py-2.5">
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">Absent</span>
                      <span className="ml-auto text-[10px] tabular-nums text-red-600">{attDetail.unexcused.length}</span>
                    </div>
                    <div className="space-y-0.5">
                      {attDetail.unexcused.map(e => (
                        <p key={e.brotherId} className="text-[11px] text-slate-300">{e.brotherName}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          )}

          {/* Log attendance inline form */}
          {logAttOpen && (() => {
            const excusedIds = new Set((attDetail?.excused ?? []).map(e => e.brotherId));
            const eligible   = brotherList.filter(b => !excusedIds.has(b.id));
            const excused    = brotherList.filter(b => excusedIds.has(b.id));
            return (
              <form onSubmit={submitLogAtt} className="px-3 py-3 space-y-2.5">
                <p className="text-[11px] font-semibold text-slate-400">Mark who attended</p>
                <div className="max-h-44 overflow-y-auto space-y-0.5 rounded-lg border border-white/[0.07] bg-[#0a0d14] p-1.5">
                  {eligible.map(b => (
                    <label key={b.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-white/[0.05] transition-colors">
                      <input
                        type="checkbox"
                        checked={logAttended.has(b.id)}
                        onChange={() => setLogAttended(prev => { const n = new Set(prev); n.has(b.id) ? n.delete(b.id) : n.add(b.id); return n; })}
                        className="h-3.5 w-3.5 rounded border-white/20 bg-transparent text-indigo-500 focus:ring-indigo-500/30"
                      />
                      <span className="flex-1 text-[12px] text-slate-200">{b.name}</span>
                    </label>
                  ))}
                  {excused.map(b => (
                    <div key={b.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 opacity-35">
                      <input type="checkbox" disabled className="h-3.5 w-3.5 rounded border-white/20 bg-transparent" />
                      <span className="flex-1 text-[12px] text-slate-400">{b.name}</span>
                      <span className="text-[10px] text-amber-500">excused</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-600">
                  {logAttended.size} attending · {eligible.length - logAttended.size} absent
                  {excused.length > 0 && ` · ${excused.length} excused`}
                </p>
                {logError && <p className="text-[11px] text-red-400">{logError}</p>}
                <div className="flex gap-2">
                  <button type="submit" disabled={logSubmitting}
                    className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                    {logSubmitting ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => setLogAttOpen(false)}
                    className="rounded-lg border border-white/[0.08] px-3 py-2 text-[12px] text-slate-500 hover:text-slate-300 transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            );
          })()}

          {/* Excuse inline form */}
          {excuseOpen && (
            <form onSubmit={submitExcuse} className="px-3 py-3 space-y-2.5">
              <p className="text-[11px] font-semibold text-slate-400">
                {canLogAttendance
                  ? isPast && attDetail && attDetail.unexcused.length > 0 ? "Retroactive excuse" : "Submit excuse"
                  : "Submit excuse for yourself"}
              </p>
              {canLogAttendance ? (
                <div>
                  <select className={inputCls} value={excuseBrother} onChange={e => setExcuseBrother(e.target.value)} required>
                    <option value="">Select brother…</option>
                    {brotherList.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              ) : (
                // Member self-excuse: brotherId is forced server-side; hint who it's for.
                <p className="text-[11px] text-slate-500">
                  {brotherList.find(b => b.id === selfBrotherId)?.name ?? "You"}
                </p>
              )}
              <div>
                <input className={inputCls} value={excuseReason} onChange={e => setExcuseReason(e.target.value)} placeholder="Reason" required />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={excuseSubmitting}
                  className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                  {excuseSubmitting ? "Saving…" : "Submit"}
                </button>
                <button type="button" onClick={() => setExcuseOpen(false)}
                  className="rounded-lg border border-white/[0.08] px-3 py-2 text-[12px] text-slate-500 hover:text-slate-300 transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {!canEdit && (
        <p className="text-[10px] leading-relaxed text-slate-700">
          Managed from its source list — edit there to update.
        </p>
      )}
    </div>
  );
}

// ─── Right Panel ──────────────────────────────────────────────────────────────

function RightPanel({
  allFiltered, todayRef, selectedEvent, selectedEventCanEdit, onClearEvent, onEditEvent, onDeleteEvent, brotherList,
  isAdmin, selfBrotherId,
}: {
  allFiltered: CalendarEvent[];
  todayRef: React.RefObject<HTMLDivElement | null>;
  selectedEvent: CalendarEvent | null;
  selectedEventCanEdit: boolean;
  onClearEvent: () => void;
  onEditEvent: () => void;
  onDeleteEvent: () => void;
  brotherList: { id: number; name: string }[];
  isAdmin: boolean;
  selfBrotherId: number | null;
}) {
  const todayStr = toDateStr(TODAY.year, TODAY.month, TODAY.day);

  const nowD      = new Date(todayStr + "T12:00:00");
  const daysToSat = 6 - nowD.getDay();
  const eow       = new Date(nowD);
  eow.setDate(nowD.getDate() + daysToSat);
  const eowStr    = `${eow.getFullYear()}-${pad(eow.getMonth() + 1)}-${pad(eow.getDate())}`;

  const urgentCount    = allFiltered.filter(e => e.category === "deadline" && e.date <= todayStr).length;
  const thisWeekCount  = allFiltered.filter(e => e.date > todayStr && e.date <= eowStr).length;
  const mandatoryCount = allFiltered.filter(e => e.mandatory).length;
  const upcomingCount  = allFiltered.filter(e => e.date > todayStr).length;

  const catCounts = (Object.keys(CAT_META) as CalEventCategory[]).map(cat => ({
    cat,
    count: allFiltered.filter(e => e.category === cat).length,
  })).filter(c => c.count > 0);
  const totalCat = catCounts.reduce((s, c) => s + c.count, 0) || 1;

  // Next 3 upcoming events for preview
  const nextEvents = allFiltered
    .filter(e => e.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);

  return (
    <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-l border-white/[0.07] bg-[#07090f]/80 px-4 py-5 lg:flex gap-5">
      {selectedEvent ? (
        <EventDetail
          event={selectedEvent}
          onClose={onClearEvent}
          canEdit={selectedEventCanEdit}
          canDelete={selectedEventCanEdit && isAdmin}
          canLogAttendance={isAdmin}
          onEdit={onEditEvent}
          onDelete={onDeleteEvent}
          brotherList={brotherList}
          selfBrotherId={selfBrotherId}
        />
      ) : (
        <>
          {/* Overdue alert — only show when non-zero */}
          {urgentCount > 0 && (
            <div className="flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5">
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-400" />
              <p className="text-[12px] font-semibold text-red-300">
                {urgentCount} overdue deadline{urgentCount !== 1 ? "s" : ""}
              </p>
            </div>
          )}

          {/* Stats row */}
          <div className="space-y-1.5">
            {[
              { value: thisWeekCount,  label: "This week",  color: "text-amber-400",   dot: "bg-amber-400"   },
              { value: mandatoryCount, label: "Required",   color: "text-emerald-400", dot: "bg-emerald-400" },
              { value: upcomingCount,  label: "Upcoming",   color: "text-slate-300",   dot: "bg-slate-500"   },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2.5 rounded-lg px-1 py-1">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
                <span className="flex-1 text-[11px] text-slate-500">{s.label}</span>
                <span className={`text-[18px] font-black tabular-nums leading-none ${s.color}`}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="h-px bg-white/[0.05]" />

          {/* Category breakdown */}
          {catCounts.length > 0 && (
            <div>
              <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">By Category</p>
              {/* Segmented bar with gaps */}
              <div className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full">
                {catCounts.map(({ cat, count }) => {
                  const m   = CAT_META[cat];
                  const pct = (count / totalCat) * 100;
                  return (
                    <div
                      key={cat}
                      className={`h-full rounded-full ${m.accentBar} transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  );
                })}
              </div>
              {/* Legend */}
              <div className="mt-3 space-y-2">
                {catCounts.map(({ cat, count }) => {
                  const m   = CAT_META[cat];
                  const pct = Math.round((count / totalCat) * 100);
                  return (
                    <div key={cat} className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.dot}`} />
                      <span className="flex-1 text-[11px] text-slate-400">{m.label}</span>
                      <span className="text-[11px] tabular-nums text-slate-500">{count}</span>
                      <span className="w-8 text-right text-[10px] tabular-nums text-slate-700">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="h-px bg-white/[0.05]" />

          {/* Upcoming events preview */}
          {nextEvents.length > 0 && (
            <div>
              <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Up Next</p>
              <div className="space-y-1.5">
                {nextEvents.map(ev => {
                  const m    = CAT_META[ev.category];
                  const diff = daysFromToday(ev.date);
                  const [, mo, d] = ev.date.split("-").map(Number);
                  return (
                    <div
                      key={ev.id}
                      className="flex items-start gap-2.5 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5"
                    >
                      <div className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${m.dot}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold leading-snug text-slate-200">{ev.title}</p>
                        <p className="mt-0.5 text-[10px] text-slate-600">
                          {MONTH_NAMES[mo - 1].slice(0, 3)} {d}
                          {diff === 0 ? " · Today" : diff === 1 ? " · Tomorrow" : ` · ${diff}d`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Jump to today — subtle ghost button */}
          <button
            onClick={() => todayRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/[0.06] py-2 text-[11px] font-medium text-slate-600 transition-all hover:border-indigo-500/25 hover:text-indigo-400"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Jump to today
          </button>
        </>
      )}
    </aside>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TimelinePage() {
  const { currentUser, deadlineList, partyList, brotherList, setBrotherList, avatarRevision } = useChapter();
  const selfId = currentUser?.id ?? null;
  const isAdmin = currentUser?.isAdmin ?? false;

  const [sidebarOpen,     setSidebarOpen]     = useState(false);
  const [activeLayer,     setActiveLayer]     = useState<CalLayer>("all");
  const [selectedEvent,   setSelectedEvent]   = useState<CalendarEvent | null>(null);
  const [apiEvents,       setApiEvents]       = useState<CalendarEvent[]>([]);
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());
  const [activeModal,     setActiveModal]     = useState<"create" | "edit" | null>(null);
  const [calendarLoading,      setCalendarLoading]      = useState(true);
  const [calendarError,        setCalendarError]        = useState<string | null>(null);
  const [confirmDeleteEvent,   setConfirmDeleteEvent]   = useState<CalendarEvent | null>(null);

  // Pending-excuse review queue (admin-only)
  const [pendingExcuses, setPendingExcuses] = useState<PendingExcuse[]>([]);
  const [reviewPanelOpen, setReviewPanelOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [excuseActionBusy, setExcuseActionBusy] = useState<number | null>(null);

  const todayRef         = useRef<HTMLDivElement | null>(null);
  const currentMonthRef  = useRef<HTMLDivElement | null>(null);
  const feedRef          = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    requestJson<CalendarEvent[]>("/api/calendar")
      .then(data => { setApiEvents(data); setCalendarError(null); })
      .catch(error => { console.error(error); setCalendarError("Could not load calendar events from the database."); })
      .finally(() => setCalendarLoading(false));
  }, []);

  // Admin-only: load pending excuses for the review banner.
  useEffect(() => {
    if (!isAdmin) { setPendingExcuses([]); return; }
    requestJson<PendingExcuse[]>("/api/excuses?status=pending")
      .then(setPendingExcuses)
      .catch(() => {});
  }, [isAdmin]);

  async function decideExcuse(excuseId: number, action: "approve" | "reject", note?: string) {
    setExcuseActionBusy(excuseId);
    const target = pendingExcuses.find(e => e.id === excuseId);
    try {
      const result = await requestJson<{ brotherId: number; attendance: number | null }>(`/api/excuses/${excuseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rejectionNote: note }),
      });
      setPendingExcuses(prev => prev.filter(e => e.id !== excuseId));
      setRejectingId(null);
      setRejectionNote("");
      // Approval recalculates attendance — push the fresh % into the chapter context.
      if (action === "approve" && target && result.attendance !== null) {
        setBrotherList(prev => prev.map(b => b.id === target.brotherId ? { ...b, attendance: result.attendance ?? b.attendance } : b));
      }
    } catch (err) {
      console.error("decideExcuse failed", err);
      // Race condition (e.g. member resubmitted before admin clicked) — resync the queue from the server.
      setRejectingId(null);
      setRejectionNote("");
      requestJson<PendingExcuse[]>("/api/excuses?status=pending").then(setPendingExcuses).catch(() => {});
    } finally {
      setExcuseActionBusy(null);
    }
  }

  const didScrollToToday = useRef(false);
  useLayoutEffect(() => {
    // Only scroll once, and only after the API load is complete (so all events are in the DOM)
    if (didScrollToToday.current || calendarLoading) return;
    const feed   = feedRef.current;
    // Prefer the today-anchor event; fall back to the current-month divider if present.
    const target = todayRef.current ?? currentMonthRef.current;
    if (!feed || !target) return;
    didScrollToToday.current = true;
    const targetTop = target.getBoundingClientRect().top;
    const feedTop   = feed.getBoundingClientRect().top;
    feed.scrollTop  = feed.scrollTop + (targetTop - feedTop);
  }, [calendarLoading]);


  const apiEventIds = useMemo(() => new Set(apiEvents.map(e => e.id)), [apiEvents]);

  const allEvents = useMemo<CalendarEvent[]>(() => {
    const live: CalendarEvent[] = [
      ...deadlineList.map(d => ({
        id:          10000 + d.id,
        title:       d.title,
        date:        d.dueDate,
        category:    "deadline" as CalEventCategory,
        mandatory:   d.status === "Urgent" || d.status === "Due Soon",
        description: `Owner: ${d.owner} · Status: ${d.status}`,
      })),
      ...partyList.map(p => ({
        id:          20000 + p.id,
        title:       p.name,
        date:        p.date,
        category:    "party" as CalEventCategory,
        mandatory:   false,
        description: p.notes,
      })),
    ];

    const liveDeadlineTitles = new Set(deadlineList.map(d => d.title));
    const livePartyTitles    = new Set(partyList.map(p => p.name));

    const deduped = apiEvents.filter(e => {
      if (e.category === "deadline") return !liveDeadlineTitles.has(e.title);
      if (e.category === "party")    return !livePartyTitles.has(e.title);
      return true;
    });

    return [...deduped, ...live];
  }, [apiEvents, deadlineList, partyList]);

  const filtered    = useMemo(() => filterByLayer(allEvents, activeLayer), [allEvents, activeLayer]);
  const monthGroups = useMemo(() => buildMonthGroups(filtered), [filtered]);
  const layerCounts = useMemo(
    () => Object.fromEntries(LAYERS.map(l => [l.id, filterByLayer(allEvents, l.id).length])),
    [allEvents],
  );
  const selectedEventCanEdit = selectedEvent ? apiEventIds.has(selectedEvent.id) : false;

  const todayStr = toDateStr(TODAY.year, TODAY.month, TODAY.day);

  // The first event on or after today — the chronological "now" anchor we scroll to on load.
  const todayAnchorId = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => a.date.localeCompare(b.date));
    const upcoming = sorted.find(e => e.date >= todayStr);
    return upcoming ? upcoming.id : sorted.length > 0 ? sorted[sorted.length - 1].id : null;
  }, [filtered, todayStr]);

  function toggleMonth(id: string) {
    setCollapsedMonths(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleCreateEvent(draft: CalendarDraft) {
    const tempId = -Date.now();
    const optimistic: CalendarEvent = { id: tempId, ...draft };
    setApiEvents(prev => [...prev, optimistic]);
    setSelectedEvent(optimistic);
    setActiveModal(null);
    setCalendarError(null);

    // Service events get a backing ServiceEvent row so they also surface on the
    // Service page — route through /api/service-events. Everything else goes
    // directly to /api/calendar. The service-events POST returns
    // `{ ...serviceEvent, calendarEvent }`; we only need the linked calendar
    // row to update the timeline's local list.
    const isService = draft.category === "service";
    const promise = isService
      ? requestJson<{ calendarEvent: CalendarEvent }>("/api/service-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        }).then(res => res.calendarEvent)
      : requestJson<CalendarEvent>("/api/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });

    promise
      .then(saved => { setApiEvents(prev => prev.map(e => e.id === tempId ? saved : e)); setSelectedEvent(saved); })
      .catch(error => {
        console.error(error);
        setApiEvents(prev => prev.filter(e => e.id !== tempId));
        setSelectedEvent(null);
        setCalendarError("Calendar event could not be saved. Local changes were reverted.");
      });
  }

  function handleUpdateEvent(draft: CalendarDraft) {
    if (!selectedEvent || !selectedEventCanEdit) return;
    const previous = apiEvents.find(e => e.id === selectedEvent.id);
    if (!previous) return;
    const optimistic: CalendarEvent = { ...previous, ...draft };
    setApiEvents(prev => prev.map(e => e.id === previous.id ? optimistic : e));
    setSelectedEvent(optimistic);
    setActiveModal(null);
    setCalendarError(null);
    requestJson<CalendarEvent>(`/api/calendar/${previous.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    })
      .then(saved => { setApiEvents(prev => prev.map(e => e.id === previous.id ? saved : e)); setSelectedEvent(saved); })
      .catch(error => {
        console.error(error);
        setApiEvents(prev => prev.map(e => e.id === previous.id ? previous : e));
        setSelectedEvent(previous);
        setCalendarError("Calendar event update failed. Local changes were reverted.");
      });
  }

  function handleDeleteEvent() {
    if (!selectedEvent || !selectedEventCanEdit) return;
    setConfirmDeleteEvent(selectedEvent);
  }

  function executeDeleteEvent(event: CalendarEvent) {
    const previous = apiEvents.find(e => e.id === event.id);
    if (!previous) return;
    setApiEvents(prev => prev.filter(e => e.id !== previous.id));
    setSelectedEvent(null);
    setCalendarError(null);
    requestJson<void>(`/api/calendar/${previous.id}`, { method: "DELETE" })
      .catch(error => {
        console.error(error);
        setApiEvents(prev => [...prev, previous].sort((a, b) => a.id - b.id));
        setSelectedEvent(previous);
        setCalendarError("Calendar event delete failed. Local changes were reverted.");
      });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#07090f]">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeSection="Timeline"
        onNavClick={() => {}}
      />

      <div className="flex flex-1 flex-col overflow-hidden">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <header className="toolbar-frosted relative z-10 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.05] px-4 sm:px-6">

          {/* Mobile menu */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.07] lg:hidden"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Title */}
          <div className="relative min-w-0 shrink-0">
            <p className="text-[14px] font-semibold leading-tight text-white">Timeline</p>
            <p className="hidden text-[11px] leading-tight text-slate-400 sm:block">{currentUser?.org?.name ?? "ChaptOS"} · Chapter Timeline</p>
          </div>

          {/* Layer filter pills — centered on desktop, hidden on mobile (shown below) */}
          <div className="hidden flex-1 items-center justify-center gap-1.5 lg:flex">
            {LAYERS.map(layer => {
              const active = activeLayer === layer.id;
              const count  = layerCounts[layer.id] ?? 0;
              return (
                <button
                  key={layer.id}
                  onClick={() => setActiveLayer(layer.id)}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-semibold transition-all duration-150 ${
                    active
                      ? layer.activeClasses
                      : "border-transparent text-slate-500 hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-slate-300"
                  }`}
                >
                  <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={layer.iconPath} />
                  </svg>
                  {layer.label}
                  <span className={`rounded-full px-1.5 py-px text-[9px] font-bold tabular-nums ${
                    active ? "bg-white/[0.2] text-white" : "bg-white/[0.05] text-slate-600"
                  }`}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Right: + Event button + avatar */}
          <div className="relative ml-auto flex items-center gap-2">
            <button
              onClick={() => setActiveModal("create")}
              className={headerActionBtnCls}
            >
              <svg className="h-3.5 w-3.5 shrink-0 text-indigo-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Add Event</span>
            </button>
            <UserAvatar />
          </div>
        </header>

        {/* Mobile layer pills strip */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-white/[0.05] bg-[#07090f] px-4 py-2 lg:hidden">
          {LAYERS.map(layer => {
            const active = activeLayer === layer.id;
            const count  = filterByLayer(allEvents, layer.id).length;
            return (
              <button
                key={layer.id}
                onClick={() => setActiveLayer(layer.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-all duration-150 ${
                  active
                    ? layer.activeClasses
                    : "border-transparent text-slate-500 hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-slate-300"
                }`}
              >
                {layer.label}
                <span className={`rounded-full px-1.5 py-px text-[9px] font-bold tabular-nums ${
                  active ? "bg-white/[0.2] text-white" : "bg-white/[0.05] text-slate-600"
                }`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* ── Body ──────────────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Timeline feed */}
          <div ref={feedRef} className="flex-1 overflow-y-auto px-6 py-6">
            {isAdmin && pendingExcuses.length > 0 && (
              <div className="mx-auto mb-5 max-w-2xl rounded-xl border border-amber-500/25 bg-amber-500/[0.06]">
                <button
                  onClick={() => setReviewPanelOpen(o => !o)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[12px] text-amber-100 transition-colors hover:bg-amber-500/[0.08]"
                >
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" />
                    </svg>
                    <span className="font-semibold">{pendingExcuses.length} excuse{pendingExcuses.length === 1 ? "" : "s"} awaiting review</span>
                  </span>
                  <span className="rounded-md border border-amber-400/30 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                    {reviewPanelOpen ? "Hide" : "Review"}
                  </span>
                </button>
                {reviewPanelOpen && (
                  <div className="space-y-2 border-t border-amber-500/20 px-3 py-3">
                    {pendingExcuses.map(ex => {
                      const isRejecting = rejectingId === ex.id;
                      const busy = excuseActionBusy === ex.id;
                      const brother = brotherList.find(b => b.id === ex.brotherId);
                      return (
                        <div key={ex.id} className="rounded-lg border border-white/[0.06] bg-[#10121a] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                {brother && (
                                  <BrotherAvatar
                                    brother={brother}
                                    selfId={selfId}
                                    selfAvatarUrl={currentUser?.avatarUrl}
                                    avatarRevision={avatarRevision}
                                    size="xs"
                                  />
                                )}
                                <p className="text-[13px] font-semibold text-white">{ex.brotherName}</p>
                              </div>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                {ex.eventTitle} · {ex.eventDate}
                                {ex.isRetroactive && <span className="ml-1 text-amber-400">· retroactive</span>}
                              </p>
                              <p className="mt-2 text-[12px] leading-relaxed text-slate-300">{ex.reason}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <button
                                onClick={() => decideExcuse(ex.id, "approve")}
                                disabled={busy}
                                className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => { setRejectingId(isRejecting ? null : ex.id); setRejectionNote(""); }}
                                disabled={busy}
                                className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                              >
                                {isRejecting ? "Cancel" : "Reject"}
                              </button>
                            </div>
                          </div>
                          {isRejecting && (
                            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                              <input
                                type="text"
                                value={rejectionNote}
                                onChange={e => setRejectionNote(e.target.value)}
                                placeholder="Optional note for the brother…"
                                className="flex-1 rounded-md border border-white/[0.08] bg-[#0a0d14] px-2.5 py-1.5 text-[12px] text-white placeholder:text-slate-600 focus:border-red-500/60 focus:outline-none"
                              />
                              <button
                                onClick={() => decideExcuse(ex.id, "reject", rejectionNote.trim() || undefined)}
                                disabled={busy}
                                className="rounded-md bg-red-500/80 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                              >
                                Confirm reject
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {(calendarLoading || calendarError) && (
              <div className={`mx-auto mb-5 flex max-w-2xl items-center justify-between gap-3 rounded-xl border px-4 py-3 text-[12px] ${
                calendarError
                  ? "border-red-500/25 bg-red-500/10 text-red-200"
                  : "border-indigo-500/20 bg-indigo-500/10 text-indigo-200"
              }`}>
                <span>{calendarError ?? "Loading calendar events from the database..."}</span>
                {calendarError && (
                  <button onClick={() => setCalendarError(null)} className="rounded-lg border border-red-300/20 px-2.5 py-1 font-semibold text-red-100 hover:bg-red-500/15">
                    Dismiss
                  </button>
                )}
              </div>
            )}

            {calendarLoading && monthGroups.length === 0 ? (
              <div className="mx-auto max-w-2xl space-y-5">
                {[...Array(2)].map((_, monthIdx) => (
                  <div key={monthIdx} className="space-y-3">
                    <div className="h-4 w-32 rounded bg-white/[0.05] animate-pulse" />
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-[#10121a] px-4 py-4 animate-pulse">
                        <div className="h-10 w-10 shrink-0 rounded-lg bg-white/[0.05]" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="h-3 w-48 rounded bg-white/[0.05]" />
                          <div className="h-2.5 w-28 rounded bg-white/[0.05]" />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : monthGroups.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-24 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                  <svg className="h-6 w-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-[14px] font-semibold text-slate-500">No events on this filter</p>
                <button
                  onClick={() => setActiveLayer("all")}
                  className="cursor-pointer text-[12px] text-indigo-500 transition-colors hover:text-indigo-400"
                >
                  Show all events →
                </button>
              </div>
            ) : (
              <div className="mx-auto max-w-2xl">
                {monthGroups.map(group => {
                  const isCollapsed = collapsedMonths.has(group.id);

                  // Find if today marker should appear inside this month group
                  let todayMarkerIndex = -1;
                  if (group.isCurrentMonth && !isCollapsed) {
                    const firstFutureIdx = group.events.findIndex(e => e.date >= todayStr);
                    if (firstFutureIdx > 0) todayMarkerIndex = firstFutureIdx;
                  }

                  return (
                    <div
                      key={group.id}
                      ref={group.isCurrentMonth ? (el => { currentMonthRef.current = el; }) : undefined}
                      className="mb-8"
                    >
                      <MonthDivider
                        group={group}
                        collapsed={isCollapsed}
                        onToggle={() => toggleMonth(group.id)}
                      />

                      {!isCollapsed && (
                        <div className="space-y-0">
                          {group.isCurrentMonth && !group.events.some(e => e.date >= todayStr) && (
                            <TodayMarker />
                          )}
                          {group.events.map((e, i) => (
                            <div
                              key={e.id}
                              ref={e.id === todayAnchorId ? (el => { todayRef.current = el; }) : undefined}
                            >
                              <EventCard
                                event={e}
                                onSelect={setSelectedEvent}
                                selected={selectedEvent?.id === e.id}
                                showTodayMarkerBefore={i === todayMarkerIndex}
                              />
                            </div>
                          ))}
                          {group.isCurrentMonth && group.events.length === 0 && (
                            <TodayMarker />
                          )}
                        </div>
                      )}

                      {isCollapsed && (
                        <div className="flex items-center gap-2 rounded-xl border border-white/[0.04] bg-white/[0.01] px-4 py-2.5">
                          <span className="text-[11px] text-slate-600">{group.events.length} event{group.events.length !== 1 ? "s" : ""} hidden</span>
                          <button
                            onClick={() => toggleMonth(group.id)}
                            className="cursor-pointer text-[11px] text-indigo-600 transition-colors hover:text-indigo-400"
                          >
                            Show →
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="h-12" />
              </div>
            )}
          </div>

          {/* Right panel */}
          <RightPanel
            allFiltered={filtered}
            todayRef={todayRef}
            selectedEvent={selectedEvent}
            selectedEventCanEdit={selectedEventCanEdit}
            onClearEvent={() => setSelectedEvent(null)}
            onEditEvent={() => setActiveModal("edit")}
            onDeleteEvent={handleDeleteEvent}
            brotherList={brotherList}
            isAdmin={isAdmin}
            selfBrotherId={currentUser?.id ?? null}
          />
        </div>
      </div>

      {activeModal === "create" && (
        <Modal title="Add Calendar Event" onClose={() => setActiveModal(null)}>
          <CalendarEventForm submitLabel="Add Event" onSubmit={handleCreateEvent} />
        </Modal>
      )}
      {activeModal === "edit" && selectedEvent && selectedEventCanEdit && (
        <Modal title="Edit Calendar Event" onClose={() => setActiveModal(null)}>
          <CalendarEventForm initialEvent={selectedEvent} submitLabel="Save Event" onSubmit={handleUpdateEvent} />
        </Modal>
      )}
      {confirmDeleteEvent && (
        <ConfirmDialog
          title="Delete Event"
          message={<>Delete <span className="font-semibold text-white">{confirmDeleteEvent.title}</span>? This cannot be undone.</>}
          onCancel={() => setConfirmDeleteEvent(null)}
          onConfirm={() => { executeDeleteEvent(confirmDeleteEvent); setConfirmDeleteEvent(null); }}
        />
      )}
    </div>
  );
}
