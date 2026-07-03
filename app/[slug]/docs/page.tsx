"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "../../components/Sidebar";
import { Modal, ConfirmDialog, LoadingSpinner } from "../../components/dashboard/primitives";
import { useToast } from "../../components/dashboard/Toast";
import { useChapter } from "../../context/ChapterContext";
import { kindOf, type Doc, type Folder } from "./lib";
import { DocForm, type DocDraft } from "./DocForm";
import { FolderForm } from "./FolderForm";
import { FolderSection } from "./FolderSection";
import { LedgerRow } from "./LedgerRow";
import { MoveDocDialog } from "./MoveDocDialog";
import { PinnedCard } from "./PinnedCard";
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
// Which sections are folded shut, keyed "f-{folderId}" / "unfiled"; persists
// per browser. Stale keys for deleted folders are harmless — never read again.
const COLLAPSE_PREF_KEY = "chaptos-docs-collapsed";

export default function DocsPage() {
  const toast = useToast();
  const { currentUser, can } = useChapter();
  const canManage = can("MANAGE_DOCS");

  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [docs,         setDocs]         = useState<Doc[]>([]);
  const [folders,      setFolders]      = useState<Folder[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState<string | null>(null);
  const [pageError,    setPageError]    = useState<string | null>(null);
  const [showAdd,      setShowAdd]      = useState(false);
  // Which folder the Add modal files into — set by a ghost row, null from the
  // header button (Unfiled).
  const [addFolderId,  setAddFolderId]  = useState<number | null>(null);
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
  const [collapsed,    setCollapsed]    = useState<Record<string, boolean>>({});

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const savedSort = localStorage.getItem(SORT_PREF_KEY);
      if (savedSort === "newest" || savedSort === "name" || savedSort === "kind") setSort(savedSort);
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem(COLLAPSE_PREF_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, boolean>;
        setCollapsed(c => ({ ...c, ...saved }));
      }
    } catch { /* ignore malformed prefs */ }
  }, []);

  function changeSort(id: SortId) {
    setSort(id);
    try { localStorage.setItem(SORT_PREF_KEY, id); } catch { /* ignore */ }
  }

  function toggleSection(key: string) {
    setCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(COLLAPSE_PREF_KEY, JSON.stringify(next)); } catch { /* ignore */ }
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

  // "/" focuses the library search (⌘K already belongs to the chat widget) —
  // unless a modal owns the focus or the user is already typing somewhere.
  const modalOpen = showAdd || showAddFolder || editTarget != null || deleteTarget != null
    || moveTarget != null || renameTarget != null || deleteFolderTarget != null;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (modalOpen) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  function closeAdd() {
    setShowAdd(false);
    setAddFolderId(null);
  }

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
          folderId: addFolderId,
        }),
      });
      // POST returns the raw doc (no createdByName); the creator is the current
      // user, so attribute it immediately instead of waiting for a reload.
      setDocs(prev => [{ ...created, createdByName: currentUser?.name ?? null }, ...prev]);
      // If the active search/kind filter would hide the new doc, clear both so
      // it doesn't land invisibly in its section.
      const k = kindOf(created.url);
      const bucket: KindFilter = k === "drive" ? "link" : (k as KindFilter);
      const q = query.trim().toLowerCase();
      const visible = (filter === "all" || bucket === filter)
        && (!q || created.title.toLowerCase().includes(q)
          || (created.description?.toLowerCase().includes(q) ?? false)
          || created.url.toLowerCase().includes(q));
      if (!visible) { setQuery(""); setFilter("all"); }
      closeAdd();
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

  async function handleCopy(doc: Doc) {
    try {
      await navigator.clipboard.writeText(doc.url);
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  }

  async function handleRefresh(doc: Doc) {
    try {
      const updated = await requestJson<Doc>("/api/docs/refresh-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: doc.id }),
      });
      // Endpoint returns the raw doc (no createdByName); preserve attribution.
      setDocs(prev => prev.map(d => d.id === updated.id ? { ...updated, createdByName: d.createdByName } : d));
      toast.success("Preview refreshed.");
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : "Failed to refresh preview.";
      toast.error(message);
    }
  }

  // Create a folder and add it to local state; returns it so callers can chain
  // (e.g. the Move dialog moves a doc into the folder it just created).
  async function createFolderApi(name: string): Promise<Folder> {
    const created = await requestJson<Folder>("/api/docs/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setFolders(prev => [created, ...prev]);
    return created;
  }

  async function handleAddFolder(name: string) {
    setPageError(null);
    setSubmitting(true);
    try {
      const created = await createFolderApi(name);
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

  // From the Move dialog: create a folder, then move the doc into it.
  async function handleCreateFolderForMove(name: string) {
    if (!moveTarget) return;
    const docId = moveTarget.id;
    setSubmitting(true);
    try {
      const created = await createFolderApi(name);
      await handleMove(docId, created.id);
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
      // Released docs return to Unfiled.
      setDocs(prev => prev.map(d => d.folderId === id ? { ...d, folderId: null } : d));
      toast.success(`Deleted folder "${name}".`);
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : "Failed to delete folder.";
      setPageError(message);
      toast.error(message);
    }
  }

  // Move a doc to a folder (or null = Unfiled). Shared by the Move dialog and
  // drag-and-drop onto section headers.
  async function handleMove(docId: number, folderId: number | null) {
    // No-op if the doc is already there (e.g. dropping onto its own section, or
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
      const dest = folderId == null ? "Unfiled" : (folders.find(f => f.id === folderId)?.name ?? "folder");
      toast.success(`Moved to ${dest}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : "Failed to move doc.";
      setPageError(message);
      toast.error(message);
    }
  }

  // Pin / unpin a doc — pinned docs live on the shelf, not in their section.
  async function handlePinDoc(doc: Doc) {
    const pinned = doc.pinnedAt == null; // toggling toward pinned?
    try {
      const updated = await requestJson<Doc>(`/api/docs/${doc.id}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      });
      // The pin endpoint doesn't enrich createdByName; carry it forward.
      setDocs(prev => prev.map(d => d.id === updated.id ? { ...updated, createdByName: d.createdByName } : d));
      toast.success(pinned ? `Pinned "${doc.title}".` : `Unpinned "${doc.title}".`);
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : "Failed to pin doc.";
      setPageError(message);
      toast.error(message);
    }
  }

  // Pin / unpin a folder — floats its section ahead of unpinned ones.
  async function handlePinFolder(folder: Folder) {
    const pinned = folder.pinnedAt == null;
    try {
      const updated = await requestJson<Folder>(`/api/docs/folders/${folder.id}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      });
      setFolders(prev => prev.map(f => f.id === updated.id ? updated : f));
      toast.success(pinned ? `Pinned "${folder.name}".` : `Unpinned "${folder.name}".`);
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : "Failed to pin folder.";
      setPageError(message);
      toast.error(message);
    }
  }

  // Read a dragged doc id from a drop event (set by LedgerRow.onDragStart).
  function docIdFromDrop(e: React.DragEvent): number | null {
    const raw = e.dataTransfer.getData("application/x-doc-id") || e.dataTransfer.getData("text/plain");
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  function openAdd(folderId: number | null) {
    setAddFolderId(folderId);
    setShowAdd(true);
  }

  // Newest-first always — used by the meta-line measures independent of the
  // user's chosen display sort.
  const newestFirst = useMemo(
    () => [...docs].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id),
    [docs],
  );

  const sorted = useMemo(() => {
    const arr = [...newestFirst];
    if (sort === "name") arr.sort((a, b) => a.title.localeCompare(b.title) || a.id - b.id);
    else if (sort === "kind") arr.sort((a, b) =>
      kindOf(a.url).localeCompare(kindOf(b.url)) || a.title.localeCompare(b.title) || a.id - b.id);
    // "newest" keeps newestFirst order. Pinned docs render on the shelf, not
    // here, so no pin float — the shelf orders by pinnedAt itself.
    return arr;
  }, [newestFirst, sort]);

  // The shelf: pinned docs, most-recently pinned first. Honors the search (a
  // query should find everything) but ignores the kind filter — the shelf
  // stays put while the ledgers filter, matching the mock.
  const pinnedDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs
      .filter(d => d.pinnedAt != null)
      .sort((a, b) => b.pinnedAt!.localeCompare(a.pinnedAt!) || b.id - a.id)
      .filter(d => !q
        || d.title.toLowerCase().includes(q)
        || (d.description?.toLowerCase().includes(q) ?? false)
        || d.url.toLowerCase().includes(q));
  }, [docs, query]);

  // Everything below the shelf works on the unpinned library.
  const unpinned = useMemo(() => sorted.filter(d => d.pinnedAt == null), [sorted]);

  // Per-kind counts for the filter segment, over what the tabs actually
  // filter (the ledgers). Anything not Doc/Sheet/Form reads as a Link here.
  const counts = useMemo(() => {
    const c = { all: unpinned.length, doc: 0, sheet: 0, form: 0, link: 0 } as Record<KindFilter, number>;
    for (const d of unpinned) {
      const k = kindOf(d.url);
      if (k === "doc") c.doc++;
      else if (k === "sheet") c.sheet++;
      else if (k === "form") c.form++;
      else c.link++; // drive + link both surface under "Links"
    }
    return c;
  }, [unpinned]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return unpinned.filter(d => {
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
  }, [unpinned, query, filter]);

  const folderIds = useMemo(() => new Set(folders.map(f => f.id)), [folders]);

  // Visible rows grouped by section. Docs pointing at a folder we don't have
  // (partial/failed folders load) fall back to Unfiled so nothing vanishes.
  const docsByFolder = useMemo(() => {
    const m = new Map<number | null, Doc[]>();
    for (const d of filtered) {
      const key = d.folderId != null && folderIds.has(d.folderId) ? d.folderId : null;
      const arr = m.get(key);
      if (arr) arr.push(d); else m.set(key, [d]);
    }
    return m;
  }, [filtered, folderIds]);

  // Section order: pinned folders first (most-recently pinned), then by name.
  const sortedFolders = useMemo(() => {
    return [...folders].sort((a, b) => {
      if (a.pinnedAt && b.pinnedAt) return b.pinnedAt.localeCompare(a.pinnedAt);
      if (a.pinnedAt) return -1;
      if (b.pinnedAt) return 1;
      return a.name.localeCompare(b.name) || a.id - b.id;
    });
  }, [folders]);

  // "N docs" badges count what the ledger shows: unpinned docs, unfiltered.
  const folderCounts = useMemo(() => {
    const m = new Map<number, number>();
    for (const d of docs) {
      if (d.pinnedAt == null && d.folderId != null) m.set(d.folderId, (m.get(d.folderId) ?? 0) + 1);
    }
    return m;
  }, [docs]);

  // Folder-delete confirm counts everything the backend will release — pinned
  // docs included — so the copy never understates.
  const folderTotals = useMemo(() => {
    const m = new Map<number, number>();
    for (const d of docs) if (d.folderId != null) m.set(d.folderId, (m.get(d.folderId) ?? 0) + 1);
    return m;
  }, [docs]);

  // Unfiled renders whenever unpinned root (or orphaned) docs exist at all —
  // if the filter hides them it shows its none-match line like any folder.
  const unfiledCount = useMemo(
    () => docs.filter(d => d.pinnedAt == null && (d.folderId == null || !folderIds.has(d.folderId))).length,
    [docs, folderIds],
  );

  // Meta-line measures, all derived from the live library.
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
  const hasDocs = docs.length > 0;
  const queryActive = query.trim() !== "" || filter !== "all";
  // Search/filter matched nothing anywhere — skip the shelf and sections and
  // show one global empty state instead of a page of none-match lines.
  const nothingMatches = queryActive && hasDocs && filtered.length === 0 && pinnedDocs.length === 0;
  const addFolderName = addFolderId != null
    ? (folders.find(f => f.id === addFolderId)?.name ?? "folder")
    : null;

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
                <h1>The chapter&rsquo;s <em>reading room</em>.</h1>
                <div className="dx-digest">
                  <span className="ai">AI</span>
                  <p>{digestLine(sorted, orgName)}</p>
                </div>
                {hasDocs && (
                  <p className="dx-meta-line">
                    <span><b>{glance.total}</b>{" "}{glance.total === 1 ? "reference" : "references"}</span>
                    <span className="dot">·</span>
                    <span><b>{glance.kinds}</b>{" "}{glance.kinds === 1 ? "kind" : "kinds"}</span>
                    <span className="dot">·</span>
                    <span><b>{glance.contributors}</b>{" "}{glance.contributors === 1 ? "contributor" : "contributors"}</span>
                    <span className="dot">·</span>
                    {glance.newest === "Today"
                      ? <span>newest{" "}<b>today</b></span>
                      : <span>newest{" "}<b>{glance.newest}</b>{" "}ago</span>}
                  </p>
                )}
              </div>
              {canManage && (
                <div className="dx-actions">
                  <button className="dx-add ghost" onClick={() => setShowAddFolder(true)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><path d="M12 11v4M10 13h4" /></svg>
                    New folder
                  </button>
                  <button className="dx-add" onClick={() => openAdd(null)}>
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    Add doc
                  </button>
                </div>
              )}
            </section>

            {/* ── Toolbar: search + kind filter + sort ── */}
            {hasDocs && (
              <div className="dx-toolbar">
                <label className="dx-search">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search the library…"
                    aria-label="Search docs"
                  />
                  {query ? (
                    <button type="button" className="clr" onClick={() => setQuery("")} aria-label="Clear search">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  ) : (
                    <span className="kbd">/</span>
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
                <span className="dx-scope">{filtered.length} of {unpinned.length}</span>
              </div>
            )}

            {/* ── States ── */}
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

            {/* Search / filter matched nothing anywhere. */}
            {!loading && !loadError && nothingMatches && (
              <div className="dx-empty">
                <div className="ic">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
                </div>
                <p className="t">Nothing matches</p>
                <p className="h">Try a different search or filter.</p>
                <button className="clear" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button>
              </div>
            )}

            {/* ── Pinned shelf ── */}
            {!loading && !loadError && !nothingMatches && pinnedDocs.length > 0 && (
              <>
                <p className="dx-shelf-label">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5M9 3h6l-.75 6.5L18 12H6l3.75-2.5z" /></svg>
                  Pinned
                </p>
                <div className="dx-shelf">
                  {pinnedDocs.map(doc => (
                    <PinnedCard
                      key={doc.id}
                      doc={doc}
                      canManage={canManage}
                      onEdit={() => setEditTarget(doc)}
                      onDelete={() => setDeleteTarget(doc)}
                      onMove={() => setMoveTarget(doc)}
                      onCopy={() => handleCopy(doc)}
                      onRefresh={() => handleRefresh(doc)}
                      onPin={() => handlePinDoc(doc)}
                    />
                  ))}
                </div>
              </>
            )}

            {/* ── Folder sections + Unfiled ── */}
            {!loading && !loadError && !nothingMatches && (
              <>
                {sortedFolders.map(folder => (
                  <FolderSection
                    key={`f-${folder.id}`}
                    name={folder.name}
                    folder={folder}
                    totalCount={folderCounts.get(folder.id) ?? 0}
                    visibleCount={docsByFolder.get(folder.id)?.length ?? 0}
                    collapsed={!!collapsed[`f-${folder.id}`]}
                    forceOpen={queryActive}
                    queryActive={queryActive}
                    canManage={canManage}
                    onToggle={() => toggleSection(`f-${folder.id}`)}
                    onGhostAdd={openAdd}
                    onDropDoc={(docId) => handleMove(docId, folder.id)}
                    readDropId={docIdFromDrop}
                    onRename={() => setRenameTarget(folder)}
                    onDelete={() => setDeleteFolderTarget(folder)}
                    onPin={() => handlePinFolder(folder)}
                  >
                    {(docsByFolder.get(folder.id) ?? []).map(doc => (
                      <LedgerRow
                        key={doc.id}
                        doc={doc}
                        canManage={canManage}
                        onEdit={() => setEditTarget(doc)}
                        onDelete={() => setDeleteTarget(doc)}
                        onMove={() => setMoveTarget(doc)}
                        onCopy={() => handleCopy(doc)}
                        onRefresh={() => handleRefresh(doc)}
                        onPin={() => handlePinDoc(doc)}
                      />
                    ))}
                  </FolderSection>
                ))}
                {unfiledCount > 0 && (
                  <FolderSection
                    key="unfiled"
                    name="Unfiled"
                    folder={null}
                    totalCount={unfiledCount}
                    visibleCount={docsByFolder.get(null)?.length ?? 0}
                    collapsed={!!collapsed["unfiled"]}
                    forceOpen={queryActive}
                    queryActive={queryActive}
                    canManage={canManage}
                    onToggle={() => toggleSection("unfiled")}
                    onGhostAdd={openAdd}
                    onDropDoc={(docId) => handleMove(docId, null)}
                    readDropId={docIdFromDrop}
                    onRename={() => {}}
                    onDelete={() => {}}
                    onPin={() => {}}
                  >
                    {(docsByFolder.get(null) ?? []).map(doc => (
                      <LedgerRow
                        key={doc.id}
                        doc={doc}
                        canManage={canManage}
                        onEdit={() => setEditTarget(doc)}
                        onDelete={() => setDeleteTarget(doc)}
                        onMove={() => setMoveTarget(doc)}
                        onCopy={() => handleCopy(doc)}
                        onRefresh={() => handleRefresh(doc)}
                        onPin={() => handlePinDoc(doc)}
                      />
                    ))}
                  </FolderSection>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* ── Add modal ── */}
      {showAdd && (
        <Modal
          title={addFolderName ? `Add doc — ${addFolderName}` : "Add doc"}
          tone="dusk"
          onClose={() => !submitting && closeAdd()}
        >
          <DocForm
            initial={EMPTY_DRAFT}
            submitLabel={submitting ? "Adding…" : "Add"}
            onSubmit={handleAdd}
            onClose={closeAdd}
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
          message={folderDeleteMessage(deleteFolderTarget.name, folderTotals.get(deleteFolderTarget.id) ?? 0)}
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
            onCreateFolder={handleCreateFolderForMove}
            submitting={submitting}
            onClose={() => setMoveTarget(null)}
          />
        </Modal>
      )}
    </div>
  );
}

/** "2d", "Today", "3w" — compact relative age for the newest measure. */
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

/** Folder-delete confirm copy, with the live doc count it will release. */
function folderDeleteMessage(name: string, count: number): string {
  if (count === 0) return `"${name}" will be deleted. It has no docs.`;
  const docs = count === 1 ? "Its 1 doc returns" : `Its ${count} docs return`;
  return `"${name}" will be deleted. ${docs} to Unfiled — they aren't deleted.`;
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function numWord(n: number): string {
  const w = ["zero","one","two","three","four","five","six","seven","eight","nine","ten"];
  return n <= 10 ? w[n] : String(n);
}
