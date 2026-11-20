"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "../../../components/Sidebar";
import { Modal, ConfirmDialog, LoadingSpinner } from "../../../components/dashboard/primitives";
import { useToast } from "../../../components/dashboard/Toast";
import { useChapter } from "../../../context/ChapterContext";
import { folderHue, type Doc, type Folder } from "./lib";
import {
  FILTERS, SAY, SORTS, digestLine, docDeleteMessage, filterDocs, folderCounts as folderCountsOf, folderDeleteMessage,
  folderTotals as folderTotalsOf, glanceOf, groupByFolder, isSortId, kindCounts, newestFirstOf, pageState, pinnedShelf,
  shownUnder, sortDocs, sortFolders, unfiledCount as unfiledCountOf, type KindFilter, type SortId,
} from "@/lib/docs/library";
import { FolderPicker } from "./FolderPicker";
import { DocForm, type DocDraft } from "./DocForm";
import { FolderForm } from "./FolderForm";
import { FolderSection } from "./FolderSection";
import { LedgerRow } from "./LedgerRow";
import { MoveDocDialog } from "./MoveDocDialog";
import { PinnedCard } from "./PinnedCard";
import { DocsDayOne } from "./DayOne";
import { PaperIcon } from "../../../components/paper/PaperIcon";
import { requestJson } from "../../../lib/api";
import "../../../components/dashboard/dashboard-ledger.css";
import "./docs-ledger.css";

const EMPTY_DRAFT: DocDraft = { title: "", url: "", description: "" };

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
  // Live drag cue: the doc being dragged, and the row it's currently over. The
  // hovered row shows an insertion line so you see where the drop will land; the
  // dragged row stays put (dimmed) — we don't reorder the DOM mid-drag because
  // moving the drag source aborts the native drag.
  const [dragDoc,      setDragDoc]      = useState<{ id: number; folderId: number | null } | null>(null);
  const [overDocId,    setOverDocId]    = useState<number | "end" | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const savedSort = localStorage.getItem(SORT_PREF_KEY);
      if (isSortId(savedSort)) setSort(savedSort);
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
      .catch(() => setLoadError(SAY.fail.load))
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
      const visible = shownUnder(created, query, filter);
      if (!visible) { setQuery(""); setFilter("all"); }
      closeAdd();
      toast.success(SAY.added(created.title));
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : SAY.fail.add;
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
      toast.success(SAY.updated);
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : SAY.fail.update;
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
      toast.success(SAY.deleted(title));
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : SAY.fail.delete;
      setPageError(message);
      toast.error(message);
    }
  }

  async function handleCopy(doc: Doc) {
    try {
      await navigator.clipboard.writeText(doc.url);
      toast.success(SAY.copied);
    } catch {
      toast.error(SAY.copyFailed);
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
      toast.success(SAY.refreshed);
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : SAY.fail.refresh;
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
      toast.success(SAY.folderCreated(created.name));
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : SAY.fail.folderCreate;
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
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : SAY.fail.folderCreate;
      setPageError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  // From the Add sheet's picker: create a folder; the picker then selects it.
  async function handleCreateFolderForAdd(name: string): Promise<Folder | null> {
    try {
      const created = await createFolderApi(name);
      toast.success(SAY.folderCreated(created.name));
      return created;
    } catch (err) {
      toast.error(err instanceof Error ? err.message.replace(/^.*?: /, "") : SAY.fail.folderCreate);
      return null;
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
      toast.success(SAY.folderRenamed);
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : SAY.fail.folderRename;
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
      toast.success(SAY.folderDeleted(name));
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : SAY.fail.folderDelete;
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
      toast.success(SAY.moved(dest));
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : SAY.fail.move;
      setPageError(message);
      toast.error(message);
    }
  }

  // Reorder a doc within its section: drop `docId` immediately before
  // `beforeDocId` (null = drop at the end). `folderId` scopes the section.
  //
  // Reorder is same-section only. A doc dropped on a row in a *different* folder
  // is delegated to handleMove (a plain move into that folder, unpositioned) —
  // treating cross-folder + reposition as one action invited a move/reorder race
  // and a rollback that could diverge from the DB.
  async function handleReorderDocs(folderId: number | null, docId: number, beforeDocId: number | null) {
    const dragged = docs.find(d => d.id === docId);
    if (!dragged || dragged.pinnedAt != null) return; // pinned docs live on the shelf
    if ((dragged.folderId ?? null) !== folderId) { handleMove(docId, folderId); return; }

    // The section's current order (unpinned docs in this folder, in display order),
    // with the dragged doc pulled out so we can re-insert it at the drop point.
    const inSection = (d: Doc) => d.pinnedAt == null
      && ((d.folderId ?? null) === folderId
        || (folderId == null && d.folderId != null && !folderIds.has(d.folderId)));
    const currentIds = sorted.filter(inSection).map(d => d.id).filter(id => id !== docId);
    const at = beforeDocId == null ? currentIds.length : currentIds.indexOf(beforeDocId);
    const insertAt = at < 0 ? currentIds.length : at;
    const orderedIds = [...currentIds.slice(0, insertAt), docId, ...currentIds.slice(insertAt)];

    // No-op if the order is unchanged (dropped onto its own slot / current
    // neighbor) and positions are already dense — skip the needless PATCH.
    const sectionDocs = sorted.filter(inSection);
    const unchanged = sectionDocs.length === orderedIds.length
      && sectionDocs.every((d, i) => d.id === orderedIds[i] && d.position === i);
    if (unchanged) return;

    const posById = new Map(orderedIds.map((id, i) => [id, i]));
    const prevDocs = docs;
    setDocs(prev => prev.map(d => posById.has(d.id) ? { ...d, position: posById.get(d.id)! } : d));
    if (sort !== "manual") changeSort("manual"); // reordering only shows under Manual
    try {
      await requestJson<{ count: number }>("/api/docs/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId, orderedIds }),
      });
    } catch (err) {
      setDocs(prevDocs); // roll back the optimistic order
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : "Failed to reorder.";
      setPageError(message);
      toast.error(message);
    }
  }

  // Reorder folder sections: drop `folderId` immediately before `beforeFolderId`
  // (null = drop at the end of the unpinned run). Pinned folders don't reorder —
  // they float by pin. Optimistic, same as doc reorder.
  async function handleReorderFolders(folderId: number, beforeFolderId: number | null) {
    const unpinned = sortedFolders.filter(f => f.pinnedAt == null);
    const currentIds = unpinned.map(f => f.id);
    if (!currentIds.includes(folderId)) return;
    const without = currentIds.filter(id => id !== folderId);
    const at = beforeFolderId == null ? without.length : without.indexOf(beforeFolderId);
    const insertAt = at < 0 ? without.length : at;
    const orderedIds = [...without.slice(0, insertAt), folderId, ...without.slice(insertAt)];
    if (orderedIds.length === currentIds.length && orderedIds.every((id, i) => id === currentIds[i])) return;

    const posById = new Map(orderedIds.map((id, i) => [id, i]));
    const prevFolders = folders;
    setFolders(prev => prev.map(f => posById.has(f.id) ? { ...f, position: posById.get(f.id)! } : f));
    try {
      await requestJson<{ count: number }>("/api/docs/folders/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      });
    } catch (err) {
      setFolders(prevFolders);
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : "Failed to reorder folders.";
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
      toast.success(SAY.pinned(doc.title, pinned));
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : SAY.fail.pinDoc;
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
      toast.success(SAY.pinned(folder.name, pinned));
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : SAY.fail.pinFolder;
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

  // Read a dragged folder id — its own MIME type keeps folder drags from being
  // mistaken for doc drags (a section header is a target for both).
  function folderIdFromDrop(e: React.DragEvent): number | null {
    const raw = e.dataTransfer.getData("application/x-folder-id");
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  // Drag session for the live preview. A row calls beginDrag on dragstart, sets
  // the hovered row via setOverDocId, and endDrag clears both (on drop / dragend).
  function beginDrag(id: number, folderId: number | null) {
    setDragDoc({ id, folderId });
    setOverDocId(null);
  }
  function endDrag() {
    setDragDoc(null);
    setOverDocId(null);
  }

  function openAdd(folderId: number | null) {
    setAddFolderId(folderId);
    setShowAdd(true);
  }

  // Newest-first always — used by the meta-line measures independent of the
  // user's chosen display sort.
  const newestFirst = useMemo(() => newestFirstOf(docs), [docs]);
  const sorted = useMemo(() => sortDocs(newestFirst, sort), [newestFirst, sort]);
  // The shelf honors the search but not the kind filter.
  const pinnedDocs = useMemo(() => pinnedShelf(docs, query), [docs, query]);
  // Everything below the shelf works on the unpinned library.
  const unpinned = useMemo(() => sorted.filter(d => d.pinnedAt == null), [sorted]);
  const counts = useMemo(() => kindCounts(unpinned), [unpinned]);
  const filtered = useMemo(() => filterDocs(unpinned, query, filter), [unpinned, query, filter]);

  const folderIds = useMemo(() => new Set(folders.map(f => f.id)), [folders]);

  const docsByFolder = useMemo(() => groupByFolder(filtered, folderIds), [filtered, folderIds]);

  // Which row shows the "will drop before me" line for the section a drag is
  // hovering. We DON'T reorder the DOM mid-drag: moving the dragged source node
  // during a native HTML5 drag makes the browser abort the drag. Instead the
  // dragged row stays put (dimmed) and the hovered row shows an insertion line —
  // live feedback, stable drag. Only same-section drags cue here; the end-of-list
  // line is handled imperatively by the section's own drop zone. Returns the
  // row id to mark, or null.
  function cueBeforeId(folderKey: number | null): number | null {
    if (!dragDoc || !canReorder) return null;
    if ((dragDoc.folderId ?? null) !== folderKey) return null;
    if (overDocId === dragDoc.id) return null;      // hovering itself → no cue
    return typeof overDocId === "number" ? overDocId : null;
  }

  const sortedFolders = useMemo(() => sortFolders(folders), [folders]);
  // "N docs" badges count what the ledger shows: unpinned docs, unfiltered.
  const folderCounts = useMemo(() => folderCountsOf(docs), [docs]);
  // Folder-delete confirm counts everything the backend will release.
  const folderTotals = useMemo(() => folderTotalsOf(docs), [docs]);
  const unfiledCount = useMemo(() => unfiledCountOf(docs, folderIds), [docs, folderIds]);
  // Meta-line measures, all derived from the live library.
  const glance = useMemo(() => glanceOf(newestFirst, new Date()), [newestFirst]);

  const orgName = currentUser?.org?.name ?? "ChaptOS";
  // Day one: nothing filed and no folders yet (see DayOne.tsx). nothingMatches: the
  // search/filter matched nothing anywhere, so one global empty state shows instead.
  const { hasDocs, dayOne, queryActive, nothingMatches } = pageState({
    loading, loadError: loadError != null, docs: docs.length, folders: folders.length, query, filter,
    filtered: filtered.length, pinned: pinnedDocs.length,
  });
  // Drag-reorder is an admin gesture, available under any sort as long as no
  // search/filter is narrowing the sections (otherwise "before this row" is
  // ambiguous against a hidden neighbor). It isn't gated to Manual sort: dropping
  // a row commits a hand order and flips the view to Manual (see handleReorderDocs
  // / handleReorderFolders) so the result is visible — otherwise a page that
  // defaults to Newest would swallow the gesture with no feedback. Cross-folder
  // moves stay on at all times.
  const canReorder = canManage && !queryActive;

  return (
    <div className="flex h-screen overflow-hidden bg-[color:var(--paper)]">
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
                {dayOne ? <>
                  <p className="kicker">Docs</p>
                  <h1>Your links, <em>all in one place</em>.</h1>
                  <p className="dx1-sub">Paste a link to anything the chapter uses. It turns into a card here that everyone can open.</p>
                </> : <>
                  <p className="kicker">Reference Library</p>
                  <h1>The chapter&rsquo;s <em>reading room</em>.</h1>
                  <div className="dx-digest">
                    <span className="ai"><span><PaperIcon name="spark" />Digest</span></span>
                    <p>{digestLine(sorted, orgName, new Date())}</p>
                  </div>
                </>}
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
                  {!dayOne && <button className="dx-add ghost" onClick={() => setShowAddFolder(true)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><path d="M12 11v4M10 13h4" /></svg>
                    New folder
                  </button>}
                  <button className="dx-add" onClick={() => openAdd(null)}>
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    Add doc
                  </button>
                </div>
              )}
              {!dayOne && <button
                className="dx-ask"
                onClick={() => window.dispatchEvent(new CustomEvent("chapt:ask", { detail: { q: "Where do we keep " } }))}
              >
                <PaperIcon name="spark" />Ask where a doc lives<kbd>⌘K</kbd>
              </button>}
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

            {dayOne && <DocsDayOne canManage={canManage} known={currentUser != null} onAdd={() => openAdd(null)} />}

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
                  <span className="cnt">{pinnedDocs.length} · stays put while you filter</span>
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
                {sortedFolders.map((folder, i) => (
                  <FolderSection
                    key={`f-${folder.id}`}
                    name={folder.name}
                    folder={folder}
                    hue={folderHue(i)}
                    totalCount={folderCounts.get(folder.id) ?? 0}
                    visibleCount={docsByFolder.get(folder.id)?.length ?? 0}
                    collapsed={!!collapsed[`f-${folder.id}`]}
                    forceOpen={queryActive}
                    queryActive={queryActive}
                    canManage={canManage}
                    reorderable={canReorder && folder.pinnedAt == null}
                    onToggle={() => toggleSection(`f-${folder.id}`)}
                    onGhostAdd={openAdd}
                    onDropDoc={(docId) => handleMove(docId, folder.id)}
                    onDropDocAtEnd={(docId) => handleReorderDocs(folder.id, docId, null)}
                    onDragOverEnd={() => setOverDocId(prev => prev === "end" ? prev : "end")}
                    onReorderFolderBefore={(draggedId) => handleReorderFolders(draggedId, folder.id)}
                    readDropId={docIdFromDrop}
                    readFolderDropId={folderIdFromDrop}
                    onRename={() => setRenameTarget(folder)}
                    onDelete={() => setDeleteFolderTarget(folder)}
                    onPin={() => handlePinFolder(folder)}
                  >
                    {(docsByFolder.get(folder.id) ?? []).map(doc => (
                      <LedgerRow
                        key={doc.id}
                        doc={doc}
                        canManage={canManage}
                        reorderable={canReorder}
                        dragging={dragDoc?.id === doc.id}
                        cueBefore={cueBeforeId(folder.id) === doc.id}
                        readDropId={docIdFromDrop}
                        onDragBegin={() => beginDrag(doc.id, folder.id)}
                        onDragEnd={endDrag}
                        onDragOverRow={() => setOverDocId(prev => prev === doc.id ? prev : doc.id)}
                        onReorderBefore={(draggedId) => handleReorderDocs(folder.id, draggedId, doc.id)}
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
                    reorderable={canReorder}
                    onToggle={() => toggleSection("unfiled")}
                    onGhostAdd={openAdd}
                    onDropDoc={(docId) => handleMove(docId, null)}
                    onDropDocAtEnd={(docId) => handleReorderDocs(null, docId, null)}
                    onDragOverEnd={() => setOverDocId(prev => prev === "end" ? prev : "end")}
                    onReorderFolderBefore={() => {}}
                    readDropId={docIdFromDrop}
                    readFolderDropId={folderIdFromDrop}
                    onRename={() => {}}
                    onDelete={() => {}}
                    onPin={() => {}}
                  >
                    {(docsByFolder.get(null) ?? []).map(doc => (
                      <LedgerRow
                        key={doc.id}
                        doc={doc}
                        canManage={canManage}
                        reorderable={canReorder}
                        dragging={dragDoc?.id === doc.id}
                        cueBefore={cueBeforeId(null) === doc.id}
                        readDropId={docIdFromDrop}
                        onDragBegin={() => beginDrag(doc.id, null)}
                        onDragEnd={endDrag}
                        onDragOverRow={() => setOverDocId(prev => prev === doc.id ? prev : doc.id)}
                        onReorderBefore={(draggedId) => handleReorderDocs(null, draggedId, doc.id)}
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
          title="Add doc"
          tone="dusk"
          onClose={() => !submitting && closeAdd()}
        >
          <DocForm
            initial={EMPTY_DRAFT}
            submitLabel={submitting ? "Adding…" : "Add"}
            onSubmit={handleAdd}
            onClose={closeAdd}
          >
            <FolderPicker
              folders={sortedFolders}
              counts={folderTotals}
              value={addFolderId}
              onChange={setAddFolderId}
              onCreate={handleCreateFolderForAdd}
            />
          </DocForm>
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
          message={docDeleteMessage(deleteTarget.title)}
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
