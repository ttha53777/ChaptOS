"use client";

import React, { useMemo, useCallback } from "react";
import Link from "next/link";
import { useChapter } from "../../context/ChapterContext";
import { Modal } from "../../components/dashboard/primitives";
import { AddDeadlineForm, AddIGTaskForm, AddRevenueForm } from "../../components/dashboard/forms";
import { TaskStatus, ActivityEntry, Deadline, InstagramTask, PartyEvent, fmt$ } from "../../data";

let _nextId = Date.now();

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = typeof body?.error === "string" ? `: ${body.error}` : "";
    } catch { /* ignore */ }
    throw new Error(`${url} returned ${res.status}${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

type ModalKey = "deadline" | "revenue" | "ig" | null;

export function GeneralSection({
  onStatus,
  onError,
}: {
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [activeModal, setActiveModal] = React.useState<ModalKey>(null);

  const {
    brotherList,
    deadlineList,
    setDeadlineList,
    igTaskList,
    setIgTaskList,
    partyList,
    setPartyList,
    setActivityFeed,
    setMutationError,
    refreshChapterData,
  } = useChapter();

  const brotherNames = useMemo(() => brotherList.map(b => b.name), [brotherList]);

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
      .catch(err => {
        console.error(err);
        setActivityFeed(prev => prev.filter(e => e.id !== optimisticId));
        setMutationError("Activity could not be saved to the database.");
      });
  }, [setActivityFeed, setMutationError]);

  function persist<T>(op: Promise<T>, errMsg: string, rollback?: () => void, onSuccess?: (v: T) => void) {
    op.then(v => { setMutationError(null); onSuccess?.(v); })
      .catch(err => { console.error(err); rollback?.(); setMutationError(errMsg); });
  }

  function handleRefresh() {
    refreshChapterData()
      .then(() => { setMutationError(null); onStatus("Data refreshed from database"); addActivity("Data refreshed from database", "info"); })
      .catch(err => { console.error(err); onError("Could not refresh data from the database."); });
  }

  function handleAddDeadline(d: { title: string; dueDate: string; owner: string; status: TaskStatus }) {
    const tempId = _nextId++;
    setDeadlineList(prev => [...prev, { id: tempId, ...d }]);
    addActivity(`New deadline added: "${d.title}"`, "info");
    setActiveModal(null);
    persist(
      requestJson<Deadline>("/api/deadlines", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }),
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
    persist(
      requestJson<PartyEvent>("/api/parties", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(e) }),
      "Revenue entry could not be saved. Local changes were reverted.",
      () => setPartyList(prev => prev.filter(x => x.id !== tempId)),
      saved => setPartyList(prev => prev.map(x => x.id === tempId ? saved : x)),
    );
  }

  function handleAddIGTask(t: { title: string; dueDate: string; owner: string; type: string; status: TaskStatus }) {
    const tempId = _nextId++;
    setIgTaskList(prev => [...prev, { id: tempId, ...t }]);
    addActivity(`IG task added: "${t.title}"`, "info");
    setActiveModal(null);
    persist(
      requestJson<InstagramTask>("/api/instagram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(t) }),
      "Instagram task could not be saved. Local changes were reverted.",
      () => setIgTaskList(prev => prev.filter(x => x.id !== tempId)),
      saved => setIgTaskList(prev => prev.map(x => x.id === tempId ? saved : x)),
    );
  }

  return (
    <>
      <div className="space-y-8">
        {/* Data controls */}
        <div>
          <h3 className="mb-1 text-[12px] font-semibold text-slate-300">Data Controls</h3>
          <p className="mb-3 text-[11px] text-slate-500">
            Dashboard changes are saved through the Prisma API. Refresh below to sync the local view with the database.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleRefresh}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-slate-300 transition-all hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 focus:outline-none"
            >
              <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh from database
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-slate-300 transition-all hover:border-white/[0.2] hover:bg-white/[0.08] focus:outline-none"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-slate-400">
                <path fillRule="evenodd" d="M11.5 4.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0ZM4.25 8.5a3.25 3.25 0 0 0-3.25 3.25v.5A1.75 1.75 0 0 0 2.75 14h10.5A1.75 1.75 0 0 0 15 12.25v-.5A3.25 3.25 0 0 0 11.75 8.5h-7.5Z" clipRule="evenodd" />
              </svg>
              Export report
            </button>
          </div>
        </div>

        <div className="h-px bg-white/[0.06]" />

        {/* Quick actions */}
        <div>
          <h3 className="mb-3 text-[12px] font-semibold text-slate-300">Quick Actions</h3>
          <div className="flex flex-wrap gap-2">
            {([["deadline", "+ Add Deadline"], ["revenue", "+ Log Revenue"], ["ig", "+ Add IG Task"]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveModal(key)}
                className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-slate-300 transition-all hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-400"
              >
                {label}
              </button>
            ))}
            <Link
              href="/timeline"
              className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-slate-300 transition-all hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-400"
            >
              Log Attendance
            </Link>
          </div>
        </div>

        <div className="h-px bg-white/[0.06]" />

        {/* Chapter info */}
        <div>
          <h3 className="mb-2 text-[12px] font-semibold text-slate-300">Chapter</h3>
          <div className="space-y-1 text-[11px] text-slate-500">
            <p>Lambda Phi Epsilon · Fall 2026</p>
            <p>{brotherList.length} brothers · {deadlineList.length} deadlines · {partyList.length} parties</p>
          </div>
        </div>
      </div>

      {activeModal === "deadline" && (
        <Modal title="Add Deadline" onClose={() => setActiveModal(null)}>
          <AddDeadlineForm brotherNames={brotherNames} onSubmit={handleAddDeadline} />
        </Modal>
      )}
      {activeModal === "revenue" && (
        <Modal title="Log Revenue" onClose={() => setActiveModal(null)}>
          <AddRevenueForm onSubmit={handleAddRevenue} />
        </Modal>
      )}
      {activeModal === "ig" && (
        <Modal title="Add Instagram Task" onClose={() => setActiveModal(null)}>
          <AddIGTaskForm brotherNames={brotherNames} onSubmit={handleAddIGTask} />
        </Modal>
      )}
    </>
  );
}
