"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import { Sidebar } from "../../components/Sidebar";
import { BrotherAvatar } from "../../components/BrotherAvatar";
import { Modal, FieldLabel, LoadingSpinner } from "../../components/dashboard/primitives";
import { useToast } from "../../components/dashboard/Toast";
import { useChapter } from "../../context/ChapterContext";
import { useVocab } from "../../hooks/useVocab";
import { useThresholds } from "../../hooks/useThresholds";
import { Brother, fmtDate } from "../../data";
import { requestJson } from "../../lib/api";
import "../../components/dashboard/dashboard-ledger.css";
import "./service-ledger.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceEvent {
  id: number;
  title: string;
  date: string;
  location: string;
  notes: string;
  createdAt: string;
}

interface Participation {
  id: number;
  serviceEventId: number;
  brotherId: number;
  hours: number;
  brother: { id: number; name: string; avatarUrl: string | null };
}

type View = "events" | "members";
const EMPTY_FORM = { title: "", date: "", location: "", notes: "" };

export default function ServicePage() {
  const toast = useToast();
  const { currentUser, brotherList, setBrotherList, isLoading, avatarRevision, can } = useChapter();
  const v = useVocab();
  const THRESHOLDS = useThresholds();
  const canService = can("MANAGE_SERVICE");
  const selfId     = currentUser?.id ?? null;
  const goal       = THRESHOLDS.serviceHoursGoal;

  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [view,          setView]          = useState<View>("events");
  const [search,        setSearch]        = useState("");
  const [serviceEvents, setServiceEvents] = useState<ServiceEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  // Participation rows, keyed by event id. Lazily fetched the first time an event
  // is expanded; the member view aggregates whatever has been loaded.
  const [partByEvent, setPartByEvent] = useState<Record<number, Participation[]>>({});
  const [expandedId,  setExpandedId]  = useState<number | null>(null);

  // Add/Edit service event modal.
  const [eventModal,   setEventModal]   = useState<"add" | "edit" | null>(null);
  const [editingEvent, setEditingEvent] = useState<ServiceEvent | null>(null);
  const [eventForm,    setEventForm]    = useState(EMPTY_FORM);

  // "Log hours" picker (a service event id + a working set of per-member hours).
  const [logFor,    setLogFor]    = useState<ServiceEvent | null>(null);
  const [logDraft,  setLogDraft]  = useState<Record<number, string>>({});
  const [logSearch, setLogSearch] = useState("");
  const [logBusy,   setLogBusy]   = useState(false);

  // "Log my hours" — a self-service picker: choose one event, enter own hours.
  const [logMineOpen,    setLogMineOpen]    = useState(false);
  const [logMineEventId,  setLogMineEventId] = useState<number | null>(null);
  const [logMineHours,    setLogMineHours]   = useState("");
  const [logMineBusy,     setLogMineBusy]    = useState(false);

  // Member detail drawer (which events contributed a member's hours).
  const [memberDetail, setMemberDetail] = useState<Brother | null>(null);

  // ── Load service events ──────────────────────────────────────────────────────
  useEffect(() => {
    requestJson<ServiceEvent[]>("/api/service-events")
      .then(setServiceEvents)
      .catch(() => toast.error("Could not load service events."))
      .finally(() => setEventsLoading(false));
  }, [toast]);

  function loadParticipation(eventId: number) {
    if (partByEvent[eventId]) return; // cached
    requestJson<Participation[]>(`/api/service-events/${eventId}/participation`)
      .then(rows => setPartByEvent(prev => ({ ...prev, [eventId]: rows })))
      .catch(() => toast.error("Could not load attendees."));
  }

  function toggleExpand(eventId: number) {
    setExpandedId(prev => (prev === eventId ? null : eventId));
    loadParticipation(eventId);
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  // brotherList is already ghost-filtered server-side (listBrothers → isGhost:false).
  const roster = brotherList;

  const filteredRoster = useMemo(() =>
    [...roster]
      .filter(b => b.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.serviceHours - a.serviceHours),
    [roster, search],
  );

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...serviceEvents].sort((a, b) => b.date.localeCompare(a.date));
    if (!q) return list;
    return list.filter(e =>
      e.title.toLowerCase().includes(q) || e.location.toLowerCase().includes(q));
  }, [serviceEvents, search]);

  const totalHours   = useMemo(() => roster.reduce((s, b) => s + b.serviceHours, 0), [roster]);
  const onTrackCount = useMemo(() => roster.filter(b => b.serviceHours >= goal).length, [roster, goal]);
  const avgHours     = roster.length ? totalHours / roster.length : 0;

  // ── Service event CRUD ────────────────────────────────────────────────────────
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
      setEventModal(null);
      try {
        const saved = await requestJson<ServiceEvent>("/api/service-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(eventForm),
        });
        setServiceEvents(prev => [...prev, saved].sort((a, b) => b.date.localeCompare(a.date)));
        toast.success(`Added "${saved.title}".`);
      } catch {
        toast.error("Could not add the service event.");
      }
    } else if (eventModal === "edit" && editingEvent) {
      const snapshot = editingEvent;
      const updated = { ...snapshot, ...eventForm };
      setServiceEvents(list => list.map(e => e.id === snapshot.id ? updated : e).sort((a, b) => b.date.localeCompare(a.date)));
      setEventModal(null);
      setEditingEvent(null);
      try {
        await requestJson<ServiceEvent>(`/api/service-events/${snapshot.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(eventForm),
        });
        toast.success("Service event updated.");
      } catch {
        setServiceEvents(list => list.map(e => e.id === snapshot.id ? snapshot : e).sort((a, b) => b.date.localeCompare(a.date)));
        toast.error("Could not save changes.");
      }
    }
  }

  async function handleDeleteEvent(ev: ServiceEvent) {
    setServiceEvents(prev => prev.filter(e => e.id !== ev.id));
    setPartByEvent(prev => { const next = { ...prev }; delete next[ev.id]; return next; });
    try {
      await requestJson(`/api/service-events/${ev.id}`, { method: "DELETE" });
      toast.success(`Deleted "${ev.title}".`);
      // Deleting an event recomputes totals server-side; refresh the roster.
      await refreshRosterHours();
    } catch {
      setServiceEvents(prev => [...prev, ev].sort((a, b) => b.date.localeCompare(a.date)));
      toast.error("Could not delete the event.");
    }
  }

  // ── Log hours ──────────────────────────────────────────────────────────────────
  function openLog(ev: ServiceEvent) {
    // Seed the draft from whatever participation we have cached for this event.
    const existing = partByEvent[ev.id] ?? [];
    const seed: Record<number, string> = {};
    for (const p of existing) seed[p.brotherId] = String(p.hours);
    setLogDraft(seed);
    setLogSearch("");
    setLogFor(ev);
    loadParticipation(ev.id);
  }

  function setDraftHours(brotherId: number, value: string) {
    setLogDraft(prev => ({ ...prev, [brotherId]: value }));
  }

  async function submitLog() {
    if (!logFor) return;
    const entries = Object.entries(logDraft)
      .map(([id, val]) => ({ brotherId: Number(id), hours: Math.max(0, parseFloat(val) || 0) }))
      .filter(e => logDraft[e.brotherId] !== undefined && logDraft[e.brotherId] !== "");
    if (entries.length === 0) { setLogFor(null); return; }

    setLogBusy(true);
    try {
      const rows = await requestJson<Participation[]>(`/api/service-events/${logFor.id}/participation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      setPartByEvent(prev => ({ ...prev, [logFor.id]: rows }));
      setLogFor(null);
      toast.success("Hours logged.");
      await refreshRosterHours();
    } catch {
      toast.error("Could not log hours.");
    } finally {
      setLogBusy(false);
    }
  }

  // ── Log my hours (self-service) ──────────────────────────────────────────────
  function openLogMine() {
    const recent = [...serviceEvents].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
    setLogMineEventId(recent?.id ?? null);
    setLogMineHours("");
    setLogMineOpen(true);
  }

  async function submitLogMine() {
    if (logMineEventId == null) return;
    const hours = Math.max(0, parseFloat(logMineHours) || 0);
    setLogMineBusy(true);
    try {
      const rows = await requestJson<Participation[]>(`/api/service-events/${logMineEventId}/participation/me`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours }),
      });
      setPartByEvent(prev => ({ ...prev, [logMineEventId]: rows }));
      setLogMineOpen(false);
      toast.success("Your hours were logged.");
      await refreshRosterHours();
    } catch {
      toast.error("Could not log your hours.");
    } finally {
      setLogMineBusy(false);
    }
  }

  async function removeAttendee(eventId: number, p: Participation) {
    setPartByEvent(prev => ({ ...prev, [eventId]: (prev[eventId] ?? []).filter(x => x.id !== p.id) }));
    try {
      await requestJson(`/api/service-participation/${p.id}`, { method: "DELETE" });
      await refreshRosterHours();
    } catch {
      setPartByEvent(prev => ({ ...prev, [eventId]: [...(prev[eventId] ?? []), p].sort((a, b) => a.brother.name.localeCompare(b.brother.name)) }));
      toast.error("Could not remove attendee.");
    }
  }

  // serviceHours is recomputed server-side from participations; pull fresh totals.
  async function refreshRosterHours() {
    try {
      const fresh = await requestJson<Brother[]>("/api/brothers");
      setBrotherList(fresh);
    } catch { /* totals refresh on next page load */ }
  }

  // Per-event rolled-up hours, from cached participation when available.
  function eventHours(eventId: number): number | null {
    const rows = partByEvent[eventId];
    if (!rows) return null;
    return rows.reduce((s, p) => s + p.hours, 0);
  }
  function eventCount(eventId: number): number | null {
    const rows = partByEvent[eventId];
    return rows ? rows.length : null;
  }

  // Events that contributed to a member's hours (member detail drawer).
  const memberEvents = useMemo(() => {
    if (!memberDetail) return [];
    const out: { event: ServiceEvent; hours: number }[] = [];
    for (const ev of serviceEvents) {
      const row = (partByEvent[ev.id] ?? []).find(p => p.brotherId === memberDetail.id);
      if (row) out.push({ event: ev, hours: row.hours });
    }
    return out.sort((a, b) => b.event.date.localeCompare(a.event.date));
  }, [memberDetail, serviceEvents, partByEvent]);

  // Make sure every event's participation is loaded before opening a member drawer
  // so the contributing-events list is complete.
  function openMemberDetail(b: Brother) {
    for (const ev of serviceEvents) loadParticipation(ev.id);
    setMemberDetail(b);
  }

  const orgName = currentUser?.org?.name ?? "ChaptOS";
  const hasEvents = serviceEvents.length > 0;

  const measures: { k: string; v: ReactNode; note: string; warn?: boolean }[] = [
    { k: "Hours logged", v: round(totalHours),                  note: "this term" },
    { k: v("Service"),   v: serviceEvents.length,               note: serviceEvents.length === 1 ? "event" : "events" },
    { k: "On track",     v: `${onTrackCount}/${roster.length}`, note: `${goal}h goal`, warn: roster.length > 0 && onTrackCount < roster.length },
    { k: "Avg / member", v: round(avgHours),                    note: "hours" },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[#0f0d0a]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="Service" onNavClick={() => {}} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ── Toolbar (mobile hamburger + label) ── */}
        <header className="toolbar-frosted dash-toolbar svc-toolbar-bar relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.05] px-4 sm:px-6 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="tb-icon-btn flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.07]"
            aria-label="Open menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="svc-crumb truncate">{v("Service")}</span>
        </header>

        {/* ── Scrollable dusk ledger pane ── */}
        <main className="page-ambient flex-1 overflow-y-auto">
          <div className="dash dash-service" data-dashboard-theme="dusk">

            {/* ── Briefing ── */}
            <section className="svc-briefing" aria-label="Service log">
              <div>
                <p className="kicker">The Service Log</p>
                <h1>Hours, <em>by the event</em>.</h1>
                <div className="svc-digest">
                  <span className="ai">AI</span>
                  <p>{digestLine(roster, serviceEvents.length, totalHours, goal, orgName)}</p>
                </div>
              </div>
              <div className="svc-actions">
                <button className="svc-add ghost" onClick={openLogMine} disabled={!hasEvents} title={hasEvents ? undefined : "No service events yet"}>
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  Log my hours
                </button>
                {canService && (
                  <button className="svc-add" onClick={openAddEvent}>
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    New service event
                  </button>
                )}
              </div>
            </section>

            {/* ── Glance strip ── */}
            {(hasEvents || roster.length > 0) && (
              <section className="svc-glance" aria-label="Service at a glance">
                {measures.map(m => (
                  <div className="svc-measure" key={m.k}>
                    <p className="k">{m.k}</p>
                    <p className={`v${m.warn ? " warn" : ""}`}>{m.v}</p>
                    <p className="note">{m.note}</p>
                  </div>
                ))}
              </section>
            )}

            {/* ── Toolbar: search + view toggle ── */}
            <div className="svc-toolbar">
              <label className="svc-search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
                <input
                  type="search"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={view === "events" ? "Search events…" : "Search members…"}
                  aria-label="Search"
                />
                {search && (
                  <button type="button" className="clr" onClick={() => setSearch("")} aria-label="Clear search">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </label>
              <div className="svc-seg" role="tablist" aria-label="View">
                <button role="tab" aria-selected={view === "events"}  className={view === "events"  ? "on" : ""} onClick={() => setView("events")}>Events</button>
                <button role="tab" aria-selected={view === "members"} className={view === "members" ? "on" : ""} onClick={() => setView("members")}>Members</button>
              </div>
              <span className="svc-scope">
                {view === "events" ? `${filteredEvents.length} of ${serviceEvents.length}` : `${filteredRoster.length} of ${roster.length}`}
              </span>
            </div>

            {/* ── EVENTS VIEW ── */}
            {view === "events" && (
              eventsLoading ? (
                <div className="svc-loading"><LoadingSpinner size="md" tone="dusk" label="Loading events" /></div>
              ) : !hasEvents ? (
                <div className="svc-empty">
                  <div className="ic"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg></div>
                  <p className="t">No service events yet</p>
                  <p className="h">{canService ? "Log your first cleanup, food bank, or fundraiser — then record who showed up." : "Ask an admin to log the chapter's service events."}</p>
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className="svc-empty">
                  <div className="ic"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg></div>
                  <p className="t">Nothing matches</p>
                  <p className="h">Try a different search.</p>
                  <button className="clear" onClick={() => setSearch("")}>Clear search</button>
                </div>
              ) : (
                <div className="svc-events">
                  {filteredEvents.map(ev => {
                    const isPast = ev.date < new Date().toISOString().slice(0, 10);
                    const hrs = eventHours(ev.id);
                    const ct  = eventCount(ev.id);
                    const expanded = expandedId === ev.id;
                    const rows = partByEvent[ev.id] ?? [];
                    return (
                      <div key={ev.id} className={`svc-event${expanded ? " open" : ""}`}>
                        <button className="svc-event-head" onClick={() => toggleExpand(ev.id)} aria-expanded={expanded}>
                          <span className="svc-chev" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                          </span>
                          <span className="svc-event-main">
                            <span className="t">{ev.title}{isPast && <span className="past">Past</span>}</span>
                            <span className="meta">
                              {fmtDate(ev.date)}
                              {ev.location && <> · {ev.location}</>}
                            </span>
                          </span>
                          <span className="svc-event-stats">
                            <span className="stat"><b>{ct ?? "—"}</b> here</span>
                            <span className="stat hrs"><b>{hrs != null ? round(hrs) : "—"}</b>h</span>
                          </span>
                        </button>

                        {expanded && (
                          <div className="svc-event-body">
                            {ev.notes && <p className="svc-event-notes">{ev.notes}</p>}
                            {rows.length === 0 ? (
                              <p className="svc-event-none">No one logged yet.{canService && " Use “Log hours” to record attendees."}</p>
                            ) : (
                              <ul className="svc-attendees">
                                {rows.map(p => (
                                  <li key={p.id}>
                                    <BrotherAvatar brother={p.brother} selfId={selfId} selfAvatarUrl={currentUser?.avatarUrl} avatarRevision={avatarRevision} size="xs" />
                                    <span className="nm">{p.brother.name}</span>
                                    <span className="hr">{round(p.hours)}h</span>
                                    {canService && (
                                      <button className="rm" onClick={() => removeAttendee(ev.id, p)} title="Remove" aria-label={`Remove ${p.brother.name}`}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                      </button>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className="svc-event-actions">
                              {canService && <button className="log" onClick={() => openLog(ev)}>Log hours</button>}
                              {canService && <button className="edit" onClick={() => openEditEvent(ev)}>Edit</button>}
                              {canService && <button className="del" onClick={() => handleDeleteEvent(ev)}>Delete</button>}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* ── MEMBERS VIEW ── */}
            {view === "members" && (
              isLoading ? (
                <div className="svc-loading"><LoadingSpinner size="md" tone="dusk" label="Loading members" /></div>
              ) : filteredRoster.length === 0 ? (
                <div className="svc-empty">
                  <div className="ic"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg></div>
                  <p className="t">No members found</p>
                  <p className="h">Try a different search.</p>
                </div>
              ) : (
                <div className="svc-members">
                  {filteredRoster.map(b => {
                    const onTrack = b.serviceHours >= goal;
                    const pct = goal > 0 ? Math.min(100, Math.round((b.serviceHours / goal) * 100)) : 100;
                    const status = onTrack ? "ok" : b.serviceHours >= goal * 0.5 ? "watch" : "risk";
                    return (
                      <button key={b.id} className="svc-member" onClick={() => openMemberDetail(b)}>
                        <BrotherAvatar brother={b} selfId={selfId} selfAvatarUrl={currentUser?.avatarUrl} avatarRevision={avatarRevision} size="sm" />
                        <span className="svc-member-main">
                          <span className="row">
                            <span className="nm">{b.name}</span>
                            <span className="hr">{round(b.serviceHours)}<i>/{goal}h</i></span>
                          </span>
                          <span className="bar"><i className={status} style={{ width: `${pct}%` }} /></span>
                        </span>
                        <span className={`svc-dot ${status}`} aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </main>
      </div>

      {/* ── Add / Edit service event modal ── */}
      {eventModal && (
        <Modal title={eventModal === "add" ? "Log service event" : "Edit service event"} tone="dusk" onClose={() => setEventModal(null)}>
          <div className="space-y-3">
            <div>
              <FieldLabel tone="dusk">Title</FieldLabel>
              <input className="svc-input" value={eventForm.title} autoFocus
                onChange={e => setEventForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Beach cleanup, food bank, …" />
            </div>
            <div>
              <FieldLabel tone="dusk">Date</FieldLabel>
              <input type="date" className="svc-input" value={eventForm.date}
                onChange={e => setEventForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <FieldLabel tone="dusk">Location</FieldLabel>
              <input className="svc-input" value={eventForm.location}
                onChange={e => setEventForm(f => ({ ...f, location: e.target.value }))}
                placeholder="Address or venue name" />
            </div>
            <div>
              <FieldLabel tone="dusk">Notes</FieldLabel>
              <textarea className="svc-input min-h-[72px] resize-none" value={eventForm.notes}
                onChange={e => setEventForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Details, dress code, what to bring…" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEventModal(null)} className="svc-btn ghost">Cancel</button>
              <button onClick={handleSaveEvent} disabled={!eventForm.title || !eventForm.date} className="svc-btn primary">
                {eventModal === "add" ? "Log event" : "Save changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Log hours picker ── */}
      {logFor && (
        <Modal title={`Log hours · ${logFor.title}`} tone="dusk" onClose={() => !logBusy && setLogFor(null)}>
          <p className="svc-log-hint">Enter hours for everyone who showed up. Leave a member blank to skip them.</p>
          <label className="svc-search inmodal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
            <input type="search" value={logSearch} onChange={e => setLogSearch(e.target.value)} placeholder="Find a member…" aria-label="Find member" />
          </label>
          <div className="svc-log-list">
            {roster
              .filter(b => b.name.toLowerCase().includes(logSearch.toLowerCase()))
              .map(b => {
                const val = logDraft[b.id] ?? "";
                const active = val !== "" && parseFloat(val) > 0;
                return (
                  <div key={b.id} className={`svc-log-row${active ? " on" : ""}`}>
                    <BrotherAvatar brother={b} selfId={selfId} selfAvatarUrl={currentUser?.avatarUrl} avatarRevision={avatarRevision} size="xs" />
                    <span className="nm">{b.name}</span>
                    <input
                      type="number" min="0" step="0.5" inputMode="decimal"
                      className="hrin"
                      value={val}
                      placeholder="0"
                      onChange={e => setDraftHours(b.id, e.target.value)}
                    />
                    <span className="u">h</span>
                  </div>
                );
              })}
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <button onClick={() => setLogFor(null)} disabled={logBusy} className="svc-btn ghost">Cancel</button>
            <button onClick={submitLog} disabled={logBusy} className="svc-btn primary">{logBusy ? "Saving…" : "Save hours"}</button>
          </div>
        </Modal>
      )}

      {/* ── Log my hours (self-service) ── */}
      {logMineOpen && (
        <Modal title="Log my hours" tone="dusk" onClose={() => !logMineBusy && setLogMineOpen(false)}>
          <p className="svc-log-hint">Pick the service event you showed up to and enter how many hours you earned.</p>
          <div className="space-y-3">
            <div>
              <FieldLabel tone="dusk">Service event</FieldLabel>
              <select
                className="svc-input"
                value={logMineEventId ?? ""}
                onChange={e => setLogMineEventId(e.target.value ? Number(e.target.value) : null)}
              >
                {[...serviceEvents].sort((a, b) => b.date.localeCompare(a.date)).map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.title} · {fmtDate(ev.date)}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel tone="dusk">Hours</FieldLabel>
              <input
                type="number" min="0" step="0.5" inputMode="decimal" autoFocus
                className="svc-input"
                value={logMineHours}
                placeholder="0"
                onChange={e => setLogMineHours(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setLogMineOpen(false)} disabled={logMineBusy} className="svc-btn ghost">Cancel</button>
              <button onClick={submitLogMine} disabled={logMineBusy || logMineEventId == null || logMineHours === ""} className="svc-btn primary">
                {logMineBusy ? "Saving…" : "Log my hours"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Member detail drawer ── */}
      {memberDetail && (
        <Modal title={memberDetail.name} tone="dusk" onClose={() => setMemberDetail(null)}>
          <div className="svc-md-head">
            <span className="big">{round(memberDetail.serviceHours)}<i>h</i></span>
            <span className="goal">of {goal}h goal</span>
          </div>
          {memberEvents.length === 0 ? (
            <p className="svc-md-none">No event-logged hours yet{memberDetail.serviceHours > 0 ? " — earlier hours were recorded before per-event tracking." : "."}</p>
          ) : (
            <ul className="svc-md-events">
              {memberEvents.map(({ event, hours }) => (
                <li key={event.id}>
                  <span className="t">{event.title}</span>
                  <span className="d">{fmtDate(event.date)}</span>
                  <span className="h">{round(hours)}h</span>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Trim trailing .0 so "3" not "3.0", but keep "3.5". */
function round(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** One-line AI-style digest derived from the live roster + events. */
function digestLine(roster: Brother[], eventCount: number, total: number, goal: number, orgName: string): string {
  if (roster.length === 0) return `${orgName} hasn't added members yet.`;
  if (eventCount === 0) {
    return `No service events logged yet — record one and start crediting the members who show up.`;
  }
  const behind = roster.filter(b => b.serviceHours < goal).length;
  const tail = behind > 0
    ? ` ${behind} ${behind === 1 ? "member is" : "members are"} still short of the ${goal}h goal.`
    : ` Every member has hit the ${goal}h goal.`;
  return `${round(total)} hours logged across ${eventCount} ${eventCount === 1 ? "event" : "events"}.${tail}`;
}
