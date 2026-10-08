"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sidebar } from "../../../components/Sidebar";
import { ConfirmDialog, LoadingSpinner } from "../../../components/dashboard/primitives";
import { useToast } from "../../../components/dashboard/Toast";
import { PaperIcon } from "../../../components/paper/PaperIcon";
import { AgendaBody, AGENDA_CATEGORY, categoryOf } from "../../../components/agenda-templates/AgendaBody";
import { nextMeetingDraft } from "../../../components/meeting-notes/meeting-defaults";
import { useChapter } from "../../../context/ChapterContext";
import { useVocab } from "../../../hooks/useVocab";
import { useOrgPath } from "../../../hooks/useOrgPath";
import { useActiveSemester } from "../../../hooks/useActiveSemester";
import type { CalendarEvent } from "../../../data";
import { orgFetch } from "../../../lib/api";
import { todayStr } from "../../../lib/dates";
import {
  AGENDA_DESCRIPTION_MAX, AGENDA_FIELDS, AGENDA_NAME_MAX, agendaFieldsIn, agendaSections, agendaValues,
  formatAgendaDate, unknownAgendaFields,
} from "@/lib/agenda-template";
import type { AgendaTemplateDTO } from "@/lib/services/agenda-template-service";
import "../../../components/dashboard/dashboard-ledger.css";
import "../../../components/dashboard/meetings-ledger.css";
import "../../../components/agenda-templates/agenda-templates.css";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const API = "/api/calendar/agenda-templates";

/** JSON request that throws the server's own message, so a 400/409 reads as written. */
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await orgFetch(url, init?.body ? { ...init, headers: { "Content-Type": "application/json", ...init.headers } } : init);
  if (!res.ok) {
    let message = res.status === 403 ? "Only officers who schedule meetings can change templates." : "Something went wrong. Try again.";
    try {
      const b = await res.json();
      const detail = Array.isArray(b?.details) ? b.details[0]?.message : null;
      if (typeof detail === "string") message = detail;
      else if (typeof b?.error === "string" && b.error !== "Validation failed") message = b.error;
    } catch { /* keep the fallback */ }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

const CATS = Object.keys(AGENDA_CATEGORY);
const toneClass = (category: string) => `k-${categoryOf(category).tone}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function editedOn(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
}

/**
 * Day-one starting points. Nothing is written to the database until an officer
 * opens one and saves it — the drawer belongs to the chapter, not to us.
 */
const STARTERS: Draft[] = [
  { name: "Weekly chapter meeting", description: "The standing agenda, from roll call to adjournment.", category: "meetings",
    body: "## Roll call\nDate: {{meeting_date}} · {{meeting_time}} · Location: {{location}}\nPresent / Absent / Excused:\n\n## Officer reports\nPresident · Treasurer · Secretary · Committee chairs\n\n## Old business\nReview action items from the previous meeting.\n\n## New business\nDiscussion items, motions, and votes.\n\n## Action items\n[ ] Task — owner — due date\n\n## Adjournment\nNext meeting / time adjourned:" },
  { name: "Executive board check-in", description: "A little structure for the decisions that move us forward.", category: "leadership",
    body: "## Opening\n{{meeting_title}} · {{meeting_date}}\n\n## Officer updates\nWins, blockers, and support needed.\n\n## Decisions to make\nProposal / discussion / decision\n\n## Budget & priorities\n• Upcoming spending\n• Chapter priorities\n\n## Before we meet again\n[ ] Action — owner — due date" },
  { name: "Committee working session", description: "Keep projects, people, and next steps on the same page.", category: "committees",
    body: "## Session details\n{{meeting_title}} · {{meeting_date}}\nLocation: {{location}}\n\n## What we’re working toward\nGoal for this session:\n\n## Project updates\nProgress / blockers / help needed\n\n## Working notes\nIdeas and decisions:\n\n## Next steps\n[ ] Task — owner — due date" },
  { name: "Chapter town hall", description: "Space for open questions and a clear record of answers.", category: "meetings",
    body: "## Welcome\n{{meeting_title}} · {{meeting_date}}\n\n## Chapter updates\nAnnouncements and upcoming dates.\n\n## Open floor\nQuestion / discussion / response\n\n## Follow-ups\n[ ] Question to follow up — owner\n\n## Closing\nWhat we heard and what happens next." },
];

type Draft = { name: string; description: string; category: string; body: string };
type EditorMode = "new" | "edit" | "copy";
type Editor = { mode: EditorMode; id?: number; baseUpdatedAt?: string; uses: number; sourceName?: string; draft: Draft; original: string };

const snapshot = (d: Draft) => JSON.stringify(d);

// ─── Drawer card: a taped mini legal pad showing the template's own outline ───

function Sheet({ t, on, onSelect }: { t: AgendaTemplateDTO; on: boolean; onSelect: () => void }) {
  const heads = agendaSections(t.body);
  const rows = heads.slice(0, 4);
  return (
    <button type="button" className={`at-sheet ${toneClass(t.category)}${on ? " on" : ""}`} aria-pressed={on} onClick={onSelect}>
      <span className="at-tape pp-only" aria-hidden />
      <span className="at-sh-head">
        <span className="at-sh-cat">{categoryOf(t.category).label}</span>
        {t.isDefault && <span className="at-star" title="New meetings start from this"><PaperIcon name="star" />Default</span>}
      </span>
      <strong className="at-sh-name">{t.name}</strong>
      <span className="at-sh-lines" aria-hidden>
        {rows.map((h, i) => <span key={i}><i>{i + 1}</i>{h}</span>)}
        {heads.length > 4 ? <span className="more">+ {heads.length - 4} more</span> : null}
        {Array.from({ length: Math.max(0, 5 - rows.length - (heads.length > 4 ? 1 : 0)) }, (_, i) => <span key={`b${i}`} />)}
      </span>
      <span className="at-sh-foot">
        <span>{plural(heads.length, "section")}</span>
        <span>{t.uses ? `used ${t.uses}×` : "not used yet"}</span>
      </span>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgendaTemplatesPage() {
  const toast = useToast();
  const router = useRouter();
  const orgPath = useOrgPath();
  const semester = useActiveSemester();
  const v = useVocab();
  const { currentUser, can } = useChapter();
  const canEvents = can("MANAGE_EVENTS");
  const orgName = currentUser?.org?.name ?? "the chapter";

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [templates, setTemplates] = useState<AgendaTemplateDTO[] | null>(null);
  const [meetings, setMeetings] = useState<CalendarEvent[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"blank" | "filled">("blank");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AgendaTemplateDTO | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<(() => void) | null>(null);
  const deskRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  // <main> scrolls, not the window.
  const mainRef = useRef<HTMLElement>(null);

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canEvents) return;
    api<AgendaTemplateDTO[]>(API)
      .then(rows => { setTemplates(rows); setSelectedId(id => id ?? rows[0]?.id ?? null); })
      .catch(e => setLoadError(e instanceof Error ? e.message : "Could not load templates."));
    // Meetings only feed the "Filled for <date>" sample; it degrades to today.
    api<CalendarEvent[]>("/api/calendar?category=chapter").then(setMeetings).catch(() => { /* optional */ });
  }, [canEvents]);

  const list = useMemo(() => templates ?? [], [templates]);
  const selected = list.find(t => t.id === selectedId) ?? list[0] ?? null;
  const defaultTpl = list.find(t => t.isDefault) ?? null;

  // The meeting Add meeting would propose next — the same defaults it uses.
  const next = useMemo(() => nextMeetingDraft(meetings, semester, todayStr()), [meetings, semester]);
  const sampleFor = useCallback((name: string) => agendaValues({
    title: name, date: next.when.date, startTime: next.when.startTime, endTime: next.when.endTime,
    allDay: next.when.mode === "allDay", location: next.location,
  }), [next]);
  const nextLabel = formatAgendaDate(next.when.date).replace(/^\w+, /, "");

  const q = query.trim().toLowerCase();
  const matches = list.filter(t => (filter === "all" || t.category === filter) && `${t.name} ${t.description} ${t.body}`.toLowerCase().includes(q));

  // ── Editor ──────────────────────────────────────────────────────────────────
  const dirty = !!editor && snapshot(editor.draft) !== editor.original;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function guard(then: () => void) {
    if (dirty) setConfirmDiscard(() => then);
    else then();
  }

  function openEditor(mode: EditorMode, source?: AgendaTemplateDTO | Draft) {
    const from = source ?? { name: "", description: "", body: "", category: CATS.includes(filter) ? filter : "meetings" };
    // A duplicate keeps the name to edit, not a "(copy)" suffix to clean up later.
    const draft: Draft = { name: from.name, description: from.description, category: from.category, body: from.body };
    const saved = mode === "edit" && "id" in from ? (from as AgendaTemplateDTO) : null;
    setEditor({
      mode, id: saved?.id, baseUpdatedAt: saved?.updatedAt, uses: saved?.uses ?? 0,
      sourceName: mode === "copy" ? from.name : undefined, draft,
      original: snapshot(mode === "edit" ? draft : { name: "", description: "", category: draft.category, body: "" }),
    });
    setTab("write");
    mainRef.current?.scrollTo({ top: 0 });
    requestAnimationFrame(() => { nameRef.current?.focus(); if (mode === "copy") nameRef.current?.select(); });
  }

  const setDraft = (patch: Partial<Draft>) => setEditor(ed => ed && { ...ed, draft: { ...ed.draft, ...patch } });

  function insertAtCaret(text: string, linePrefix = false) {
    const area = bodyRef.current;
    if (!editor) return;
    if (!area) { setTab("write"); setDraft({ body: editor.draft.body + text }); return; }
    const { value, selectionStart: s, selectionEnd: e } = area;
    let nextValue: string, caret: number;
    if (linePrefix) {
      const start = value.lastIndexOf("\n", s - 1) + 1;
      if (value.startsWith(text, start)) { area.focus(); return; }
      nextValue = value.slice(0, start) + text + value.slice(start);
      caret = s + text.length;
    } else {
      nextValue = value.slice(0, s) + text + value.slice(e);
      caret = s + text.length;
    }
    setDraft({ body: nextValue });
    requestAnimationFrame(() => { area.focus(); area.setSelectionRange(caret, caret); });
  }

  const badFields = editor ? unknownAgendaFields(editor.draft.body) : [];

  async function save() {
    if (!editor || saving) return;
    const d = editor.draft;
    if (!d.name.trim() || !d.body.trim()) {
      toast.error("Add a template name and some agenda before saving.");
      (d.name.trim() ? bodyRef.current : nameRef.current)?.focus();
      return;
    }
    if (badFields.length) {
      toast.error("Fix the highlighted blank first — it would show up unfilled in every meeting.");
      setTab("preview");
      return;
    }
    setSaving(true);
    try {
      const payload = { name: d.name.trim(), description: d.description.trim(), category: d.category, body: d.body };
      const saved = editor.mode === "edit" && editor.id
        ? await api<AgendaTemplateDTO>(`${API}/${editor.id}`, { method: "PATCH", body: JSON.stringify({ ...payload, expectedUpdatedAt: editor.baseUpdatedAt }) })
        : await api<AgendaTemplateDTO>(API, { method: "POST", body: JSON.stringify(payload) });
      setTemplates(prev => {
        const rest = (prev ?? []).filter(t => t.id !== saved.id);
        return editor.mode === "edit" ? (prev ?? []).map(t => t.id === saved.id ? saved : t) : [saved, ...rest];
      });
      setSelectedId(saved.id);
      setQuery(""); setFilter("all"); setView("blank");
      setEditor(null);
      requestAnimationFrame(() => deskRef.current?.scrollIntoView({ block: "start" }));
      toast.success(editor.mode === "edit" ? "Template saved. Past meetings keep their notes as written." : "Added to the drawer. Ready for your next meeting.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the template.");
    } finally {
      setSaving(false);
    }
  }

  // ⌘S saves while the editor is open.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!editor) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void saveRef.current(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor]);

  // ── Default / delete ────────────────────────────────────────────────────────
  async function toggleDefault(t: AgendaTemplateDTO) {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await api<AgendaTemplateDTO>(`${API}/${t.id}`, { method: "PATCH", body: JSON.stringify({ isDefault: !t.isDefault }) });
      setTemplates(prev => (prev ?? []).map(x => x.id === updated.id ? updated : { ...x, isDefault: updated.isDefault ? false : x.isDefault }));
      toast.success(updated.isDefault ? `New meetings will start from “${t.name}”.` : "New meetings will start blank.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change the default.");
    } finally {
      setBusy(false);
    }
  }

  async function restore(t: AgendaTemplateDTO, wasDefault: boolean) {
    try {
      const back = await api<AgendaTemplateDTO>(`${API}/${t.id}`, { method: "PATCH", body: JSON.stringify({ archived: false, ...(wasDefault ? { isDefault: true } : {}) }) });
      setTemplates(prev => [back, ...(prev ?? []).filter(x => x.id !== back.id).map(x => back.isDefault ? { ...x, isDefault: false } : x)]);
      setSelectedId(back.id);
      toast.success("Template restored.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not restore the template.");
    }
  }

  async function remove(t: AgendaTemplateDTO) {
    setConfirmDelete(null);
    try {
      const { wasDefault } = await api<{ id: number; wasDefault: boolean }>(`${API}/${t.id}`, { method: "DELETE" });
      const idx = list.findIndex(x => x.id === t.id);
      const rest = list.filter(x => x.id !== t.id);
      setTemplates(rest);
      setSelectedId((rest[idx] ?? rest[idx - 1])?.id ?? null);
      toast.success(`Deleted “${t.name}”${wasDefault ? " — new meetings will start blank" : ""}.`, { action: { label: "Undo", onClick: () => void restore(t, wasDefault) } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the template.");
    }
  }

  function selectTemplate(id: number) {
    setSelectedId(id);
    if (window.matchMedia?.("(max-width: 820px)").matches) deskRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  const useTemplate = (t: AgendaTemplateDTO) => router.push(orgPath(`/chapter?add=1&template=${t.id}`));
  const toMeetings = () => guard(() => router.push(orgPath("/chapter")));

  // ── Render pieces ───────────────────────────────────────────────────────────
  const n = list.length;
  const digest = !n
    ? "The drawer is empty. Write your standing agenda once, and every meeting can start from it."
    : <>
        <b>{plural(n, "template")}</b> in the drawer.{" "}
        {defaultTpl
          ? <>New meetings start from <b>{defaultTpl.name}</b>{defaultTpl.uses ? ` — used ${plural(defaultTpl.uses, "time")} so far` : ""}.</>
          : "New meetings start blank — make one the default to save the minute-taker some typing."}
      </>;

  function libraryView() {
    const t = selected;
    const values = t && view === "filled" ? sampleFor(t.name) : null;
    const fills = t ? agendaFieldsIn(t.body) : [];
    const sample = t ? sampleFor(t.name) : null;
    return (
      <>
        <div className="briefing">
          <div>
            <div className="at-kick">
              <Link className="at-kpill" href={orgPath("/chapter")}><PaperIcon name="chev-l" />{v("Meetings")}</Link>
              <span className="at-kick-lbl">Agenda templates</span>
            </div>
            <h1 className="greeting">Start every meeting<br /><em>on the same page.</em></h1>
            <div className="digest">
              {templates && <span className="ai-chip"><span className="lg-only">Digest</span><span className="pp-only"><PaperIcon name="spark" />Digest</span></span>}
              <p>{templates ? digest : ""}</p>
            </div>
          </div>
          <div className="ch-acts">
            <button className="mt-add-btn" onClick={() => openEditor("new")}><PaperIcon name="plus" />New template</button>
            <button className="mt-add-btn at-ghost" onClick={() => router.push(orgPath("/chapter?add=1"))}><PaperIcon name="cal" />Add meeting</button>
          </div>
        </div>

        {!templates && !loadError && <LoadingSpinner size="md" label="Loading templates" className="py-24" tone="dusk" />}
        {loadError && <p className="at-error" role="alert">{loadError}</p>}

        {templates && (
          <>
            <div className="sec-label"><h2>The drawer</h2><span className="rule" /><span className="cnt">{n ? "Pick one to read it" : "Start from one of these, or a blank sheet"}</span></div>

            {n > 0 && (
              <div className="at-tools">
                <label className="at-find">
                  <PaperIcon name="search" />
                  <input value={query} onChange={e => setQuery(e.target.value)} aria-label="Search templates" placeholder="Find a template, or a word inside one…" />
                </label>
                <div className="at-tabs" role="group" aria-label="Filter by category">
                  {["all", ...CATS].map(c => (
                    <button key={c} type="button" className={`at-tab${c === "all" ? "" : ` ${toneClass(c)}`}${filter === c ? " on" : ""}`} aria-pressed={filter === c} onClick={() => setFilter(c)}>
                      {c !== "all" && <span className="sw" aria-hidden />}
                      {c === "all" ? "All" : AGENDA_CATEGORY[c].label}
                      <span className="n">{c === "all" ? n : list.filter(x => x.category === c).length}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="at-shelf">
              {n === 0
                ? STARTERS.map(s => (
                    <button key={s.name} type="button" className={`at-sheet starter ${toneClass(s.category)}`} onClick={() => openEditor("new", s)}>
                      <span className="at-sh-head"><span className="at-sh-cat">{categoryOf(s.category).label}</span><span className="at-sh-tag">Starter</span></span>
                      <strong className="at-sh-name">{s.name}</strong>
                      <span className="at-sh-lines" aria-hidden>{agendaSections(s.body).slice(0, 4).map((h, i) => <span key={i}><i>{i + 1}</i>{h}</span>)}<span /></span>
                      <span className="at-sh-foot"><span>{plural(agendaSections(s.body).length, "section")}</span><span>Start from this →</span></span>
                    </button>
                  ))
                : matches.length
                  ? matches.map(x => <Sheet key={x.id} t={x} on={x.id === t?.id} onSelect={() => selectTemplate(x.id)} />)
                  : (
                    <div className="at-shelf-empty">
                      <span>Nothing in {filter === "all" ? "the drawer" : AGENDA_CATEGORY[filter].label} mentions “{query}”.</span>
                      <button type="button" className="at-link" onClick={() => { setQuery(""); setFilter("all"); }}>Clear the search</button>
                    </div>
                  )}
              <button type="button" className="at-sheet blank" onClick={() => openEditor("new")}>
                <span className="plus"><PaperIcon name="plus" /></span>
                <strong>Blank sheet</strong>
                <small>Write a new template</small>
              </button>
            </div>

            <div className="sec-label" ref={deskRef}><h2>On the desk</h2><span className="rule" /><span className="cnt">The original stays put — using it makes a copy</span></div>

            {!t ? (
              <div className="at-desk-empty">
                <h3>Nothing on the desk.</h3>
                <p>Write your chapter’s standing agenda once — roll call to adjournment — and every new meeting can start from it.</p>
                <button className="mt-add-btn" onClick={() => openEditor("new", STARTERS[0])}><PaperIcon name="plus" />Write the first one</button>
              </div>
            ) : (
              <div className={`at-desk ${toneClass(t.category)}`}>
                <div className="at-desk-main">
                  <article className="at-pad">
                    <header className="at-pad-head">
                      <div className="at-pad-kick">
                        <span className="at-lbl">{categoryOf(t.category).label} · template</span>
                        {fills.length > 0 && (
                          <div className="at-seg" role="group" aria-label="Show the blanks or a filled-in copy">
                            <button type="button" aria-pressed={view === "blank"} onClick={() => setView("blank")}>With blanks</button>
                            <button type="button" aria-pressed={view === "filled"} onClick={() => setView("filled")}>Filled for {nextLabel}</button>
                          </div>
                        )}
                      </div>
                      <h2>{t.name}</h2>
                      {t.description && <p className="at-desc">{t.description}</p>}
                    </header>
                    <div className="at-pad-body"><AgendaBody body={t.body} values={values} /></div>
                  </article>
                </div>

                <aside className="at-margin" aria-label="About this template">
                  <div className="at-use">
                    <button className="mt-add-btn" onClick={() => useTemplate(t)}>Use for a new meeting<PaperIcon name="arrow-r" /></button>
                    <p>Copies this agenda into the meeting’s notes{fills.length ? ", with the blanks filled in from the form" : ""}. The original stays as it is.</p>
                  </div>

                  <div className={`at-note${t.isDefault ? " on" : ""}`}>
                    {t.isDefault ? (
                      <>
                        <h4><PaperIcon name="star" />New meetings start here.</h4>
                        <p>Add meeting picks this agenda for you. Anyone can still switch.</p>
                        <button type="button" className="at-link" disabled={busy} onClick={() => toggleDefault(t)}>Start new meetings blank instead</button>
                      </>
                    ) : (
                      <>
                        <h4>Make it the go-to?</h4>
                        <p>Add meeting will pick this agenda for you{defaultTpl ? <> instead of <b>{defaultTpl.name}</b></> : ""}.</p>
                        <button type="button" className="at-btn-small" disabled={busy} onClick={() => toggleDefault(t)}><PaperIcon name="star" />Make default</button>
                      </>
                    )}
                  </div>

                  <div className="at-mcard">
                    <div className="at-mh">Fills in by itself</div>
                    {fills.length && sample ? (
                      <>
                        <ul className="at-fills">
                          {fills.map(f => <li key={f}><span className="at-chip">{AGENDA_FIELDS[f]}</span><span className="v">{sample[f] || "—"}</span></li>)}
                        </ul>
                        <p className="at-mnote">Shown with the next meeting’s details. Each meeting brings its own.</p>
                      </>
                    ) : <p className="at-mnote" style={{ margin: 0 }}>No blanks — this one reads the same every time.</p>}
                  </div>

                  <div className="at-mcard">
                    <div className="at-mh">On file</div>
                    <dl className="at-rec">
                      <dt>Sections</dt><dd>{agendaSections(t.body).length}</dd>
                      <dt>Used</dt><dd>{t.uses ? plural(t.uses, "meeting") : "Not yet"}</dd>
                      <dt>Edited</dt><dd>{editedOn(t.updatedAt)}{t.updatedBy && <small> · {t.updatedBy.name}</small>}</dd>
                      <dt>Shared</dt><dd>Officers of {orgName}</dd>
                    </dl>
                    <p className="at-mnote at-edit-note"><PaperIcon name="pencil" /><span>Editing changes new meetings only.{t.uses ? ` The ${plural(t.uses, "meeting")} that already used it keep their notes as written.` : ""}</span></p>
                    <div className="at-acts">
                      <button type="button" className="at-text-btn" onClick={() => openEditor("edit", t)}><PaperIcon name="pencil" />Edit</button>
                      <button type="button" className="at-text-btn" onClick={() => openEditor("copy", t)}><PaperIcon name="copy" />Duplicate</button>
                      <button type="button" className="at-text-btn danger" onClick={() => setConfirmDelete(t)}><PaperIcon name="trash" />Delete</button>
                    </div>
                  </div>
                </aside>
              </div>
            )}
          </>
        )}
      </>
    );
  }

  function editorView(ed: Editor) {
    const d = ed.draft;
    const status = ed.mode === "edit" ? (dirty ? "Unsaved changes" : "Saved original") : ed.mode === "copy" ? "Unsaved copy" : "New draft";
    const lede = ed.mode === "edit"
      ? <>You’re editing the <b>shared original</b>. Changes apply to new meetings only{ed.uses ? <> — the <b>{plural(ed.uses, "meeting")}</b> that already used it keep their notes exactly as written</> : null}.</>
      : ed.mode === "copy"
        ? <>A copy of <b>{ed.sourceName}</b>. It joins the drawer when you add it — the original isn’t touched.</>
        : "A blank sheet. Write the agenda your chapter actually runs, top to bottom.";
    const impact = ed.mode === "edit" && ed.uses
      ? `Past meetings aren’t changed. The ${plural(ed.uses, "meeting")} that used this got their own copy, and keep it as written. Your edits show up from the next meeting on.`
      : "Changes apply the next time someone uses this template. Meetings that already used it keep their own copy.";
    const cancel = () => guard(() => setEditor(null));
    return (
      <>
        <div className="briefing">
          <div>
            <div className="at-kick">
              <button type="button" className="at-kpill" onClick={cancel}><PaperIcon name="chev-l" />Templates</button>
              <span className="at-kick-lbl">{status}</span>
            </div>
            <h1 className="greeting">{ed.mode === "new" ? <>Write it <em>once.</em></> : <>Make it <em>your own.</em></>}</h1>
            <div className="digest">
              <span className="ai-chip">{ed.mode === "edit" ? "Editing" : ed.mode === "copy" ? "Copy" : "New"}</span>
              <p>{lede}</p>
            </div>
          </div>
          <div className="ch-acts">
            <button type="button" className="mt-add-btn at-quiet" onClick={cancel}>Cancel</button>
            <button type="button" className="mt-add-btn" onClick={() => void save()} disabled={saving} title="Save (⌘S)">
              <PaperIcon name="check" />{saving ? "Saving…" : ed.mode === "copy" ? "Add to drawer" : "Save template"}
            </button>
          </div>
        </div>

        <div className="sec-label"><h2>On the desk</h2><span className="rule" /><span className="cnt">⌘S saves</span></div>

        <div className={`at-desk editing ${toneClass(d.category)}`}>
          <div className="at-desk-main">
            <article className="at-pad">
              <header className="at-pad-head">
                <div className="at-pad-kick"><label className="at-lbl" htmlFor="at-name">Template name</label></div>
                <input id="at-name" ref={nameRef} className="at-title-input" placeholder="Name it…" value={d.name} maxLength={AGENDA_NAME_MAX} onChange={e => setDraft({ name: e.target.value })} />
                <label className="sr-only" htmlFor="at-desc">Short description</label>
                <input id="at-desc" className="at-desc-input" placeholder="One line on when to reach for it" value={d.description} maxLength={AGENDA_DESCRIPTION_MAX} onChange={e => setDraft({ description: e.target.value })} />
              </header>
              <div className="at-pad-tools">
                <div className="at-seg" role="tablist" aria-label="Editor view">
                  <button type="button" role="tab" aria-selected={tab === "write"} aria-pressed={tab === "write"} onClick={() => { setTab("write"); requestAnimationFrame(() => bodyRef.current?.focus()); }}><PaperIcon name="pencil" />Write</button>
                  <button type="button" role="tab" aria-selected={tab === "preview"} aria-pressed={tab === "preview"} onClick={() => setTab("preview")}><PaperIcon name="eye" />Preview</button>
                </div>
                <button type="button" className="at-blk" disabled={tab === "preview"} onClick={() => insertAtCaret("## ", true)}>Heading</button>
                <button type="button" className="at-blk" disabled={tab === "preview"} onClick={() => insertAtCaret("[ ] ", true)}>Checklist</button>
                <button type="button" className="at-blk" disabled={tab === "preview"} onClick={() => insertAtCaret("• ", true)}>Bullet</button>
                <small>## heading · [ ] checklist · • bullet</small>
              </div>
              {tab === "write" ? (
                <textarea
                  ref={bodyRef}
                  className="at-pad-text"
                  aria-label="Template content"
                  value={d.body}
                  onChange={e => setDraft({ body: e.target.value })}
                  placeholder={"## Roll call\nWho’s here, who’s excused…\n\n## Officer reports"}
                />
              ) : (
                <div className="at-pad-body"><AgendaBody body={d.body} /></div>
              )}
            </article>
            {badFields.length > 0 && (
              <p className="at-field-warning" role="alert">
                <PaperIcon name="alert" />
                <span><b>{badFields.map(f => `{{${f}}}`).join(", ")}</b> {badFields.length === 1 ? "isn’t a blank" : "aren’t blanks"} the meeting form can fill. Use {Object.values(AGENDA_FIELDS).join(", ")} from the margin.</span>
              </p>
            )}
          </div>

          <aside className="at-margin">
            <div className="at-mcard">
              <div className="at-mh">File under</div>
              <div className="at-cats" role="radiogroup" aria-label="Category">
                {CATS.map(c => (
                  <label key={c} className={`at-cat ${toneClass(c)}`}>
                    <input type="radio" name="at-cat" value={c} checked={d.category === c} onChange={() => setDraft({ category: c })} />
                    <span className="sw" aria-hidden />{AGENDA_CATEGORY[c].label}
                  </label>
                ))}
              </div>
            </div>
            <div className="at-mcard">
              <div className="at-mh">Leave a blank</div>
              <div className="at-ins">
                {Object.entries(AGENDA_FIELDS).map(([k, label]) => (
                  <button key={k} type="button" className="at-chip" title={`Inserts {{${k}}}`} onClick={() => { setTab("write"); requestAnimationFrame(() => insertAtCaret(`{{${k}}}`)); }}>+ {label}</button>
                ))}
              </div>
              <p className="at-mnote">Drops in where you’re writing. Each meeting fills it from its own form.</p>
            </div>
            <div className="at-note">
              <h4>Write once. Pass it on.</h4>
              <p style={{ marginBottom: 0 }}>{impact}</p>
            </div>
          </aside>
        </div>
      </>
    );
  }

  // ── Shell ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden bg-[color:var(--paper)]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="Chapter" onNavClick={() => {}} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative z-10 flex h-14 shrink-0 items-center gap-3 border-b border-[rgba(var(--ink-rgb),0.06)] bg-[color:var(--paper-2)] px-4 sm:px-6 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--muted)] hover:bg-[rgba(var(--ink-rgb),0.07)] lg:hidden"
            aria-label="Open menu"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight text-[color:var(--ink)]">Agenda templates</p>
          </div>
        </header>

        <main ref={mainRef} className="page-ambient flex-1 overflow-y-auto">
          <div className="dash dash-chapter dash-templates" data-dashboard-theme="dusk">
            {!currentUser ? (
              <LoadingSpinner size="md" label="Loading" className="py-24" tone="dusk" />
            ) : !canEvents ? (
              <div className="at-desk-empty" style={{ marginTop: 40 }}>
                <h3>Agenda templates are for officers.</h3>
                <p>Whoever schedules meetings keeps the chapter’s agendas here. Your minutes still start from them.</p>
                <button className="mt-add-btn" onClick={toMeetings}><PaperIcon name="chev-l" />Back to {v("Meetings").toLowerCase()}</button>
              </div>
            ) : editor ? editorView(editor) : libraryView()}
          </div>
        </main>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          tone="dusk"
          title={`Delete “${confirmDelete.name}”?`}
          message={confirmDelete.uses
            ? `The ${plural(confirmDelete.uses, "meeting")} that used it keep their notes. You can undo this for a few seconds.`
            : "No meetings have used it yet. You can undo this for a few seconds."}
          onConfirm={() => void remove(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      {confirmDiscard && (
        <ConfirmDialog
          tone="dusk"
          title="Discard your changes?"
          message="Your unsaved template changes will be lost."
          confirmLabel="Discard"
          onConfirm={() => { const then = confirmDiscard; setConfirmDiscard(null); setEditor(null); then(); }}
          onCancel={() => setConfirmDiscard(null)}
        />
      )}
    </div>
  );
}
