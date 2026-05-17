"use client";

import React, { useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { useChapter } from "../../context/ChapterContext";
import { Modal } from "../../components/dashboard/primitives";
import { AddDeadlineForm, AddIGTaskForm, AddRevenueForm } from "../../components/dashboard/forms";
import { TaskStatus, ActivityEntry, Deadline, InstagramTask, PartyEvent, fmt$ } from "../../data";
import { useOrgLogo } from "../../hooks/useOrgLogo";

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
  const [logoError, setLogoError] = React.useState<string | null>(null);
  const { logoUrl, setLogo, clearLogo } = useOrgLogo();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLogoError("Please upload an image file (PNG, JPG, SVG, etc.).");
      return;
    }
    if (file.size > 1024 * 1024) {
      setLogoError("Image must be under 1 MB.");
      return;
    }
    setLogoError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === "string") setLogo(result);
    };
    reader.readAsDataURL(file);
  }

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

        {/* Org icon */}
        <div>
          <h3 className="mb-1 text-[12px] font-semibold text-slate-300">Organization Icon</h3>
          <p className="mb-3 text-[11px] text-slate-500">
            Replaces the ΛΦΕ badge in the top-left of the sidebar. PNG, JPG, or SVG · max 1 MB.
          </p>
          <div className="flex items-center gap-4">
            {/* Preview */}
            <div className="shrink-0">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt="Org logo preview"
                  className="h-12 w-12 rounded-xl object-cover ring-2 ring-white/[0.08]"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-[13px] font-bold text-white shadow-[0_2px_8px_rgba(99,102,241,0.3)]">
                  ΛΦΕ
                </div>
              )}
            </div>
            {/* Controls */}
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoFile}
                className="hidden"
                id="org-logo-upload"
              />
              <label
                htmlFor="org-logo-upload"
                className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-[12px] font-medium text-indigo-400 hover:bg-indigo-500/20 transition-colors"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8.5 1.75a.75.75 0 0 0-1.5 0v5.19L5.03 4.97a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.5 6.94V1.75Z" />
                  <path d="M2.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 3.75 14h8.5A2.75 2.75 0 0 0 15 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-8.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" />
                </svg>
                Upload image
              </label>
              {logoUrl && (
                <button
                  onClick={() => { clearLogo(); setLogoError(null); }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/[0.08] px-3 py-2 text-[12px] font-medium text-red-400 hover:bg-red-500/15 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          {logoError && (
            <p className="mt-2 text-[11px] text-red-400">{logoError}</p>
          )}
        </div>

        <div className="h-px bg-white/[0.06]" />

        {/* Chapter info */}
        <div>
          <h3 className="mb-2 text-[12px] font-semibold text-slate-300">Chapter</h3>
          <div className="space-y-1 text-[11px] text-slate-500">
            <p>Lambda Phi Epsilon · ChaptOS</p>
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
