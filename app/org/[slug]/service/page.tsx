"use client";

import { useState, useEffect, useMemo, startTransition } from "react";
import { Sidebar } from "../../../components/Sidebar";
import { BrotherAvatar } from "../../../components/BrotherAvatar";
import { Modal } from "../../../components/dashboard/primitives";
import { useToast } from "../../../components/dashboard/Toast";
import { useChapter } from "../../../context/ChapterContext";
import { useVocab } from "../../../hooks/useVocab";
import { useThresholds } from "../../../hooks/useThresholds";
import { useActiveSemester } from "../../../hooks/useActiveSemester";
import { useSemesterErrorHandler } from "../../../hooks/useSemesterErrorHandler";
import { Brother } from "../../../data";
import { requestJson } from "../../../lib/api";
import { ScheduleFields, initialSchedule, scheduleFromValue, type ScheduleValue } from "../../../components/timeline/ScheduleFields";
import { scheduleDate, scheduleTime, type Schedule } from "@/lib/calendar-feed/schedule";
import "../../../components/dashboard/dashboard-ledger.css";
import "./service-ledger.css";
import "./service-paper.css";
import { PaperService, DeskDate, dayLabel, r1, localToday, standing } from "./PaperService";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceEvent {
  id: number;
  title: string;
  date: string;
  location: string;
  notes: string;
  createdAt: string;
  /** From the linked calendar entry: structured start/end, else legacy free text. */
  schedule?: Schedule | null;
  time?: string | null;
  /** Set on an event added on this page: keeps its card (and its animation)
   *  the same row once the temporary id is swapped for the saved one. */
  clientKey?: string;
  /** Shown before the server has confirmed it; nothing can act on it yet. */
  pending?: boolean;
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
  const activeSemester = useActiveSemester();
  const handleSemesterError = useSemesterErrorHandler();
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
  const [when,         setWhen]         = useState<ScheduleValue>(() => initialSchedule(null, { date: "", isNew: true }));
  const [whenError,    setWhenError]    = useState("");

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
  // Each row's "here · hours" needs its sheet, so every event's participation
  // comes along in one request, fired alongside the events rather than after.
  useEffect(() => {
    const events = requestJson<ServiceEvent[]>("/api/service-events");
    const parts = requestJson<Participation[]>("/api/service-participation").catch(() => null);
    events
      .then(setServiceEvents)
      .catch(() => toast.error("Could not load service events."))
      .finally(() => setEventsLoading(false));
    Promise.all([events, parts]).then(([evs, rows]) => {
      // Rows open their sheets one by one (loadParticipation) if this fails.
      if (!rows) { toast.error("Could not load attendees."); return; }
      const byEvent: Record<number, Participation[]> = Object.fromEntries(evs.map(e => [e.id, []]));
      for (const r of rows) (byEvent[r.serviceEventId] ??= []).push(r);
      // A sheet already fetched or logged in the meantime is newer; keep it.
      setPartByEvent(prev => ({ ...byEvent, ...prev }));
    }).catch(() => { /* events' own catch already said so */ });
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

  // ── Service event CRUD ────────────────────────────────────────────────────────
  function openAddEvent() {
    setEditingEvent(null);
    setEventForm(EMPTY_FORM);
    setWhen(initialSchedule(null, { date: "", isNew: true }));
    setWhenError("");
    setEventModal("add");
  }
  function openEditEvent(e: ServiceEvent) {
    setEditingEvent(e);
    setEventForm({ title: e.title, date: e.date, location: e.location, notes: e.notes });
    setWhen(initialSchedule(e.schedule, { date: e.date, time: e.time, isNew: false }));
    setWhenError("");
    setEventModal("edit");
  }

  async function handleSaveEvent() {
    if (!eventForm.title) return;
    const result = scheduleFromValue(when);
    if ("error" in result) { setWhenError(result.error); return; }
    // A legacy free-text time is left as written until someone sets real times.
    const timing = result.schedule ? { date: scheduleDate(result.schedule), schedule: result.schedule } : { date: when.date };
    const body = { ...eventForm, ...timing };
    if (eventModal === "add") {
      setEventModal(null);
      // On the desk now, inert until the save lands, so adding doesn't wait on
      // the round trip. The temporary id is negative and never sent anywhere.
      const clientKey = `new-${Date.now()}`;
      const draft: ServiceEvent = {
        id: -Date.now(), title: eventForm.title, date: timing.date,
        location: eventForm.location, notes: eventForm.notes, createdAt: new Date().toISOString(),
        schedule: result.schedule ?? null, time: result.schedule ? scheduleTime(result.schedule) : null,
        clientKey, pending: true,
      };
      // A transition, so the list re-render yields instead of dropping a frame
      // at the start of PaperService's add/edit/delete motion.
      startTransition(() => setServiceEvents(prev => [...prev, draft].sort((a, b) => b.date.localeCompare(a.date))));
      try {
        const saved = await requestJson<ServiceEvent>("/api/service-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        setPartByEvent(prev => ({ ...prev, [saved.id]: [] }));
        startTransition(() => setServiceEvents(prev => prev.map(e => e.clientKey === clientKey ? { ...saved, clientKey } : e)));
        toast.success(`Added "${saved.title}".`);
      } catch (err) {
        startTransition(() => setServiceEvents(prev => prev.filter(e => e.clientKey !== clientKey)));
        handleSemesterError(err, msg => toast.error(msg), "Could not add the service event.");
      }
    } else if (eventModal === "edit" && editingEvent) {
      const snapshot = editingEvent;
      const updated = { ...snapshot, ...body };
      startTransition(() => setServiceEvents(list => list.map(e => e.id === snapshot.id ? updated : e).sort((a, b) => b.date.localeCompare(a.date))));
      setEventModal(null);
      setEditingEvent(null);
      try {
        await requestJson<ServiceEvent>(`/api/service-events/${snapshot.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast.success("Service event updated.");
      } catch (err) {
        setServiceEvents(list => list.map(e => e.id === snapshot.id ? snapshot : e).sort((a, b) => b.date.localeCompare(a.date)));
        handleSemesterError(err, msg => toast.error(msg), "Could not save changes.");
      }
    }
  }

  async function handleDeleteEvent(ev: ServiceEvent) {
    startTransition(() => setServiceEvents(prev => prev.filter(e => e.id !== ev.id)));
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
    const recent = serviceEvents.filter(e => !e.pending).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
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
    for (const ev of serviceEvents) if (!ev.pending) loadParticipation(ev.id);
    setMemberDetail(b);
  }

  const orgName = currentUser?.org?.name ?? "ChaptOS";

  return (
    <div className="flex h-screen overflow-hidden bg-[color:var(--paper)]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="Service" onNavClick={() => {}} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ── Toolbar (mobile hamburger + label) ── */}
        <header className="toolbar-frosted dash-toolbar svc-toolbar-bar relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-[rgba(var(--ink-rgb),0.05)] px-4 sm:px-6 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="tb-icon-btn flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--muted)] hover:bg-[rgba(var(--ink-rgb),0.07)]"
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
            <div>
              <PaperService
                orgName={orgName} semesterLabel={activeSemester?.label ?? null} goal={goal}
                roster={roster} events={serviceEvents} eventsLoading={eventsLoading} rosterLoading={isLoading}
                selfId={selfId} canService={canService}
                view={view} setView={k => { setView(k); setSearch(""); }} search={search} setSearch={setSearch}
                expandedId={expandedId} toggleExpand={toggleExpand} partByEvent={partByEvent}
                avatar={(b, size = "xs") => <BrotherAvatar brother={b} selfId={selfId} selfAvatarUrl={currentUser?.avatarUrl} avatarRevision={avatarRevision} size={size} />}
                onNew={openAddEvent} onLogMine={openLogMine} onLog={openLog} onEdit={openEditEvent}
                onDelete={handleDeleteEvent} onRemove={removeAttendee} onMember={openMemberDetail}
              />
            </div>
          </div>
        </main>
      </div>

      {/* ── Add / Edit service event modal ── */}
      {eventModal && (
        <Modal title={eventModal === "add" ? "Log service event" : "Edit service event"} tone="dusk" icon="heart" accent="mint" onClose={() => setEventModal(null)}>
          <div className="cef-root cef svc-wide">
            <div className="cef-field">
              <label className="cef-label" htmlFor="svc-title">Title</label>
              <input id="svc-title" className="cef-input" value={eventForm.title} autoFocus
                onChange={e => setEventForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Beach cleanup, food bank, …" />
            </div>
            <div className="cef-field">
              <span className="cef-label">When</span>
              <ScheduleFields value={when} onChange={setWhen} legacyReadOnly
                minDate={activeSemester?.startDate} maxDate={activeSemester?.endDate} />
              {whenError && <p role="alert" className="cef-hint sched-warn">{whenError}</p>}
            </div>
            <div className="cef-field">
              <label className="cef-label" htmlFor="svc-location">Location<span className="opt">opt</span></label>
              <input id="svc-location" className="cef-input" value={eventForm.location}
                onChange={e => setEventForm(f => ({ ...f, location: e.target.value }))}
                placeholder="Address or venue name" />
            </div>
            <div className="cef-field">
              <label className="cef-label" htmlFor="svc-notes">Notes<span className="opt">opt</span></label>
              <textarea id="svc-notes" className="cef-textarea" value={eventForm.notes}
                onChange={e => setEventForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Details, dress code, what to bring…" />
            </div>
            <div className="svc-foot flex justify-end gap-2 pt-1">
              <span className="note">{activeSemester ? `Dates stay inside ${activeSemester.label}. ` : ""}It lands on the Timeline as a service event.</span>
              <button onClick={() => setEventModal(null)} className="svc-btn ghost">Cancel</button>
              <button onClick={handleSaveEvent} disabled={!eventForm.title} className="svc-btn primary">
                {eventModal === "add" ? "Log event" : "Save changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Log hours picker ── */}
      {logFor && (
        <Modal title={`Log hours · ${logFor.title}`} tone="dusk" icon="clock" accent="mint" onClose={() => !logBusy && setLogFor(null)}>
          <div className="svc-wide">
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
                    <span className="nm">{b.name}<small>{r1(b.serviceHours)}h total</small></span>
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
          <div className="svc-foot flex justify-end gap-2 pt-3">
            <span className="note">{logTally(logDraft)}</span>
            <button onClick={() => setLogFor(null)} disabled={logBusy} className="svc-btn ghost">Cancel</button>
            <button onClick={submitLog} disabled={logBusy} className="svc-btn primary">{logBusy ? "Saving…" : "Save hours"}</button>
          </div>
          </div>
        </Modal>
      )}

      {/* ── Log my hours (self-service) ── */}
      {logMineOpen && (
        <Modal title="Log my hours" tone="dusk" icon="clock" accent="mint" onClose={() => !logMineBusy && setLogMineOpen(false)}>
          <div className="svc-wide svc-mine">
            <div className="svc-mine-pick">
              <p className="svc-mine-k">Which event?</p>
              <div className="svc-mine-list" role="radiogroup" aria-label="Service event">
                {serviceEvents.filter(e => !e.pending).sort((a, b) => b.date.localeCompare(a.date)).map(ev => {
                  const mineH = (partByEvent[ev.id] ?? []).find(p => p.brotherId === selfId)?.hours;
                  return (
                    <button key={ev.id} type="button" role="radio" aria-checked={logMineEventId === ev.id}
                      className={`svc-mine-ev${logMineEventId === ev.id ? " on" : ""}`} onClick={() => setLogMineEventId(ev.id)}>
                      <DeskDate date={ev.date} up={ev.date > localToday()} />
                      <span className="t">{ev.title}<small>{dayLabel(ev.date)}{ev.location ? ` · ${ev.location}` : ""}</small></span>
                      {mineH != null && <span className="had">{r1(mineH)}h</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="svc-mine-hours">
              <p className="svc-mine-k">How many hours?</p>
              <label className="svc-mine-big">
                <input type="number" min="0" step="0.5" inputMode="decimal" value={logMineHours} placeholder="0"
                  onChange={e => setLogMineHours(e.target.value)} aria-label="Hours" />
                <span>h</span>
              </label>
              <div className="svc-chips">
                {[1, 2, 3, 4, 6].map(n => (
                  <button key={n} type="button" className={logMineHours === String(n) ? "on" : ""} onClick={() => setLogMineHours(String(n))}>{n}h</button>
                ))}
              </div>
              <p className="svc-mine-hint">
                You’re at <b>{r1(currentUser ? (roster.find(b => b.id === selfId)?.serviceHours ?? 0) : 0)}h</b> of {goal}. Logging again for the same event replaces your hours there.
              </p>
            </div>
            <div className="svc-foot flex justify-end gap-2">
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
        <Modal title={memberDetail.name} tone="dusk" icon="heart" accent="mint" onClose={() => setMemberDetail(null)}>
          <div className="svc-pmd">
            <div className="svc-pmd-big">
              <b>{r1(memberDetail.serviceHours)}</b>
              <span>of {goal}h goal · {standing(memberDetail.serviceHours, goal) === "ok" ? "on track" : `${r1(goal - memberDetail.serviceHours)}h to go`}</span>
            </div>
            {(() => {
              const logged = memberEvents.reduce((s, x) => s + x.hours, 0);
              // Until every event's sheet has loaded, the remainder would read as "before tracking".
              const loaded = serviceEvents.every(e => e.pending || partByEvent[e.id]);
              if (!loaded) return <p className="svc-pmd-none">Reading the sign-in sheets…</p>;
              const early = Math.round((memberDetail.serviceHours - logged) * 10) / 10;
              if (memberEvents.length === 0 && early <= 0) return <p className="svc-pmd-none">No event-logged hours yet.</p>;
              return (
                <ul className="svc-pmd-l">
                  {memberEvents.map(({ event, hours }) => (
                    <li key={event.id}><span>{event.title}</span><span className="d">{dayLabel(event.date)}</span><span className="h">{r1(hours)}h</span></li>
                  ))}
                  {early > 0 && <li className="early"><span>Recorded before per-event tracking</span><span className="d">—</span><span className="h">{r1(early)}h</span></li>}
                </ul>
              );
            })()}
            <div className="svc-foot flex justify-end"><button className="svc-btn primary" onClick={() => setMemberDetail(null)}>Done</button></div>
          </div>
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

/** "3 members · 7.5h on this sheet" — the Log hours footer's running tally. */
function logTally(draft: Record<number, string>): string {
  let n = 0, h = 0;
  for (const v of Object.values(draft)) { const x = parseFloat(v) || 0; if (x > 0) { n++; h += x; } }
  return `${n} ${n === 1 ? "member" : "members"} · ${round(h)}h on this sheet`;
}

