"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "../../components/Sidebar";
import { Modal, ConfirmDialog, LoadingSpinner } from "../../components/dashboard/primitives";
import { InstagramPostForm, type PostDraft, type PostFormEvent } from "./InstagramPostForm";
import { InstagramPostCard, type Lane } from "./InstagramPostCard";
import { InstagramPostDetail } from "./InstagramPostDetail";
import { InstagramTask, InstagramType, fmtDate } from "../../data";
import { useChapter } from "../../context/ChapterContext";
import { useOrgPath } from "../../hooks/useOrgPath";
import { requestJson } from "../../lib/api";
import { daysFromToday, todayStr } from "../../lib/dates";
import "../../components/dashboard/dashboard-ledger.css";
import "./instagram-ledger.css";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// post-type → css var suffix for calendar dots (mirrors InstagramPostCard)
const TYPE_KEY: Record<InstagramType, string> = { Story: "story", Reel: "reel", Carousel: "carousel" };
function calMarkColor(type: string): string {
  const k = TYPE_KEY[type as InstagramType];
  return k ? `var(--t-${k})` : "var(--muted)";
}

const TODAY_STR = todayStr();

type ViewMode = "lanes" | "month";
type Draft = PostDraft;

// ─── Briefing digest ────────────────────────────────────────────────────────

function digestLine(tasks: InstagramTask[]): string {
  const open = tasks.filter(t => t.status !== "posted");
  if (open.length === 0) {
    return tasks.length === 0
      ? "Nothing queued yet — plan a post to start the calendar."
      : "The queue is clear — every planned post has gone out.";
  }
  const overdue = open.filter(t => daysFromToday(t.dueDate) < 0).length;
  const thisWeek = open.filter(t => { const d = daysFromToday(t.dueDate); return d >= 0 && d <= 7; }).length;

  // Days since the most recent posted item — the cadence signal.
  const posted = tasks.filter(t => t.status === "posted").sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  const sinceLast = posted.length ? daysFromToday(posted[0].dueDate) : null;

  const bits: string[] = [];
  if (overdue > 0) bits.push(`${overdue} post${overdue > 1 ? "s are" : " is"} overdue`);
  if (thisWeek > 0) bits.push(`${thisWeek} land${thisWeek > 1 ? "" : "s"} this week`);
  if (bits.length === 0) bits.push(`${open.length} post${open.length > 1 ? "s" : ""} queued`);
  let line = bits.join(", ") + ".";
  if (sinceLast !== null && sinceLast > 0) line += ` Last post went up ${sinceLast} day${sinceLast > 1 ? "s" : ""} ago.`;
  return line.charAt(0).toUpperCase() + line.slice(1);
}

// ─── Lane bucketing ─────────────────────────────────────────────────────────

const LANE_META: { id: Lane; label: string; cls: string }[] = [
  { id: "overdue",  label: "Overdue",   cls: "overdue"  },
  { id: "week",     label: "This week", cls: "week"     },
  { id: "upcoming", label: "Upcoming",  cls: "upcoming" },
  { id: "posted",   label: "Posted",    cls: "posted"   },
];

function laneOf(task: InstagramTask): Lane {
  if (task.status === "posted") return "posted";
  const diff = daysFromToday(task.dueDate);
  if (diff < 0) return "overdue";
  if (diff <= 7) return "week";
  return "upcoming";
}

// ─── Month / cadence view ───────────────────────────────────────────────────

function MonthView({ tasks, onSelect }: { tasks: InstagramTask[]; onSelect: (t: InstagramTask) => void }) {
  const [month, setMonth] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; });

  const prev = () => setMonth(p => p.month === 0 ? { year: p.year - 1, month: 11 } : { year: p.year, month: p.month - 1 });
  const next = () => setMonth(p => p.month === 11 ? { year: p.year + 1, month: 0 } : { year: p.year, month: p.month + 1 });
  const goToday = () => { const n = new Date(); setMonth({ year: n.getFullYear(), month: n.getMonth() }); };

  const firstDay = new Date(month.year, month.month, 1).getDay();
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();

  const tasksByDay = useMemo(() => {
    const map: Record<number, InstagramTask[]> = {};
    for (const t of tasks) {
      const [yr, mo, day] = t.dueDate.split("-").map(Number);
      if (yr === month.year && mo === month.month + 1) (map[day] ??= []).push(t);
    }
    return map;
  }, [tasks, month]);

  // Longest run of consecutive empty days between two scheduled posts — the
  // "quiet stretch" we hatch and call out. Also collects the gap day set.
  const { gapDays, longestGap } = useMemo(() => {
    const scheduled = Object.keys(tasksByDay).map(Number).sort((a, b) => a - b);
    const gaps = new Set<number>();
    let longest = 0;
    for (let i = 0; i < scheduled.length - 1; i++) {
      const span = scheduled[i + 1] - scheduled[i] - 1;
      if (span > longest) longest = span;
      if (span > 0) for (let d = scheduled[i] + 1; d < scheduled[i + 1]; d++) gaps.add(d);
    }
    return { gapDays: gaps, longestGap: longest };
  }, [tasksByDay]);

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const now = new Date();
  const isCurrentMonth = month.year === now.getFullYear() && month.month === now.getMonth();

  return (
    <div>
      <div className="ig-month-h">
        <div className="nav-btns">
          <button className="arrow" onClick={prev} aria-label="Previous month">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="mtitle">{MONTH_NAMES[month.month]} <em>{month.year}</em></span>
          <button className="arrow" onClick={next} aria-label="Next month">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
          {!isCurrentMonth && <button className="today-btn" onClick={goToday}>Today</button>}
        </div>
        {longestGap > 0 && (
          <span className="cadence-note">Longest quiet stretch this month: <b>{longestGap} day{longestGap > 1 ? "s" : ""}</b></span>
        )}
      </div>

      <div className="ig-dow">{DAY_LABELS.map(d => <span key={d}>{d}</span>)}</div>
      <div className="ig-cal">
        {cells.map((day, i) => {
          if (!day) return <div key={`b-${i}`} className="ig-cell blank" />;
          const dateStr = `${month.year}-${String(month.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = dateStr === TODAY_STR;
          const dayTasks = tasksByDay[day] ?? [];
          return (
            <div key={dateStr} className={`ig-cell${isToday ? " today" : ""}${gapDays.has(day) ? " gap" : ""}`}>
              <span className="dnum">{day}</span>
              <div className="marks">
                {dayTasks.map(t => (
                  <button
                    key={t.id}
                    className={`ig-cmark${t.status === "posted" ? " done" : ""}`}
                    style={{ ["--cmc" as string]: calMarkColor(t.type) } as React.CSSProperties}
                    onClick={() => onSelect(t)}
                    title={t.title}
                  >
                    <span className="d" /><span className="ct">{t.title}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

let _nextId = Date.now();

export default function InstagramPage() {
  const { currentUser, igTaskList, setIgTaskList, isLoading, can } = useChapter();
  const canManage = can("MANAGE_INSTAGRAM");
  const orgPath = useOrgPath();
  const router = useRouter();

  // Calendar events available to link a post to (loaded once, like Treasury does).
  const [calendarEvents, setCalendarEvents] = useState<PostFormEvent[]>([]);
  useEffect(() => {
    requestJson<PostFormEvent[]>("/api/calendar")
      .then(evs => setCalendarEvents(evs.map(e => ({ id: e.id, title: e.title, date: e.date }))))
      .catch(() => {});
  }, []);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("lanes");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InstagramTask | null>(null);
  // The post whose detail rail is open (null = closed). Stored by id so the
  // rail re-reads fresh data after an optimistic edit/complete.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // When true, the open rail shows the inline edit form instead of the read view.
  const [railEditing, setRailEditing] = useState(false);

  // ── Derived ──
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? igTaskList.filter(t => t.title.toLowerCase().includes(q) || t.type.toLowerCase().includes(q)) : igTaskList;
  }, [igTaskList, query]);

  const counts = useMemo(() => {
    const open = igTaskList.filter(t => t.status !== "posted");
    const overdue = open.filter(t => daysFromToday(t.dueDate) < 0).length;
    const thisWeek = open.filter(t => { const d = daysFromToday(t.dueDate); return d >= 0 && d <= 7; }).length;
    const posted = igTaskList.filter(t => t.status === "posted").sort((a, b) => b.dueDate.localeCompare(a.dueDate));
    const sinceLast = posted.length ? daysFromToday(posted[0].dueDate) : null;
    return { queued: open.length, overdue, thisWeek, sinceLast };
  }, [igTaskList]);

  const lanes = useMemo(() => {
    const map: Record<Lane, InstagramTask[]> = { overdue: [], week: [], upcoming: [], posted: [] };
    for (const t of filtered) map[laneOf(t)].push(t);
    const byDue = (a: InstagramTask, b: InstagramTask) => a.dueDate.localeCompare(b.dueDate);
    map.overdue.sort(byDue); map.week.sort(byDue); map.upcoming.sort(byDue);
    map.posted.sort((a, b) => b.dueDate.localeCompare(a.dueDate));
    return map;
  }, [filtered]);

  // The currently-selected post, re-read from the live list so the rail
  // reflects optimistic edits; auto-closes if the post disappears (deleted).
  const selectedTask = useMemo(
    () => selectedId === null ? null : igTaskList.find(t => t.id === selectedId) ?? null,
    [igTaskList, selectedId],
  );

  // id → event, for resolving a post's linked event when rendering.
  const eventsById = useMemo(
    () => new Map(calendarEvents.map(e => [e.id, e])),
    [calendarEvents],
  );
  const linkedEventFor = (t: InstagramTask) =>
    t.calendarEventId != null ? eventsById.get(t.calendarEventId) ?? null : null;

  // ── CRUD (optimistic, preserved from the original page) ──
  function openCreate() { setCreateOpen(true); }
  // Selecting a post opens the rail in read mode. The hover "Edit" icon and the
  // rail's own Edit button both route here, opening the rail straight into edit.
  function openDetail(task: InstagramTask) { setSelectedId(task.id); setRailEditing(false); }
  function openEdit(task: InstagramTask) { setSelectedId(task.id); setRailEditing(true); }

  function handleCreate(draft: Draft) {
    const tempId = _nextId++;
    const optimistic: InstagramTask = { id: tempId, ...draft, status: "open" };
    setIgTaskList(prev => [...prev, optimistic]);
    setCreateOpen(false);
    requestJson<InstagramTask>("/api/instagram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    })
      .then(saved => setIgTaskList(prev => prev.map(t => t.id === tempId ? saved : t)))
      .catch(err => { console.error(err); setIgTaskList(prev => prev.filter(t => t.id !== tempId)); });
  }

  // Save an inline rail edit. Takes the id explicitly (the rail owns the form),
  // applies the change optimistically, and leaves the rail open in read mode.
  function handleEdit(id: number, draft: Draft) {
    const prev = igTaskList.find(t => t.id === id);
    if (!prev) return;
    const updated: InstagramTask = { ...prev, ...draft };
    setIgTaskList(list => list.map(t => t.id === id ? updated : t));
    setRailEditing(false);
    requestJson<InstagramTask>(`/api/instagram/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    })
      .then(saved => setIgTaskList(list => list.map(t => t.id === id ? saved : t)))
      .catch(err => { console.error(err); setIgTaskList(list => list.map(t => t.id === id ? prev : t)); });
  }

  // Quick inline change of just the posting date from the detail rail's read
  // view — optimistic, mirrors handleEdit but patches a single field.
  function handleChangeDate(id: number, dueDate: string) {
    const prev = igTaskList.find(t => t.id === id);
    if (!prev || prev.dueDate === dueDate) return;
    const updated: InstagramTask = { ...prev, dueDate };
    setIgTaskList(list => list.map(t => t.id === id ? updated : t));
    requestJson<InstagramTask>(`/api/instagram/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate }),
    })
      .then(saved => setIgTaskList(list => list.map(t => t.id === id ? saved : t)))
      .catch(err => { console.error(err); setIgTaskList(list => list.map(t => t.id === id ? prev : t)); });
  }

  // Quick inline change of just the actual posting date, from the rail's read
  // view. Optimistic, mirrors handleChangeDate but patches postedDate.
  function handleChangePostedDate(id: number, postedDate: string) {
    const prev = igTaskList.find(t => t.id === id);
    if (!prev || prev.postedDate === postedDate) return;
    const updated: InstagramTask = { ...prev, postedDate };
    setIgTaskList(list => list.map(t => t.id === id ? updated : t));
    requestJson<InstagramTask>(`/api/instagram/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postedDate }),
    })
      .then(saved => setIgTaskList(list => list.map(t => t.id === id ? saved : t)))
      .catch(err => { console.error(err); setIgTaskList(list => list.map(t => t.id === id ? prev : t)); });
  }

  function handleComplete(task: InstagramTask) {
    setIgTaskList(prev => prev.map(t => t.id === task.id ? { ...t, status: "posted" } : t));
    requestJson<InstagramTask>(`/api/instagram/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "posted" }),
    })
      .then(saved => setIgTaskList(prev => prev.map(t => t.id === task.id ? saved : t)))
      .catch(err => { console.error(err); setIgTaskList(prev => prev.map(t => t.id === task.id ? task : t)); });
  }

  function handleDelete(task: InstagramTask) {
    setIgTaskList(prev => prev.filter(t => t.id !== task.id));
    setDeleteTarget(null);
    requestJson<void>(`/api/instagram/${task.id}`, { method: "DELETE" })
      .catch(err => { console.error(err); setIgTaskList(prev => [...prev, task].sort((a, b) => a.id - b.id)); });
  }

  const createInitial: Draft = { title: "", dueDate: "", postedDate: null, type: "Story", calendarEventId: null };

  const hasTasks = igTaskList.length > 0;

  return (
    <div className="flex h-screen overflow-hidden bg-[#0f0d0a]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="Instagram" onNavClick={() => {}} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ── Mobile toolbar (hamburger + label). No desktop topbar. ── */}
        <header className="toolbar-frosted dash-toolbar ig-toolbar-bar relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.05] px-4 sm:px-6 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="tb-icon-btn flex h-8 w-8 items-center justify-center rounded-lg text-[#958d7c] hover:bg-white/[0.07]"
            aria-label="Open menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="ig-crumb truncate">Instagram</span>
        </header>

        {/* ── Scrollable dusk ledger pane ── */}
        <main className="page-ambient flex-1 overflow-y-auto">
          <div className="dash dash-instagram" data-dashboard-theme="dusk">

            {/* ── Briefing ── */}
            <section className="ig-briefing" aria-label="Content calendar">
              <div>
                <p className="kicker">Content Calendar</p>
                <h1>What&rsquo;s <em>going out</em>.</h1>
                <div className="ig-digest">
                  <span className="ai">AI</span>
                  <p>{digestLine(igTaskList)}</p>
                </div>
              </div>
              {canManage && (
                <button className="ig-add" onClick={openCreate}>
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  Add post
                </button>
              )}
            </section>

            {/* ── Glance strip ── */}
            {hasTasks && (
              <section className="ig-glance" aria-label="Calendar at a glance">
                <div className="ig-measure"><p className="k">Queued</p><p className="v">{counts.queued}</p><p className="note">posts planned</p></div>
                <div className="ig-measure"><p className="k">Overdue</p><p className={`v${counts.overdue > 0 ? " warn" : ""}`}>{counts.overdue}</p><p className="note">past due date</p></div>
                <div className="ig-measure"><p className="k">This week</p><p className="v">{counts.thisWeek}</p><p className="note">due in 7 days</p></div>
                <div className="ig-measure"><p className="k">Cadence</p><p className="v">{counts.sinceLast === null ? "—" : `${counts.sinceLast}d`}</p><p className="note">since last post</p></div>
              </section>
            )}

            {/* ── Toolbar: search + view seg + type legend ── */}
            {hasTasks && (
              <div className="ig-toolbar">
                <label className="ig-search">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
                  <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search posts…" aria-label="Search posts" />
                  {query && (
                    <button type="button" className="clr" onClick={() => setQuery("")} aria-label="Clear search">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </label>
                <div className="ig-seg" role="tablist" aria-label="View">
                  <button role="tab" aria-selected={view === "lanes"} className={view === "lanes" ? "on" : ""} onClick={() => setView("lanes")}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
                    Lanes
                  </button>
                  <button role="tab" aria-selected={view === "month"} className={view === "month" ? "on" : ""} onClick={() => setView("month")}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 2v3M16 2v3M3 9h18M5 4h14a2 2 0 012 2v13a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" /></svg>
                    Month
                  </button>
                </div>
                <div className="ig-legend" aria-hidden="true">
                  <span className="li"><span className="dot" style={{ background: "var(--t-story)" }} />Story</span>
                  <span className="li"><span className="dot" style={{ background: "var(--t-reel)" }} />Reel</span>
                  <span className="li"><span className="dot" style={{ background: "var(--t-carousel)" }} />Carousel</span>
                </div>
              </div>
            )}

            {/* ── Body ── */}
            {isLoading ? (
              <div className="ig-loading"><LoadingSpinner size="md" tone="dusk" label="Loading posts" /></div>
            ) : !hasTasks ? (
              <div className="ig-empty">
                <div className="ic">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
                <p className="t">No posts on the calendar</p>
                <p className="h">{canManage ? "Add a post to start planning your chapter's feed." : "Ask an admin to plan some posts."}</p>
              </div>
            ) : view === "lanes" ? (
              <div className="ig-lanes">
                {LANE_META.map(({ id, label, cls }) => {
                  const bucket = lanes[id];
                  if (bucket.length === 0) return null;
                  return (
                    <section key={id} className={`ig-lane ${cls}`}>
                      <div className="ig-lane-h">
                        <span className="pip" />
                        <span className="lbl">{label}</span>
                        <span className="ct">{bucket.length} post{bucket.length > 1 ? "s" : ""}</span>
                        <span className="rule" />
                      </div>
                      <div className="ig-rows">
                        {bucket.map(t => (
                          <InstagramPostCard
                            key={t.id}
                            task={t}
                            lane={id}
                            canManage={canManage}
                            selected={t.id === selectedId}
                            linkedEventTitle={linkedEventFor(t)?.title}
                            onSelect={openDetail}
                            onEdit={openEdit}
                            onDelete={setDeleteTarget}
                            onComplete={handleComplete}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="ig-empty">
                    <div className="ic">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
                    </div>
                    <p className="t">No posts match &ldquo;{query}&rdquo;</p>
                  </div>
                )}
              </div>
            ) : (
              <MonthView tasks={filtered} onSelect={openDetail} />
            )}
          </div>
        </main>
      </div>

      {/* ── Detail rail (opens on post click; edits happen inline here) ── */}
      {selectedTask && (
        <InstagramPostDetail
          task={selectedTask}
          canManage={canManage}
          editing={railEditing}
          events={calendarEvents}
          linkedEvent={linkedEventFor(selectedTask)}
          onOpenEvent={() => router.push(orgPath("/timeline"))}
          onClose={() => { setSelectedId(null); setRailEditing(false); }}
          onStartEdit={() => setRailEditing(true)}
          onCancelEdit={() => setRailEditing(false)}
          onSave={(draft) => handleEdit(selectedTask.id, draft)}
          onChangeDate={(dueDate) => handleChangeDate(selectedTask.id, dueDate)}
          onChangePostedDate={(postedDate) => handleChangePostedDate(selectedTask.id, postedDate)}
          onDelete={(t) => { setSelectedId(null); setRailEditing(false); setDeleteTarget(t); }}
          onComplete={handleComplete}
        />
      )}

      {/* ── Create modal (editing is inline in the rail) ── */}
      {createOpen && (
        <Modal title="Add Post" tone="dusk" onClose={() => setCreateOpen(false)}>
          <InstagramPostForm initial={createInitial} submitLabel="Add Post" events={calendarEvents} onSubmit={handleCreate} onClose={() => setCreateOpen(false)} />
        </Modal>
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Post"
          message={`Delete "${deleteTarget.title}" (due ${fmtDate(deleteTarget.dueDate)})? This cannot be undone.`}
          confirmLabel="Delete"
          tone="dusk"
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
