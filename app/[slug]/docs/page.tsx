"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Sidebar } from "../../components/Sidebar";
import { Modal, ConfirmDialog, LoadingSpinner } from "../../components/dashboard/primitives";
import { useToast } from "../../components/dashboard/Toast";
import { useChapter } from "../../context/ChapterContext";
import { DocCard, kindOf, type Doc } from "./DocCard";
import { DocForm, type DocDraft } from "./DocForm";
import { FolderCard, type Folder } from "./FolderCard";
import { FolderForm } from "./FolderForm";
import { MoveDocDialog } from "./MoveDocDialog";
import { requestJson } from "../../lib/api";
import "../../components/dashboard/dashboard-ledger.css";
import "./docs-ledger.css";

const EMPTY_DRAFT: DocDraft = { title: "", url: "", description: "" };

type KindFilter = "all" | "doc" | "sheet" | "form" | "link";
const FILTERS: { id: KindFilter; label: string }[] = [
  { id: "all",   label: "All" },
  { id: "doc",   label: "Docs" },
  { id: "sheet", label: "Sheets" },
  { id: "form",  label: "Forms" },
  { id: "link",  label: "Links" },
];

type SortId = "newest" | "name" | "kind";
const SORTS: { id: SortId; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "name",   label: "Name" },
  { id: "kind",   label: "Kind" },
];
const SORT_PREF_KEY = "chaptos-docs-sort";

// The four "at a glance" measures. Each can be hidden from its own top-right ✕;
// the choice persists per browser in localStorage (GLANCE_PREF_KEY).
type MeasureId = "total" | "kinds" | "contributors" | "newest";
const MEASURES: { id: MeasureId; label: string; note: string }[] = [
  { id: "total",        label: "References",   note: "on file" },
  { id: "kinds",        label: "Sources",      note: "kinds" },
  { id: "contributors", label: "Contributors", note: "brothers" },
  { id: "newest",       label: "Newest",       note: "added" },
];
const GLANCE_PREF_KEY = "chaptos-docs-glance";

export default function DocsPage() {
  const toast = useToast();
  const { currentUser, can } = useChapter();
  const canManage = can("MANAGE_DOCS");

  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [docs,         setDocs]         = useState<Doc[]>([]);
  const [folders,      setFolders]      = useState<Folder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState<string | null>(null);
  const [pageError,    setPageError]    = useState<string | null>(null);
  const [showAdd,      setShowAdd]      = useState(false);
  const [editTarget,   setEditTarget]   = useState<Doc | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Doc | null>(null);
  const [moveTarget,   setMoveTarget]   = useState<Doc | null>(null);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Folder | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<Folder | null>(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [query,        setQuery]        = useState("");
  const [filter,       setFilter]       = useState<KindFilter>("all");
  const [sort,         setSort]         = useState<SortId>("newest");

  const currentFolder = currentFolderId == null
    ? null
    : folders.find(f => f.id === currentFolderId) ?? null;

  // Which glance measures are visible. Default: all on. Restored from
  // localStorage on mount, persisted on every change.
  const [visible, setVisible] = useState<Record<MeasureId, boolean>>(
    { total: true, kinds: true, contributors: true, newest: true },
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(GLANCE_PREF_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Record<MeasureId, boolean>>;
        setVisible(v => ({ ...v, ...saved }));
      }
    } catch { /* ignore malformed prefs */ }
    try {
      const savedSort = localStorage.getItem(SORT_PREF_KEY);
      if (savedSort === "newest" || savedSort === "name" || savedSort === "kind") setSort(savedSort);
    } catch { /* ignore */ }
  }, []);

  function changeSort(id: SortId) {
    setSort(id);
    try { localStorage.setItem(SORT_PREF_KEY, id); } catch { /* ignore */ }
  }

  function persistVisible(next: Record<MeasureId, boolean>) {
    try { localStorage.setItem(GLANCE_PREF_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }
  function toggleMeasure(id: MeasureId) {
    setVisible(prev => {
      const next = { ...prev, [id]: !prev[id] };
      persistVisible(next);
      return next;
    });
  }

  useEffect(() => {
    Promise.all([
      requestJson<Doc[]>("/api/docs"),
      requestJson<Folder[]>("/api/docs/folders").catch(() => [] as Folder[]),
    ])
      .then(([d, f]) => { setDocs(d); setFolders(f); })
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
          folderId: currentFolderId,
        }),
      });
      // POST returns the raw doc (no createdByName); the creator is the current
      // user, so attribute it immediately instead of waiting for a reload.
      setDocs(prev => [{ ...created, createdByName: currentUser?.name ?? null }, ...prev]);
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
      // PATCH returns the raw doc (no createdByName); preserve attribution.
      setDocs(prev => prev.map(d => d.id === updated.id ? { ...updated, createdByName: d.createdByName } : d));
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

  async function handleAddFolder(name: string) {
    setPageError(null);
    setSubmitting(true);
    try {
      const created = await requestJson<Folder>("/api/docs/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      setFolders(prev => [created, ...prev]);
      setShowAddFolder(false);
      toast.success(`Created folder "${created.name}".`);
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : "Failed to create folder.";
      setPageError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRenameFolder(name: string) {
    if (!renameTarget) return;
    setPageError(null);
    setSubmitting(true);
    try {
      const updated = await requestJson<Folder>(`/api/docs/folders/${renameTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      setFolders(prev => prev.map(f => f.id === updated.id ? updated : f));
      setRenameTarget(null);
      toast.success("Folder renamed.");
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : "Failed to rename folder.";
      setPageError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteFolder() {
    if (!deleteFolderTarget) return;
    const id = deleteFolderTarget.id;
    const name = deleteFolderTarget.name;
    setDeleteFolderTarget(null);
    try {
      await requestJson<void>(`/api/docs/folders/${id}`, { method: "DELETE" });
      setFolders(prev => prev.filter(f => f.id !== id));
      // Released docs return to the library root.
      setDocs(prev => prev.map(d => d.folderId === id ? { ...d, folderId: null } : d));
      if (currentFolderId === id) setCurrentFolderId(null);
      toast.success(`Deleted folder "${name}".`);
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : "Failed to delete folder.";
      setPageError(message);
      toast.error(message);
    }
  }

  // Move a doc to a folder (or null = library root). Shared by the Move dialog
  // and drag-and-drop onto folder tiles / the breadcrumb.
  async function handleMove(docId: number, folderId: number | null) {
    // No-op if the doc is already there (e.g. dropping onto its own folder, or
    // re-picking "Here" in the dialog) — just close, no needless request/toast.
    const current = docs.find(d => d.id === docId);
    if (current && (current.folderId ?? null) === folderId) { setMoveTarget(null); return; }
    try {
      const updated = await requestJson<Doc>(`/api/docs/${docId}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      // The move endpoint doesn't enrich createdByName (only listDocs does);
      // carry the existing value forward so attribution doesn't vanish.
      setDocs(prev => prev.map(d => d.id === updated.id ? { ...updated, createdByName: d.createdByName } : d));
      setMoveTarget(null);
      const dest = folderId == null ? "Library" : (folders.find(f => f.id === folderId)?.name ?? "folder");
      toast.success(`Moved to ${dest}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : "Failed to move doc.";
      setPageError(message);
      toast.error(message);
    }
  }

  // Read a dragged doc id from a drop event (set by DocCard.onDragStart).
  function docIdFromDrop(e: React.DragEvent): number | null {
    const raw = e.dataTransfer.getData("application/x-doc-id") || e.dataTransfer.getData("text/plain");
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  // Newest-first always — used by the glance metrics ("Newest", contributors)
  // independent of the user's chosen display sort.
  const newestFirst = useMemo(
    () => [...docs].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id),
    [docs],
  );

  const sorted = useMemo(() => {
    const arr = [...newestFirst];
    if (sort === "name") arr.sort((a, b) => a.title.localeCompare(b.title) || a.id - b.id);
    else if (sort === "kind") arr.sort((a, b) =>
      kindOf(a.url).localeCompare(kindOf(b.url)) || a.title.localeCompare(b.title) || a.id - b.id);
    // "newest" keeps newestFirst order.
    return arr;
  }, [newestFirst, sort]);

  // Docs visible in the current view: root shows folderId == null; inside a
  // folder shows that folder's docs.
  const scopedDocs = useMemo(
    () => sorted.filter(d => (d.folderId ?? null) === currentFolderId),
    [sorted, currentFolderId],
  );

  // Doc counts per folder, for the folder tiles.
  const folderCounts = useMemo(() => {
    const m = new Map<number, number>();
    for (const d of docs) if (d.folderId != null) m.set(d.folderId, (m.get(d.folderId) ?? 0) + 1);
    return m;
  }, [docs]);

  // Per-kind counts for the filter segment. "Sheet" and "Drive" both fold into
  // their own buttons; anything not Doc/Sheet/Form reads as a Link here.
  const counts = useMemo(() => {
    const c = { all: scopedDocs.length, doc: 0, sheet: 0, form: 0, link: 0 } as Record<KindFilter, number>;
    for (const d of scopedDocs) {
      const k = kindOf(d.url);
      if (k === "doc") c.doc++;
      else if (k === "sheet") c.sheet++;
      else if (k === "form") c.form++;
      else c.link++; // drive + link both surface under "Links"
    }
    return c;
  }, [scopedDocs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scopedDocs.filter(d => {
      if (filter !== "all") {
        const k = kindOf(d.url);
        const bucket: KindFilter = k === "drive" ? "link" : (k as KindFilter);
        if (bucket !== filter) return false;
      }
      if (!q) return true;
      return d.title.toLowerCase().includes(q)
        || (d.description?.toLowerCase().includes(q) ?? false)
        || d.url.toLowerCase().includes(q);
    });
  }, [scopedDocs, query, filter]);

  // Glance metrics, all derived from the live library.
  const glance = useMemo(() => {
    const kinds = new Set(newestFirst.map(d => {
      const k = kindOf(d.url);
      return k === "drive" || k === "link" ? "link" : k;
    }));
    const contributors = new Set(newestFirst.map(d => d.createdById).filter((x): x is number => x != null));
    const newest = newestFirst[0]?.createdAt ? relDays(newestFirst[0].createdAt) : "—";
    return { total: newestFirst.length, kinds: kinds.size, contributors: contributors.size, newest };
  }, [newestFirst]);

  const orgName = currentUser?.org?.name ?? "ChaptOS";
  const hasDocs = sorted.length > 0;
  const atRoot = currentFolderId == null;
  // Folder tiles only show at root (flat hierarchy — no nested folders).
  const showFolders = atRoot && folders.length > 0;
  // Whether the current view has anything to render (docs and/or folder tiles).
  const viewHasContent = filtered.length > 0 || (showFolders && !query && filter === "all");
  const anyVisible = MEASURES.some(m => visible[m.id]);
  const allVisible = MEASURES.every(m => visible[m.id]);
  const measureValue: Record<MeasureId, ReactNode> = {
    total: glance.total,
    kinds: glance.kinds,
    contributors: glance.contributors,
    newest: glance.newest,
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#0f0d0a]">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeSection="Docs"
        onNavClick={() => {}}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ── Scrollable dusk ledger pane ── */}
        <main className="page-ambient flex-1 overflow-y-auto">
          <div className="dash dash-docs" data-dashboard-theme="dusk">

            {pageError && (
              <div className="dx-toast" role="status">
                <span>{pageError}</span>
                <button onClick={() => setPageError(null)} aria-label="Dismiss">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* ── Briefing ── */}
            <section className="dx-briefing" aria-label="Reference library">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="dx-menu-mob"
                aria-label="Open menu"
              >
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div>
                <p className="kicker">Reference Library</p>
                <h1>Everything <em>on file</em>.</h1>
                <div className="dx-digest">
                  <span className="ai">AI</span>
                  <p>{digestLine(sorted, orgName)}</p>
                </div>
              </div>
              {canManage && (
                <div className="dx-actions">
                  <button className="dx-add ghost" onClick={() => setShowAddFolder(true)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><path d="M12 11v4M10 13h4" /></svg>
                    New folder
                  </button>
                  <button className="dx-add" onClick={() => setShowAdd(true)}>
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    Add doc
                  </button>
                </div>
              )}
            </section>

            {/* ── Breadcrumb (inside a folder) ── */}
            {!atRoot && currentFolder && (
              <nav className="dx-breadcrumb" aria-label="Folder path">
                <button
                  type="button"
                  onClick={() => setCurrentFolderId(null)}
                  onDragOver={canManage ? (e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); } : undefined}
                  onDragLeave={canManage ? (e) => e.currentTarget.classList.remove("drag-over") : undefined}
                  onDrop={canManage ? (e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("drag-over");
                    const id = docIdFromDrop(e);
                    if (id != null) handleMove(id, null);
                  } : undefined}
                >Library</button>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                <span className="cur">{currentFolder.name}</span>
              </nav>
            )}

            {/* ── Glance strip — hide any measure from its top-right ✕ ── */}
            {hasDocs && anyVisible && (
              <section className="dx-glance" aria-label="Library at a glance">
                {MEASURES.filter(m => visible[m.id]).map(m => (
                  <div className="dx-measure" key={m.id}>
                    <button
                      type="button"
                      className="dx-measure-hide"
                      aria-label={`Hide ${m.label}`}
                      title={`Hide ${m.label}`}
                      onClick={() => toggleMeasure(m.id)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    <p className="k">{m.label}</p>
                    <p className="v">{measureValue[m.id]}</p>
                    <p className="note">{m.note}</p>
                  </div>
                ))}
              </section>
            )}

            {/* ── Toolbar: search + kind filter ── */}
            {hasDocs && (
              <div className="dx-toolbar">
                <label className="dx-search">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
                  <input
                    type="search"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search the library…"
                    aria-label="Search docs"
                  />
                  {query && (
                    <button type="button" className="clr" onClick={() => setQuery("")} aria-label="Clear search">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </label>
                <div className="dx-seg" role="tablist" aria-label="Filter by kind">
                  {FILTERS.map(f => (
                    <button
                      key={f.id}
                      role="tab"
                      aria-selected={filter === f.id}
                      className={filter === f.id ? "on" : ""}
                      onClick={() => setFilter(f.id)}
                    >
                      {f.label} <span className="ct">{counts[f.id]}</span>
                    </button>
                  ))}
                </div>
                <label className="dx-sort">
                  <span className="lbl">Sort</span>
                  <select value={sort} onChange={e => changeSort(e.target.value as SortId)} aria-label="Sort docs">
                    {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </label>
                <span className="dx-scope">{filtered.length} of {sorted.length}</span>
              </div>
            )}

            {/* ── States + grid ── */}
            {loading && (
              <div className="dx-loading">
                <LoadingSpinner size="md" tone="dusk" label="Loading docs" />
              </div>
            )}

            {!loading && loadError && (
              <div className="dx-empty err">
                <div className="ic">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" /></svg>
                </div>
                <p className="t">Couldn&apos;t load the library</p>
                <p className="h">{loadError}</p>
              </div>
            )}

            {!loading && !loadError && !hasDocs && folders.length === 0 && (
              <div className="dx-empty">
                <div className="ic">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                </div>
                <p className="t">No references pinned yet</p>
                <p className="h">{canManage ? "Add a link to start your chapter's reference library." : "Ask an admin to add some links."}</p>
              </div>
            )}

            {/* Folder is empty (no docs, after the breadcrumb). */}
            {!loading && !loadError && !atRoot && filtered.length === 0 && !query && filter === "all" && (
              <div className="dx-empty">
                <div className="ic">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
                </div>
                <p className="t">This folder is empty</p>
                <p className="h">{canManage ? "Move a doc here from its menu, or add a new one." : "No docs in this folder yet."}</p>
              </div>
            )}

            {/* Search / filter matched nothing in the current view. */}
            {!loading && !loadError && (hasDocs || folders.length > 0) && filtered.length === 0 && (query || filter !== "all") && (
              <div className="dx-empty">
                <div className="ic">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
                </div>
                <p className="t">Nothing matches</p>
                <p className="h">Try a different search or filter.</p>
                <button className="clear" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button>
              </div>
            )}

            {!loading && !loadError && viewHasContent && (
              <div className="dx-grid">
                {showFolders && folders.map(folder => (
                  <FolderCard
                    key={`f-${folder.id}`}
                    folder={folder}
                    count={folderCounts.get(folder.id) ?? 0}
                    canManage={canManage}
                    onOpen={() => { setCurrentFolderId(folder.id); setQuery(""); setFilter("all"); }}
                    onRename={() => setRenameTarget(folder)}
                    onDelete={() => setDeleteFolderTarget(folder)}
                    onDropDoc={(docId) => handleMove(docId, folder.id)}
                    readDropId={docIdFromDrop}
                  />
                ))}
                {filtered.map(doc => (
                  <DocCard
                    key={doc.id}
                    doc={doc}
                    canManage={canManage}
                    onEdit={() => setEditTarget(doc)}
                    onDelete={() => setDeleteTarget(doc)}
                    onMove={() => setMoveTarget(doc)}
                  />
                ))}
              </div>
            )}

            {/* ── Hidden measures tray (restore path) — mirrors the dashboard ── */}
            {hasDocs && !allVisible && (
              <div className="hidden-tray">
                <p className="lbl">Hidden measures</p>
                <div className="chips">
                  {MEASURES.filter(m => !visible[m.id]).map(m => (
                    <button key={m.id} onClick={() => toggleMeasure(m.id)} title={`Show ${m.label}`}>{m.label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ── Add modal ── */}
      {showAdd && (
        <Modal title="Add doc" tone="dusk" onClose={() => !submitting && setShowAdd(false)}>
          <DocForm
            initial={EMPTY_DRAFT}
            submitLabel={submitting ? "Adding…" : "Add"}
            onSubmit={handleAdd}
            onClose={() => setShowAdd(false)}
          />
        </Modal>
      )}

      {/* ── Edit modal ── */}
      {editTarget && (
        <Modal title="Edit doc" tone="dusk" onClose={() => !submitting && setEditTarget(null)}>
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

      {/* ── Delete confirm ── */}
      {deleteTarget && (
        <ConfirmDialog
          tone="dusk"
          title="Delete this doc?"
          message={`"${deleteTarget.title}" will be removed from the docs page.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* ── Add folder modal ── */}
      {showAddFolder && (
        <Modal title="New folder" tone="dusk" onClose={() => !submitting && setShowAddFolder(false)}>
          <FolderForm
            initial=""
            submitLabel={submitting ? "Creating…" : "Create"}
            onSubmit={handleAddFolder}
            onClose={() => setShowAddFolder(false)}
          />
        </Modal>
      )}

      {/* ── Rename folder modal ── */}
      {renameTarget && (
        <Modal title="Rename folder" tone="dusk" onClose={() => !submitting && setRenameTarget(null)}>
          <FolderForm
            initial={renameTarget.name}
            submitLabel={submitting ? "Saving…" : "Save"}
            onSubmit={handleRenameFolder}
            onClose={() => setRenameTarget(null)}
          />
        </Modal>
      )}

      {/* ── Delete folder confirm ── */}
      {deleteFolderTarget && (
        <ConfirmDialog
          tone="dusk"
          title="Delete this folder?"
          message={`"${deleteFolderTarget.name}" will be deleted. Its docs return to the library root — they aren't deleted.`}
          confirmLabel="Delete folder"
          onConfirm={handleDeleteFolder}
          onCancel={() => setDeleteFolderTarget(null)}
        />
      )}

      {/* ── Move doc modal ── */}
      {moveTarget && (
        <Modal title={`Move "${moveTarget.title}"`} tone="dusk" onClose={() => setMoveTarget(null)}>
          <MoveDocDialog
            folders={folders}
            currentFolderId={moveTarget.folderId ?? null}
            onMove={(folderId) => handleMove(moveTarget.id, folderId)}
            onClose={() => setMoveTarget(null)}
          />
        </Modal>
      )}
    </div>
  );
}

/** "2d", "Today", "3w" — compact relative age for the Newest measure. */
function relDays(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const days = Math.floor((Date.now() - then) / 86_400_000);
    if (days <= 0) return "Today";
    if (days === 1) return "1d";
    if (days < 14) return `${days}d`;
    if (days < 60) return `${Math.round(days / 7)}w`;
    return `${Math.round(days / 30)}mo`;
  } catch {
    return "—";
  }
}

/** A one-line AI-style digest, derived from what's actually in the library. */
function digestLine(docs: Doc[], orgName: string): string {
  if (docs.length === 0) {
    return `${orgName}'s reference library is empty — pin the documents the chapter reaches for most.`;
  }
  const recent = docs.filter(d => {
    try { return (Date.now() - new Date(d.createdAt).getTime()) < 7 * 86_400_000; } catch { return false; }
  }).length;
  const noun = docs.length === 1 ? "reference is" : "references are";
  const tail = recent > 0
    ? ` ${recent === 1 ? "One was" : `${recent} were`} added this week.`
    : "";
  return `${cap(numWord(docs.length))} ${noun} pinned for the chapter to reach for.${tail}`;
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function numWord(n: number): string {
  const w = ["zero","one","two","three","four","five","six","seven","eight","nine","ten"];
  return n <= 10 ? w[n] : String(n);
}
