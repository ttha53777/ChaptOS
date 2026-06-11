"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "../../components/Sidebar";
import { UserAvatar } from "../../components/UserAvatar";
import { Modal, ConfirmDialog } from "../../components/dashboard/primitives";
import { AddProgrammingTaskForm } from "../../components/dashboard/forms";
import { ProgrammingBoard } from "../../components/programming/ProgrammingBoard";
import { ProgrammingCalendarView } from "../../components/programming/ProgrammingCalendarView";
import { ProgrammingInspector } from "../../components/programming/ProgrammingInspector";
import type { ProgrammingTask, TaskStatus } from "../../data";
import { useChapter } from "../../context/ChapterContext";
import { requestJson } from "../../lib/api";
import type { ProgrammingStage } from "@/lib/state/programming-stage";

const TYPE_FILTERS = ["All", "Program", "Social", "Fundraiser", "Community Service"] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];
type View = "board" | "calendar";

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
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [view, setView] = useState<View>("board");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("All");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<ProgrammingTask | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProgrammingTask | null>(null);
  const [promotePrompt, setPromotePrompt] = useState<{ id: number; stage: ProgrammingStage } | null>(null);

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
            <p className="hidden text-[11px] leading-tight text-slate-400 sm:block">{currentUser?.org?.name ?? "ChaptOS"} · Plan &amp; track org events</p>
          </div>
          <div className="flex items-center rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5 text-[12px]">
            {(["board", "calendar"] as View[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 font-medium capitalize transition-colors ${view === v ? "bg-white/[0.10] text-white" : "text-slate-400 hover:text-slate-200"}`}>
                {v}
              </button>
            ))}
          </div>
          {canManage && (
            <button
              onClick={() => setModal("add")}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-2.5 py-1.5 text-[12px] font-semibold text-indigo-300 transition-colors hover:bg-indigo-500/20 sm:px-3"
              aria-label="New event"
            >
              <span className="text-[14px] leading-none">+</span>
              <span className="hidden sm:inline">New Event</span>
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
          <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6">

            {loading && (
              <div className="space-y-2">
                <div className="h-10 animate-pulse rounded-xl border border-white/[0.06] bg-[#10121a]" />
                <div className="h-[480px] animate-pulse rounded-xl border border-white/[0.06] bg-[#10121a]" />
              </div>
            )}

            {!loading && <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
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
                <div className="flex flex-wrap gap-1">
                  {TYPE_FILTERS.map(f => (
                    <button key={f} onClick={() => setTypeFilter(f)}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${typeFilter === f ? "bg-white/[0.10] text-white" : "border border-white/[0.08] text-slate-400 hover:text-slate-200"}`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`grid gap-4 ${selected ? "xl:grid-cols-[minmax(0,1fr)_380px]" : "grid-cols-1"}`}>
                <div className="min-w-0">
                  {view === "board" ? (
                    <ProgrammingBoard
                      tasks={filtered}
                      selectedId={selectedId}
                      canManage={canManage}
                      onSelect={id => setSelectedId(id === selectedId ? null : id)}
                      onMoveStage={moveStage}
                    />
                  ) : (
                    <ProgrammingCalendarView
                      tasks={filtered}
                      selectedId={selectedId}
                      onSelect={id => setSelectedId(id === selectedId ? null : id)}
                    />
                  )}
                </div>

                {selected && (
                  <>
                    {/* Mobile: full-screen drawer. Desktop (xl+): inline side panel. */}
                    <div
                      onClick={() => setSelectedId(null)}
                      className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm xl:hidden"
                    />
                    <div className="fixed inset-x-0 bottom-0 top-14 z-50 overflow-hidden rounded-t-2xl border-t border-white/[0.1] xl:static xl:inset-auto xl:top-auto xl:z-auto xl:min-h-[420px] xl:rounded-none xl:border-0">
                      <button
                        onClick={() => setSelectedId(null)}
                        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.08] text-slate-300 hover:bg-white/[0.15] xl:hidden"
                        aria-label="Close"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      <ProgrammingInspector
                        event={selected}
                        canManage={canManage}
                        onPatch={patchEvent}
                        onStage={moveStage as unknown as (id: number, stage: ProgrammingStage) => Promise<void>}
                        onEdit={() => openEdit(selected)}
                        onDelete={() => setDeleteTarget(selected)}
                      />
                    </div>
                  </>
                )}
              </div>
            </>}
          </div>
        </main>
      </div>

      {modal === "add" && (
        <Modal title="New Event" onClose={() => setModal(null)}>
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
    <Modal title="Set a date" onClose={onCancel}>
      <form
        onSubmit={e => { e.preventDefault(); if (date) onConfirm(date); }}
        className="space-y-4"
      >
        <p className="text-[12px] text-slate-400">Events need a date once they leave the Idea stage — they&apos;ll show on the timeline.</p>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          required
          className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] text-white focus:border-indigo-500/40 focus:outline-none"
        />
        <button type="submit" disabled={!date} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-40">
          Move event
        </button>
      </form>
    </Modal>
  );
}
