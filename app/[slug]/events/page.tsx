"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "../../components/Sidebar";
import { Modal, ConfirmDialog } from "../../components/dashboard/primitives";
import { inputDuskCls, btnDuskPrimaryCls } from "../../components/dashboard/styles";
import { AddProgrammingTaskForm } from "../../components/dashboard/forms";
import { ProgrammingBoard } from "../../components/programming/ProgrammingBoard";
import { ProgrammingCalendarView } from "../../components/programming/ProgrammingCalendarView";
import { ProgrammingInspector } from "../../components/programming/ProgrammingInspector";
import { ProgrammingTable } from "../../components/programming/ProgrammingTable";
import { LedgerStrip, Measure } from "../../components/dashboard/ledger/LedgerStrip";
import type { ProgrammingTask, TaskStatus } from "../../data";
import { fmt$, fmtDate } from "../../data";
import type { Doc } from "../docs/DocCard";
import { useChapter } from "../../context/ChapterContext";
import { requestJson } from "../../lib/api";
import { todayStr } from "../../lib/dates";
import {
  eventsNeedingAttention,
  eventsTermStats,
  nextOnDeckEvent,
  programmingPrepChecks,
  type AttentionEntry,
} from "@/lib/programming";
import type { ProgrammingStage } from "@/lib/state/programming-stage";
import "./events-ledger.css";
import "../../components/dashboard/dashboard-ledger.css";

const TYPE_FILTERS = ["All", "Program", "Social", "Fundraiser", "Community Service"] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];
const FILTER_LABEL: Record<TypeFilter, string> = {
  All: "All", Program: "Program", Social: "Social", Fundraiser: "Fundraiser", "Community Service": "Service",
};
type View = "board" | "calendar" | "table";

type ApiPatch = Record<string, unknown>;

type FormInput = {
  title: string; dueDate: string | null; location: string | null; time?: string | null;
  collab?: string | null; type: string; status: TaskStatus;
};

export default function ProgrammingPage() {
  const { currentUser, can, setProgrammingTaskList } = useChapter();
  const canManage = can("MANAGE_EVENTS");

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [events, setEvents] = useState<ProgrammingTask[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [view, setView] = useState<View>("board");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("All");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isClosingDrawer, setIsClosingDrawer] = useState(false);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<ProgrammingTask | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProgrammingTask | null>(null);
  const [promotePrompt, setPromotePrompt] = useState<{ id: number; stage: ProgrammingStage } | null>(null);

  // Animate the inspector drawer out before unmounting.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeDrawer = useCallback(() => {
    setIsClosingDrawer(true);
    closeTimerRef.current = setTimeout(() => { setSelectedId(null); setIsClosingDrawer(false); }, 280);
  }, []);

  // Escape key closes the inspector (or modals — Modal component handles its own Escape).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedId !== null && modal === null) closeDrawer();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedId, modal, closeDrawer]);

  // Click-outside closes the inspector on desktop (mobile uses the backdrop).
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedId || isClosingDrawer) return;
    function onPointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        closeDrawer();
      }
    }
    // Use pointerdown so it fires before any click handlers on the board.
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [selectedId, isClosingDrawer, closeDrawer]);

  useEffect(() => {
    requestJson<ProgrammingTask[]>("/api/programming")
      .then(data => {
        setEvents(data);
        setProgrammingTaskList(data);
      })
      .catch(() => setPageError("Could not load programming events."))
      .finally(() => setLoading(false));
  }, [setProgrammingTaskList]);

  // Keep a ref to the latest events so syncEvents can compute the next list
  // without nesting setProgrammingTaskList inside setEvents' updater (calling
  // another component's setter from within an updater triggers React's
  // "update a component while rendering a different component" warning, since
  // updaters run during render).
  const eventsRef = useRef<ProgrammingTask[]>(events);
  useEffect(() => { eventsRef.current = events; }, [events]);

  // Resources docs, used to resolve a doc attachment's URL so the table's
  // paperclip can open the doc directly.
  useEffect(() => {
    requestJson<Doc[]>("/api/docs").then(setDocs).catch(() => setDocs([]));
  }, []);

  const syncEvents = useCallback((updater: (prev: ProgrammingTask[]) => ProgrammingTask[]) => {
    const next = updater(eventsRef.current);
    eventsRef.current = next;
    setEvents(next);
    setProgrammingTaskList(next);
  }, [setProgrammingTaskList]);

  const reload = useCallback(() => {
    requestJson<ProgrammingTask[]>("/api/programming").then(data => {
      setEvents(data);
      setProgrammingTaskList(data);
    }).catch(() => {});
  }, [setProgrammingTaskList]);

  const patchEvent = useCallback(async (id: number, patch: ApiPatch) => {
    syncEvents(prev => prev.map(e => e.id === id ? { ...e, ...patch } as ProgrammingTask : e));
    // `checklist` is a client-only optimistic field; never PATCH it to /api/programming.
    const { checklist: _checklist, ...rest } = patch;
    if (Object.keys(rest).length === 0) return;
    try {
      const saved = await requestJson<ProgrammingTask>(`/api/programming/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rest),
      });
      syncEvents(prev => prev.map(e => e.id === id ? saved : e));
    } catch {
      setPageError("Could not save changes.");
      reload();
    }
  }, [syncEvents, reload]);

  /** Move an event to a new stage. Returns false if rejected (e.g. promote without date). */
  const moveStage = useCallback(async (id: number, stage: ProgrammingStage): Promise<boolean> => {
    const target = events.find(e => e.id === id);
    if (!target) return false;
    if (stage !== "idea" && !target.dueDate) {
      // Promoting out of Idea needs a date — ask for one first.
      setPromotePrompt({ id, stage });
      return false;
    }
    const prevStage = target.stage;
    syncEvents(prev => prev.map(e => e.id === id ? { ...e, stage } : e));
    try {
      const saved = await requestJson<ProgrammingTask>(`/api/programming/${id}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      syncEvents(prev => prev.map(e => e.id === id ? saved : e));
      return true;
    } catch {
      syncEvents(prev => prev.map(e => e.id === id ? { ...e, stage: prevStage } : e));
      setPageError("Could not move event.");
      return false;
    }
  }, [events, syncEvents]);

  const filtered = useMemo(() => {
    let list = [...events];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q) ||
        (e.collab ?? "").toLowerCase().includes(q),
      );
    }
    if (typeFilter !== "All") list = list.filter(e => e.type === typeFilter);
    return list;
  }, [events, search, typeFilter]);

  const selected = events.find(e => e.id === selectedId) ?? null;

  // ── Derived: on-deck hero, glance stats, attention rail, recent recap ──
  const today = todayStr();
  const onDeck = useMemo(() => nextOnDeckEvent(events, today), [events, today]);
  const stats = useMemo(() => eventsTermStats(events, today), [events, today]);
  const attention = useMemo(() => eventsNeedingAttention(events, today).slice(0, 4), [events, today]);
  const recap = useMemo(
    () =>
      events
        .filter(e => e.stage === "done")
        .sort((a, b) => (b.dueDate ?? "").localeCompare(a.dueDate ?? ""))
        .slice(0, 3),
    [events],
  );

  const orgName = currentUser?.org?.name ?? "ChaptOS";
  const dateLabel = new Date(today + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  async function handleAdd(input: FormInput) {
    try {
      const created = await requestJson<ProgrammingTask>("/api/programming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      syncEvents(prev => [...prev, created]);
      setSelectedId(created.id);
      setModal(null);
    } catch {
      setPageError("Could not create event.");
    }
  }

  async function handleEdit(input: FormInput) {
    if (!editTarget) return;
    await patchEvent(editTarget.id, {
      title: input.title,
      dueDate: input.dueDate,
      location: input.location,
      time: input.time,
      collab: input.collab,
      type: input.type,
      status: input.status,
    });
    setModal(null);
    setEditTarget(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    syncEvents(prev => prev.filter(e => e.id !== id));
    if (selectedId === id) setSelectedId(null);
    try {
      await requestJson<void>(`/api/programming/${id}`, { method: "DELETE" });
    } catch {
      setPageError("Could not delete event.");
      reload();
    }
  }

  function openEdit(e: ProgrammingTask) {
    setEditTarget(e);
    setModal("edit");
  }

  // Open a card in the inspector (toggles closed if it's already the selected one).
  const selectCard = useCallback((id: number) => {
    if (id === selectedId) { closeDrawer(); return; }
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setIsClosingDrawer(false);
    setSelectedId(id);
  }, [selectedId, closeDrawer]);

  const railOpen = selected || isClosingDrawer;

  return (
    <div className="flex h-screen overflow-hidden bg-[#0f0d0a]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="Programming" onNavClick={() => {}} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ── Slim toolbar (mobile hamburger + breadcrumb) ── */}
        <header className="toolbar-frosted dash-toolbar ev-toolbar-bar relative z-20 flex h-14 shrink-0 items-center gap-3 border-b px-4 sm:px-6 lg:hidden">
          <button onClick={() => setSidebarOpen(true)}
            className="tb-icon-btn flex h-8 w-8 items-center justify-center rounded-lg lg:hidden"
            aria-label="Open menu">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="ev-crumb truncate">Events</span>
        </header>

        <main className="page-ambient flex-1 overflow-y-auto">
          <div className="dash dash-events" data-dashboard-theme="dusk">

            {pageError && (
              <div className="ev-toast" role="status">
                <span>{pageError}</span>
                <button onClick={() => setPageError(null)} aria-label="Dismiss">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* ── Briefing ── */}
            <section className="briefing" aria-label="Events">
              <div>
                <p className="kicker">
                  <span className="today">{dateLabel}</span>
                  &ensp;·&ensp;Events&ensp;·&ensp;{orgName}
                </p>
                <h1 className="greeting">The <em>programme</em>.</h1>
                <div className="digest">
                  <span className="ai-chip">AI</span>
                  {loading
                    ? <p className="digest-loading">Reading the slate…</p>
                    : <p>{briefingDigest(onDeck, attention, today)}</p>}
                </div>
              </div>
              {canManage && (
                <button className="ev-add" onClick={() => setModal("add")}>
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  New event
                </button>
              )}
            </section>

            {loading ? (
              <>
                <div className="ev-skel glance" />
                <div className="ev-sec" style={{ marginTop: 30 }}><h2>Pipeline</h2><span className="rule" /></div>
                <div className="ev-skel" />
              </>
            ) : (
              <>
                {/* ── Glance strip ── */}
                <LedgerStrip>
                  <Measure
                    label="On the slate"
                    value={String(stats.total)}
                    note={`${stats.byStage.idea} ideas · ${stats.byStage.planning} planning · ${stats.byStage.confirmed} confirmed`}
                  />
                  <Measure
                    label="Next 14 days"
                    value={String(stats.next14)}
                    unit={stats.next14 === 1 ? " event" : " events"}
                    note={stats.next14NeedRoom > 0
                      ? `${stats.next14NeedRoom} need${stats.next14NeedRoom === 1 ? "s" : ""} a room booked`
                      : "all rooms handled"}
                    noteWarn={stats.next14NeedRoom > 0}
                  />
                  <Measure
                    label="Avg success"
                    value={stats.avgSuccess != null ? stats.avgSuccess.toFixed(1) : "—"}
                    unit={stats.avgSuccess != null ? "/5" : undefined}
                    note={`across ${stats.doneCount} wrapped`}
                  />
                  <Measure
                    label="Spent this term"
                    value={fmt$(stats.spendCents / 100)}
                    note="across all events"
                  />
                </LedgerStrip>

                <div className="ev-layout">
                  <div className="min-w-0">

                    {/* ── On-deck hero ── */}
                    {onDeck && <OnDeckHero event={onDeck} today={today} onOpen={() => selectCard(onDeck.id)} />}

                    {/* ── Pipeline ── */}
                    <div className="ev-sec">
                      <h2>Pipeline</h2>
                      <span className="rule" />
                      <div className="ev-views">
                        {(["board", "calendar", "table"] as View[]).map(v => (
                          <button key={v} className={view === v ? "on" : ""} onClick={() => setView(v)}>{v}</button>
                        ))}
                      </div>
                    </div>

                    <div className="ev-filters">
                      {TYPE_FILTERS.map(f => (
                        <button key={f} className={`chip${typeFilter === f ? " on" : ""}`} onClick={() => setTypeFilter(f)}>
                          {FILTER_LABEL[f]}
                        </button>
                      ))}
                      <span className="grow" />
                      <span className="ev-search">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                        <input
                          type="search"
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          placeholder="Search events…"
                        />
                      </span>
                    </div>

                    {events.length === 0 ? (
                      <div className="ev-empty">
                        <span className="ic">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                        </span>
                        <div className="t">No events yet</div>
                        <div className="h">{canManage ? "Add your first event to start the programme." : "Nothing on the slate yet."}</div>
                      </div>
                    ) : view === "board" ? (
                      <ProgrammingBoard
                        tasks={filtered}
                        selectedId={selectedId}
                        canManage={canManage}
                        variant="dusk"
                        onSelect={selectCard}
                        onMoveStage={moveStage}
                      />
                    ) : view === "calendar" ? (
                      <ProgrammingCalendarView
                        tasks={filtered}
                        selectedId={selectedId}
                        variant="dusk"
                        onSelect={selectCard}
                      />
                    ) : (
                      <ProgrammingTable
                        tasks={filtered}
                        docs={docs}
                        selectedId={selectedId}
                        canManage={canManage}
                        onSelect={selectCard}
                        onPatch={patchEvent}
                      />
                    )}
                  </div>

                  {/* ── Right column: the attention/recap rail (hidden when a card is
                       open; the inspector below takes the same slot on desktop). ── */}
                  {!railOpen && (
                    <aside className="ev-rail">
                      <div>
                        <p className="lbl">Needs attention · before its date</p>
                        <div className="ev-attn">
                          {attention.length === 0 ? (
                            <p className="a-empty">Everything's prepped — nice work.</p>
                          ) : attention.map(({ task, reason, tone }) => (
                            <button key={task.id} className="a-row" onClick={() => selectCard(task.id)}>
                              <span className={`a-flag ${tone}`} />
                              <div className="a-main">
                                <div className="a-t">{task.title}</div>
                                <div className={`a-need ${tone}`}>{attnReason(reason)}</div>
                              </div>
                              <span className="a-when">{whenLabel(task.dueDate, today)}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {recap.length > 0 && (
                        <div>
                          <p className="lbl">Recently wrapped</p>
                          <div className="ev-recap">
                            {recap.map(task => (
                              <button key={task.id} className="r-row" onClick={() => selectCard(task.id)}>
                                <div className="r-main">
                                  <div className="r-t">{task.title}</div>
                                  <div className="r-meta">
                                    {task.dueDate ? fmtDate(task.dueDate) : "—"}
                                    {task.spendingCents > 0 ? ` · ${fmt$(task.spendingCents / 100)} spent` : ""}
                                  </div>
                                </div>
                                <span className="r-stars">
                                  {task.successRating != null
                                    ? <>{"★".repeat(task.successRating)}<span className="off">{"★".repeat(5 - task.successRating)}</span></>
                                    : <span className="off">★★★★★</span>}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </aside>
                  )}

                  {/* ── Inspector: bottom-sheet on mobile, inline column on desktop.
                       One element + one panelRef so click-outside works on both. ── */}
                  {railOpen && (
                    <>
                      {/* Mobile-only dimmed backdrop behind the sheet. */}
                      <div className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-[280ms] xl:hidden ${isClosingDrawer ? "opacity-0" : "opacity-100"}`} />
                      <div
                        ref={panelRef}
                        className={`fixed inset-x-0 bottom-0 top-14 z-50 overflow-hidden rounded-t-2xl border-t border-white/[0.1] transition-[transform,opacity] duration-[280ms] ease-in-out xl:static xl:inset-auto xl:top-auto xl:z-auto xl:rounded-none xl:border-0 xl:opacity-100 xl:translate-y-0 ${isClosingDrawer ? "translate-y-full opacity-0" : "translate-y-0 opacity-100"}`}
                      >
                        {selected && (
                          <ProgrammingInspector
                            event={selected}
                            canManage={canManage}
                            onPatch={patchEvent}
                            onStage={moveStage as unknown as (id: number, stage: ProgrammingStage) => Promise<void>}
                            onEdit={() => openEdit(selected)}
                            onDelete={() => setDeleteTarget(selected)}
                          />
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {modal === "add" && (
        <Modal title="New Event" tone="dusk" onClose={() => setModal(null)}>
          <AddProgrammingTaskForm onSubmit={handleAdd} />
        </Modal>
      )}

      {modal === "edit" && editTarget && (
        <Modal title="Edit Event" tone="dusk" onClose={() => { setModal(null); setEditTarget(null); }}>
          <AddProgrammingTaskForm
            initial={{
              title: editTarget.title,
              dueDate: editTarget.dueDate,
              location: editTarget.location,
              time: editTarget.time ?? undefined,
              collab: editTarget.collab,
              type: editTarget.type,
              status: editTarget.status,
            }}
            onSubmit={handleEdit}
          />
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          tone="dusk"
          title="Delete this event?"
          message={`"${deleteTarget.title}" will be removed from programming${deleteTarget.dueDate ? " and the timeline" : ""}.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {promotePrompt && (
        <PromoteDateModal
          onCancel={() => setPromotePrompt(null)}
          onConfirm={async (date) => {
            const { id, stage } = promotePrompt;
            setPromotePrompt(null);
            await patchEvent(id, { dueDate: date });
            await moveStage(id, stage);
          }}
        />
      )}
    </div>
  );
}

function PromoteDateModal({ onConfirm, onCancel }: {
  onConfirm: (date: string) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState("");
  return (
    <Modal title="Set a date" tone="dusk" onClose={onCancel}>
      <form
        onSubmit={e => { e.preventDefault(); if (date) onConfirm(date); }}
        className="space-y-4"
      >
        <p className="text-[12px] text-[#958d7c]">Events need a date once they leave the Idea stage — they&apos;ll show on the timeline.</p>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          required
          className={inputDuskCls}
        />
        <button type="submit" disabled={!date} className={btnDuskPrimaryCls}>
          Move event
        </button>
      </form>
    </Modal>
  );
}

// ─── Helpers + on-deck hero ──────────────────────────────────────────────────

/** Days until a date, relative to `today` (negative = past). */
function daysUntil(dueDate: string, today: string): number {
  const ms = new Date(dueDate + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime();
  return Math.round(ms / 86_400_000);
}

/** Compact "when" label for rail rows: Today / Tomorrow / In Nd / a date. */
function whenLabel(dueDate: string | null, today: string): string {
  if (!dueDate) return "—";
  const d = daysUntil(dueDate, today);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d > 1 && d <= 30) return `In ${d}d`;
  return fmtDate(dueDate);
}

/** Warmer "when" phrasing for the briefing digest: "today" / "tomorrow" / "this
 *  Thursday" / a plain date. */
function digestWhen(dueDate: string | null, today: string): string {
  if (!dueDate) return "soon";
  const d = daysUntil(dueDate, today);
  if (d === 0) return "it's today";
  if (d === 1) return "tomorrow";
  const dow = new Date(dueDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });
  if (d <= 7) return `this ${dow}`;
  if (d <= 14) return `next ${dow}`;
  return fmtDate(dueDate);
}

function attnReason(reason: AttentionEntry<ProgrammingTask>["reason"]): string {
  if (reason === "room") return "Room not booked";
  if (reason === "flyer") return "Flyer not posted";
  return "Prep incomplete";
}

/** The AI digest sentence under the briefing — derived, not a live model call. */
function briefingDigest(
  onDeck: ProgrammingTask | null,
  attention: AttentionEntry<ProgrammingTask>[],
  today: string,
): string {
  if (!onDeck) {
    return "Nothing on the calendar yet — promote an idea out of the backlog to get the next event on the books.";
  }
  const lead = `${onDeck.title} is up first — ${digestWhen(onDeck.dueDate, today)}.`;
  const blocker = attention.find(a => a.task.id === onDeck.id);
  if (blocker) {
    return `${lead} ${attnReason(blocker.reason)} — that's the one thing standing between you and a clear slate.`;
  }
  const others = attention.length;
  if (others > 0) {
    return `${lead} It's fully prepped, but ${others} other ${others === 1 ? "event" : "events"} still need attention before their date.`;
  }
  return `${lead} Everything on the slate is prepped and on track.`;
}

/** Contextual hero CTA: label reflects the top blocker; all open the inspector. */
function heroCta(checks: ReturnType<typeof programmingPrepChecks>): { label: string; icon: "room" | "flyer" | "check" } {
  const room = checks.find(c => c.key === "room");
  const flyer = checks.find(c => c.key === "flyer");
  if (room && !room.done) return { label: "Book the room", icon: "room" };
  if (flyer && !flyer.done) return { label: "Post the flyer", icon: "flyer" };
  return { label: "Open checklist", icon: "check" };
}

function OnDeckHero({ event, today, onOpen }: { event: ProgrammingTask; today: string; onOpen: () => void }) {
  const checks = programmingPrepChecks(event);
  const done = checks.filter(c => c.done).length;
  const total = checks.length;
  const full = done === total;
  const cta = heroCta(checks);
  const blocker = checks.find(c => !c.done);
  const days = event.dueDate ? daysUntil(event.dueDate, today) : null;
  const cnt = days != null ? (days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`) : null;

  const whenLine = [
    event.dueDate ? fmtDate(event.dueDate) : null,
    event.time ?? null,
  ].filter(Boolean).join(" · ");

  return (
    <>
      <div className="ev-sec">
        <h2>On deck</h2>
        <span className="rule" />
        {cnt && <span className="cnt">{cnt}</span>}
      </div>

      <div className="ev-hero">
        <div className="od-top">
          <span className="pill">Next event</span>
          <span className="typ">{event.type}</span>
          <span className="when">{whenLine || "No date"}</span>
        </div>
        <h3>{event.title}</h3>
        <p className="meta">
          {event.location && <span><b>{event.location}</b></span>}
          {event.collab && <><span>·</span><span>w/ <b>{event.collab}</b></span></>}
          {event.owner && <><span>·</span><span>Owner <b>{event.owner.split(" ")[0]}</b></span></>}
          {event.spendingCents > 0 && <><span>·</span><span>Budget <b>{fmt$(event.spendingCents / 100)}</b></span></>}
        </p>

        <div className="ev-prep">
          <div className="p-head">
            <span className="p-lbl">Prep checklist</span>
            <span className="p-count"><b>{done}</b> / {total} ready</span>
            <span className={`p-state ${full ? "ok" : "warn"}`}>{full ? "✓ All set" : `${total - done} to go`}</span>
          </div>
          <div className="ev-pchecks">
            {checks.map(c => (
              <div key={c.key} className={`ev-pcheck ${c.done ? "done" : "block"}`}>
                <div className="pc-ico">
                  {c.done ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
                  )}
                  <span className="pc-k">{c.label}</span>
                </div>
                <div className="pc-v">{prepValue(c.key, c.done)}</div>
              </div>
            ))}
          </div>
        </div>

        {blocker && (
          <div className="ev-blocker">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
            <p><b>{blockerHead(blocker.key)}</b> {blockerTail(blocker.key, days)}</p>
          </div>
        )}

        <div className="actions">
          <button className="ev-btn-primary" onClick={onOpen}>
            <CtaIcon icon={cta.icon} />
            {cta.label}
          </button>
          <button className="ev-btn-ghost" onClick={onOpen}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
            Open event
          </button>
        </div>
      </div>
    </>
  );
}

function prepValue(key: string, done: boolean): string {
  switch (key) {
    case "room":       return done ? "Booked" : "Not booked";
    case "attachment": return done ? "Attached" : "Missing";
    case "flyer":      return done ? "Posted" : "Not posted";
    case "socials":    return done ? "Held" : "Not held";
    default:           return done ? "Done" : "To do";
  }
}

function blockerHead(key: string): string {
  if (key === "room") return "Room not booked.";
  if (key === "flyer") return "Flyer not posted.";
  if (key === "attachment") return "No itinerary attached.";
  return "Socials meeting not held.";
}

function blockerTail(key: string, days: number | null): string {
  const window = days != null && days >= 0
    ? days === 0 ? "It's today" : `It's in ${days} day${days === 1 ? "" : "s"}`
    : "It's coming up";
  if (key === "room") return `${window} — reserve the venue to clear the slate.`;
  if (key === "flyer") return `${window} — post the flyer so brothers can RSVP.`;
  if (key === "attachment") return `${window} — attach the itinerary or run-of-show.`;
  return `${window} — sync with socials before the event.`;
}

function CtaIcon({ icon }: { icon: "room" | "flyer" | "check" }) {
  if (icon === "room") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9h18M8 3v4M16 3v4" /><rect x="3" y="5" width="18" height="16" rx="2" /></svg>;
  }
  if (icon === "flyer") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>;
}
