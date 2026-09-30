"use client";

import React, { useCallback, useRef } from "react";
import Link from "next/link";
import { useChapter } from "../../../context/ChapterContext";
import { Modal } from "../../../components/dashboard/primitives";
import { isNavVisible } from "../../../components/Sidebar";
import { AddIGTaskForm, AddRevenueForm } from "../../../components/dashboard/forms";
import { InstagramType, ActivityEntry, InstagramTask, PartyEvent } from "../../../data";
import { useOrgPath } from "../../../hooks/useOrgPath";
import { orgFetch, requestJson } from "../../../lib/api";
import { orgInitials } from "@/lib/org-initials";
import { DangerZone } from "./DangerZone";

let _nextId = Date.now();

type ModalKey = "revenue" | "ig" | null;

export function GeneralSection({
  onStatus,
  onError,
}: {
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [activeModal, setActiveModal] = React.useState<ModalKey>(null);
  const [logoError, setLogoError] = React.useState<string | null>(null);
  const [logoBusy, setLogoBusy] = React.useState(false);
  const orgPath = useOrgPath();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    currentUser,
    brotherList,
    taskList,
    setIgTaskList,
    partyList,
    setPartyList,
    setActivityFeed,
    setMutationError,
    refreshChapterData,
  } = useChapter();

  // Quick actions are shortcuts INTO other pages, so they have to respect the
  // same workflow gating the sidebar uses — otherwise Settings offers to file an
  // Instagram task for an org that turned Instagram off two sections away, and
  // the entry lands on a page nobody in that org can reach.
  const enabledWorkflows = currentUser?.org?.enabledWorkflows ?? [];
  const igEnabled      = isNavVisible("Instagram", enabledWorkflows);
  const partiesEnabled = isNavVisible("Parties", enabledWorkflows);

  // Logo is now persisted on the org (Organization.logoUrl), surfaced via
  // /api/auth/me → ChapterContext. Upload/remove go through /api/orgs/logo and
  // then refresh the context so the sidebar updates everywhere live.
  const logoUrl = currentUser?.org?.logoUrl ?? null;

  async function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLogoError("Please upload an image file (PNG, JPG, SVG, etc.).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("Image must be under 2 MB.");
      return;
    }
    setLogoError(null);
    setLogoBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await orgFetch("/api/orgs/logo", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLogoError(data?.error ?? "Couldn't upload the logo. Try again.");
        return;
      }
      await refreshChapterData();
    } catch {
      setLogoError("Couldn't reach the server. Check your connection.");
    } finally {
      setLogoBusy(false);
    }
  }

  async function handleClearLogo() {
    setLogoError(null);
    setLogoBusy(true);
    try {
      const res = await orgFetch("/api/orgs/logo", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLogoError(data?.error ?? "Couldn't remove the logo. Try again.");
        return;
      }
      await refreshChapterData();
    } catch {
      setLogoError("Couldn't reach the server. Check your connection.");
    } finally {
      setLogoBusy(false);
    }
  }

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

  function persist<T>(op: Promise<T>, errMsg: string, rollback?: () => void, onSuccess?: (v: T) => void, onError?: (err: unknown) => void) {
    op.then(v => { setMutationError(null); onSuccess?.(v); })
      .catch(err => { console.error(err); rollback?.(); if (onError) onError(err); else setMutationError(errMsg); });
  }

  function handleRefresh() {
    refreshChapterData()
      .then(() => { setMutationError(null); onStatus("Refreshed."); addActivity("Data refreshed", "info"); })
      .catch(err => { console.error(err); onError("Couldn't refresh. Check your connection and try again."); });
  }


  function handleAddRevenue(e: { name: string; date: string; doorRevenue: number; attendance: number; notes: string }) {
    const tempId = _nextId++;
    setPartyList(prev => [...prev, { id: tempId, theme: "", collabOrg: "", expenses: 0, partyType: "Open", completed: false, completedAt: null, ...e }]);
    setActiveModal(null);
    persist(
      requestJson<PartyEvent>("/api/parties", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(e) }),
      "Revenue entry could not be saved. Local changes were reverted.",
      () => setPartyList(prev => prev.filter(x => x.id !== tempId)),
      saved => setPartyList(prev => prev.map(x => x.id === tempId ? saved : x)),
    );
  }

  function handleAddIGTask(t: { title: string; dueDate: string; type: InstagramType }) {
    const tempId = _nextId++;
    setIgTaskList(prev => [...prev, { id: tempId, ...t, status: "open" }]);
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
      <div className="sc-stack">
        {/* Org icon — the one thing on this page most people come to change. */}
        <div>
          <h3 className="sc-h">Organization icon</h3>
          <p className="sc-note">
            Shown on the login screen and in the sidebar for everyone in the org. PNG, JPG, or SVG · max 2 MB.
          </p>
          <div className="mt-3 flex items-center gap-4">
            {/* Preview */}
            <div className="shrink-0">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt="Org logo preview"
                  className="sc-avatar"
                  style={{ width: 48, height: 48, borderRadius: 12 }}
                />
              ) : (
                <div className="sc-avatar" style={{ width: 48, height: 48, borderRadius: 12, fontSize: 17 }}>
                  {orgInitials(currentUser?.org?.name)}
                </div>
              )}
            </div>
            {/* Controls.
                The file input is a hidden TRIGGER, not the control: a
                `display:none` input is not focusable, and the old <label
                htmlFor> that stood in for it isn't either — which left no
                keyboard path at all to the most-used setting on the page. The
                visible control is now a real button that forwards the click. */}
            <div className="sc-btn-row">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoFile}
                tabIndex={-1}
                aria-hidden="true"
                className="hidden"
                id="org-logo-upload"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={logoBusy}
                aria-describedby={logoError ? "org-logo-error" : undefined}
                className="sc-btn sc-btn-accent"
              >
                <svg viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8.5 1.75a.75.75 0 0 0-1.5 0v5.19L5.03 4.97a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.5 6.94V1.75Z" />
                  <path d="M2.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 3.75 14h8.5A2.75 2.75 0 0 0 15 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-8.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" />
                </svg>
                {logoBusy ? "Working…" : logoUrl ? "Replace image" : "Upload image"}
              </button>
              {logoUrl && (
                <button onClick={handleClearLogo} disabled={logoBusy} className="sc-btn sc-btn-danger">
                  Remove
                </button>
              )}
            </div>
          </div>
          {logoError && <p className="sc-err mt-2" id="org-logo-error" role="alert">{logoError}</p>}
        </div>

        <hr className="sc-divider" />

        {/* Quick actions */}
        <div>
          <h3 className="sc-h">Quick actions</h3>
          <p className="sc-note">Jump straight to a common entry without leaving Settings.</p>
          <div className="sc-btn-row mt-3">
            {([
              ["revenue", "Log revenue", partiesEnabled],
              ["ig",      "Add IG task", igEnabled],
            ] as const)
              .filter(([, , enabled]) => enabled)
              .map(([key, label]) => (
                <button key={key} onClick={() => setActiveModal(key)} className="sc-btn sc-btn-ghost">
                  {label}
                </button>
              ))}
            <Link href={orgPath("/tasks?new=1")} className="sc-btn sc-btn-ghost">
              Add task
            </Link>
            {/* Named for where it goes. It used to say "Log attendance" and land
                on the timeline, which is a planning surface, not an attendance
                one. */}
            <Link href={orgPath("/timeline")} className="sc-btn sc-btn-ghost">
              Open timeline
            </Link>
          </div>
        </div>

        <hr className="sc-divider" />

        {/* Data controls */}
        <div>
          <h3 className="sc-h">Data</h3>
          <p className="sc-note">
            Your changes are saved as you make them. Refresh to pull the latest from the server if
            someone else has been editing.
          </p>
          <div className="sc-btn-row mt-3">
            <button onClick={handleRefresh} className="sc-btn sc-btn-ghost">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            {/* This is window.print() and nothing more. It was labelled "Export
                report" under a Data heading, which read as a data export it has
                never been — the real exports are the treasury CSV
                (/api/transactions/export) and the roster CSV, both on their own
                pages. Named for what it does until an org-wide report exists. */}
            <button onClick={() => window.print()} className="sc-btn sc-btn-ghost">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print this page
            </button>
          </div>
        </div>

        <hr className="sc-divider" />

        {/* Chapter info */}
        <div>
          <h3 className="sc-h">Chapter</h3>
          <div className="mt-2 space-y-1">
            <p className="sc-note" style={{ color: "var(--ink-soft)" }}>{currentUser?.org?.name ?? "ChaptOS"}</p>
            <p className="sc-note">{brotherList.length} brothers · {taskList.length} tasks · {partyList.length} parties</p>
          </div>
        </div>

        {/* Danger zone — org-admin only; renders nothing for everyone else. */}
        <DangerZone onError={onError} />
      </div>

      {activeModal === "revenue" && (
        <Modal title="Log Revenue" tone="dusk" onClose={() => setActiveModal(null)}>
          <AddRevenueForm onSubmit={handleAddRevenue} />
        </Modal>
      )}
      {activeModal === "ig" && (
        <Modal title="Add Instagram Task" tone="dusk" onClose={() => setActiveModal(null)}>
          <AddIGTaskForm onSubmit={handleAddIGTask} />
        </Modal>
      )}
    </>
  );
}
