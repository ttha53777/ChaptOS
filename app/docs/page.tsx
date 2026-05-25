"use client";

import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "../components/Sidebar";
import { UserAvatar } from "../components/UserAvatar";
import { Modal, ConfirmDialog, LoadingSpinner } from "../components/dashboard/primitives";
import { useToast } from "../components/dashboard/Toast";
import { headerActionBtnCls } from "../components/dashboard/styles";
import { useChapter } from "../context/ChapterContext";
import { DocCard, type Doc } from "./DocCard";
import { DocForm, type DocDraft } from "./DocForm";

type HttpError = Error & { status: number };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = "";
    try { const b = await res.json(); detail = typeof b?.error === "string" ? `: ${b.error}` : ""; } catch { /* ignore */ }
    const err = new Error(`${url} returned ${res.status}${detail}`) as HttpError;
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const EMPTY_DRAFT: DocDraft = { title: "", url: "", description: "" };

export default function DocsPage() {
  const toast = useToast();
  const { can } = useChapter();
  const canManage = can("MANAGE_DOCS");

  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [docs,         setDocs]         = useState<Doc[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState<string | null>(null);
  const [pageError,    setPageError]    = useState<string | null>(null);
  const [showAdd,      setShowAdd]      = useState(false);
  const [editTarget,   setEditTarget]   = useState<Doc | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Doc | null>(null);
  const [submitting,   setSubmitting]   = useState(false);

  useEffect(() => {
    requestJson<Doc[]>("/api/docs")
      .then(setDocs)
      .catch(() => setLoadError("Could not load docs. Please refresh."))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(draft: DocDraft) {
    setPageError(null);
    setSubmitting(true);
    try {
      const created = await requestJson<Doc>("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title.trim(),
          url: draft.url.trim(),
          description: draft.description.trim() || null,
        }),
      });
      setDocs(prev => [created, ...prev]);
      setShowAdd(false);
      toast.success(`Added "${created.title}".`);
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : "Failed to add doc.";
      setPageError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(draft: DocDraft) {
    if (!editTarget) return;
    setPageError(null);
    setSubmitting(true);
    try {
      const updated = await requestJson<Doc>(`/api/docs/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title.trim(),
          url: draft.url.trim(),
          description: draft.description.trim() || null,
        }),
      });
      setDocs(prev => prev.map(d => d.id === updated.id ? updated : d));
      setEditTarget(null);
      toast.success("Doc updated.");
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : "Failed to update doc.";
      setPageError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    const title = deleteTarget.title;
    setDeleteTarget(null);
    try {
      await requestJson<void>(`/api/docs/${id}`, { method: "DELETE" });
      setDocs(prev => prev.filter(d => d.id !== id));
      toast.success(`Deleted "${title}".`);
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : "Failed to delete doc.";
      setPageError(message);
      toast.error(message);
    }
  }

  const sorted = useMemo(() => [...docs].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id), [docs]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#07090f]">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeSection="Docs"
        onNavClick={() => {}}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <header className="toolbar-frosted relative z-10 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.05] px-4 sm:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.07] lg:hidden"
            aria-label="Open menu"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight text-white">Docs</p>
            <p className="hidden text-[11px] leading-tight text-slate-400 sm:block">
              {loading ? "Loading…" : `${docs.length} link${docs.length !== 1 ? "s" : ""}`}
            </p>
          </div>

          {canManage && (
            <button onClick={() => setShowAdd(true)} className={headerActionBtnCls}>
              <svg className="h-3.5 w-3.5 shrink-0 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Add Doc</span>
            </button>
          )}

          <UserAvatar />
        </header>

        {/* ── Error banner ────────────────────────────────────────────────── */}
        {pageError && (
          <div className="flex items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/10 px-5 py-2.5">
            <p className="text-[12px] text-amber-400">{pageError}</p>
            <button onClick={() => setPageError(null)} className="text-amber-500 hover:text-amber-300">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* ── Main ────────────────────────────────────────────────────────────── */}
        <main className="page-ambient flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
            {loading && <LoadingSpinner size="md" label="Loading docs" className="py-24" />}

            {!loading && loadError && (
              <div className="flex flex-col items-center gap-2 py-24 text-center">
                <p className="text-[14px] text-red-400">{loadError}</p>
              </div>
            )}

            {!loading && !loadError && sorted.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-24 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                  <svg className="h-6 w-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <p className="text-[14px] font-semibold text-slate-500">No docs pinned yet</p>
                <p className="text-[12px] text-slate-600">
                  {canManage ? "Add a link to start your reference library." : "Ask an admin to add some links."}
                </p>
              </div>
            )}

            {!loading && !loadError && sorted.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sorted.map(doc => (
                  <DocCard
                    key={doc.id}
                    doc={doc}
                    canManage={canManage}
                    onEdit={() => setEditTarget(doc)}
                    onDelete={() => setDeleteTarget(doc)}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ── Add modal ───────────────────────────────────────────────────────── */}
      {showAdd && (
        <Modal title="Add doc" onClose={() => !submitting && setShowAdd(false)}>
          <DocForm
            initial={EMPTY_DRAFT}
            submitLabel={submitting ? "Adding…" : "Add"}
            onSubmit={handleAdd}
            onClose={() => setShowAdd(false)}
          />
        </Modal>
      )}

      {/* ── Edit modal ──────────────────────────────────────────────────────── */}
      {editTarget && (
        <Modal title="Edit doc" onClose={() => !submitting && setEditTarget(null)}>
          <DocForm
            initial={{
              title: editTarget.title,
              url: editTarget.url,
              description: editTarget.description ?? "",
            }}
            submitLabel={submitting ? "Saving…" : "Save"}
            onSubmit={handleEdit}
            onClose={() => setEditTarget(null)}
          />
        </Modal>
      )}

      {/* ── Delete confirm ──────────────────────────────────────────────────── */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete this doc?"
          message={`"${deleteTarget.title}" will be removed from the docs page.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
