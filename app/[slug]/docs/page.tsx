"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Sidebar } from "../../components/Sidebar";
import { Modal, ConfirmDialog, LoadingSpinner } from "../../components/dashboard/primitives";
import { useToast } from "../../components/dashboard/Toast";
import { useChapter } from "../../context/ChapterContext";
import { DocCard, kindOf, type Doc } from "./DocCard";
import { DocForm, type DocDraft } from "./DocForm";
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
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState<string | null>(null);
  const [pageError,    setPageError]    = useState<string | null>(null);
  const [showAdd,      setShowAdd]      = useState(false);
  const [editTarget,   setEditTarget]   = useState<Doc | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Doc | null>(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [query,        setQuery]        = useState("");
  const [filter,       setFilter]       = useState<KindFilter>("all");

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
  }, []);

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

  const sorted = useMemo(
    () => [...docs].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id),
    [docs],
  );

  // Per-kind counts for the filter segment. "Sheet" and "Drive" both fold into
  // their own buttons; anything not Doc/Sheet/Form reads as a Link here.
  const counts = useMemo(() => {
    const c = { all: sorted.length, doc: 0, sheet: 0, form: 0, link: 0 } as Record<KindFilter, number>;
    for (const d of sorted) {
      const k = kindOf(d.url);
      if (k === "doc") c.doc++;
      else if (k === "sheet") c.sheet++;
      else if (k === "form") c.form++;
      else c.link++; // drive + link both surface under "Links"
    }
    return c;
  }, [sorted]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter(d => {
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
  }, [sorted, query, filter]);

  // Glance metrics, all derived from the live library.
  const glance = useMemo(() => {
    const kinds = new Set(sorted.map(d => {
      const k = kindOf(d.url);
      return k === "drive" || k === "link" ? "link" : k;
    }));
    const contributors = new Set(sorted.map(d => d.createdById).filter((x): x is number => x != null));
    const newest = sorted[0]?.createdAt ? relDays(sorted[0].createdAt) : "—";
    return { total: sorted.length, kinds: kinds.size, contributors: contributors.size, newest };
  }, [sorted]);

  const orgName = currentUser?.org?.name ?? "ChaptOS";
  const hasDocs = sorted.length > 0;
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
        {/* ── Toolbar (mobile hamburger + label). dash-toolbar warms it at md+. ── */}
        <header className="toolbar-frosted dash-toolbar dx-toolbar-bar relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.05] px-4 sm:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="tb-icon-btn flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.07] lg:hidden"
            aria-label="Open menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="dx-crumb truncate">Docs</span>
        </header>

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
              <div>
                <p className="kicker">Reference Library</p>
                <h1>Everything <em>on file</em>.</h1>
                <div className="dx-digest">
                  <span className="ai">AI</span>
                  <p>{digestLine(sorted, orgName)}</p>
                </div>
              </div>
              {canManage && (
                <button className="dx-add" onClick={() => setShowAdd(true)}>
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  Add doc
                </button>
              )}
            </section>

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

            {!loading && !loadError && !hasDocs && (
              <div className="dx-empty">
                <div className="ic">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                </div>
                <p className="t">No references pinned yet</p>
                <p className="h">{canManage ? "Add a link to start your chapter's reference library." : "Ask an admin to add some links."}</p>
              </div>
            )}

            {!loading && !loadError && hasDocs && filtered.length === 0 && (
              <div className="dx-empty">
                <div className="ic">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
                </div>
                <p className="t">Nothing matches</p>
                <p className="h">Try a different search or filter.</p>
                <button className="clear" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button>
              </div>
            )}

            {!loading && !loadError && filtered.length > 0 && (
              <div className="dx-grid">
                {filtered.map(doc => (
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
