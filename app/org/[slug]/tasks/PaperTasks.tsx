"use client";

/**
 * The Paper aesthetic's Tasks page — _design/Tasks Simple Paper Mock.html, on
 * real data. Two piles (Overdue, then Upcoming soonest first) with a tear-off
 * date stub on every row, and a side column holding the collapsed Done line and
 * the open votes. Every mutation goes through the page's own handlers.
 *
 * Also here: the ballot sheet, which the page mounts inside its <Modal>. The
 * task and poll sheets (create/edit) are TaskSheets.tsx; the task spotlight is
 * TaskSpotlight.tsx.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { PaperIcon, type PaperIconName } from "../../../components/paper/PaperIcon";
import { fmtDueTime } from "./task-forms";
import { takeTaskFlight } from "./task-fly";
import { fmtDate, type Brother, type Poll, type Task } from "../../../data";
import { avatarDisplayUrl } from "@/lib/avatar";
import "./tasks-paper.css";

// ── date + copy helpers ──────────────────────────────────────────────────────
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function isoOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function plusDays(d: Date, n: number): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
export function dateOf(iso: string): Date { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); }
/** Whole calendar days from today to `iso` (negative = past). */
export function dFrom(iso: string, today: Date): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86_400_000);
}
function dowOf(iso: string): string { return DOW[dateOf(iso).getDay()]; }
function relClose(iso: string, today: Date): string {
  const n = dFrom(iso, today);
  if (n < 0) return "past its close date";
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  return `in ${n} days`;
}
function andList(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
export const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ── small pieces ─────────────────────────────────────────────────────────────
const AV_TONES = ["peach", "sky", "mint", "butter", "lilac", "rose"] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** The mock's pastel initial disc, or the member's photo when they have one. */
export function PAvatar({ id, name, url, size = "md" }: { id: number; name: string; url?: string | null; size?: "xs" | "sm" | "md" | "lg" }) {
  const src = avatarDisplayUrl(url ?? null, 0);
  const tone = AV_TONES[Math.abs(id) % AV_TONES.length];
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className={`ptk-av ${size}`} src={src} alt="" referrerPolicy="no-referrer" />
    : <span className={`ptk-av ${size}`} style={{ ["--av" as string]: `var(--pp-${tone})` }} aria-hidden>{initials(name)}</span>;
}

export function Ic({ name }: { name: PaperIconName }) { return <PaperIcon name={name} className="ptk-ic" />; }

/** Confetti from the mock (`burst`): pastel bits flung from a point, gone in .9s. */
export function burst(x: number, y: number) {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cols = ["#FFD5C4", "#CFE2FF", "#C7EFDA", "#FFE5A0", "#E1D8FF", "#FFD6E6"];
  for (let i = 0; i < 18; i++) {
    const b = document.createElement("i");
    b.className = "ptk-bit";
    const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 90;
    b.style.cssText = `left:${x}px;top:${y}px;background:${cols[i % 6]};--x:${Math.cos(a) * r}px;--y:${Math.sin(a) * r - 40}px;--r:${Math.random() * 540 - 270}deg`;
    document.body.appendChild(b);
    window.setTimeout(() => b.remove(), 950);
  }
}

export type Me = { selfId: number | null; myRoleIds: Set<number> };

type RowTask = Pick<Task, "id" | "title" | "status" | "dueDate" | "dueTime" | "notes" | "assignments" | "everyone" | "doneCount" | "memberCount">;

// ── the list: _design/Tasks Simple Paper Mock.html ───────────────────────────
// Two piles and nothing else: Overdue (past its date) on top, Upcoming (soonest
// first, undated last) below. The date is a tear-off stub on the right of every
// row, so "when" reads without a colour key. Classes are tks-, styled by
// tasks-paper.css inside .tks-scope.
export const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function pileOf(t: Pick<Task, "dueDate">, today: Date): "over" | "up" {
  return t.dueDate && dFrom(t.dueDate, today) < 0 ? "over" : "up";
}
/** The mock's row words: "4 days late", "Yesterday", "Tomorrow", "Sat · in 3 days". */
function rowWhen(dueDate: string | null, today: Date): string {
  if (!dueDate) return "No date";
  const n = dFrom(dueDate, today);
  if (n < -1) return `${-n} days late`;
  if (n === -1) return "Yesterday";
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n < 7) return `${dowOf(dueDate)} · in ${n} days`;
  return `in ${n} days`;
}
/** Soonest first; undated tasks wait at the bottom. */
function byDue(a: Pick<Task, "id" | "dueDate">, b: Pick<Task, "id" | "dueDate">): number {
  if (!a.dueDate || !b.dueDate) return a.dueDate ? -1 : b.dueDate ? 1 : a.id - b.id;
  return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.id - b.id;
}

function Stub({ dueDate, today }: { dueDate: string | null; today: Date }) {
  if (!dueDate) return <span className="tks-stub none" aria-hidden><small>ANY</small><b>—</b></span>;
  const d = dateOf(dueDate);
  return <span className={`tks-stub${dFrom(dueDate, today) === 0 ? " today" : ""}`} aria-hidden><small>{MON[d.getMonth()]}</small><b>{d.getDate()}</b></span>;
}

function WhoChips({ task, me }: { task: Pick<Task, "assignments" | "everyone" | "doneCount" | "memberCount">; me: Me }) {
  if (task.everyone) {
    const { doneCount: c, memberCount: n } = task;
    return (
      <>
        <span className="tks-who all"><Ic name="people" />{task.everyone === "each" ? "Everyone" : "Anyone"}</span>
        {task.everyone === "each" && c != null && n != null && (
          <span className="tks-prog" title={`${c} of ${n} members have done their part`}>
            <i style={{ ["--w" as string]: n ? Math.round((c / n) * 100) : 0 }} />{c} of {n}
          </span>
        )}
      </>
    );
  }
  return (
    <>
      {task.assignments.map(a => a.role ? (
        <span key={`r${a.id}`} className={`tks-who role${me.myRoleIds.has(a.role.id) ? " you" : ""}`}
          style={{ ["--rc" as string]: a.role.color ?? "var(--paper-3)" }}>{a.role.name}</span>
      ) : a.brother ? (
        <span key={`b${a.id}`} className={`tks-who${a.brother.id === me.selfId ? " you" : ""}`}>
          <PAvatar id={a.brother.id} name={a.brother.name} url={a.brother.avatarUrl} size="xs" />
          {a.brother.id === me.selfId ? "You" : first(a.brother.name)}
        </span>
      ) : null)}
    </>
  );
}

/** How far a phone swipe must travel left before letting go finishes the task. */
const SWIPE_ARM = 96;

/** One row: tick circle · title + who · words + tear-off stub. On a phone, a
 *  swipe left past the line finishes it too (same rule as the circle). */
function TaskRow({ task, today, me, ticked, fresh, canToggle, onOpen, onTick }: {
  task: RowTask;
  today: Date;
  me: Me;
  ticked?: boolean;
  fresh?: boolean;
  canToggle?: boolean;
  onOpen?: () => void;
  onTick?: (el: HTMLElement) => void;
}) {
  // A due time rides on the day words: "Tomorrow · by 5 PM".
  const when = rowWhen(task.dueDate, today) + (task.dueDate && task.dueTime ? ` · by ${fmtDueTime(task.dueTime)}` : "");
  const title = task.title;
  const liRef = useRef<HTMLLIElement>(null);
  const ckRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x0: number; y0: number; dx: number; dir: "x" | "y" | null } | null>(null);
  const swallowUntil = useRef(0);
  const [armed, setArmed] = useState(false);

  function onPointerDown(e: React.PointerEvent<HTMLLIElement>) {
    if (!canToggle || ticked || !window.matchMedia("(max-width: 600px)").matches) return;
    drag.current = { x0: e.clientX, y0: e.clientY, dx: 0, dir: null };
  }
  function onPointerMove(e: React.PointerEvent<HTMLLIElement>) {
    const d = drag.current, li = liRef.current;
    if (!d || !li) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (d.dir == null) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { d.dir = "x"; li.setPointerCapture(e.pointerId); li.classList.add("swiping"); }
      else if (Math.abs(dy) > 8) { drag.current = null; return; }
      else return;
    }
    d.dx = Math.max(-170, Math.min(0, dx));
    li.style.transform = `translateX(${d.dx}px)`;
    setArmed(d.dx < -SWIPE_ARM);
  }
  function onPointerUp() {
    const d = drag.current, li = liRef.current;
    drag.current = null;
    if (!d || d.dir !== "x" || !li) return;
    swallowUntil.current = performance.now() + 350;
    li.classList.remove("swiping");
    li.style.transform = "";
    setArmed(false);
    if (d.dx < -SWIPE_ARM && ckRef.current) onTick?.(ckRef.current);
  }

  return (
    <li ref={liRef} className={`tks-tk${ticked ? " ticked" : ""}${fresh ? " fresh" : ""}${armed ? " armed" : ""}`} id={`ptk-row-${task.id}`}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onClickCapture={e => { if (performance.now() < swallowUntil.current) { swallowUntil.current = 0; e.stopPropagation(); e.preventDefault(); } }}>
      {canToggle && <span className="tks-swipe" aria-hidden><Ic name="check" />Done</span>}
      <button ref={ckRef} type="button" className="tks-ck" disabled={!canToggle}
        aria-label={canToggle ? `Mark “${title}” done` : "Only the people on it can tick this"}
        title={canToggle ? undefined : "Only the people on it can tick this"}
        onClick={e => { if (canToggle) onTick?.(e.currentTarget); }}>
        <Ic name="check" />
      </button>
      <div className="tks-m">
        <button type="button" className="tks-t" onClick={onOpen}>{title}</button>
        <div className="tks-meta">
          <WhoChips task={task} me={me} />
          {task.notes && <span className="tks-has-note" title="Has a note"><Ic name="doc" /></span>}
          <span className="tks-when-m">· {when}</span>
        </div>
      </div>
      <div className="tks-when"><span className="tks-when-d">{when}</span><Stub dueDate={task.dueDate} today={today} /></div>
    </li>
  );
}

/** A finished task in the Done list: a filled tick that reopens it. */
function DoneRow({ task, canToggle, onOpen, onTick }: { task: Task; canToggle: boolean; onOpen: () => void; onTick: () => void }) {
  return (
    <li className="tks-tk" id={`ptk-row-${task.id}`}>
      <button type="button" className="tks-ck" disabled={!canToggle} onClick={onTick}
        aria-label={`Reopen “${task.title}”`} title={canToggle ? "Reopen" : undefined}><Ic name="check" /></button>
      <div className="tks-m"><button type="button" className="tks-t" onClick={onOpen}>{task.title}</button></div>
      <div className="tks-when"><span className="tks-when-d">{task.dueDate ? `Was due ${fmtDate(task.dueDate)}` : "Done"}</span></div>
    </li>
  );
}

// The side column stays shorter than the screen: the latest few, the rest on ask.
const DONE_SHOWN = 6;

/** The viewer's local calendar day of an instant (closedAt is a timestamp, not a date). */
const localDay = (at: string) => fmtDate(isoOf(new Date(at)));

function closesTxt(p: Poll, today: Date): string {
  if (p.status === "closed") return `Closed${p.closedAt ? ` ${localDay(p.closedAt)}` : ""}`;
  if (!p.closeDate) return "No close date";
  const n = dFrom(p.closeDate, today);
  return `Closes ${n < 0 ? "any time now" : n === 0 ? "today" : n === 1 ? "tomorrow" : n < 7 ? dowOf(p.closeDate) : fmtDate(p.closeDate)}`;
}

/** A vote, kept small: tap a choice to cast (or change) it; bars once you have. */
function VoteCard({ poll, today, canVote, onVote, onOpen }: {
  poll: Poll; today: Date; canVote: boolean; onVote: (optionId: number) => Promise<void>; onOpen: () => void;
}) {
  const [casting, setCasting] = useState(false);
  const closed = poll.status === "closed";
  const mine = poll.myVoteOptionId;
  const total = poll.totalVotes;
  // Bars only once the viewer has voted or the vote is over: a blind ballot even
  // for managers here, who can still peek from the full sheet.
  const reveal = (closed || mine != null) && poll.options.every(o => o.voteCount != null);
  const live = !closed && canVote;
  const lead = leaderOf(poll);
  const winner = lead != null ? poll.options.find(o => o.id === lead)?.label : null;
  async function cast(id: number) {
    if (!live || casting || id === mine) return;
    setCasting(true);
    try { await onVote(id); } catch { /* the page surfaces the error */ } finally { setCasting(false); }
  }
  return (
    <div className={`tks-vote${closed ? " closed" : ""}`}>
      <div className="tks-vote-h">
        <button type="button" className="q" onClick={onOpen}>{poll.question}</button>
        <span>{closesTxt(poll, today)} · {total} of {poll.assigneeCount} voted</span>
      </div>
      <div className="tks-vote-o" aria-busy={casting || undefined}>
        {poll.options.map(o => {
          const pct = reveal && total ? Math.round(((o.voteCount ?? 0) / total) * 100) : 0;
          return (
            <button key={o.id} type="button" disabled={!live || casting} onClick={() => cast(o.id)}
              className={`${o.id === mine ? "mine" : ""}${closed && o.id === lead ? " win" : ""}`} aria-pressed={o.id === mine}>
              <i className="fill" style={{ width: `${reveal ? pct : 0}%` }} />
              <span className="bx"><Ic name="check" /></span>
              <span className="lb">{o.label}</span>
              {reveal && <span className="pct">{pct}%</span>}
            </button>
          );
        })}
      </div>
      <p className="tks-vote-f">{closed
        ? (winner ? `Decided · ${winner} won.` : "Closed with no votes.")
        : mine != null ? "Your vote is in. Tap another to change it."
        : canVote ? "Anonymous. Results show after you vote."
        : "Only the people on it vote."}</p>
    </div>
  );
}

function leaderOf(p: Poll): number | null {
  let best: number | null = null, n = -1;
  for (const o of p.options) { const c = o.voteCount ?? 0; if (c > n) { n = c; best = o.id; } }
  return n > 0 ? best : null;
}

// ── the page body ────────────────────────────────────────────────────────────
export function PaperTasks({
  taskList, pollList, today, me, semesterLabel, canManage, canManagePolls,
  assigneeFilter, setAssigneeFilter, showDone, setShowDone, freshId,
  isMine, canVote, canComplete, onNewTask, onNewPoll, onOpenTask, onToggleTask, onOpenPoll, onVote, loading,
}: {
  taskList: Task[];
  pollList: Poll[];
  today: Date;
  me: Me;
  semesterLabel: string | null;
  canManage: boolean;
  canManagePolls: boolean;
  assigneeFilter: "all" | "mine";
  setAssigneeFilter: (f: "all" | "mine") => void;
  showDone: boolean;
  setShowDone: (v: boolean) => void;
  freshId: number | null;
  isMine: (t: Task) => boolean;
  canVote: (p: Poll) => boolean;
  canComplete: (t: Task) => boolean;
  onNewTask: () => void;
  onNewPoll: () => void;
  onOpenTask: (t: Task) => void;
  onToggleTask: (t: Task) => void;
  onOpenPoll: (p: Poll) => void;
  onVote: (p: Poll, optionId: number) => Promise<void>;
  /** Tasks, polls or the viewer still on their way: say nothing rather than "nothing yet". */
  loading: boolean;
}) {
  const [ticking, setTicking] = useState<number | null>(null);
  const [allDone, setAllDone] = useState(false);
  const mineOnly = assigneeFilter === "mine";

  const vis = mineOnly ? taskList.filter(isMine) : taskList;
  const open = vis.filter(t => t.status !== "done");
  const over = open.filter(t => pileOf(t, today) === "over").sort(byDue);
  const up = open.filter(t => pileOf(t, today) === "up").sort(byDue);
  const done = vis.filter(t => t.status === "done")
    .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt));
  const hasAny = taskList.length > 0 || pollList.length > 0;

  // Open votes this viewer is asked into (all of them for a poll manager), then
  // the few most recently decided.
  const polls = useMemo(() => {
    const seen = pollList.filter(p => canManagePolls ? (!mineOnly || canVote(p)) : canVote(p));
    const openP = seen.filter(p => p.status === "open")
      .sort((a, b) => (a.myVoteOptionId == null) !== (b.myVoteOptionId == null) ? (a.myVoteOptionId == null ? -1 : 1) : (a.closeDate ?? "9") < (b.closeDate ?? "9") ? -1 : 1);
    const decided = seen.filter(p => p.status === "closed")
      .sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? "")).slice(0, 2);
    return [...openP, ...decided];
  }, [pollList, mineOnly, canVote, canManagePolls]);
  const openPolls = polls.filter(p => p.status === "open").length;

  // A task just added from the sheet flies into its slot (task-fly.ts); any
  // other freshly saved task scrolls into view and glows once.
  useEffect(() => {
    if (freshId == null) return;
    const raf = window.requestAnimationFrame(() => {
      const li = document.getElementById(`ptk-row-${freshId}`);
      if (!takeTaskFlight(freshId, li)) window.setTimeout(() => li?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [freshId]);

  function tick(t: Task, el: HTMLElement) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { onToggleTask(t); return; }
    const r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2);
    setTicking(t.id);
    window.setTimeout(() => { onToggleTask(t); setTicking(null); }, 700);
  }

  const row = (t: Task) => (
    <TaskRow key={t.id} task={t} today={today} me={me} ticked={ticking === t.id} fresh={freshId === t.id}
      canToggle={canComplete(t)} onOpen={() => onOpenTask(t)} onTick={el => tick(t, el)} />
  );

  const kick = <span className="tks-kick">Tasks{semesterLabel && <span className="chip">{semesterLabel}</span>}</span>;

  if (loading) {
    return (
      <div className="tks-scope" aria-busy="true">
        <header className="tks-brief"><div>{kick}<div className="tks-wait greet" /><div className="tks-wait sub" /></div></header>
        <div className="tks-wait pile" /><div className="tks-wait pile short" />
      </div>
    );
  }

  if (!hasAny) {
    return (
      <div className="tks-scope">
        <header className="tks-brief">
          <div>
            {kick}
            <h1 className="tks-greet">Nothing to do <span className="tks-hi" style={{ ["--mark" as string]: "var(--butter)" }}>yet</span></h1>
            <p className="tks-sub">{canManage ? "Hand out a task and it lands here, sorted by date." : "When an officer hands you a task, it shows up here."}</p>
          </div>
        </header>
        <section className="tks-d1">
          <div className="piles">
            <div className="mini over" style={{ ["--pc" as string]: "var(--peach)" }}><p>Overdue</p><div><i />Past its date<em>2 days late</em></div></div>
            <div className="mini" style={{ ["--pc" as string]: "var(--sky)" }}><p>Upcoming</p><div><i />Still ahead<em>Fri</em></div></div>
          </div>
          <h2>Two piles. That’s the whole page.</h2>
          <p>Anything past its date goes on top. Everything else waits below, soonest first. Tick it and it’s done.</p>
          {canManage
            ? <button type="button" className="tks-btn" onClick={onNewTask}><Ic name="plus" />Hand out the first task</button>
            : canManagePolls && <button type="button" className="tks-btn" onClick={onNewPoll}><Ic name="bars" />Ask the chapter something</button>}
        </section>
      </div>
    );
  }

  const forYou = mineOnly ? " for you" : "";
  return (
    <div className="tks-scope">
      <header className="tks-brief">
        <div>
          {kick}
          <h1 className="tks-greet">{over.length
            ? <><span className="tks-hi" style={{ ["--mark" as string]: "var(--peach)" }}>{over.length} overdue</span>{forYou}, {up.length} coming up</>
            : <>Nothing overdue{forYou}. <span className="tks-hi">{up.length} coming up</span></>}</h1>
          <p className="tks-sub">{over.length
            ? "Start with the overdue pile, then work down. Tick a task when it’s done."
            : "You’re on top of it. Everything left is still ahead of its date."}</p>
        </div>
        {(canManage || canManagePolls) && (
          <div className="tks-head-btns">
            {canManagePolls && <button type="button" className="tks-btn soft" onClick={onNewPoll}><Ic name="bars" />New poll</button>}
            {canManage && <button type="button" className="tks-btn" onClick={onNewTask}><Ic name="plus" />New task</button>}
          </div>
        )}
      </header>

      <div className="tks-ctl">
        <div className="tks-seg" role="group" aria-label="Whose tasks">
          <button type="button" aria-pressed={!mineOnly} onClick={() => setAssigneeFilter("all")}>Everyone’s</button>
          <button type="button" aria-pressed={mineOnly} onClick={() => setAssigneeFilter("mine")}>Just mine</button>
        </div>
      </div>

      <div className="tks-cols">
        <div className="tks-col-main">
          {over.length > 0 ? (
            <section className="tks-pile over" aria-labelledby="tks-h-over">
              <div className="tks-pile-h">
                <span className="tile"><Ic name="alert" /></span>
                <div><h2 id="tks-h-over">Overdue</h2><p>Past its date. Start here.</p></div>
                <span className="n">{over.length}</span>
              </div>
              <ul>{over.map(row)}</ul>
            </section>
          ) : (
            <div className="tks-clear">
              <span className="tile"><Ic name="check" /></span>
              <span><b>Nothing overdue.</b> Every open task is still ahead of its date.</span>
            </div>
          )}

          <section className="tks-pile up" aria-labelledby="tks-h-up">
            <div className="tks-pile-h">
              <span className="tile"><Ic name="cal" /></span>
              <div><h2 id="tks-h-up">Upcoming</h2><p>Soonest first. No-date tasks wait at the bottom.</p></div>
              <span className="n">{up.length}</span>
            </div>
            <ul>
              {up.length ? up.map(row) : <li className="tks-tk empty"><p>Nothing coming up{forYou}.</p></li>}
            </ul>
          </section>
        </div>

        <aside className="tks-col-side">
          {done.length > 0 && (
            <>
              <button type="button" className="tks-done-bar" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
                <span className="tile"><Ic name="check" /></span>{done.length} done this term
                <PaperIcon name="chev-d" className="ptk-ic chev" />
              </button>
              {showDone && (
                <>
                  <ul className="tks-done-list">
                    {(allDone ? done : done.slice(0, DONE_SHOWN)).map(t => <DoneRow key={t.id} task={t} canToggle={canComplete(t)} onOpen={() => onOpenTask(t)} onTick={() => onToggleTask(t)} />)}
                  </ul>
                  {done.length > DONE_SHOWN && (
                    <button type="button" className="tks-done-more" onClick={() => setAllDone(!allDone)}>
                      {allDone ? "Show fewer" : `Show ${done.length - DONE_SHOWN} more`}
                    </button>
                  )}
                </>
              )}
            </>
          )}

          <div className="tks-sec">
            <h2>Votes</h2><span className="rule" />
            {canManagePolls
              ? <button type="button" className="tks-sec-btn" onClick={onNewPoll}><Ic name="plus" />New poll</button>
              : <span className="cnt">{openPolls} open</span>}
          </div>
          {polls.length === 0 && (
            <div className="tks-vote empty">
              <p>No votes open right now.</p>
              {canManagePolls && <button type="button" className="tks-btn sm soft" onClick={onNewPoll}><Ic name="bars" />Ask the chapter something</button>}
            </div>
          )}
          {polls.map(p => (
            <VoteCard key={p.id} poll={p} today={today} canVote={canVote(p)} onVote={id => onVote(p, id)} onOpen={() => onOpenPoll(p)} />
          ))}
        </aside>
      </div>
    </div>
  );
}

// ── the New task / New poll sheets ───────────────────────────────────────────
// The mock's composer: a tilted tile and a title, plain labelled fields, every
// choice a chip, and a footer that says where the thing lands before you add
// it. Mounted inside the page's <Modal hideHeader> (its ✕ floats top-right);
// styled by tasks-paper.css under .tks-sheet.

/** The quick date chips: today, tomorrow, the coming Friday, a week out. */
// ── ballot sheet ─────────────────────────────────────────────────────────────
export function PaperBallot({ poll, today, brothers, canManage, canVote, onVote, onClosePoll, onReopen, onEdit, onDelete, onDone }: {
  poll: Poll;
  today: Date;
  brothers: Brother[];
  canManage: boolean;
  canVote: boolean;
  onVote: (optionId: number) => Promise<void>;
  onClosePoll: () => void;
  onReopen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDone: () => void;
}) {
  const closed = poll.status === "closed";
  const mv = poll.myVoteOptionId;
  const tot = poll.totalVotes;
  const [pick, setPick] = useState<number | null>(mv);
  const [peek, setPeek] = useState(false);
  const [change, setChange] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [casting, setCasting] = useState(false);
  const castRef = useRef<HTMLButtonElement>(null);

  const ballot = !closed && canVote && (mv == null || change) && !peek;
  const counted = poll.options.every(o => o.voteCount != null);
  const lead = leaderOf(poll);

  const roleOnly = !poll.everyone && poll.assignments.length > 0 && poll.assignments.every(a => a.roleId != null);
  const whoLabel = roleOnly
    ? `${andList(poll.assignments.map(a => a.role?.name ?? "").filter(Boolean))} vote`
    : poll.everyone || (poll.assigneeCount >= brothers.length && brothers.length > 1) ? "Everyone votes" : `${plural(poll.assigneeCount, "voter")}`;

  async function cast() {
    if (pick == null || casting) return;
    setCasting(true);
    const r = castRef.current?.getBoundingClientRect();
    try {
      await onVote(pick);
      if (r) burst(r.left + r.width / 2, r.top);
      setChange(false); setPeek(false);
    } catch { /* the page surfaces the error */ }
    setCasting(false);
  }

  const pending = poll.pendingVoters ?? [];
  return (
    <div className="ptk-pl-wrap">
      <div className="ptk-pl">
        {closed && <span className="ptk-rubber">Decided</span>}
        <p className="ptk-kick">{closed ? "Final results" : "Ballot"} · {whoLabel} · anonymous</p>
        <h3 className="ptk-pl-q">{poll.question}</h3>
        <p className="ptk-pl-sub">
          {closed
            ? `Closed${poll.closedAt ? ` ${localDay(poll.closedAt)}` : poll.closeDate ? ` ${fmtDate(poll.closeDate)}` : ""}`
            : poll.closeDate ? `Closes ${dowOf(poll.closeDate)}, ${fmtDate(poll.closeDate)} · ${relClose(poll.closeDate, today)}` : "No close date"}
          {` · ${tot} of ${poll.assigneeCount} voted`}
        </p>

        {ballot ? (
          <>
            <div className="ptk-pl-opts" role="radiogroup" aria-label="Your vote">
              {poll.options.map(o => (
                <label key={o.id} className="ptk-pl-o">
                  <input type="radio" name="ptk-pick" checked={pick === o.id} onChange={() => setPick(o.id)} />
                  <span className="bx"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg></span>
                  <span className="nm">{o.label}</span><span />
                </label>
              ))}
            </div>
            <div className="ptk-seal">
              <Ic name="lock" />
              <span>{mv == null
                ? `${tot} sealed so far. Counts open up to you once you vote — nobody sees who picked what.`
                : "Changing your vote replaces the old one."}</span>
              {mv == null && canManage && counted && <button type="button" className="ptk-link" onClick={() => setPeek(true)}>Peek <Ic name="arrow-r" /></button>}
            </div>
          </>
        ) : counted ? (
          <>
            <div className="ptk-pl-opts">
              {poll.options.map(o => {
                const c = o.voteCount ?? 0;
                const w = tot ? (c / tot) * 100 : 0;
                return (
                  <div key={o.id} className={`ptk-pl-o res${o.id === lead ? " win" : ""}`} style={{ ["--w" as string]: w }}>
                    <span className="nm">{o.label}
                      {o.id === mv && <span className="tg mv">your vote</span>}
                      {o.id === lead && <span className="tg ld">{closed ? "won" : "leading"}</span>}
                    </span>
                    <span className="v"><b>{c}</b>{Math.round(w)}%</span>
                  </div>
                );
              })}
            </div>
            {peek && mv == null && !closed && (
              <div className="ptk-seal"><Ic name="lock" /><span>You’re peeking as an officer — voters still see a sealed ballot.</span>
                {canVote && <button type="button" className="ptk-link" onClick={() => setPeek(false)}>Back to the ballot</button>}
              </div>
            )}
          </>
        ) : (
          <div className="ptk-seal"><Ic name="lock" /><span>You’re not on this ballot — results open up when it closes.</span></div>
        )}

        {!closed && canManage && pending.length > 0 && (
          <div className="ptk-pl-who">
            <p className="k">Not voted yet</p>
            <div className="row2">
              <span className="stk">{pending.slice(0, 5).map(v => <PAvatar key={v.brotherId} id={v.brotherId} name={v.name} url={v.avatarUrl} size="sm" />)}</span>
              <span>{andList(pending.slice(0, 3).map(v => first(v.name)))}{pending.length > 3 ? ` and ${pending.length - 3} more` : ""}</span>
            </div>
          </div>
        )}
      </div>

      <div className="ptk-foot">
        {confirm ? (
          <div className="ptk-confirm">Close now? Voting stops and the results become final.
            <span className="sp">
              <button type="button" className="ptk-btn soft sm" onClick={() => setConfirm(false)}>Keep open</button>
              <button type="button" className="ptk-btn sm" onClick={() => { setConfirm(false); onClosePoll(); }}>Close poll</button>
            </span>
          </div>
        ) : (
          <>
            {canManage ? (
              <span className="ptk-mgmt">
                {closed
                  ? <button type="button" className="ptk-btn soft sm" onClick={onReopen}>Reopen</button>
                  : <button type="button" className="ptk-btn soft sm" onClick={() => setConfirm(true)}>Close poll</button>}
                <button type="button" className="ptk-ib" aria-label="Edit poll" title="Edit poll" onClick={onEdit}><Ic name="pencil" /></button>
                <button type="button" className="ptk-ib del" aria-label="Delete poll" title="Delete poll" onClick={onDelete}><Ic name="trash" /></button>
              </span>
            ) : <span />}
            <span className="sp">
              {ballot ? (
                <button type="button" ref={castRef} className="ptk-btn" disabled={pick == null || casting} onClick={cast}>
                  <Ic name="check" />{casting ? "Casting…" : mv == null ? "Cast ballot" : "Change vote"}
                </button>
              ) : (
                <>
                  {!closed && canVote && mv != null && <button type="button" className="ptk-btn soft" onClick={() => { setPick(mv); setChange(true); setPeek(false); }}>Change vote</button>}
                  <button type="button" className="ptk-btn" onClick={onDone}>Done</button>
                </>
              )}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
