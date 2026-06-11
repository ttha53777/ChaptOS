"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "../../components/Sidebar";
import { UserAvatar } from "../../components/UserAvatar";
import { Modal, ConfirmDialog } from "../../components/dashboard/primitives";
import { AddProgrammingTaskForm } from "../../components/dashboard/forms";
import { ProgrammingInspector } from "../../components/programming/ProgrammingInspector";
import { ProgrammingMatrix } from "../../components/programming/ProgrammingMatrix";
import { ProgrammingMobileList } from "../../components/programming/ProgrammingMobileList";
import { DocForm, type DocDraft } from "../docs/DocForm";
import type { ProgrammingTask, TaskStatus } from "../../data";
import { useChapter } from "../../context/ChapterContext";
import { requestJson } from "../../lib/api";
import { todayStr } from "../../lib/dates";
import { programmingNeedsAttention } from "@/lib/programming";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const TYPE_FILTERS = ["All", "Program", "Social", "Fundraiser", "Community Service"] as const;
type TimeTab = "All" | "Upcoming" | "Past";
type TypeFilter = (typeof TYPE_FILTERS)[number];
type StatusFilter = "All" | "Needs attention" | "Past unrated";

const TODAY = todayStr();
const EMPTY_DOC: DocDraft = { title: "", url: "", description: "" };

function monthKey(dateStr: string) {
  const [y, m] = dateStr.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

type ApiPatch = Record<string, unknown>;

export default function ProgrammingPage() {
  const { currentUser, can, setProgrammingTaskList } = useChapter();
  const canManage = can("MANAGE_EVENTS");

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [events, setEvents] = useState<ProgrammingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [timeTab, setTimeTab] = useState<TimeTab>("All");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<ProgrammingTask | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProgrammingTask | null>(null);
  const [docsModalId, setDocsModalId] = useState<number | null>(null);
  const [mobileDetailId, setMobileDetailId] = useState<number | null>(null);

  useEffect(() => {
    requestJson<ProgrammingTask[]>("/api/programming")
      .then(data => {
        setEvents(data);
        setProgrammingTaskList(data);
      })
      .catch(() => setPageError("Could not load programming events."))
      .finally(() => setLoading(false));
  }, [setProgrammingTaskList]);

  const syncEvents = useCallback((updater: (prev: ProgrammingTask[]) => ProgrammingTask[]) => {
    setEvents(prev => {
      const next = updater(prev);
      setProgrammingTaskList(next);
      return next;
    });
  }, [setProgrammingTaskList]);

  const patchEvent = useCallback(async (id: number, patch: ApiPatch) => {
    syncEvents(prev => prev.map(e => e.id === id ? { ...e, ...patch } as ProgrammingTask : e));
    try {
      const saved = await requestJson<ProgrammingTask>(`/api/programming/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      syncEvents(prev => prev.map(e => e.id === id ? saved : e));
    } catch {
      setPageError("Could not save changes.");
      requestJson<ProgrammingTask[]>("/api/programming").then(data => {
        setEvents(data);
        setProgrammingTaskList(data);
      }).catch(() => {});
    }
  }, [syncEvents, setProgrammingTaskList]);

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
    if (timeTab === "Upcoming") list = list.filter(e => e.dueDate >= TODAY);
    if (timeTab === "Past")     list = list.filter(e => e.dueDate < TODAY);
    if (typeFilter !== "All")   list = list.filter(e => e.type === typeFilter);
    if (statusFilter === "Needs attention") list = list.filter(e => programmingNeedsAttention(e, TODAY));
    if (statusFilter === "Past unrated")    list = list.filter(e => e.dueDate < TODAY && e.successRating == null);
    return list.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id);
  }, [events, search, timeTab, typeFilter, statusFilter]);

  const monthGroups = useMemo(() => {
    const map = new Map<string, ProgrammingTask[]>();
    for (const e of filtered) {
      const key = monthKey(e.dueDate);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const counts = useMemo(() => ({
    all:      events.length,
    upcoming: events.filter(e => e.dueDate >= TODAY).length,
    past:     events.filter(e => e.dueDate < TODAY).length,
  }), [events]);

  const selected = events.find(e => e.id === selectedId) ?? null;
  const mobileDetail = events.find(e => e.id === mobileDetailId) ?? null;

  async function handleAdd(input: {
    title: string; dueDate: string; location: string; time?: string | null;
    collab?: string | null; type: string; status: TaskStatus;
  }) {
    try {
      const created = await requestJson<ProgrammingTask>("/api/programming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      syncEvents(prev => [...prev, created].sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
      setSelectedId(created.id);
      setModal(null);
    } catch {
      setPageError("Could not create event.");
    }
  }

  async function handleEdit(input: {
    title: string; dueDate: string; location: string; time?: string | null;
    collab?: string | null; type: string; status: TaskStatus;
  }) {
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
      requestJson<ProgrammingTask[]>("/api/programming").then(data => {
        setEvents(data);
        setProgrammingTaskList(data);
      }).catch(() => {});
    }
  }

  function openEdit(e: ProgrammingTask) {
    setEditTarget(e);
    setModal("edit");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#07090f]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="Programming" onNavClick={() => {}} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="toolbar-frosted relative z-10 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.05] px-4 sm:px-6">
          <button onClick={() => setSidebarOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.07] lg:hidden">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight text-white">Programming</p>
            <p className="hidden text-[11px] leading-tight text-slate-400 sm:block">{currentUser?.org?.name ?? "ChaptOS"} · Event planning &amp; prep</p>
          </div>
          {canManage && (
            <button
              onClick={() => setModal("add")}
              className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-[12px] font-semibold text-indigo-300 hover:bg-indigo-500/20 transition-colors"
            >
              + Add Event
            </button>
          )}
          <UserAvatar />
        </header>

        {pageError && (
          <div className="flex items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/10 px-5 py-2.5">
            <p className="text-[12px] text-amber-400">{pageError}</p>
            <button onClick={() => setPageError(null)} className="text-amber-500 hover:text-amber-300">Dismiss</button>
          </div>
        )}

        <main className="page-ambient flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1500px] px-4 py-4 sm:px-6">

            {loading && (
              <div className="space-y-2">
                <div className="h-10 animate-pulse rounded-xl border border-white/[0.06] bg-[#10121a]" />
                <div className="h-[480px] animate-pulse rounded-xl border border-white/[0.06] bg-[#10121a]" />
              </div>
            )}

            {!loading && <>
              <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-[#0b0e14]/95 px-3 py-2 backdrop-blur">
                <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
                  <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                  </svg>
                  <input
                    type="search"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search events, locations, collabs"
                    className="h-8 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] pl-8 pr-3 text-[12px] text-white placeholder:text-slate-500 focus:border-indigo-500/40 focus:outline-none"
                  />
                </div>
                <div className="flex gap-1">
                  {(["All", "Upcoming", "Past"] as TimeTab[]).map(tab => (
                    <button key={tab} onClick={() => setTimeTab(tab)}
                      className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all ${timeTab === tab ? "bg-white/[0.10] text-white" : "border border-white/[0.08] text-slate-400 hover:text-slate-200"}`}>
                      {tab}
                      <span className="ml-1.5 text-[10px] tabular-nums text-slate-500">
                        {tab === "All" ? counts.all : tab === "Upcoming" ? counts.upcoming : counts.past}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {TYPE_FILTERS.map(f => (
                    <button key={f} onClick={() => setTypeFilter(f)}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${typeFilter === f ? "bg-white/[0.10] text-white" : "border border-white/[0.08] text-slate-400 hover:text-slate-200"}`}>
                      {f}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {(["All", "Needs attention", "Past unrated"] as StatusFilter[]).map(f => (
                    <button key={f} onClick={() => setStatusFilter(f)}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${statusFilter === f ? "bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/25" : "border border-white/[0.08] text-slate-400 hover:text-slate-200"}`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Desktop: spreadsheet + optional inspector */}
              <div className={`hidden lg:grid lg:gap-4 ${selected ? "lg:grid-cols-[minmax(0,1fr)_360px]" : "lg:grid-cols-1"}`}>
                <ProgrammingMatrix
                  monthGroups={monthGroups}
                  selectedId={selectedId}
                  canManage={canManage}
                  onSelect={id => setSelectedId(id === selectedId ? null : id)}
                  onPatch={patchEvent}
                  onDocs={id => setDocsModalId(id)}
                />

                {selected && (
                  <div className="min-h-[420px]">
                    <ProgrammingInspector
                      event={selected}
                      canManage={canManage}
                      onPatch={patchEvent}
                      onEdit={() => openEdit(selected)}
                      onDelete={() => setDeleteTarget(selected)}
                    />
                  </div>
                )}
              </div>

              <ProgrammingMobileList monthGroups={monthGroups} onOpen={setMobileDetailId} />
            </>}
          </div>
        </main>
      </div>

      {modal === "add" && (
        <Modal title="Add Event" onClose={() => setModal(null)}>
          <AddProgrammingTaskForm onSubmit={handleAdd} />
        </Modal>
      )}

      {modal === "edit" && editTarget && (
        <Modal title="Edit Event" onClose={() => { setModal(null); setEditTarget(null); }}>
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
          title="Delete this event?"
          message={`"${deleteTarget.title}" will be removed from programming and the timeline.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {docsModalId != null && (
        <EventDocsModal
          eventId={docsModalId}
          event={events.find(e => e.id === docsModalId)!}
          canManage={canManage}
          onClose={() => setDocsModalId(null)}
          onDocCountChange={count => patchEvent(docsModalId, { docCount: count })}
        />
      )}

      {mobileDetailId != null && mobileDetail && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#07090f] lg:hidden">
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] px-4">
            <button onClick={() => setMobileDetailId(null)} className="text-[13px] font-semibold text-indigo-400">Close</button>
            <p className="flex-1 truncate text-[14px] font-semibold text-white">{mobileDetail.title}</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <ProgrammingInspector
              event={mobileDetail}
              canManage={canManage}
              onPatch={patchEvent}
              onEdit={() => { setMobileDetailId(null); openEdit(mobileDetail); }}
              onDelete={() => { setMobileDetailId(null); setDeleteTarget(mobileDetail); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function EventDocsModal({
  eventId,
  event,
  canManage,
  onClose,
  onDocCountChange,
}: {
  eventId: number;
  event: ProgrammingTask;
  canManage: boolean;
  onClose: () => void;
  onDocCountChange: (count: number) => void;
}) {
  const [docs, setDocs] = useState<{ id: number; title: string; url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    requestJson<typeof docs>(`/api/programming/${eventId}/docs`)
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, [eventId]);

  async function handleAdd(draft: DocDraft) {
    const created = await requestJson<{ id: number; title: string; url: string }>(`/api/programming/${eventId}/docs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setDocs(prev => [created, ...prev]);
    onDocCountChange(docs.length + 1);
    setShowAdd(false);
  }

  async function handleDelete(id: number) {
    await requestJson<void>(`/api/programming/${eventId}/docs/${id}`, { method: "DELETE" });
    setDocs(prev => {
      const next = prev.filter(d => d.id !== id);
      onDocCountChange(next.length);
      return next;
    });
  }

  return (
    <Modal title={`Files — ${event.title}`} onClose={onClose}>
      <div className="space-y-3">
        {loading ? <p className="text-[12px] text-slate-500">Loading…</p> : docs.length === 0 ? (
          <p className="text-[12px] text-slate-500">No files linked.</p>
        ) : (
          <ul className="space-y-2">
            {docs.map(d => (
              <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-[12px] text-indigo-400 hover:underline">{d.title}</a>
                {canManage && (
                  <button onClick={() => handleDelete(d.id)} className="shrink-0 text-[11px] text-red-400 hover:text-red-300">Remove</button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canManage && !showAdd && (
          <button onClick={() => setShowAdd(true)} className="text-[12px] font-semibold text-indigo-400 hover:text-indigo-300">+ Add link</button>
        )}
        {showAdd && (
          <DocForm initial={EMPTY_DOC} submitLabel="Add" onSubmit={handleAdd} onClose={() => setShowAdd(false)} />
        )}
      </div>
    </Modal>
  );
}
