"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import Link from "next/link";
import { Sidebar } from "../components/Sidebar";
import { Card, Modal } from "../components/dashboard/primitives";
import { AddDeadlineForm, AddIGTaskForm, AddRevenueForm } from "../components/dashboard/forms";
import { useChapter } from "../context/ChapterContext";
import {
  THRESHOLDS,
  TaskStatus,
  ActivityEntry,
  Deadline,
  InstagramTask,
  PartyEvent,
  fmt$,
} from "../data";

let _nextId = Date.now();

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = typeof body?.error === "string" ? `: ${body.error}` : "";
    } catch {
      /* ignore */
    }
    throw new Error(`${url} returned ${response.status}${detail}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

type ModalKey = "deadline" | "revenue" | "ig" | null;

export default function SettingsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalKey>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const {
    brotherList,
    deadlineList,
    setDeadlineList,
    igTaskList,
    setIgTaskList,
    partyList,
    setPartyList,
    setActivityFeed,
    mutationError,
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
        setActivityFeed(prev => prev.map(e => (e.id === optimisticId ? { ...saved, timestamp: "just now" } : e)));
      })
      .catch(error => {
        console.error(error);
        setActivityFeed(prev => prev.filter(e => e.id !== optimisticId));
        setMutationError("Activity could not be saved to the database.");
      });
  }, [setActivityFeed, setMutationError]);

  function persistMutation<T>(
    operation: Promise<T>,
    errorMessage: string,
    rollback?: () => void,
    onSuccess?: (value: T) => void,
  ) {
    operation
      .then(value => {
        setMutationError(null);
        onSuccess?.(value);
      })
      .catch(error => {
        console.error(error);
        rollback?.();
        setMutationError(errorMessage);
      });
  }

  useEffect(() => {
    if (!statusMsg) return;
    const t = setTimeout(() => setStatusMsg(null), 4000);
    return () => clearTimeout(t);
  }, [statusMsg]);

  function refreshDataFromDatabase() {
    refreshChapterData()
      .then(() => {
        setMutationError(null);
        setStatusMsg("Data refreshed from database");
        addActivity("Data refreshed from database", "info");
      })
      .catch(error => {
        console.error(error);
        setMutationError("Could not refresh data from the database.");
      });
  }

  function handleAddDeadline(d: { title: string; dueDate: string; owner: string; status: TaskStatus }) {
    const tempId = _nextId++;
    setDeadlineList(prev => [...prev, { id: tempId, ...d }]);
    addActivity(`New deadline added: "${d.title}"`, "info");
    setActiveModal(null);
    persistMutation(
      requestJson<Deadline>("/api/deadlines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      }),
      "Deadline could not be saved. Local changes were reverted.",
      () => setDeadlineList(prev => prev.filter(x => x.id !== tempId)),
      saved => setDeadlineList(prev => prev.map(x => (x.id === tempId ? saved : x))),
    );
  }

  function handleAddRevenue(e: { name: string; date: string; doorRevenue: number; attendance: number; notes: string }) {
    const tempId = _nextId++;
    setPartyList(prev => [
      ...prev,
      { id: tempId, theme: "", collabOrg: "", expenses: 0, partyType: "Open", completed: false, completedAt: null, ...e },
    ]);
    addActivity(`Revenue logged: ${e.name} — ${fmt$(e.doorRevenue)}`, "success");
    setActiveModal(null);
    persistMutation(
      requestJson<PartyEvent>("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(e),
      }),
      "Revenue entry could not be saved. Local changes were reverted.",
      () => setPartyList(prev => prev.filter(x => x.id !== tempId)),
      saved => setPartyList(prev => prev.map(x => (x.id === tempId ? saved : x))),
    );
  }

  function handleAddIGTask(t: { title: string; dueDate: string; owner: string; type: string; status: TaskStatus }) {
    const tempId = _nextId++;
    setIgTaskList(prev => [...prev, { id: tempId, ...t }]);
    addActivity(`IG task added: "${t.title}"`, "info");
    setActiveModal(null);
    persistMutation(
      requestJson<InstagramTask>("/api/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(t),
      }),
      "Instagram task could not be saved. Local changes were reverted.",
      () => setIgTaskList(prev => prev.filter(x => x.id !== tempId)),
      saved => setIgTaskList(prev => prev.map(x => (x.id === tempId ? saved : x))),
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0d1117]">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeSection="Settings"
        onNavClick={() => {}}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="toolbar-frosted relative z-10 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.05] px-4 sm:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.07] lg:hidden"
            aria-label="Open menu"
          >
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight text-white">Settings</p>
            <p className="hidden text-[11px] leading-tight text-slate-400 sm:block">Chapter configuration &amp; data tools</p>
          </div>
        </header>

        <main className="page-ambient flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-6">
            {(mutationError || statusMsg) && (
              <div
                className={`rounded-xl border px-4 py-3 text-[12px] ${
                  mutationError
                    ? "border-red-500/25 bg-red-500/10 text-red-200"
                    : "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                }`}
              >
                {mutationError ?? statusMsg}
              </div>
            )}

            <Card className="overflow-hidden">
              <div className="border-b border-white/[0.07] px-5 py-4">
                <h1 className="text-[14px] font-semibold text-white">Chapter Settings</h1>
                <p className="mt-0.5 text-[11px] text-slate-500">Database-backed controls · optimistic UI updates</p>
              </div>

              <div className="divide-y divide-white/[0.06]">
                <div className="px-5 py-4">
                  <p className="mb-3 text-[12px] font-semibold text-slate-300">Data Controls</p>
                  <p className="mb-3 text-[11px] text-slate-500">
                    Dashboard changes are saved through the Prisma API. Use the button below to refresh the local view
                    from the database.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={refreshDataFromDatabase}
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

                <div className="px-5 py-4">
                  <p className="mb-3 text-[12px] font-semibold text-slate-300">Quick Actions</p>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["deadline", "+ Add Deadline"],
                        ["revenue", "+ Log Revenue"],
                        ["ig", "+ Add IG Task"],
                      ] as const
                    ).map(([key, label]) => (
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

                <div className="px-5 py-4">
                  <p className="mb-3 text-[12px] font-semibold text-slate-300">Active Thresholds</p>
                  <p className="mb-3 text-[11px] text-slate-500">Read-only · used for brother status and KPI alerts on the dashboard.</p>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 sm:grid-cols-3">
                    {(
                      [
                        ["Attendance At Risk", `< ${THRESHOLDS.attendanceAtRisk}%`],
                        ["Attendance Watch", `< ${THRESHOLDS.attendanceWatch}%`],
                        ["GPA At Risk", `< ${THRESHOLDS.gpaAtRisk}`],
                        ["GPA Watch", `< ${THRESHOLDS.gpaWatch}`],
                        ["Service Goal", `${THRESHOLDS.serviceHoursGoal}h`],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-500">{k}</span>
                        <span className="text-[11px] font-semibold tabular-nums text-slate-300">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="px-5 py-4">
                  <p className="mb-2 text-[12px] font-semibold text-slate-300">Chapter</p>
                  <div className="space-y-1 text-[11px] text-slate-500">
                    <p>Lambda Phi Epsilon · Fall 2026</p>
                    <p>{brotherList.length} brothers · {deadlineList.length} deadlines · {partyList.length} parties</p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </main>
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
    </div>
  );
}
