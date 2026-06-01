"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Sidebar } from "../../components/Sidebar";
import { BrotherAvatar } from "../../components/BrotherAvatar";
import { UserAvatar } from "../../components/UserAvatar";
import { Modal, FieldLabel } from "../../components/dashboard/primitives";
import { headerActionBtnCls, inputCls } from "../../components/dashboard/styles";
import { useChapter } from "../../context/ChapterContext";
import { Brother, THRESHOLDS, fmtDate } from "../../data";
import { requestJson } from "../../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceEvent {
  id: number;
  title: string;
  date: string;
  location: string;
  notes: string;
  createdAt: string;
}

// ─── Icon helpers ─────────────────────────────────────────────────────────────

const ICON_EDIT  = "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z";
const ICON_TRASH = "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16";

function IconBtn({ path, label, onClick, className = "" }: { path: string; label: string; onClick: () => void; className?: string }) {
  return (
    <button
      title={label}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${className}`}
    >
      <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d={path} />
      </svg>
      <span className="sr-only">{label}</span>
    </button>
  );
}

// ─── Empty event form ─────────────────────────────────────────────────────────

const EMPTY_FORM = { title: "", date: "", location: "", notes: "" };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ServicePage() {
  const { currentUser, brotherList, setBrotherList, isLoading, avatarRevision, can } = useChapter();
  const canService = can("MANAGE_SERVICE");
  const selfId     = currentUser?.id ?? null;

  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [search,        setSearch]        = useState("");
  const [editingId,     setEditingId]     = useState<number | null>(null);
  const [editHours,     setEditHours]     = useState("");
  const [serviceEvents, setServiceEvents] = useState<ServiceEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventModal,    setEventModal]    = useState<"add" | "edit" | null>(null);
  const [editingEvent,  setEditingEvent]  = useState<ServiceEvent | null>(null);
  const [eventForm,     setEventForm]     = useState(EMPTY_FORM);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Load service events
  useEffect(() => {
    requestJson<ServiceEvent[]>("/api/service-events")
      .then(setServiceEvents)
      .catch(() => {})
      .finally(() => setEventsLoading(false));
  }, []);

  // Focus input when edit starts
  useEffect(() => {
    if (editingId !== null) editInputRef.current?.focus();
  }, [editingId]);

  const filteredBrothers = useMemo(() =>
    [...brotherList]
      .filter(b => b.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.serviceHours - a.serviceHours),
    [brotherList, search]
  );

  const onTrackCount = useMemo(
    () => brotherList.filter(b => b.serviceHours >= THRESHOLDS.serviceHoursGoal).length,
    [brotherList]
  );

  // ── Hours editing ────────────────────────────────────────────────────────────

  function startEdit(b: Brother) {
    setEditingId(b.id);
    setEditHours(String(b.serviceHours));
  }

  function saveHours(b: Brother) {
    const newHrs = Math.max(0, parseFloat(editHours) || 0);
    setEditingId(null);
    if (newHrs === b.serviceHours) return;
    setBrotherList(prev => prev.map(x => x.id === b.id ? { ...x, serviceHours: newHrs } : x));
    requestJson<Brother>(`/api/brothers/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceHours: newHrs }),
    }).catch(() => {
      setBrotherList(prev => prev.map(x => x.id === b.id ? b : x));
    });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  // ── Event CRUD ───────────────────────────────────────────────────────────────

  function openAddEvent() {
    setEditingEvent(null);
    setEventForm(EMPTY_FORM);
    setEventModal("add");
  }

  function openEditEvent(e: ServiceEvent) {
    setEditingEvent(e);
    setEventForm({ title: e.title, date: e.date, location: e.location, notes: e.notes });
    setEventModal("edit");
  }

  async function handleSaveEvent() {
    if (!eventForm.title || !eventForm.date) return;
    if (eventModal === "add") {
      const tempId = Date.now();
      const optimistic: ServiceEvent = { id: tempId, createdAt: new Date().toISOString(), ...eventForm };
      setServiceEvents(prev => [...prev, optimistic].sort((a, b) => a.date.localeCompare(b.date)));
      setEventModal(null);
      try {
        const saved = await requestJson<ServiceEvent>("/api/service-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(eventForm),
        });
        setServiceEvents(prev => prev.map(e => e.id === tempId ? saved : e).sort((a, b) => a.date.localeCompare(b.date)));
      } catch {
        // API failed — keep the event in the list anyway so it doesn't disappear
        // (it will re-sync on next page load)
      }
    } else if (eventModal === "edit" && editingEvent) {
      const snapshot = editingEvent;
      const updated = { ...snapshot, ...eventForm };
      setServiceEvents(list => list.map(e => e.id === snapshot.id ? updated : e).sort((a, b) => a.date.localeCompare(b.date)));
      setEventModal(null);
      setEditingEvent(null);
      requestJson<ServiceEvent>(`/api/service-events/${snapshot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventForm),
      }).catch(() => {
        setServiceEvents(list => list.map(e => e.id === snapshot.id ? snapshot : e).sort((a, b) => a.date.localeCompare(b.date)));
      });
    }
  }

  async function handleDeleteEvent(ev: ServiceEvent) {
    setServiceEvents(prev => prev.filter(e => e.id !== ev.id));
    requestJson(`/api/service-events/${ev.id}`, { method: "DELETE" }).catch(() => {
      setServiceEvents(prev => [...prev, ev].sort((a, b) => a.date.localeCompare(b.date)));
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#07090f" }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="" onNavClick={() => {}} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.05] bg-[#07090f]/80 px-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <button
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] text-slate-400 hover:bg-white/[0.08] lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div>
              <h1 className="text-[15px] font-semibold text-white">Community Service</h1>
              <p className="text-[11px] text-slate-500">{onTrackCount} / {brotherList.length} on track · {THRESHOLDS.serviceHoursGoal}h goal</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openAddEvent}
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

        {/* Body */}
        <div className="flex flex-1 flex-col gap-4 overflow-hidden p-4 md:flex-row">

          {/* ── Brothers Panel ─────────────────────────────────────────────── */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.07] bg-[#10121a] md:w-[55%] md:flex-none md:shrink-0">
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-white/[0.05] px-5 py-4">
              <div>
                <h2 className="text-[14px] font-semibold text-white">Brothers</h2>
                <p className="mt-0.5 text-[11px] text-slate-500">Click hours to edit</p>
              </div>
              <div className="relative">
                <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-40 rounded-lg border border-white/[0.08] bg-[#0a0d14] py-1.5 pl-8 pr-3 text-[12px] text-white placeholder:text-slate-500 focus:border-indigo-500/60 focus:outline-none"
                />
              </div>
            </div>

            {/* Brother rows */}
            <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
              {isLoading ? (
                <div className="space-y-0">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-5 py-3 animate-pulse">
                      <div className="h-8 w-8 shrink-0 rounded-full bg-white/[0.05]" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="h-3 w-32 rounded bg-white/[0.05]" />
                        <div className="h-1 w-full rounded-full bg-white/[0.05]" />
                      </div>
                      <div className="h-4 w-10 rounded bg-white/[0.05]" />
                    </div>
                  ))}
                </div>
              ) : filteredBrothers.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-[12px] text-slate-600">No brothers found</p>
                </div>
              ) : filteredBrothers.map(b => {
                const onTrack = b.serviceHours >= THRESHOLDS.serviceHoursGoal;
                const pct = Math.min(100, Math.round((b.serviceHours / THRESHOLDS.serviceHoursGoal) * 100));
                const isEditing = editingId === b.id;
                return (
                  <div key={b.id} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.02]">
                    <BrotherAvatar
                      brother={b}
                      selfId={selfId}
                      selfAvatarUrl={currentUser?.avatarUrl}
                      avatarRevision={avatarRevision}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] font-medium text-slate-200">{b.name}</p>
                        <span className="text-[10px] text-slate-500 tabular-nums">{b.serviceHours}h / {THRESHOLDS.serviceHoursGoal}h</span>
                      </div>
                      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.07]">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${onTrack ? "bg-indigo-500" : "bg-amber-400"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          ref={editInputRef}
                          type="number"
                          min="0"
                          step="0.5"
                          value={editHours}
                          onChange={e => setEditHours(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") saveHours(b);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          onBlur={() => saveHours(b)}
                          className="w-16 rounded-md border border-indigo-500/50 bg-[#0a0d14] px-2 py-1 text-center text-[13px] text-white focus:outline-none"
                        />
                        <span className="text-[11px] text-slate-500">h</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => { if (canService || b.id === selfId) startEdit(b); }}
                        disabled={!canService && b.id !== selfId}
                        title={canService || b.id === selfId ? "Click to edit" : "Only admins can edit other brothers' hours"}
                        className={`tabular-nums text-[15px] font-semibold transition-colors hover:opacity-70 disabled:cursor-default disabled:hover:opacity-100 ${onTrack ? "text-white" : "text-amber-400"}`}
                      >
                        {b.serviceHours}h
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Events Panel ───────────────────────────────────────────────── */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.07] bg-[#10121a]">
            <div className="flex items-center justify-between border-b border-white/[0.05] px-5 py-4">
              <div>
                <h2 className="text-[14px] font-semibold text-white">Service Events</h2>
                <p className="mt-0.5 text-[11px] text-slate-500">{serviceEvents.length} event{serviceEvents.length !== 1 ? "s" : ""} posted</p>
              </div>
              <button
                onClick={openAddEvent}
                className="flex items-center gap-1 rounded-md bg-indigo-500/15 px-2.5 py-1 text-[11px] font-semibold text-indigo-400 ring-1 ring-inset ring-indigo-500/25 hover:bg-indigo-500/25 transition-colors"
              >
                + Add
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
              {eventsLoading ? (
                <div className="space-y-0">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="px-5 py-4 animate-pulse">
                      <div className="h-3 w-44 rounded bg-white/[0.05]" />
                      <div className="mt-2 h-2.5 w-28 rounded bg-white/[0.05]" />
                    </div>
                  ))}
                </div>
              ) : serviceEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
                  <p className="text-[12px] text-slate-600">No events posted yet</p>
                  <button onClick={openAddEvent} className="mt-2 text-[11px] text-indigo-400 hover:text-indigo-300">
                    + Post a service event
                  </button>
                </div>
              ) : serviceEvents.map(ev => {
                const isPast = ev.date < new Date().toISOString().slice(0, 10);
                return (
                  <div key={ev.id} className="group px-5 py-4 transition-colors hover:bg-white/[0.02]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className={`text-[13px] font-semibold ${isPast ? "text-slate-500" : "text-white"}`}>{ev.title}</p>
                          {isPast && (
                            <span className="rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-medium text-slate-600">Past</span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                          <span>{fmtDate(ev.date)}</span>
                          {ev.location && (
                            <>
                              <span className="text-slate-700">·</span>
                              <span className="truncate">{ev.location}</span>
                            </>
                          )}
                        </div>
                        {ev.notes && (
                          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{ev.notes}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                        <IconBtn path={ICON_EDIT}  label="Edit"   onClick={() => openEditEvent(ev)} className="text-slate-600 hover:bg-indigo-500/20 hover:text-indigo-400" />
                        {canService && (
                          <IconBtn path={ICON_TRASH} label="Delete" onClick={() => handleDeleteEvent(ev)} className="text-slate-600 hover:bg-red-500/20 hover:text-red-400" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Add / Edit Event Modal ─────────────────────────────────────────────── */}
      {eventModal && (
        <Modal title={eventModal === "add" ? "Post Service Event" : "Edit Service Event"} onClose={() => setEventModal(null)}>
          <div className="space-y-3">
            <div>
              <FieldLabel>Title</FieldLabel>
              <input
                type="text"
                className={inputCls}
                value={eventForm.title}
                onChange={e => setEventForm(f => ({ ...f, title: e.target.value }))}
                autoFocus
                placeholder="Beach cleanup, food bank, …"
              />
            </div>
            <div>
              <FieldLabel>Date</FieldLabel>
              <input
                type="date"
                className={inputCls}
                value={eventForm.date}
                onChange={e => setEventForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div>
              <FieldLabel>Location</FieldLabel>
              <input
                type="text"
                className={inputCls}
                value={eventForm.location}
                onChange={e => setEventForm(f => ({ ...f, location: e.target.value }))}
                placeholder="Address or venue name"
              />
            </div>
            <div>
              <FieldLabel>Notes</FieldLabel>
              <textarea
                className={`${inputCls} min-h-[72px] resize-none`}
                value={eventForm.notes}
                onChange={e => setEventForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Details, dress code, what to bring…"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setEventModal(null)}
                className="rounded-lg border border-white/[0.08] px-4 py-1.5 text-[13px] text-slate-400 hover:border-white/[0.16] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEvent}
                disabled={!eventForm.title || !eventForm.date}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {eventModal === "add" ? "Post Event" : "Save Changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
