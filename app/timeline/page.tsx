"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Sidebar } from "../components/Sidebar";
import { CalendarEvent, CalEventCategory, CalLayer } from "../data";
import { useChapter } from "../context/ChapterContext";
import { FieldLabel, Modal } from "../components/dashboard/primitives";
import { inputCls } from "../components/dashboard/styles";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const _now = new Date();
const TODAY = { year: _now.getFullYear(), month: _now.getMonth(), day: _now.getDate() };

type CalendarDraft = Omit<CalendarEvent, "id">;

const LAYERS: { id: CalLayer; label: string; accent: string; activeClasses: string; iconPath: string }[] = [
  {
    id: "all",
    label: "All",
    accent: "text-white",
    activeClasses: "border-white/20 bg-white/[0.08] text-white shadow-sm",
    iconPath: "M4 6h16M4 10h16M4 14h16M4 18h16",
  },
  {
    id: "mandatory",
    label: "Mandatory",
    accent: "text-emerald-400",
    activeClasses: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 shadow-sm shadow-emerald-900/20",
    iconPath: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    id: "deadlines",
    label: "Deadlines",
    accent: "text-red-400",
    activeClasses: "border-red-500/40 bg-red-500/10 text-red-300 shadow-sm shadow-red-900/20",
    iconPath: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    id: "parties",
    label: "Parties",
    accent: "text-indigo-400",
    activeClasses: "border-indigo-500/40 bg-indigo-500/10 text-indigo-300 shadow-sm shadow-indigo-900/20",
    iconPath: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
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
    iconPath: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  },
};

const CATEGORY_OPTIONS: { id: CalEventCategory; label: string }[] = [
  { id: "chapter", label: "Chapter" },
  { id: "social", label: "Social" },
  { id: "fundy", label: "Fundraiser" },
  { id: "program", label: "Program" },
  { id: "party", label: "Party" },
  { id: "deadline", label: "Deadline" },
];

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = typeof body?.error === "string" ? `: ${body.error}` : "";
    } catch {
      // Fall back to status code when the API does not return JSON.
    }
    throw new Error(`${url} returned ${response.status}${detail}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, "0"); }

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function filterByLayer(events: CalendarEvent[], layer: CalLayer): CalendarEvent[] {
  switch (layer) {
    case "all":       return events;
    case "mandatory": return events.filter(e => e.mandatory);
    case "deadlines": return events.filter(e => e.category === "deadline");
    case "parties":   return events.filter(e => e.category === "party");
  }
}

function fmtDow(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
}

function daysFromToday(dateStr: string): number {
  const todayStr = toDateStr(TODAY.year, TODAY.month, TODAY.day);
  const a = new Date(todayStr + "T12:00:00");
  const b = new Date(dateStr + "T12:00:00");
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function optionalValue(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function CalendarEventForm({
  initialEvent,
  submitLabel,
  onSubmit,
}: {
  initialEvent?: CalendarEvent;
  submitLabel: string;
  onSubmit: (draft: CalendarDraft) => void;
}) {
  const [title, setTitle] = useState(initialEvent?.title ?? "");
  const [date, setDate] = useState(initialEvent?.date ?? toDateStr(TODAY.year, TODAY.month, TODAY.day));
  const [time, setTime] = useState(initialEvent?.time ?? "");
  const [category, setCategory] = useState<CalEventCategory>(initialEvent?.category ?? "chapter");
  const [mandatory, setMandatory] = useState(initialEvent?.mandatory ?? false);
  const [location, setLocation] = useState(initialEvent?.location ?? "");
  const [description, setDescription] = useState(initialEvent?.description ?? "");
  const categoryOptions = CATEGORY_OPTIONS.filter(option =>
    option.id !== "deadline" && option.id !== "party" || option.id === initialEvent?.category
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      title: title.trim(),
      date,
      time: optionalValue(time),
      category,
      mandatory,
      location: optionalValue(location),
      description: optionalValue(description),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <FieldLabel>Title</FieldLabel>
        <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Chapter meeting..." required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Date</FieldLabel>
          <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} required />
        </div>
        <div>
          <FieldLabel>Time</FieldLabel>
          <input className={inputCls} value={time} onChange={e => setTime(e.target.value)} placeholder="7:00 PM" />
        </div>
      </div>
      <div>
        <FieldLabel>Category</FieldLabel>
        <select className={inputCls} value={category} onChange={e => setCategory(e.target.value as CalEventCategory)}>
          {categoryOptions.map(option => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
        <p className="mt-1 text-[10px] text-slate-600">Deadlines and parties are managed from their dashboard lists.</p>
      </div>
      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[12px] text-slate-300">
        <input type="checkbox" checked={mandatory} onChange={e => setMandatory(e.target.checked)} className="h-4 w-4 rounded border-white/[0.12] bg-[#0a0d14] accent-indigo-500" />
        Required attendance
      </label>
      <div>
        <FieldLabel>Location</FieldLabel>
        <input className={inputCls} value={location} onChange={e => setLocation(e.target.value)} placeholder="Chapter Room" />
      </div>
      <div>
        <FieldLabel>Description</FieldLabel>
        <textarea className={`${inputCls} min-h-20 resize-none`} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional notes..." />
      </div>
      <button type="submit" className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-500">
        {submitLabel}
      </button>
    </form>
  );
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
  const todayStr = toDateStr(TODAY.year, TODAY.month, TODAY.day);
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

  // Sort: past months first, then current, then future — but highlight current
  return Object.values(map).sort((a, b) => a.id.localeCompare(b.id));
}

// ─── EventCard ────────────────────────────────────────────────────────────────

function EventCard({
  event, onSelect, selected, isLast,
}: {
  event: CalendarEvent;
  onSelect: (e: CalendarEvent) => void;
  selected: boolean;
  isLast: boolean;
}) {
  const m          = CAT_META[event.category];
  const todayStr   = toDateStr(TODAY.year, TODAY.month, TODAY.day);
  const isPast     = event.date < todayStr;
  const isToday    = event.date === todayStr;
  const isDeadline = event.category === "deadline";
  const isMandatory = event.mandatory;
  const [, mo, d]  = event.date.split("-").map(Number);
  const dow        = fmtDow(event.date);
  const diff       = daysFromToday(event.date);

  const relLabel = isToday
    ? "Today"
    : diff === 1
    ? "Tomorrow"
    : diff === -1
    ? "Yesterday"
    : diff > 0
    ? `In ${diff}d`
    : `${Math.abs(diff)}d ago`;

  return (
    <div className="flex gap-4">
      {/* Timeline spine + dot */}
      <div className="flex flex-col items-center">
        <div
          className={`mt-4 flex h-3 w-3 shrink-0 items-center justify-center rounded-full shadow-md transition-all duration-300 ${
            selected
              ? `${m.dot} ${m.dotGlow} ring-2 ring-offset-1 ring-offset-[#0d1117] ring-white/20 scale-125`
              : isToday
              ? `${m.dot} ${m.dotGlow} ring-2 ring-offset-1 ring-offset-[#0d1117] ring-white/10 animate-pulse`
              : isPast
              ? "bg-white/[0.08]"
              : `${m.dot} opacity-75`
          }`}
        />
        {!isLast && (
          <div className="mt-1.5 w-px flex-1 bg-gradient-to-b from-white/[0.08] to-transparent" style={{ minHeight: "2rem" }} />
        )}
      </div>

      {/* Card */}
      <div
        onClick={() => onSelect(event)}
        className={`mb-3 flex-1 cursor-pointer rounded-xl border transition-all duration-200 overflow-hidden ${
          selected
            ? `${m.border} ${m.cardBg} shadow-lg`
            : isPast
            ? "border-white/[0.04] bg-white/[0.01] hover:border-white/[0.08] hover:bg-white/[0.03]"
            : `border-white/[0.07] bg-[#161b27] hover:border-white/[0.12] hover:bg-[#1a2033] hover:shadow-md`
        }`}
      >
        {/* Color accent bar */}
        <div className={`h-[2px] ${m.dot} ${isPast ? "opacity-20" : "opacity-60"}`} />

        <div className="flex items-start gap-3 px-4 py-3">
          {/* Date mini-block */}
          <div className={`flex w-11 shrink-0 flex-col items-center rounded-lg border py-2 text-center transition-colors ${
            isToday
              ? `${m.border} ${m.bg}`
              : isPast
              ? "border-white/[0.04] bg-white/[0.01]"
              : "border-white/[0.06] bg-white/[0.02]"
          }`}>
            <span className={`text-[9px] font-bold uppercase tracking-widest ${isToday ? m.text : "text-slate-600"}`}>{dow}</span>
            <span className={`text-[18px] font-bold leading-none tabular-nums ${isPast ? "text-slate-600" : isToday ? m.text : "text-slate-200"}`}>{d}</span>
            <span className={`text-[9px] ${isPast ? "text-slate-700" : "text-slate-500"}`}>{MONTH_NAMES[mo - 1].slice(0, 3)}</span>
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className={`text-[13px] font-semibold leading-tight ${isPast ? "text-slate-500" : "text-white"}`}>
                {event.title}
              </p>
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold tabular-nums ${
                isToday
                  ? `${m.bg} ${m.text}`
                  : diff > 0 && diff <= 3
                  ? "bg-amber-500/15 text-amber-400"
                  : isPast
                  ? "bg-white/[0.04] text-slate-600"
                  : "bg-white/[0.04] text-slate-500"
              }`}>
                {relLabel}
              </span>
            </div>

            <div className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] ${isPast ? "text-slate-600" : "text-slate-400"}`}>
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
              {!event.location && event.description && (
                <span className="truncate max-w-[220px]">{event.description}</span>
              )}
            </div>

            {/* Badges row */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${m.text} ${m.bg} ${m.ring}`}>
                <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={m.iconPath} />
                </svg>
                {m.label}
              </span>
              {isMandatory && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/25">
                  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Required
                </span>
              )}
              {isDeadline && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400 ring-1 ring-inset ring-red-500/25">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
                  Deadline
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
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
      className="mb-4 flex w-full cursor-pointer items-center gap-3 text-left"
    >
      {/* Spine top cap */}
      <div className="flex w-3 shrink-0 flex-col items-center">
        <div className={`h-3 w-3 rounded-sm transition-colors ${group.isCurrentMonth ? "bg-indigo-500" : "bg-white/[0.06]"}`} />
      </div>
      <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 transition-all ${
        group.isCurrentMonth
          ? "border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/15"
          : "border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04]"
      }`}>
        <span className={`text-[12px] font-bold tracking-wide ${group.isCurrentMonth ? "text-indigo-300" : "text-slate-400"}`}>
          {group.monthLabel}
        </span>
        <span className={`text-[12px] ${group.isCurrentMonth ? "text-indigo-500" : "text-slate-600"}`}>
          {group.year}
        </span>
        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold tabular-nums ${
          group.isCurrentMonth
            ? "bg-indigo-500/20 text-indigo-400"
            : "bg-white/[0.04] text-slate-600"
        }`}>
          {group.events.length}
        </span>
        {group.isCurrentMonth && (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-bold text-indigo-300">
            <span className="h-1 w-1 animate-pulse rounded-full bg-indigo-400" />
            Now
          </span>
        )}
        {/* Chevron */}
        <svg
          className={`ml-0.5 h-3 w-3 shrink-0 transition-transform duration-200 ${
            collapsed
              ? group.isCurrentMonth ? "text-indigo-500 -rotate-90" : "text-slate-600 -rotate-90"
              : group.isCurrentMonth ? "text-indigo-500" : "text-slate-600"
          }`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      <div className="flex-1 border-t border-white/[0.05]" />
    </button>
  );
}

// ─── EventDetail ──────────────────────────────────────────────────────────────

function EventDetail({
  event,
  onClose,
  canEdit,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent;
  onClose: () => void;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const m          = CAT_META[event.category];
  const isDeadline = event.category === "deadline";
  const todayStr   = toDateStr(TODAY.year, TODAY.month, TODAY.day);
  const isPast     = event.date < todayStr;
  const isToday    = event.date === todayStr;
  const [, mo, d]  = event.date.split("-").map(Number);
  const dow        = fmtDow(event.date);
  const diff       = daysFromToday(event.date);

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={onClose}
        className="flex items-center gap-1.5 self-start rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-slate-500 transition-all hover:bg-white/[0.06] hover:text-slate-300 cursor-pointer"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      {/* Hero date card */}
      <div className={`rounded-xl border ${m.border} ${m.bg} p-4`}>
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center rounded-xl border border-white/[0.1] bg-[#0d1117]/80 px-3 py-2.5 text-center shrink-0 min-w-[52px]">
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{dow}</span>
            <span className={`text-[32px] font-bold leading-none tabular-nums ${m.text}`}>{d}</span>
            <span className="text-[10px] text-slate-500">{MONTH_NAMES[mo - 1]}</span>
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-[15px] font-bold leading-tight text-white">{event.title}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${m.text} ${m.bg} ${m.ring}`}>
                {m.label}
              </span>
              {!isPast && !isToday && diff > 0 && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  diff <= 3 ? "bg-amber-500/15 text-amber-400" : "bg-white/[0.05] text-slate-400"
                }`}>
                  {diff === 1 ? "Tomorrow" : `In ${diff} days`}
                </span>
              )}
              {isToday && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.bg} ${m.text}`}>
                  <span className="h-1 w-1 animate-pulse rounded-full bg-current" />
                  Today
                </span>
              )}
              {isPast && (
                <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-500">
                  {Math.abs(diff)} days ago
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.07] overflow-hidden">
        {event.time && (
          <div className="flex items-center gap-3 px-4 py-3">
            <svg className="h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-[12px] text-slate-300">{event.time}</span>
          </div>
        )}
        {event.location && (
          <div className="flex items-center gap-3 px-4 py-3">
            <svg className="h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[12px] text-slate-300">{event.location}</span>
          </div>
        )}
        {event.description && (
          <div className="flex items-start gap-3 px-4 py-3">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-[12px] leading-relaxed text-slate-400">{event.description}</span>
          </div>
        )}
      </div>

      {/* Requirement badges */}
      <div className="flex flex-wrap gap-2">
        {event.mandatory && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1.5 text-[11px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/25">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Required Attendance
          </span>
        )}
        {isDeadline && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1.5 text-[11px] font-semibold text-red-400 ring-1 ring-inset ring-red-500/25">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
            Submit by deadline
          </span>
        )}
      </div>

      {canEdit ? (
        <div className="flex gap-2 border-t border-white/[0.06] pt-4">
          <button onClick={onEdit} className="flex-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-[12px] font-semibold text-indigo-300 transition-colors hover:bg-indigo-500/15">
            Edit event
          </button>
          <button onClick={onDelete} className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] font-semibold text-red-300 transition-colors hover:bg-red-500/15">
            Delete
          </button>
        </div>
      ) : (
        <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] leading-relaxed text-slate-500">
          This event is derived from dashboard data. Manage it from its source list.
        </p>
      )}
    </div>
  );
}

// ─── Right Panel ──────────────────────────────────────────────────────────────

function RightPanel({
  allFiltered, todayRef, selectedEvent, selectedEventCanEdit, onClearEvent, onEditEvent, onDeleteEvent,
}: {
  allFiltered: CalendarEvent[];
  todayRef: React.RefObject<HTMLDivElement | null>;
  selectedEvent: CalendarEvent | null;
  selectedEventCanEdit: boolean;
  onClearEvent: () => void;
  onEditEvent: () => void;
  onDeleteEvent: () => void;
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
  const maxCount = Math.max(...catCounts.map(c => c.count), 1);

  return (
    <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-l border-white/[0.07] px-4 py-5 lg:flex gap-4">
      {selectedEvent ? (
        <EventDetail
          event={selectedEvent}
          onClose={onClearEvent}
          canEdit={selectedEventCanEdit}
          onEdit={onEditEvent}
          onDelete={onDeleteEvent}
        />
      ) : (
        <>
          {/* Stat grid */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: urgentCount,    label: "Overdue",    color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20"     },
              { value: thisWeekCount,  label: "This Week",  color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20"   },
              { value: mandatoryCount, label: "Required",   color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
              { value: upcomingCount,  label: "Upcoming",   color: "text-slate-300",   bg: "bg-white/[0.03]",   border: "border-white/[0.07]"   },
            ].map(s => (
              <div key={s.label} className={`flex flex-col items-center rounded-xl border ${s.border} ${s.bg} px-2 py-3 text-center`}>
                <span className={`text-[22px] font-bold tabular-nums leading-none ${s.color}`}>{s.value}</span>
                <span className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-slate-600">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Category breakdown */}
          <div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">By Category</p>
            <div className="space-y-2">
              {catCounts.map(({ cat, count }) => {
                const m = CAT_META[cat];
                const pct = Math.round((count / maxCount) * 100);
                return (
                  <div key={cat} className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${m.dot}`} />
                    <span className="w-[72px] shrink-0 text-[11px] text-slate-400">{m.label}</span>
                    <div className="flex-1 overflow-hidden rounded-full bg-white/[0.05] h-1">
                      <div className={`h-full rounded-full transition-all duration-500 ${m.dot}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-4 text-right text-[10px] tabular-nums text-slate-600">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Jump to today */}
          <button
            onClick={() => todayRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="w-full cursor-pointer rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-3 py-2.5 text-[11px] font-semibold text-indigo-400 transition-all hover:border-indigo-500/40 hover:bg-indigo-500/15 hover:text-indigo-300"
          >
            Jump to today →
          </button>

          <p className="text-center text-[10px] text-slate-700">Click any event to see details</p>
        </>
      )}
    </aside>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TimelinePage() {
  const { deadlineList, partyList } = useChapter();

  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [activeLayer,    setActiveLayer]    = useState<CalLayer>("all");
  const [selectedEvent,  setSelectedEvent]  = useState<CalendarEvent | null>(null);
  const [apiEvents,      setApiEvents]      = useState<CalendarEvent[]>([]);
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());
  const [activeModal, setActiveModal] = useState<"create" | "edit" | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const todayRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    requestJson<CalendarEvent[]>("/api/calendar")
      .then(data => {
        setApiEvents(data);
        setCalendarError(null);
      })
      .catch(error => {
        console.error(error);
        setCalendarError("Could not load calendar events from the database.");
      })
      .finally(() => setCalendarLoading(false));
  }, []);

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

  const filtered     = useMemo(() => filterByLayer(allEvents, activeLayer), [allEvents, activeLayer]);
  const monthGroups  = useMemo(() => buildMonthGroups(filtered), [filtered]);
  const selectedEventCanEdit = selectedEvent ? apiEventIds.has(selectedEvent.id) : false;

  function toggleMonth(id: string) {
    setCollapsedMonths(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Ref for current month
  const currentMonthRef = React.useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (currentMonthRef.current) {
      currentMonthRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  function handleCreateEvent(draft: CalendarDraft) {
    const tempId = -Date.now();
    const optimistic: CalendarEvent = { id: tempId, ...draft };

    setApiEvents(prev => [...prev, optimistic]);
    setSelectedEvent(optimistic);
    setActiveModal(null);
    setCalendarError(null);

    requestJson<CalendarEvent>("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    })
      .then(saved => {
        setApiEvents(prev => prev.map(e => e.id === tempId ? saved : e));
        setSelectedEvent(saved);
      })
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
      .then(saved => {
        setApiEvents(prev => prev.map(e => e.id === previous.id ? saved : e));
        setSelectedEvent(saved);
      })
      .catch(error => {
        console.error(error);
        setApiEvents(prev => prev.map(e => e.id === previous.id ? previous : e));
        setSelectedEvent(previous);
        setCalendarError("Calendar event update failed. Local changes were reverted.");
      });
  }

  function handleDeleteEvent() {
    if (!selectedEvent || !selectedEventCanEdit) return;
    const previous = apiEvents.find(e => e.id === selectedEvent.id);
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
    <div className="flex h-screen overflow-hidden bg-[#0d1117]">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeSection="Timeline"
        onNavClick={() => {}}
      />

      <div className="flex flex-1 flex-col overflow-hidden">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <header className="relative flex h-14 shrink-0 items-center gap-3 overflow-hidden border-b border-white/[0.07] bg-[#0d1117] px-4">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-indigo-500/[0.06] via-transparent to-transparent" />

          <button
            onClick={() => setSidebarOpen(true)}
            className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-white lg:hidden cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="relative min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight text-white">Chapter Timeline</p>
            <p className="hidden text-[11px] leading-tight text-slate-500 sm:block">
              Lambda Phi Epsilon · Spring 2026
            </p>
          </div>

          <button
            onClick={() => setActiveModal("create")}
            className="relative inline-flex rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-[11px] font-semibold text-indigo-300 transition-colors hover:bg-indigo-500/15"
          >
            + Event
          </button>

          {/* Layer filter chips */}
          <div className="flex items-center gap-1">
            {LAYERS.map(layer => {
              const active = activeLayer === layer.id;
              const count  = filterByLayer(allEvents, layer.id).length;
              return (
                <button
                  key={layer.id}
                  onClick={() => setActiveLayer(layer.id)}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-all duration-150 ${
                    active
                      ? layer.activeClasses
                      : "border-transparent text-slate-500 hover:border-white/[0.06] hover:bg-white/[0.04] hover:text-slate-300"
                  }`}
                >
                  <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={layer.iconPath} />
                  </svg>
                  <span className="hidden sm:inline">{layer.label}</span>
                  <span className={`rounded-full px-1.5 py-px text-[9px] font-semibold tabular-nums ${
                    active ? "bg-white/[0.15] text-slate-100" : "bg-white/[0.04] text-slate-600"
                  }`}>{count}</span>
                </button>
              );
            })}
          </div>
        </header>

        {/* ── Body ──────────────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Timeline feed */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
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
            {monthGroups.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-24 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.02]">
                  <svg className="h-5 w-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-[13px] text-slate-600">No events on this filter</p>
                <button
                  onClick={() => setActiveLayer("all")}
                  className="cursor-pointer text-[11px] text-indigo-500 transition-colors hover:text-indigo-400"
                >
                  Show all events →
                </button>
              </div>
            ) : (
              <div className="mx-auto max-w-2xl">
                {monthGroups.map(group => {
                  const isCollapsed = collapsedMonths.has(group.id);
                  return (
                    <div
                      key={group.id}
                      ref={group.isCurrentMonth ? (el => { currentMonthRef.current = el; todayRef.current = el; }) : undefined}
                    >
                      <MonthDivider
                        group={group}
                        collapsed={isCollapsed}
                        onToggle={() => toggleMonth(group.id)}
                      />
                      {!isCollapsed && (
                        <div className="ml-[0.4rem] pl-4">
                          {group.events.map((e, i) => (
                            <EventCard
                              key={e.id}
                              event={e}
                              onSelect={setSelectedEvent}
                              selected={selectedEvent?.id === e.id}
                              isLast={i === group.events.length - 1}
                            />
                          ))}
                        </div>
                      )}
                      {isCollapsed && (
                        <div className="mb-2 ml-[0.4rem] pl-4">
                          <div className="mb-4 flex items-center gap-2 rounded-lg border border-white/[0.04] bg-white/[0.01] px-3 py-2">
                            <span className="text-[11px] text-slate-600">{group.events.length} event{group.events.length !== 1 ? "s" : ""} hidden</span>
                            <button
                              onClick={() => toggleMonth(group.id)}
                              className="cursor-pointer text-[10px] text-indigo-600 transition-colors hover:text-indigo-400"
                            >
                              Show →
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="mb-6" />
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
    </div>
  );
}
