"use client";

import React, { useState, useMemo } from "react";
import { Sidebar } from "../components/Sidebar";
import {
  calendarEvents as staticEvents,
  CalendarEvent, CalEventCategory, CalLayer,
} from "../data";
import { useChapter } from "../context/ChapterContext";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const _now = new Date();
const TODAY = { year: _now.getFullYear(), month: _now.getMonth(), day: _now.getDate() };

const LAYERS: { id: CalLayer; label: string; accent: string; iconPath: string }[] = [
  { id: "all",       label: "All",       accent: "text-white",       iconPath: "M4 6h16M4 10h16M4 14h16M4 18h16" },
  { id: "mandatory", label: "Mandatory", accent: "text-emerald-400", iconPath: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  { id: "deadlines", label: "Deadlines", accent: "text-red-400",     iconPath: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
  { id: "parties",   label: "Parties",   accent: "text-indigo-400",  iconPath: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" },
];

const CAT_META: Record<CalEventCategory, {
  label: string; dot: string; ring: string; text: string;
  bg: string; border: string; borderL: string;
}> = {
  chapter:  { label: "Chapter",    dot: "bg-emerald-400", ring: "ring-emerald-500/25", text: "text-emerald-400", bg: "bg-emerald-500/10",  border: "border-emerald-500/25", borderL: "border-l-emerald-500/60"  },
  social:   { label: "Social",     dot: "bg-violet-400",  ring: "ring-violet-500/25",  text: "text-violet-400",  bg: "bg-violet-500/10",   border: "border-violet-500/25",  borderL: "border-l-violet-500/60"   },
  fundy:    { label: "Fundraiser", dot: "bg-amber-400",   ring: "ring-amber-500/25",   text: "text-amber-400",   bg: "bg-amber-500/10",    border: "border-amber-500/25",   borderL: "border-l-amber-500/60"    },
  program:  { label: "Program",    dot: "bg-blue-400",    ring: "ring-blue-500/25",    text: "text-blue-400",    bg: "bg-blue-500/10",     border: "border-blue-500/25",    borderL: "border-l-blue-500/60"     },
  party:    { label: "Party",      dot: "bg-indigo-400",  ring: "ring-indigo-500/25",  text: "text-indigo-400",  bg: "bg-indigo-500/10",   border: "border-indigo-500/25",  borderL: "border-l-indigo-500/60"   },
  deadline: { label: "Deadline",   dot: "bg-red-400",     ring: "ring-red-500/25",     text: "text-red-400",     bg: "bg-red-500/10",      border: "border-red-500/25",     borderL: "border-l-red-500/60"      },
};

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

// Returns the Monday of the ISO week for a date string
function weekStart(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function weekLabel(weekStartStr: string): string {
  const [, m, d] = weekStartStr.split("-").map(Number);
  return `Week of ${MONTH_NAMES[m - 1].slice(0, 3)} ${d}`;
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

interface FeedGroup {
  id: string;
  label: string;
  variant: "urgent" | "thisweek" | "neutral";
  events: CalendarEvent[];
}

function buildFeedGroups(events: CalendarEvent[]): FeedGroup[] {
  const todayStr = toDateStr(TODAY.year, TODAY.month, TODAY.day);

  // End of this week (Saturday night)
  const nowD = new Date(todayStr + "T12:00:00");
  const dayOfWeek = nowD.getDay(); // 0=Sun
  const daysToSat = 6 - dayOfWeek;
  const endOfWeekD = new Date(nowD);
  endOfWeekD.setDate(nowD.getDate() + daysToSat);
  const endOfWeekStr = `${endOfWeekD.getFullYear()}-${pad(endOfWeekD.getMonth() + 1)}-${pad(endOfWeekD.getDate())}`;

  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));

  const urgent:   CalendarEvent[] = [];
  const thisWeek: CalendarEvent[] = [];
  const weekly: Record<string, CalendarEvent[]> = {};

  for (const e of sorted) {
    if (e.date <= todayStr && e.category === "deadline") {
      urgent.push(e);
    } else if (e.date <= endOfWeekStr) {
      thisWeek.push(e);
    } else {
      const ws = weekStart(e.date);
      if (!weekly[ws]) weekly[ws] = [];
      weekly[ws].push(e);
    }
  }

  const groups: FeedGroup[] = [];
  if (urgent.length > 0)   groups.push({ id: "urgent",   label: "Needs Action",  variant: "urgent",   events: urgent });
  if (thisWeek.length > 0) groups.push({ id: "thisweek", label: "This Week",     variant: "thisweek", events: thisWeek });
  for (const [ws, evts] of Object.entries(weekly).sort(([a], [b]) => a.localeCompare(b))) {
    groups.push({ id: ws, label: weekLabel(ws), variant: "neutral", events: evts });
  }
  return groups;
}

// ─── FeedRow ──────────────────────────────────────────────────────────────────

function FeedRow({ event, onSelect, selected }: {
  event: CalendarEvent;
  onSelect: (e: CalendarEvent) => void;
  selected: boolean;
}) {
  const m           = CAT_META[event.category];
  const isDeadline  = event.category === "deadline";
  const isMandatory = event.mandatory;
  const [, mo, d]   = event.date.split("-").map(Number);
  const dow         = fmtDow(event.date);

  return (
    <div
      onClick={() => onSelect(event)}
      className={`group flex items-center gap-3 border-b border-white/[0.04] border-l-[3px] ${m.borderL} px-4 py-3 transition-colors cursor-pointer ${
        selected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
      }`}
    >
      {/* Date mini-card */}
      <div className="flex w-12 shrink-0 flex-col items-center rounded-lg border border-white/[0.06] bg-white/[0.02] py-1.5">
        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">{dow}</span>
        <span className="text-[16px] font-bold leading-none tabular-nums text-slate-300">{d}</span>
        <span className="text-[9px] text-slate-600">{MONTH_NAMES[mo - 1].slice(0, 3)}</span>
      </div>

      {/* Category dot */}
      <span className={`h-2 w-2 shrink-0 rounded-full ${m.dot}`} />

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-white">{event.title}</p>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
          {event.time     && <span>{event.time}</span>}
          {event.location && <span>· {event.location}</span>}
          {!event.location && event.description && (
            <span className="truncate">{event.description}</span>
          )}
        </div>
      </div>

      {/* Badges */}
      <div className="flex shrink-0 items-center gap-1.5">
        <span className={`hidden rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset sm:inline ${m.text} ${m.bg} ${m.ring}`}>
          {m.label}
        </span>
        {isMandatory && (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/25">
            Required
          </span>
        )}
        {isDeadline && (
          <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400 ring-1 ring-inset ring-red-500/25">
            <span className="h-1 w-1 animate-pulse rounded-full bg-red-400" />
            Urgent
          </span>
        )}
      </div>
    </div>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────

function SectionHeader({ label, count, variant }: {
  label: string; count: number; variant: "urgent" | "thisweek" | "neutral";
}) {
  const s = {
    urgent:   { text: "text-red-400",     badge: "bg-red-500/15 text-red-400 ring-red-500/25",             rule: "border-red-500/20"    },
    thisweek: { text: "text-emerald-400", badge: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/25", rule: "border-emerald-500/15" },
    neutral:  { text: "text-slate-500",   badge: "bg-white/[0.05] text-slate-400 ring-white/[0.1]",        rule: "border-white/[0.06]"  },
  }[variant];

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className={`flex-1 border-t ${s.rule}`} />
      <span className={`text-[10px] font-bold uppercase tracking-widest ${s.text}`}>{label}</span>
      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset ${s.badge}`}>{count}</span>
      <span className={`flex-1 border-t ${s.rule}`} />
    </div>
  );
}

// ─── EventDetail ──────────────────────────────────────────────────────────────

function EventDetail({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const m           = CAT_META[event.category];
  const isDeadline  = event.category === "deadline";
  const [, mo, d]   = event.date.split("-").map(Number);
  const dow         = fmtDow(event.date);

  return (
    <div className="flex flex-col gap-4">
      {/* Back button */}
      <button
        onClick={onClose}
        className="flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
      >
        <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to overview
      </button>

      {/* Date card */}
      <div className={`rounded-xl border ${m.border} ${m.bg} px-4 py-4`}>
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center rounded-lg border border-white/[0.1] bg-[#0d1117]/60 px-3 py-2 text-center shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{dow}</span>
            <span className="text-[28px] font-bold leading-none tabular-nums text-white">{d}</span>
            <span className="text-[10px] text-slate-500">{MONTH_NAMES[mo - 1]}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold leading-tight text-white">{event.title}</p>
            <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${m.text} ${m.bg} ${m.ring}`}>
              {m.label}
            </span>
          </div>
        </div>
      </div>

      {/* Details list */}
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] divide-y divide-white/[0.05]">
        {event.time && (
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <svg className="h-3.5 w-3.5 shrink-0 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-[12px] text-slate-300">{event.time}</span>
          </div>
        )}
        {event.location && (
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <svg className="h-3.5 w-3.5 shrink-0 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[12px] text-slate-300">{event.location}</span>
          </div>
        )}
        {event.description && (
          <div className="flex items-start gap-2.5 px-3 py-2.5">
            <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-[12px] leading-relaxed text-slate-400">{event.description}</span>
          </div>
        )}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-2">
        {event.mandatory && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/25">
            <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Required Attendance
          </span>
        )}
        {isDeadline && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] font-semibold text-red-400 ring-1 ring-inset ring-red-500/25">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
            Deadline
          </span>
        )}
      </div>
    </div>
  );
}

// ─── RightPanel ───────────────────────────────────────────────────────────────

function RightPanel({ allFiltered, todayRef, selectedEvent, onClearEvent }: {
  allFiltered: CalendarEvent[];
  todayRef: React.RefObject<HTMLDivElement | null>;
  selectedEvent: CalendarEvent | null;
  onClearEvent: () => void;
}) {
  const todayStr = toDateStr(TODAY.year, TODAY.month, TODAY.day);

  const urgentCount   = allFiltered.filter(e => e.category === "deadline" && e.date <= todayStr).length;
  const thisWeekCount = allFiltered.filter(e => {
    const nowD = new Date(todayStr + "T12:00:00");
    const daysToSat = 6 - nowD.getDay();
    const eow = new Date(nowD); eow.setDate(nowD.getDate() + daysToSat);
    const eowStr = `${eow.getFullYear()}-${pad(eow.getMonth()+1)}-${pad(eow.getDate())}`;
    return e.date > todayStr && e.date <= eowStr;
  }).length;
  const mandatoryCount = allFiltered.filter(e => e.mandatory).length;

  const catCounts = (Object.keys(CAT_META) as CalEventCategory[]).map(cat => ({
    cat,
    count: allFiltered.filter(e => e.category === cat).length,
  }));
  const maxCount = Math.max(...catCounts.map(c => c.count), 1);

  return (
    <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-l border-white/[0.07] px-4 py-4 lg:flex">
      {selectedEvent ? (
        <EventDetail event={selectedEvent} onClose={onClearEvent} />
      ) : (
        <>
          {/* Stat boxes */}
          <div className="mb-4 grid grid-cols-3 gap-2">
            {[
              { value: urgentCount,    label: "Urgent",    color: "text-red-400"     },
              { value: thisWeekCount,  label: "This Week", color: "text-amber-400"   },
              { value: mandatoryCount, label: "Mandatory", color: "text-emerald-400" },
            ].map(s => (
              <div key={s.label} className="flex flex-col items-center rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-2.5 text-center">
                <span className={`text-[20px] font-bold tabular-nums leading-none ${s.color}`}>{s.value}</span>
                <span className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-slate-600">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Category breakdown */}
          <div className="mb-4">
            <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">By Category</p>
            <div className="space-y-2">
              {catCounts.map(({ cat, count }) => {
                const m = CAT_META[cat];
                return (
                  <div key={cat} className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${m.dot}`} />
                    <span className="w-20 shrink-0 text-[11px] text-slate-400">{m.label}</span>
                    <div className="flex-1 overflow-hidden rounded-full bg-white/[0.06] h-1">
                      <div
                        className={`h-full rounded-full ${m.dot}`}
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
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
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[11px] font-medium text-slate-400 transition-all hover:bg-white/[0.08] hover:text-white"
          >
            Jump to today ↓
          </button>

          {/* Hint */}
          <p className="mt-4 text-center text-[10px] text-slate-700">Click any event to see details</p>
        </>
      )}
    </aside>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TimelinePage() {
  const { deadlineList, partyList } = useChapter();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeLayer, setActiveLayer] = useState<CalLayer>("all");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const todayRef = React.useRef<HTMLDivElement | null>(null);

  // ── Merge static events + live dashboard data ──────────────────────────────
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

    const deduped = staticEvents.filter(e => {
      if (e.category === "deadline") return !liveDeadlineTitles.has(e.title);
      if (e.category === "party")    return !livePartyTitles.has(e.title);
      return true;
    });

    return [...deduped, ...live];
  }, [deadlineList, partyList]);

  const filtered = useMemo(() => filterByLayer(allEvents, activeLayer), [allEvents, activeLayer]);
  const groups   = useMemo(() => buildFeedGroups(filtered), [filtered]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0d1117]">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeSection="Timeline"
        onNavClick={() => {}}
      />

      <div className="flex flex-1 flex-col overflow-hidden">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="relative flex h-14 shrink-0 items-center gap-3 overflow-hidden border-b border-white/[0.07] bg-[#0d1117] px-4">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-indigo-500/[0.04] via-transparent to-transparent" />

          {/* Hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="relative flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-white lg:hidden"
          >
            <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Title */}
          <div className="relative min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight text-white">Chapter Timeline</p>
            <p className="hidden text-[11px] leading-tight text-slate-400 sm:block">Lambda Phi Epsilon · Spring 2026</p>
          </div>

          {/* Layer filters */}
          <div className="flex items-center gap-1">
            {LAYERS.map(layer => {
              const active = activeLayer === layer.id;
              const count  = filterByLayer(allEvents, layer.id).length;
              return (
                <button
                  key={layer.id}
                  onClick={() => setActiveLayer(layer.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all duration-150 ${
                    active
                      ? `border border-white/[0.1] bg-white/[0.07] ${layer.accent} shadow-sm`
                      : "border border-transparent text-slate-500 hover:border-white/[0.06] hover:bg-white/[0.04] hover:text-slate-300"
                  }`}
                >
                  <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={layer.iconPath} />
                  </svg>
                  <span className="hidden sm:inline">{layer.label}</span>
                  <span className={`rounded-full px-1.5 py-px text-[9px] font-semibold tabular-nums ${
                    active ? "bg-white/[0.12] text-slate-200" : "bg-white/[0.04] text-slate-600"
                  }`}>{count}</span>
                </button>
              );
            })}
          </div>
        </header>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Feed */}
          <div className="flex-1 overflow-y-auto">
            {groups.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-20 text-center">
                <p className="text-[13px] text-slate-600">No events on this layer</p>
                <button
                  onClick={() => setActiveLayer("all")}
                  className="text-[11px] text-indigo-500 transition-colors hover:text-indigo-400"
                >
                  Show all events →
                </button>
              </div>
            ) : (
              groups.map(group => (
                <div
                  key={group.id}
                  ref={group.variant === "thisweek" || group.variant === "urgent" ? todayRef : undefined}
                >
                  <SectionHeader label={group.label} count={group.events.length} variant={group.variant} />
                  {group.events.map(e => (
                    <FeedRow
                      key={e.id}
                      event={e}
                      onSelect={setSelectedEvent}
                      selected={selectedEvent?.id === e.id}
                    />
                  ))}
                </div>
              ))
            )}
            <div className="h-8" />
          </div>

          {/* Right panel */}
          <RightPanel
            allFiltered={filtered}
            todayRef={todayRef}
            selectedEvent={selectedEvent}
            onClearEvent={() => setSelectedEvent(null)}
          />
        </div>
      </div>
    </div>
  );
}
