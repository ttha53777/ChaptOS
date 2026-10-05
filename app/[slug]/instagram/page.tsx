"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "../../components/Sidebar";
import { LoadingSpinner } from "../../components/dashboard/primitives";
import { PaperIcon, type PaperIconName } from "../../components/paper/PaperIcon";
import { useToast } from "../../components/dashboard/Toast";
import { useChapter } from "../../context/ChapterContext";
import { useOrgPath } from "../../hooks/useOrgPath";
import { requestJson } from "../../lib/api";
import type { InstagramTask } from "../../data";
import { INSTAGRAM_TYPES } from "@/lib/validation/instagram";
import { instagramAddDays, instagramDate, instagramLane, instagramSummary, instagramToday, postedOn, type InstagramLane } from "@/lib/instagram-planner";
import { InstagramPostCard } from "./InstagramPostCard";
import { InstagramPostForm, type PostDraft, type PostFormEvent } from "./InstagramPostForm";
import { InstagramPostDetail } from "./InstagramPostDetail";
import { InstagramSnapshot, formatKey } from "./InstagramSnapshot";
import { InstagramMonth } from "./InstagramMonth";
import { InstagramSheet } from "./InstagramSheet";
import "./instagram-paper.css";

const LANES: { id: InstagramLane; label: string; note: string }[] = [
  { id: "overdue", label: "Overdue", note: "past their date" }, { id: "week", label: "This week", note: "due in the next 7 days" },
  { id: "upcoming", label: "Upcoming", note: "later this term" }, { id: "posted", label: "Posted", note: "on the feed" },
];
const IDEAS = [{ title: "Welcome to the chapter", type: "Carousel" }, { title: "Meet the founding officers", type: "Carousel" }, { title: "Rush week is coming", type: "Reel" }, { title: "First chapter meeting tonight", type: "Story" }];

/** Confetti from the mock (`burst`): pastel bits flung from the Mark posted button. */
function burst(from: HTMLElement) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = from.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const cols = ["#FFD5C4", "#CFE2FF", "#C7EFDA", "#FFE5A0", "#E1D8FF", "#FFD6E6"];
  for (let i = 0; i < 18; i++) {
    const b = document.createElement("i"), a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 90;
    b.className = "igp-bit";
    b.style.cssText = `left:${x}px;top:${y}px;background:${cols[i % 6]};--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d - 40}px;--r:${Math.random() * 540 - 270}deg`;
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 950);
  }
}
const LANE_TOAST: Record<InstagramLane, string> = { overdue: "it’s already overdue", week: "lands this week", upcoming: "queued under Upcoming", posted: "on the feed" };
const shortDay = (date: string) => new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" });

function Digest({ tasks, today }: { tasks: InstagramTask[]; today: string }) {
  const s = instagramSummary(tasks, today);
  if (!tasks.length) return <>Nothing queued yet — plan a post to start the calendar.</>;
  if (!s.queued) return <>The queue is clear — every planned post has gone out.</>;
  return <>{s.overdue > 0 && <b>{s.overdue} post{s.overdue === 1 ? " is" : "s are"} overdue</b>}{s.overdue > 0 && s.week > 0 && ", "}{s.week > 0 && <>{s.week} land{s.week === 1 ? "s" : ""} this week</>}{!s.overdue && !s.week && <>{s.queued} post{s.queued === 1 ? "" : "s"} queued</>}.{s.sinceLast !== null && <> Last post went up {s.sinceLast === 0 ? "today" : `${s.sinceLast} day${s.sinceLast === 1 ? "" : "s"} ago`}.</>}</>;
}

export default function InstagramPage() {
  const { currentUser, igTaskList, setIgTaskList, loadedSections, sectionErrors, loadError, refreshChapterData } = useChapter();
  const { can } = useChapter();
  const canManage = can("MANAGE_INSTAGRAM"), orgPath = useOrgPath(), router = useRouter(), toast = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [today, setToday] = useState(() => instagramToday(currentUser?.org?.timeZone));
  useEffect(() => {
    const update = () => setToday(instagramToday(currentUser?.org?.timeZone));
    update(); const timer = setInterval(update, 30_000); return () => clearInterval(timer);
  }, [currentUser?.org?.timeZone]);
  const [events, setEvents] = useState<PostFormEvent[]>([]);
  const [eventsError, setEventsError] = useState(false), [eventsLoading, setEventsLoading] = useState(true), [eventsRevision, setEventsRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setEventsLoading(true); setEventsError(false);
    requestJson<PostFormEvent[]>("/api/calendar", { signal: controller.signal }).then(setEvents).catch(() => { if (!controller.signal.aborted) setEventsError(true); }).finally(() => { if (!controller.signal.aborted) setEventsLoading(false); });
    return () => controller.abort();
  }, [currentUser?.orgId, eventsRevision]);
  const [view, setView] = useState<"lanes" | "month">("lanes"), [query, setQuery] = useState(""), [month, setMonth] = useState(() => today.slice(0, 7));
  // A row just added/saved/posted flashes butter (the mock's .fresh); the stamp thuds only on the post just marked.
  const [freshId, setFreshId] = useState<number | null>(null), [stampId, setStampId] = useState<number | null>(null);
  useEffect(() => { if (freshId === null) return; const t = setTimeout(() => setFreshId(null), 2600); return () => clearTimeout(t); }, [freshId]);
  const [create, setCreate] = useState<PostDraft | null>(null), [selectedId, setSelectedId] = useState<number | null>(null), [editing, setEditing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InstagramTask | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const pending = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const selected = igTaskList.find(p => p.id === selectedId) ?? null;
  const eventFor = (p: InstagramTask) => events.find(e => e.id === p.calendarEventId) ?? null;
  const filtered = igTaskList.filter(p => `${p.title} ${p.type}`.toLowerCase().includes(query.trim().toLowerCase()));
  const counts = instagramSummary(igTaskList, today);
  const loading = !loadedSections.has("instagram");
  const failedLoading = sectionErrors.has("instagram") || !!loadError;
  const [loadRetrying, setLoadRetrying] = useState(false);
  const [jump, setJump] = useState<string | null>(null);
  useEffect(() => {
    if (!jump) return;
    const el = document.getElementById(jump);
    if (el) el.scrollIntoView({ block: jump.startsWith("igp-post-") ? "center" : "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setJump(null);
  }, [jump, view, query]);
  function openCreate(preset?: { title: string; type: string }) {
    setError(null); setCreate({ title: preset?.title ?? "", type: preset?.type ?? "Story", dueDate: instagramAddDays(today, 3), postedDate: null, calendarEventId: null });
  }
  function openDetail(p: InstagramTask, edit = false) { setError(null); setSelectedId(p.id); setEditing(edit); }
  function metricClick(key: string) {
    setQuery("");
    if (key === "cadence") { setView("month"); setMonth(today.slice(0, 7)); setJump("igp-month"); return; }
    setView("lanes");
    const lane = key === "queued" ? (counts.week ? "week" : igTaskList.some(p => instagramLane(p, today) === "upcoming") ? "upcoming" : "overdue") : key;
    if (igTaskList.some(p => instagramLane(p, today) === lane)) setJump(`igp-lane-${lane}`);
    else toast.info(key === "overdue" ? "Nothing is overdue" : key === "queued" ? "The queue is clear" : "Nothing due this week");
  }
  // Serialize local mutations; failed forms stay open, and no draft is discarded.
  async function mutate(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try { await work(); }
    catch (err) { if (alive.current) { const message = err instanceof Error ? err.message : "Couldn't save. Please try again."; setError(message); toast.error(message); } }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  function saveCreate(draft: PostDraft) { void mutate(async () => {
    const saved = await requestJson<InstagramTask>("/api/instagram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    if (!alive.current) return;
    setIgTaskList(list => [...list, saved]); setCreate(null); setQuery(""); setFreshId(saved.id);
    if (view === "month") setMonth(saved.dueDate.slice(0, 7)); else setJump(`igp-post-${saved.id}`);
    toast.success(`Added — ${LANE_TOAST[instagramLane(saved, today)]}`);
  }); }
  function updatePost(task: InstagramTask, data: Partial<PostDraft> & { status?: "posted" }, message: string | ((saved: InstagramTask) => string), finishEditing = false) { void mutate(async () => {
    const saved = await requestJson<InstagramTask>(`/api/instagram/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!alive.current) return;
    setIgTaskList(list => list.map(p => p.id === saved.id ? saved : p)); if (finishEditing) { setEditing(false); setFreshId(saved.id); }
    toast.success(typeof message === "string" ? message : message(saved));
  }); }
  function markPosted(task: InstagramTask, from: HTMLElement) {
    burst(from); setFreshId(task.id); setStampId(task.id);
    updatePost(task, { status: "posted" }, "Marked posted — cadence resets to today");
  }
  function askDelete(task: InstagramTask) { setError(null); setSelectedId(null); setDeleteTarget(task); }
  const retryEvents = useCallback(() => setEventsRevision(v => v + 1), []);
  const metrics: { key: string; label: string; icon: PaperIconName; tone: string; value: number | string; note: string }[] = [
    { key: "queued", label: "Queued", icon: "camera", tone: "lilac", value: counts.queued, note: "posts planned" },
    { key: "overdue", label: "Overdue", icon: "flag", tone: "peach", value: counts.overdue, note: counts.overdue ? `oldest ${counts.oldest}d late` : "all caught up" },
    { key: "week", label: "This week", icon: "cal", tone: "butter", value: counts.week, note: "due in 7 days" },
    { key: "cadence", label: "Cadence", icon: "clock", tone: "mint", value: counts.sinceLast ?? "—", note: "since last post" },
  ];
  return <div className="flex h-dvh overflow-hidden bg-[color:var(--paper)]">
    <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="Instagram" onNavClick={() => {}} />
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="igp-scope igp-mobilebar"><button className="igp-iconbtn" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><PaperIcon name="menu" /></button><b>Instagram</b><button className="igp-btn ghost small" onClick={() => window.dispatchEvent(new CustomEvent("chapt:ask", { detail: {} }))}><PaperIcon name="spark" />Ask</button></header>
      <main className="igp-main flex-1 overflow-y-auto"><div className="igp-scope igp-page">
        <section className="igp-brief">
          <div><p className="igp-kick"><span className="chip">{shortDay(today)} · {instagramDate(today)}</span> Content calendar{currentUser?.org?.instagramHandle && <> · @{currentUser.org.instagramHandle}</>}</p>
            <h1>What’s <span className="igp-hi">going out.</span></h1>
            <div className="igp-digest">{igTaskList.length > 0 && <span className="igp-aichip"><PaperIcon name="spark" />Digest</span>}<p>{loading ? "Loading your content calendar…" : <Digest tasks={igTaskList} today={today} />}</p></div>
          </div>
          <div className="igp-head-actions">{canManage && <button className="igp-btn" onClick={() => openCreate()}><PaperIcon name="plus" />Add post</button>}<button className="igp-ask" onClick={() => window.dispatchEvent(new CustomEvent("chapt:ask", { detail: { q: "What should we post on Instagram next? Consider our upcoming events and content calendar." } }))}><PaperIcon name="spark" />Ask what to post next<kbd>⌘K</kbd></button></div>
        </section>
        {loading ? <div className="igp-loading">{failedLoading ? <p role="alert">{loadError ?? "Couldn’t load posts. Try again."}</p> : <LoadingSpinner label="Loading posts" tone="dusk" />}<button className="igp-btn soft" disabled={loadRetrying} onClick={async () => { setLoadRetrying(true); try { await refreshChapterData(); } catch { toast.error("Couldn't load posts. Please try again."); } finally { setLoadRetrying(false); } }}>{loadRetrying ? "Retrying…" : "Retry loading"}</button></div> : !igTaskList.length ? <section className="igp-empty">
          <div className="art"><InstagramSnapshot type="Story" developing /><InstagramSnapshot type="Carousel" /><InstagramSnapshot type="Reel" developing /></div><h3>No posts on the calendar.</h3><p>Plan the chapter’s feed a few weeks out — each post gets a date and a format, and can promote an event so nobody forgets to hype it.</p>
          {canManage ? <><div className="igp-actions"><button className="igp-btn" onClick={() => openCreate()}><PaperIcon name="plus" />Plan the first post</button></div><div className="igp-ideas"><p className="k">A first week of posts</p><div className="chips">{IDEAS.map(idea => <button key={idea.title} className={`igp-ty-${formatKey(idea.type)}`} onClick={() => openCreate(idea)}><i />{idea.title}</button>)}</div></div></> : <p>Ask an officer to plan the first post.</p>}
        </section> : <>
          <section className="igp-measures" aria-label="Calendar at a glance">{metrics.map(m => <button className={`igp-measure igp-tone-${m.tone}`} key={m.key} onClick={() => metricClick(m.key)}><span className="k"><PaperIcon name={m.icon} />{m.label}</span><span className={`v${m.key === "overdue" && counts.overdue ? " warn" : ""}`}>{m.value}{m.key === "cadence" && counts.sinceLast !== null && <small>d</small>}</span><span className="note">{m.note}</span></button>)}</section>
          <div className="igp-tools"><label className="igp-search"><PaperIcon name="search" /><input aria-label="Search posts" type="search" placeholder="Search posts…" value={query} onChange={e => setQuery(e.target.value)} /></label>
            <div className="igp-tabs" aria-label="Calendar view" role="group">{(["lanes", "month"] as const).map(v => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}><PaperIcon name={v === "lanes" ? "menu" : "cal"} />{v === "lanes" ? "Lanes" : "Month"}</button>)}</div>
            <div className="igp-leg">{INSTAGRAM_TYPES.map(t => <span className={`igp-ty-${formatKey(t)}`} key={t}><i />{t}</span>)}</div>
          </div>
          {!filtered.length ? <div className="igp-nomatch"><div className="calm"><span className="art"><PaperIcon name="search" /></span><div><h4>No posts match “{query}”.</h4><p>Search looks at titles and formats.</p><button className="igp-btn ghost small" style={{ marginTop: 12 }} onClick={() => setQuery("")}>Clear search</button></div></div></div> : view === "month" ? <InstagramMonth tasks={filtered} events={events} today={today} month={month} onMonth={setMonth} onSelect={openDetail} /> : <div>{LANES.map(lane => {
            const posts = filtered.filter(p => instagramLane(p, today) === lane.id).sort((a, b) => lane.id === "posted" ? postedOn(b).localeCompare(postedOn(a)) : a.dueDate.localeCompare(b.dueDate));
            return posts.length ? <section key={lane.id} id={`igp-lane-${lane.id}`} className="igp-lane"><div className={`igp-lh igp-ln-${lane.id}`}><span className="dot" /><h2>{lane.label}</h2><span className="sub">{lane.note}</span><span className="rule" /><span className="cnt">{posts.length} post{posts.length === 1 ? "" : "s"}</span></div><div className="igp-list">{posts.map(task => <InstagramPostCard key={task.id} task={task} lane={lane.id} today={today} canManage={canManage} busy={busy} selected={task.id === selectedId} fresh={task.id === freshId} linkedEventTitle={eventFor(task)?.title} onSelect={openDetail} onEdit={p => openDetail(p, true)} onDelete={askDelete} onComplete={markPosted} />)}</div></section> : null;
          })}</div>}
        </>}
        {eventsError && !selected && <p className="igp-error" role="alert">Linked events couldn't be loaded. <button onClick={retryEvents}>Try again</button></p>}
      </div></main>
    </div>
    {selected && <InstagramPostDetail key={selected.id} task={selected} today={today} canManage={canManage} editing={editing} stamped={stampId === selected.id} busy={busy} error={error} events={events} linkedEvent={eventFor(selected)} eventsError={eventsError} eventsLoading={eventsLoading} onRetryEvents={retryEvents} onOpenEvent={() => router.push(orgPath(`/timeline?event=${selected.calendarEventId}`))} onClose={() => { setSelectedId(null); setStampId(null); }} onStartEdit={() => { setError(null); setEditing(true); }} onCancelEdit={() => { setError(null); setEditing(false); }} onSave={draft => updatePost(selected, draft, "Post saved", true)} onChangeDate={dueDate => updatePost(selected, { dueDate }, `Moved to ${shortDay(dueDate)}, ${instagramDate(dueDate)}`)} onChangePostedDate={postedDate => updatePost(selected, { postedDate }, "Posting date changed")} onDelete={askDelete} onComplete={markPosted} />}
    {create && <InstagramSheet title="Add post" icon="camera" dismissable={!busy} onClose={() => setCreate(null)}><InstagramPostForm initial={create} submitLabel="Add post" variant="sheet" onSubmit={saveCreate} onClose={() => setCreate(null)} events={events} today={today} busy={busy} error={error} eventsError={eventsError} eventsLoading={eventsLoading} onRetryEvents={retryEvents} /></InstagramSheet>}
    {deleteTarget && <InstagramSheet title="Delete post" icon="trash" closeButton={false} dismissable={!busy} onClose={() => setDeleteTarget(null)}>
      <div className="igp-sheet-b"><p>Delete <b>“{deleteTarget.title}”</b> (due {instagramDate(deleteTarget.dueDate)})? This can’t be undone.</p>{error && <p className="igp-error" role="alert">{error}</p>}</div>
      <div className="igp-sheet-f"><span className="note" /><button className="igp-btn soft" disabled={busy} data-autofocus onClick={() => setDeleteTarget(null)}>Cancel</button><button className="igp-btn danger" disabled={busy} onClick={() => { const task = deleteTarget; void mutate(async () => { await requestJson(`/api/instagram/${task.id}`, { method: "DELETE" }); if (!alive.current) return; setIgTaskList(list => list.filter(p => p.id !== task.id)); setDeleteTarget(null); toast.success(`Deleted “${task.title}”`); }); }}>{busy ? "Deleting…" : "Delete"}</button></div>
    </InstagramSheet>}
  </div>;
}
