"use client";

/**
 * The Paper aesthetic's Tasks page — _design/Dashboard Paper Mock.html #tasks,
 * on real data. Briefing → four measures → a two-week runway → polls as ballot
 * papers → the checklist, grouped by computed urgency (lib/tasks/urgency) with a
 * coloured spine. Rendered beside the Ledger body inside `.pp-only`; every
 * mutation goes through the page's own handlers, so both looks share state.
 *
 * Also here: the Paper task sheet (create/edit) and ballot sheet, which the page
 * mounts inside its <Modal> instead of TaskForm / PollCard when Paper is on.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { PaperIcon, type PaperIconName } from "../../components/paper/PaperIcon";
import type { RoleOption, TaskFormInitial, TaskFormValue, TaskEveryoneMode } from "../../components/dashboard/TaskForm";
import { fmtDate, type Brother, type Poll, type Task } from "../../data";
import { avatarDisplayUrl } from "@/lib/avatar";
import { taskUrgency } from "@/lib/tasks/urgency";

// ── date + copy helpers ──────────────────────────────────────────────────────
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type Band = "overdue" | "urgent" | "upcoming" | "none" | "done";

const BAND: Record<Exclude<Band, "done">, string> = { overdue: "Overdue", urgent: "Urgent", upcoming: "Upcoming", none: "No date" };
const BAND_SUB: Record<Exclude<Band, "done">, string> = {
  overdue: "past their date",
  urgent: "due today or tomorrow",
  upcoming: "later this term",
  none: "no date — they stay on Tasks and skip the Timeline",
};

function isoOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function plusDays(d: Date, n: number): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function dateOf(iso: string): Date { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); }
/** Whole calendar days from today to `iso` (negative = past). */
function dFrom(iso: string, today: Date): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86_400_000);
}
function dowOf(iso: string): string { return DOW[dateOf(iso).getDay()]; }
function bandOf(t: Pick<Task, "status" | "dueDate">, today: Date): Band {
  return t.status === "done" ? "done" : taskUrgency(t.dueDate, today);
}
function whenTxt(t: Pick<Task, "status" | "dueDate">, today: Date): string {
  if (t.status === "done") return t.dueDate ? `Done · was due ${fmtDate(t.dueDate)}` : "Done";
  if (!t.dueDate) return "No date";
  const n = dFrom(t.dueDate, today);
  if (n < 0) return `${-n}d late`;
  if (n === 0) return "Due today";
  if (n === 1) return "Due tomorrow";
  if (n <= 7) return `Due in ${n}d`;
  return `Due ${dowOf(t.dueDate)}, ${fmtDate(t.dueDate)}`;
}
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
const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;
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

function Ic({ name }: { name: PaperIconName }) { return <PaperIcon name={name} className="ptk-ic" />; }

/** Confetti from the mock (`burst`): pastel bits flung from a point, gone in .9s. */
function burst(x: number, y: number) {
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

type Me = { selfId: number | null; myRoleIds: Set<number> };

function TaskChips({ task, me }: { task: Pick<Task, "assignments" | "everyone" | "doneCount" | "memberCount">; me: Me }) {
  if (task.everyone) {
    return (
      <>
        <span className="ptk-chip all"><Ic name="people" />{task.everyone === "each" ? "Everyone" : "Anyone"}</span>
        {task.everyone === "each" && task.doneCount != null && task.memberCount != null && (
          <span className="ptk-prog" title={`${task.doneCount} of ${task.memberCount} members have done their part`}>
            <i style={{ ["--w" as string]: task.memberCount ? (task.doneCount / task.memberCount) * 100 : 0 }} />
            {task.doneCount}/{task.memberCount} done
          </span>
        )}
      </>
    );
  }
  return (
    <>
      {task.assignments.map(a => a.role ? (
        <span key={`r${a.id}`} className={`ptk-chip role${me.myRoleIds.has(a.role.id) ? " you" : ""}`}
          style={{ ["--rc" as string]: a.role.color ?? "var(--line-med)" }}>
          <span className="pip" />{a.role.name}
        </span>
      ) : a.brother ? (
        <span key={`b${a.id}`} className={`ptk-chip${a.brother.id === me.selfId ? " you" : ""}`}>
          <PAvatar id={a.brother.id} name={a.brother.name} url={a.brother.avatarUrl} size="xs" />
          {a.brother.id === me.selfId ? "You" : first(a.brother.name)}
        </span>
      ) : null)}
    </>
  );
}

type RowTask = Pick<Task, "id" | "title" | "status" | "dueDate" | "notes" | "assignments" | "everyone" | "doneCount" | "memberCount">;

/** One checklist row: check · title + chips · when pill · edit/delete. */
function TaskRowP({ task, today, me, ticking, flash, fresh, canToggle, canManage, preview, onOpen, onTick, onEdit, onDelete }: {
  task: RowTask;
  today: Date;
  me: Me;
  ticking?: boolean;
  flash?: boolean;
  fresh?: boolean;
  canToggle?: boolean;
  canManage?: boolean;
  preview?: boolean;
  onOpen?: () => void;
  onTick?: (el: HTMLElement) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const done = task.status === "done";
  const band = bandOf(task, today);
  const cls = `ptk-row band-${band}${done ? " done" : ""}${ticking ? " ticking" : ""}${flash ? " flash" : ""}${fresh ? " fresh" : ""}`;
  const check = (
    <button type="button" className="ptk-ck" tabIndex={preview ? -1 : undefined}
      disabled={!preview && !canToggle}
      aria-label={done ? "Reopen" : "Mark done"} title={done ? "Reopen" : "Mark done"}
      onClick={e => { e.stopPropagation(); if (!preview && canToggle) onTick?.(e.currentTarget); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>
    </button>
  );
  const body = (
    <>
      {check}
      <div className="ptk-m">
        <span className="ptk-t">{task.title || <span className="ph">What needs doing…</span>}</span>
        <div className="ptk-meta">
          <TaskChips task={task} me={me} />
          {task.notes && <span className="ptk-note">{task.everyone || task.assignments.length ? "· " : ""}{task.notes}</span>}
        </div>
      </div>
      <span className="ptk-when">{whenTxt(task, today)}</span>
      {!preview && canManage && (
        <span className="ptk-acts">
          <button type="button" className="ptk-ib" aria-label="Edit" title="Edit" onClick={e => { e.stopPropagation(); onEdit?.(); }}><Ic name="pencil" /></button>
          <button type="button" className="ptk-ib del" aria-label="Delete" title="Delete" onClick={e => { e.stopPropagation(); onDelete?.(); }}><Ic name="trash" /></button>
        </span>
      )}
    </>
  );
  if (preview) return <div className={cls}>{body}</div>;
  return (
    <div className={cls} id={`ptk-row-${task.id}`} role="button" tabIndex={0} aria-label={`Open ${task.title}`}
      onClick={onOpen}
      onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); onOpen?.(); } }}>
      {body}
    </div>
  );
}

// ── polls: ballot papers ─────────────────────────────────────────────────────
function leaderOf(p: Poll): number | null {
  let best: number | null = null, n = -1;
  for (const o of p.options) { const c = o.voteCount ?? 0; if (c > n) { n = c; best = o.id; } }
  return n > 0 ? best : null;
}

function BallotCard({ poll, today, canVote, onOpen }: { poll: Poll; today: Date; canVote: boolean; onOpen: () => void }) {
  const closed = poll.status === "closed";
  const mv = poll.myVoteOptionId;
  const tot = poll.totalVotes;
  const awaits = !closed && canVote && mv == null;
  const revealed = (closed || mv != null) && poll.options.every(o => o.voteCount != null);
  const lead = leaderOf(poll);
  const meta = closed
    ? `Closed${poll.closeDate ? ` ${fmtDate(poll.closeDate)}` : ""} · ${tot} cast`
    : ["Open",
       poll.closeDate ? `closes ${dFrom(poll.closeDate, today) <= 1 ? relClose(poll.closeDate, today) : dowOf(poll.closeDate)}` : "",
       mv == null ? `${tot} sealed` : plural(tot, "vote")].filter(Boolean).join(" · ");
  const winner = lead != null ? poll.options.find(o => o.id === lead)?.label : null;
  const left = Math.max(0, poll.assigneeCount - tot);
  return (
    <button type="button" className={`ptk-blt${awaits ? " awaits" : ""}${closed ? " closed" : ""}`} onClick={onOpen}>
      <span className="ptk-blt-m">
        {meta}
        {awaits ? <span className="ptk-pill lilac"><span className="dot" />Your vote</span>
          : mv != null && !closed ? <span className="ptk-pill mint">Voted</span> : null}
      </span>
      {closed && <span className="ptk-stampw">Decided</span>}
      <span className="ptk-blt-q">{poll.question}</span>
      <span className="ptk-blt-ls">
        {!revealed
          ? poll.options.slice(0, 4).map(o => (
              <span key={o.id} className="ptk-blt-l"><span className="bx" /><span className="nm">{o.label}</span><span /></span>
            ))
          : poll.options.map(o => {
              const w = tot ? ((o.voteCount ?? 0) / tot) * 100 : 0;
              return (
                <span key={o.id} className={`ptk-blt-l res${o.id === lead ? " win" : ""}${o.id === mv ? " mine" : ""}`} style={{ ["--w" as string]: w }}>
                  <span className="nm"><span>{o.label}{o.id === mv ? " · yours" : ""}</span></span>
                  <span className="v">{Math.round(w)}%</span>
                </span>
              );
            })}
      </span>
      <span className="ptk-blt-f">
        <span>{closed ? (winner ? `Final · ${winner} won` : "Closed with no votes") : `${left} of ${poll.assigneeCount} still to vote`}</span>
        <span className="go">{closed ? "Results" : awaits ? "Vote" : "Live"}<Ic name="arrow-r" /></span>
      </span>
    </button>
  );
}

// ── the page body ────────────────────────────────────────────────────────────
export function PaperTasks({
  taskList, pollList, today, me, semesterLabel, canManage, canManagePolls,
  assigneeFilter, setAssigneeFilter, showDone, setShowDone, freshId,
  isMine, canVote, canComplete, onNewTask, onNewPoll, onOpenTask, onEditTask, onDeleteTask, onToggleTask, onOpenPoll,
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
  onEditTask: (t: Task) => void;
  onDeleteTask: (t: Task) => void;
  onToggleTask: (t: Task) => void;
  onOpenPoll: (p: Poll) => void;
}) {
  const [ticking, setTicking] = useState<number | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const mineOnly = assigneeFilter === "mine";

  const open = taskList.filter(t => t.status !== "done");
  const late = open.filter(t => bandOf(t, today) === "overdue");
  const urgent = open.filter(t => bandOf(t, today) === "urgent");
  const oldest = late.reduce((m, t) => Math.max(m, -dFrom(t.dueDate!, today)), 0);
  const owners = new Set<string>();
  for (const t of open) {
    if (t.everyone) owners.add("everyone");
    for (const a of t.assignments) owners.add(a.roleId != null ? `r${a.roleId}` : `b${a.brotherId}`);
  }
  const mineOpen = open.filter(isMine).sort((a, b) => (a.dueDate ?? "9") < (b.dueDate ?? "9") ? -1 : 1);
  const awaiting = pollList.filter(p => p.status === "open" && canVote(p) && p.myVoteOptionId == null);
  const hasAny = taskList.length > 0 || pollList.length > 0;

  const vis = mineOnly ? taskList.filter(isMine) : taskList;
  const openV = vis.filter(t => t.status !== "done");
  const doneV = vis.filter(t => t.status === "done").sort((a, b) => (a.dueDate ?? "") > (b.dueDate ?? "") ? -1 : 1);
  const groups = (["overdue", "urgent", "upcoming", "none"] as const)
    .map(u => ({ u, items: openV.filter(t => bandOf(t, today) === u).sort((a, b) => (a.dueDate ?? "") < (b.dueDate ?? "") ? -1 : (a.dueDate ?? "") > (b.dueDate ?? "") ? 1 : 0) }))
    .filter(g => g.items.length > 0);

  const polls = useMemo(() => {
    const awaitsMine = (p: Poll) => p.status === "open" && canVote(p) && p.myVoteOptionId == null;
    return pollList
      .filter(p => !mineOnly || canVote(p))
      .filter(p => showDone || p.status !== "closed")
      .sort((a, b) => {
        if (awaitsMine(a) !== awaitsMine(b)) return awaitsMine(a) ? -1 : 1;
        if ((a.status === "closed") !== (b.status === "closed")) return a.status === "closed" ? 1 : -1;
        return (a.closeDate ?? "9") < (b.closeDate ?? "9") ? -1 : 1;
      });
  }, [pollList, mineOnly, showDone, canVote]);

  // A freshly saved task scrolls into view and glows once.
  useEffect(() => {
    if (freshId == null) return;
    const id = window.setTimeout(() => document.getElementById(`ptk-row-${freshId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
    return () => window.clearTimeout(id);
  }, [freshId]);

  function goTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  function goRow(taskId: number) {
    const row = document.getElementById(`ptk-row-${taskId}`);
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlash(null);
    window.requestAnimationFrame(() => setFlash(taskId));
    window.setTimeout(() => setFlash(f => f === taskId ? null : f), 2200);
  }
  function tick(t: Task, el: HTMLElement) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (t.status === "done" || reduce) { onToggleTask(t); return; }
    const r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2);
    setTicking(t.id);
    window.setTimeout(() => { onToggleTask(t); setTicking(null); }, 700);
  }

  // ── digest ──
  let digest: React.ReactNode;
  if (!hasAny) {
    digest = canManage
      ? "Nothing on the board yet. Hand out the first task — to a person, a role, or everyone — and dated ones land on the Timeline too."
      : "Nothing on the board yet. When officers hand out tasks or put a question to the chapter, it lands here.";
  } else {
    const nx = mineOpen.find(t => t.dueDate);
    const lateNames = late.slice(0, 2).map(t => `“${t.title}”`);
    if (late.length > 2) lateNames.push(plural(late.length - 2, "more", "more"));
    digest = (
      <>
        <b>{open.length} open</b> across {plural(owners.size, "owner")}.
        {late.length ? <> <b>{andList(lateNames)}</b> {late.length === 1 ? "is" : "are"} late.</> : " Nothing is late."}
        {mineOpen.length > 0 && <> <b>{mineOpen.length === 1 ? "1 is yours" : `${mineOpen.length} are yours`}</b>{nx ? <> — next is “{nx.title}”, {whenTxt(nx, today).toLowerCase()}.</> : "."}</>}
        {awaiting.length > 0 && <> {awaiting.length === 1 ? "One poll is" : `${awaiting.length} polls are`} waiting on your vote.</>}
      </>
    );
  }

  const ask = () => window.dispatchEvent(new CustomEvent("chapt:ask", { detail: { q: "What's slipping on our tasks?" } }));

  const actions = (
    <div className="ptk-acts-top">
      {canManage && <button type="button" className="ptk-btn" onClick={onNewTask}><Ic name="plus" />New task</button>}
      {canManagePolls && <button type="button" className="ptk-btn ghost" onClick={onNewPoll}><Ic name="chat" />New poll</button>}
      <button type="button" className="ptk-askbar" onClick={ask}><Ic name="spark" />Ask what’s slipping<kbd>⌘K</kbd></button>
    </div>
  );

  const dayLabel = `${DOW[today.getDay()]} · ${fmtDate(isoOf(today))}`;
  const briefing = (
    <section className="briefing ptk-brief" aria-label="Tasks briefing">
      <div>
        <p className="kicker"><span className="today">{dayLabel}</span>Tasks{semesterLabel ? ` · ${semesterLabel}` : ""}</p>
        <h1 className="greeting">Things to get <em>done.</em></h1>
        <div className="digest">
          {hasAny && <span className="ai-chip"><span className="pp-only"><PaperIcon name="spark" />Digest</span></span>}
          <p>{digest}</p>
        </div>
      </div>
      {actions}
    </section>
  );

  if (!hasAny) {
    return (
      <>
        {briefing}
        <div className="ptk-big-empty">
          <div className="art"><Ic name="box" /></div>
          <h3>Nothing here yet.</h3>
          <p>{canManage || canManagePolls
            ? "Hand out tasks and deadlines to members or roles, or ask the chapter a question with a poll. Dated tasks show up on the chapter timeline too."
            : "When officers hand out tasks or ask the chapter a question, they show up here — and anything that’s yours gets a nudge on your dashboard."}</p>
          {(canManage || canManagePolls) && (
            <div className="ptk-actions">
              {canManage && <button type="button" className="ptk-btn" onClick={onNewTask}><Ic name="plus" />New task</button>}
              {canManagePolls && <button type="button" className="ptk-btn ghost" onClick={onNewPoll}><Ic name="chat" />New poll</button>}
            </div>
          )}
        </div>
      </>
    );
  }

  const measure = (key: string, label: string, icon: PaperIconName, c: string, v: number, note: string, onClick: () => void, noteCls = "") => (
    <button type="button" className={`measure ptk-meas${key === "overdue" && v > 0 ? " hot" : ""}`} style={{ ["--c" as string]: c }} onClick={onClick}>
      <p className="k"><PaperIcon name={icon} />{label}</p>
      <p className="v">{v}</p>
      <p className={`note ${noteCls}`}>{note}</p>
    </button>
  );

  return (
    <>
      {briefing}

      <section className="ledger ptk-meas-row" aria-label="Task measures">
        {measure("overdue", "Overdue", "flag", "var(--pp-peach-ink)", late.length, late.length ? `oldest is ${oldest}d late` : "all clear", () => goTo("ptkg-overdue"), late.length ? "warn" : "")}
        {measure("urgent", "Urgent", "clock", "var(--pp-rose-ink)", urgent.length, "due today or tomorrow", () => goTo("ptkg-urgent"))}
        {measure("open", "Open", "box", "var(--pp-sky-ink)", open.length, `across ${plural(owners.size, "owner")}`, () => goTo("ptk-list"))}
        {measure("done", "Done", "check", "var(--pp-mint-ink)", taskList.length - open.length, "this semester", () => { setShowDone(true); window.setTimeout(() => goTo("ptkg-done"), 60); }, "good")}
      </section>

      <Runway open={openV} today={today} isMine={isMine} me={me} onPip={goRow} />

      <div className="ptk-sec-h">
        <h2>Polls</h2><span className="rule" />
        <span className="cnt">{awaiting.length ? `${awaiting.length} waiting on you` : pollList.length ? "you’re all voted up" : "none yet"}</span>
      </div>
      <div className="ptk-polls">
        {polls.map(p => <BallotCard key={p.id} poll={p} today={today} canVote={canVote(p)} onOpen={() => onOpenPoll(p)} />)}
        {canManagePolls && <button type="button" className="ptk-blt add" onClick={onNewPoll}><Ic name="plus" />Ask the chapter something</button>}
        {!canManagePolls && polls.length === 0 && <p className="ptk-quiet">No polls open{mineOnly ? " for you" : ""} right now.</p>}
      </div>

      <div className="ptk-ctl" id="ptk-list">
        <div className="ptk-tabs" role="tablist" aria-label="Whose tasks">
          <button type="button" role="tab" aria-selected={!mineOnly} onClick={() => setAssigneeFilter("all")}>All tasks <span>{open.length}</span></button>
          <button type="button" role="tab" aria-selected={mineOnly} onClick={() => setAssigneeFilter("mine")}>Assigned to me <span>{mineOpen.length}</span></button>
        </div>
        <label className="ptk-sw">
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
          <span className="track" />Show done <span className="n">{taskList.length - open.length}</span>
        </label>
      </div>

      {groups.map(g => (
        <section key={g.u} aria-label={BAND[g.u]}>
          <div className={`ptk-gh band-${g.u}`} id={`ptkg-${g.u}`}>
            <span className="dot" /><h2>{BAND[g.u]}</h2><span className="sub">{BAND_SUB[g.u]}</span><span className="rule" /><span className="cnt">{g.items.length}</span>
          </div>
          <div className="ptk-list">
            {g.items.map(t => (
              <TaskRowP key={t.id} task={t} today={today} me={me} ticking={ticking === t.id} flash={flash === t.id} fresh={freshId === t.id}
                canToggle={canComplete(t)} canManage={canManage}
                onOpen={() => onOpenTask(t)} onTick={el => tick(t, el)} onEdit={() => onEditTask(t)} onDelete={() => onDeleteTask(t)} />
            ))}
          </div>
        </section>
      ))}

      {openV.length === 0 && (
        <div className="ptk-empty">
          <div className="ptk-calm">
            <span className="art"><Ic name="plant" /></span>
            <div>
              <h4>{mineOnly ? "You’re all caught up." : taskList.length === 0 ? "No tasks yet." : "No open tasks."}</h4>
              <p>{mineOnly
                ? "No open tasks are assigned to you or your roles right now."
                : taskList.length === 0
                  ? (canManage ? <>Polls are up — <button type="button" className="ptk-link" onClick={onNewTask}>hand out the first task</button> when you’re ready.</> : "Nothing has been handed out yet.")
                  : <>Everything is done — flip on <button type="button" className="ptk-link" onClick={() => setShowDone(true)}>Show done</button> to review it.</>}</p>
            </div>
          </div>
        </div>
      )}

      {showDone && doneV.length > 0 && (
        <section aria-label="Done">
          <div className="ptk-gh band-done" id="ptkg-done">
            <span className="dot" /><h2>Done</h2><span className="sub">this semester</span><span className="rule" /><span className="cnt">{doneV.length}</span>
          </div>
          <div className="ptk-list">
            {doneV.map(t => (
              <TaskRowP key={t.id} task={t} today={today} me={me} fresh={freshId === t.id} flash={flash === t.id}
                canToggle={canComplete(t)} canManage={canManage}
                onOpen={() => onOpenTask(t)} onTick={() => onToggleTask(t)} onEdit={() => onEditTask(t)} onDelete={() => onDeleteTask(t)} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** Where the open work lands over the next two weeks — one column a day, a late pile first. */
function Runway({ open, today, isMine, me, onPip }: { open: Task[]; today: Date; isMine: (t: Task) => boolean; me: Me; onPip: (id: number) => void }) {
  const todayIso = isoOf(today);
  const dated = open.filter(t => t.dueDate);
  const late = dated.filter(t => t.dueDate! < todayIso);
  const short = (t: Task): string => {
    if (t.everyone) return t.everyone === "each" ? "All" : "Any";
    const a = t.assignments[0];
    if (!a) return "—";
    if (a.role) return a.role.name.split(" ")[0].slice(0, 6);
    if (a.brother) return a.brother.id === me.selfId ? "You" : first(a.brother.name);
    return "—";
  };
  const label = (t: Task): string => t.everyone
    ? (t.everyone === "each" ? "Everyone" : "Anyone")
    : t.assignments.map(a => a.role?.name ?? (a.brother ? first(a.brother.name) : "")).filter(Boolean).join(", ");
  const pip = (t: Task) => (
    <button type="button" key={t.id} className={`ptk-pip band-${bandOf(t, today)}${isMine(t) ? " mine" : ""}`}
      title={`${t.title} · ${label(t)}`} onClick={() => onPip(t.id)}>{short(t)}</button>
  );
  const days = Array.from({ length: 15 }, (_, i) => plusDays(today, i));
  const wk = dated.filter(t => { const n = dFrom(t.dueDate!, today); return n >= 0 && n <= 7; }).length;
  const later = dated.filter(t => dFrom(t.dueDate!, today) > 14).length;
  const nd = open.length - dated.length;
  return (
    <div className="ptk-run">
      <div className="ptk-run-h">
        <span className="pp-tile pp-t-lilac"><PaperIcon name="cal" /></span>
        <h3>The next two weeks</h3>
        <span className="lg">{(["overdue", "urgent", "upcoming"] as const).map(u => <span key={u} className={`band-${u}`}><i />{BAND[u]}</span>)}</span>
      </div>
      <div className="ptk-lane">
        <div className="ptk-day late"><span className="hd"><small>Late</small><b>{late.length || "—"}</b></span>{late.map(pip)}</div>
        {days.map((d, i) => {
          const iso = isoOf(d);
          const here = dated.filter(t => t.dueDate === iso);
          return (
            <div key={iso} className={`ptk-day${i === 0 ? " today" : ""}${d.getDay() % 6 === 0 ? " we" : ""}`}>
              <span className="hd"><small>{i === 0 ? "Today" : DOW[d.getDay()]}</small><b>{d.getDate()}</b></span>
              {here.map(pip)}
            </div>
          );
        })}
      </div>
      <p className="ptk-run-f">
        <span><b>{wk}</b> land this week</span>
        {later > 0 && <span><b>{later}</b> further out</span>}
        {nd > 0 && <span><b>{nd}</b> with no date, below</span>}
        <span className="mine"><i />outlined = yours</span>
      </p>
    </div>
  );
}

// ── task sheet (create / edit) ───────────────────────────────────────────────
type DueKey = "today" | "tom" | "d3" | "nw" | "w2" | "pick" | "none";

export function PaperTaskSheet({
  brothers, roles, selfId, today, minDate, maxDate, initial, editing, error, onSubmit, onDelete, onCancel,
}: {
  brothers: Brother[];
  roles: RoleOption[];
  selfId: number | null;
  today: Date;
  minDate?: string;
  maxDate?: string;
  initial?: TaskFormInitial;
  editing: boolean;
  error?: string | null;
  onSubmit: (value: TaskFormValue) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const quick: { key: DueKey; label: string; n: number }[] = [
    { key: "today", label: "Today", n: 0 },
    { key: "tom", label: "Tomorrow", n: 1 },
    { key: "d3", label: DOW[plusDays(today, 3).getDay()], n: 3 },
    { key: "nw", label: "Next week", n: 7 },
    { key: "w2", label: "In 2 weeks", n: 14 },
  ];
  const init = initial ?? { title: "", dueDate: "", notes: "", brotherIds: [], roleIds: [], everyone: null };
  const initKey: DueKey = !init.dueDate ? "none" : (quick.find(q => isoOf(plusDays(today, q.n)) === init.dueDate)?.key ?? "pick");

  const [title, setTitle] = useState(init.title);
  const [dueKey, setDueKey] = useState<DueKey>(initKey);
  const [pick, setPick] = useState(initKey === "pick" ? init.dueDate : "");
  const [mode, setMode] = useState<"individuals" | "roles" | "everyone">(init.everyone ? "everyone" : init.roleIds.length ? "roles" : "individuals");
  const [brotherIds, setBrotherIds] = useState<number[]>(!editing && !init.brotherIds.length && selfId != null ? [selfId] : init.brotherIds);
  const [roleIds, setRoleIds] = useState<number[]>(init.roleIds);
  const [everyone, setEveryone] = useState<TaskEveryoneMode | null>(init.everyone ?? null);
  const [notes, setNotes] = useState(init.notes);
  const [showNote, setShowNote] = useState(!!init.notes);
  const [local, setLocal] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const inTerm = (iso: string) => (!minDate || iso >= minDate) && (!maxDate || iso <= maxDate);
  const due = dueKey === "none" ? "" : dueKey === "pick" ? pick : isoOf(plusDays(today, quick.find(q => q.key === dueKey)!.n));
  const band = due ? taskUrgency(due, today) : "none";
  const members = useMemo(() => [...brothers].sort((a, b) => (a.id === selfId ? -1 : b.id === selfId ? 1 : a.name.localeCompare(b.name))), [brothers, selfId]);
  const holders = (roleId: number) => brothers.filter(b => b.roles?.some(r => r.id === roleId));

  const toggle = (list: number[], id: number) => list.includes(id) ? list.filter(x => x !== id) : [...list, id];

  function submit() {
    if (!title.trim()) { setLocal("Say what needs doing."); titleRef.current?.focus(); return; }
    if (dueKey === "pick" && !pick) { setLocal("Pick a date, or choose No date."); return; }
    if (mode === "everyone" && !everyone) { setLocal("Say whether every member does it, or one person does it for the chapter."); return; }
    if (mode === "individuals" && brotherIds.length === 0) { setLocal("Pick at least one person."); return; }
    if (mode === "roles" && roleIds.length === 0) { setLocal("Pick at least one role."); return; }
    setLocal(null);
    onSubmit({
      title: title.trim(),
      dueDate: due,
      notes: notes.trim(),
      assigneeBrotherIds: mode === "individuals" ? brotherIds : [],
      assigneeRoleIds: mode === "roles" ? roleIds : [],
      everyone: mode === "everyone" ? everyone : null,
    });
  }

  // The live preview is the real row, built from what's on the sheet right now.
  const byId = new Map(brothers.map(b => [b.id, b]));
  const preview: RowTask = {
    id: 0, title: title.trim(), status: "open", dueDate: due || null, notes: notes.trim() || null,
    everyone: mode === "everyone" ? (everyone ?? "each") : null,
    doneCount: mode === "everyone" && everyone === "each" ? 0 : null,
    memberCount: mode === "everyone" && everyone === "each" ? brothers.length : null,
    assignments: mode === "individuals"
      ? brotherIds.map(id => byId.get(id)).filter((b): b is Brother => !!b).map(b => ({ id: b.id, brotherId: b.id, roleId: null, brother: { id: b.id, name: b.name, avatarUrl: b.avatarUrl ?? null }, role: null }))
      : mode === "roles"
        ? roleIds.map(id => roles.find(r => r.id === id)).filter((r): r is RoleOption => !!r).map(r => ({ id: -r.id, brotherId: null, roleId: r.id, brother: null, role: { id: r.id, name: r.name, color: r.color } }))
        : [],
  };
  const me: Me = { selfId, myRoleIds: new Set(brothers.find(b => b.id === selfId)?.roles?.map(r => r.id) ?? []) };
  const shown = local ?? error ?? null;

  return (
    <form className="ptk-sheet" onSubmit={e => { e.preventDefault(); submit(); }}
      onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}>
      <div className="ptk-sheet-b">
        <p className="ptk-kick">{editing ? "Edit task" : "New task"}</p>
        <label className="sr-only" htmlFor="ptk-title">Task</label>
        <input id="ptk-title" ref={titleRef} className="cef-title ptk-title-in" value={title} autoFocus autoComplete="off"
          placeholder="What needs doing…" onChange={e => setTitle(e.target.value)} />

        <div className="ptk-sec">
          <p className="ptk-lab"><Ic name="cal" />Due <span className="op">· optional</span></p>
          <div className="ptk-rail" role="radiogroup" aria-label="Due">
            {quick.map(q => {
              const iso = isoOf(plusDays(today, q.n));
              const ok = inTerm(iso);
              return (
                <label key={q.key} className={`band-${taskUrgency(iso, today)}${ok ? "" : " off"}`} title={ok ? undefined : "Outside this semester"}>
                  <input type="radio" name="ptk-due" checked={dueKey === q.key} disabled={!ok} onChange={() => setDueKey(q.key)} />
                  <span><i />{q.label}<small>{fmtDate(iso)}</small></span>
                </label>
              );
            })}
            <label className={`band-${dueKey === "pick" && pick ? taskUrgency(pick, today) : "upcoming"}`}>
              <input type="radio" name="ptk-due" checked={dueKey === "pick"} onChange={() => setDueKey("pick")} />
              <span><i />Pick a date</span>
            </label>
            {dueKey === "pick" && (
              <input className="ptk-date" type="date" value={pick} min={minDate} max={maxDate} aria-label="Exact date" onChange={e => setPick(e.target.value)} />
            )}
            <label className="band-none">
              <input type="radio" name="ptk-due" checked={dueKey === "none"} onChange={() => setDueKey("none")} />
              <span><i />No date</span>
            </label>
          </div>
          <p className={`ptk-say band-${band}`}>
            <span className="dot" />
            <span>{due
              ? <>Lands in <b>{BAND[band as Exclude<Band, "done">]}</b>
                  {band === "overdue" ? " — that date has already passed" : band === "urgent" ? " — near the top, with a rose spine" : " — sky spine; it turns urgent the day before"}.
                  {" "}On the Timeline <b>{dowOf(due)}, {fmtDate(due)}</b>.</>
              : <>No date — it waits under <b>No date</b> and stays off the Timeline.</>}</span>
          </p>
        </div>

        <div className="ptk-sec">
          <p className="ptk-lab"><Ic name="people" />Who’s on it</p>
          <div className="ptk-seg" role="radiogroup" aria-label="Who’s on it">
            {([["individuals", "Individuals"], ["roles", "Roles"], ["everyone", "Everyone"]] as const).map(([k, l]) => (
              <label key={k}><input type="radio" name="ptk-mode" checked={mode === k} onChange={() => { setMode(k); setLocal(null); }} /><span>{l}</span></label>
            ))}
          </div>

          {mode === "individuals" && (
            <div className="ptk-faces">
              {members.length === 0 && <span className="ptk-hint">No members yet.</span>}
              {members.map(b => (
                <label key={b.id} className="ptk-face">
                  <input type="checkbox" checked={brotherIds.includes(b.id)} onChange={() => setBrotherIds(ids => toggle(ids, b.id))} />
                  <PAvatar id={b.id} name={b.name} url={b.avatarUrl} size="lg" />
                  <span className="nm">{b.id === selfId ? "You" : first(b.name)}</span>
                </label>
              ))}
            </div>
          )}

          {mode === "roles" && (
            <>
              <div className="ptk-roles">
                {roles.length === 0 && <span className="ptk-hint">No roles defined yet.</span>}
                {roles.map(r => {
                  const hs = holders(r.id);
                  const who = hs.length === 0 ? "nobody yet" : hs.length === 1 ? (hs[0].id === selfId ? "you" : first(hs[0].name)) : `${hs.length} people`;
                  return (
                    <label key={r.id}>
                      <input type="checkbox" checked={roleIds.includes(r.id)} onChange={() => setRoleIds(ids => toggle(ids, r.id))} />
                      <span style={{ ["--rc" as string]: r.color ?? "var(--line-med)" }}><span className="pip" />{r.name}<small>{who}</small></span>
                    </label>
                  );
                })}
              </div>
              <p className="ptk-hint">Roles expand to whoever holds them — hand the role over and the task follows.</p>
            </>
          )}

          {mode === "everyone" && (
            <>
              <div className="ptk-everyone">
                <span className="stk">{members.slice(0, 5).map(b => <PAvatar key={b.id} id={b.id} name={b.name} url={b.avatarUrl} size="sm" />)}</span>
                <span>{brothers.length <= 1
                  ? <>Just you for now — everyone who joins gets it too.</>
                  : <>All <b>{brothers.length} members</b>, and anyone who joins later.</>}</span>
              </div>
              <div className="ptk-ev-choice" role="radiogroup" aria-label="Who has to do it">
                {([
                  ["each", "Every member does it", "Each person ticks off their own. It’s done when everyone has."],
                  ["any", "One person does it", "Anyone can pick it up. The first to finish ticks it off for the chapter."],
                ] as const).map(([k, l, h]) => (
                  <label key={k} className={everyone === k ? "on" : ""}>
                    <input type="radio" name="ptk-ev" checked={everyone === k} onChange={() => { setEveryone(k); setLocal(null); }} />
                    <span className="dot" /><span className="txt"><b>{l}</b><small>{h}</small></span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="ptk-sec">
          {showNote ? (
            <>
              <p className="ptk-lab"><Ic name="pencil" />Note</p>
              <textarea className="ptk-ta" rows={2} value={notes} placeholder="Links, details, what “done” means…" onChange={e => setNotes(e.target.value)} autoFocus={!init.notes} />
            </>
          ) : (
            <button type="button" className="ptk-addnote" onClick={() => setShowNote(true)}><Ic name="plus" />Add a note</button>
          )}
        </div>
      </div>

      <div className="ptk-prev">
        <p className="k">How it lands on the list</p>
        <TaskRowP task={preview} today={today} me={me} preview />
      </div>

      {shown && <p className="ptk-err" role="alert">{shown}</p>}

      <div className="ptk-foot">
        {editing && onDelete
          ? <button type="button" className="ptk-btn soft sm danger" onClick={onDelete}><Ic name="trash" />Delete</button>
          : <span className="k"><kbd>⌘</kbd><kbd>↵</kbd> to add</span>}
        <span className="sp">
          <button type="button" className="ptk-btn soft" onClick={onCancel}>Cancel</button>
          <button type="submit" className="ptk-btn">{editing ? "Save changes" : "Create task"}</button>
        </span>
      </div>
    </form>
  );
}

/** Read-only task sheet for a member without MANAGE_TASKS (a deep link or a row tap). */
export function PaperTaskView({ task, today, selfId, myRoleIds, canComplete, onToggle, onClose }: {
  task: Task; today: Date; selfId: number | null; myRoleIds: Set<number>; canComplete: boolean; onToggle: () => void; onClose: () => void;
}) {
  const done = task.status === "done";
  return (
    <div className="ptk-sheet">
      <div className="ptk-sheet-b">
        <p className="ptk-kick">Task</p>
        <h3 className="ptk-view-t">{task.title}</h3>
        <div className="ptk-view-meta">
          <span className={`ptk-when band-${bandOf(task, today)}`}>{whenTxt(task, today)}</span>
          <TaskChips task={task} me={{ selfId, myRoleIds }} />
        </div>
        {task.everyone && (
          <p className="ptk-hint">{task.everyone === "each"
            ? "Every member does this one — ticking it marks your part done."
            : "One person does this for the chapter — whoever ticks it closes it for everyone."}</p>
        )}
        {task.notes && <p className="ptk-view-note">{task.notes}</p>}
      </div>
      <div className="ptk-foot">
        <span />
        <span className="sp">
          <button type="button" className="ptk-btn soft" onClick={onClose}>Close</button>
          {canComplete && <button type="button" className="ptk-btn" onClick={onToggle}><Ic name="check" />{done ? "Reopen" : "Mark done"}</button>}
        </span>
      </div>
    </div>
  );
}

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

  const roleOnly = poll.assignments.length > 0 && poll.assignments.every(a => a.roleId != null);
  const whoLabel = roleOnly
    ? `${andList(poll.assignments.map(a => a.role?.name ?? "").filter(Boolean))} vote`
    : poll.assigneeCount >= brothers.length && brothers.length > 1 ? "Everyone votes" : `${plural(poll.assigneeCount, "voter")}`;

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
            ? `Closed${poll.closedAt ? ` ${fmtDate(poll.closedAt.slice(0, 10))}` : poll.closeDate ? ` ${fmtDate(poll.closeDate)}` : ""}`
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
