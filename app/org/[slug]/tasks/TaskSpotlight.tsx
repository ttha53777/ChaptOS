"use client";

/**
 * Task Spotlight — _design/Tasks Simple Paper Mock.html (v3), on real data.
 * One column, read top to bottom: what + when + the one button → start/due
 * bookends and a desk calendar with the one number → the note → everyone's
 * part (each tasks) → who it's for and from, quietly → history, folded.
 *
 * Opened by a row tap for everyone; officers get Edit/Delete in the top bar.
 * Everything beyond the row (each-task ticks, history) comes from
 * GET /api/tasks/[id]; names and faces from the roster the page already has.
 * A centred card on desktop, a bottom sheet on phones (tasks-paper.css).
 */

import React, { useEffect, useRef, useState } from "react";
import { fmtDate, type Brother, type Task } from "../../../data";
import type { TaskDetail, TaskHistoryEntry } from "@/lib/api-types";
import { requestJson } from "../../../lib/api";
import { Ic, MON, PAvatar, burst, dFrom, dateOf, first, plusDays, type Me } from "./PaperTasks";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULLDOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_MS = 86_400_000;
const FOCUSABLE = 'button:not([disabled]), [href], input, textarea, select, summary, [tabindex]:not([tabindex="-1"])';

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const shortD = (d: Date) => `${MONS[d.getMonth()]} ${d.getDate()}`;
const longD = (d: Date) => `${DOW[d.getDay()]}, ${MONS[d.getMonth()]} ${d.getDate()}`;
const daysBetween = (a: Date, b: Date) => Math.round((midnight(b).getTime() - midnight(a).getTime()) / DAY_MS);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
function clock(d: Date): string {
  const h = d.getHours(), m = d.getMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
function andList(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** What an update event changed, in words. */
function editedWhat(fields: string[] | null): string {
  const said: string[] = [];
  const has = (f: string) => fields?.includes(f);
  if (has("title")) said.push("renamed it");
  if (has("dueDate")) said.push("changed the due date");
  if (has("notes")) said.push("edited the note");
  if (has("assignees") || has("everyone")) said.push("changed who’s on it");
  return said.length ? andList(said) : "edited it";
}

type Line = { at: Date; actorId: number | null; text: string; tone: "c" | "d" | "e" | "r" };

export function TaskSpotlight({ task, today, me, brothers, canComplete, canManage, onToggle, onEdit, onDelete, onClose }: {
  task: Task;
  today: Date;
  me: Me;
  brothers: Brother[];
  canComplete: boolean;
  canManage: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [stamping, setStamping] = useState(false);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [detailFailed, setDetailFailed] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const calRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Remember what opened it so focus goes back there on close.
  const triggerRef = useRef<HTMLElement | null>(null);
  if (triggerRef.current === null && typeof document !== "undefined") triggerRef.current = document.activeElement as HTMLElement | null;

  function requestClose() {
    if (closing.current) return;
    closing.current = true;
    setShown(false);
    window.setTimeout(() => onCloseRef.current(), 260);
  }

  useEffect(() => {
    const r = requestAnimationFrame(() => {
      setShown(true);
      panelRef.current?.focus({ preventScroll: true });
    });
    const trigger = triggerRef.current;
    return () => { cancelAnimationFrame(r); if (trigger?.isConnected) trigger.focus?.(); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); requestClose(); return; }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const els = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!els.length) return;
      const a = els[0], z = els[els.length - 1], cur = document.activeElement;
      if (e.shiftKey && (cur === a || cur === panel)) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && cur === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Ticks and history change whenever the task does, so refetch on any edit.
  useEffect(() => {
    let live = true;
    setDetailFailed(false);
    requestJson<TaskDetail>(`/api/tasks/${task.id}`)
      .then(d => { if (live) setDetail(d); })
      .catch(() => { if (live) setDetailFailed(true); });
    return () => { live = false; };
  }, [task.id, task.status, task.completedAt, task.dueDate, task.title, task.notes, task.everyone, task.assignments]);

  const byId = new Map(brothers.map(b => [b.id, b]));
  const nameOf = (id: number | null) => id == null ? "Someone" : id === me.selfId ? "You" : byId.has(id) ? first(byId.get(id)!.name) : "Someone";

  const each = task.everyone === "each";
  const done = task.status === "done";
  const due = task.dueDate ? dateOf(task.dueDate) : null;
  const n = task.dueDate ? dFrom(task.dueDate, today) : null;
  const late = !done && n != null && n < 0;
  const tone = done ? "done" : late ? "over" : "up";
  const finAt = done && task.completedAt ? new Date(task.completedAt) : null;
  const chip = done ? (each ? "Your part’s done" : "Done") : late ? "Overdue" : due ? "Upcoming" : "No date";

  // ── the sentence under the title ──
  let when: React.ReactNode;
  if (done) {
    const who = each ? "You did your part" : task.completedById != null ? `${nameOf(task.completedById)} finished it` : "Finished";
    let rel = "";
    if (due && finAt) {
      const k = daysBetween(due, finAt);
      rel = k > 0 ? `, ${plural(k, "day")} after it was due` : k < 0 ? `, ${plural(-k, "day")} early` : ", on the day it was due";
    }
    when = <><b>{who}</b>{finAt ? <> on {longD(finAt)}</> : null}{rel}.</>;
  } else if (!due || n == null) {
    when = <>No date. It waits at the bottom of <b>Upcoming</b> until someone gets to it.</>;
  } else if (late) {
    when = <>Was due <b>{FULLDOW[due.getDay()]}, {shortD(due)}</b>. <em>{n === -1 ? "Yesterday" : `${-n} days ago`}.</em></>;
  } else {
    when = <>Due <b>{n === 0 ? "today " : n === 1 ? "tomorrow " : ""}{FULLDOW[due.getDay()]}, {shortD(due)}</b>{n === 0 ? ", by the end of the day." : n === 1 ? "." : `, in ${n} days.`}</>;
  }

  // ── who it's for ──
  const forNames = task.everyone ? ["everyone"] : task.assignments.map(a => a.role?.name ?? (a.brother ? (a.brother.id === me.selfId ? "you" : first(a.brother.name)) : "")).filter(Boolean);
  const holders = (roleId: number) => brothers.filter(b => b.roles?.some(r => r.id === roleId));

  function tick() {
    if (!canComplete || stamping) return;
    if (done) { onToggle(); requestClose(); return; }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { onToggle(); requestClose(); return; }
    setStamping(true);
    const r = calRef.current?.getBoundingClientRect();
    if (r) burst(r.left + r.width / 2, r.top + r.height / 2);
    window.setTimeout(() => { onToggle(); requestClose(); }, 820);
  }

  return (
    <>
      <div className={`tks-sp-scrim${shown ? " on" : ""}`} onClick={requestClose} aria-hidden />
      <section ref={panelRef} className={`tks-scope tks-spot ${tone}${shown ? " on" : ""}${stamping ? " stamping" : ""}`}
        role="dialog" aria-modal="true" aria-labelledby="tks-sp-title" tabIndex={-1}>
        <span className="grab" aria-hidden />
        <div className="sp-top">
          <span className="sp-chip"><i />{chip}</span>
          {canManage && (
            <>
              <button type="button" className="sp-tool" onClick={onEdit} aria-label="Edit" title="Edit"><Ic name="pencil" /></button>
              <button type="button" className="sp-tool" onClick={onDelete} aria-label="Delete" title="Delete"><Ic name="trash" /></button>
            </>
          )}
          <button type="button" className={`sp-tool x${canManage ? "" : " solo"}`} onClick={requestClose} aria-label="Close"><Ic name="x" /></button>
        </div>

        <div className="sp-scroll">
          <div className="sp-hero">
            {due
              ? <div ref={calRef} className="cal" aria-hidden><small>{MON[due.getMonth()]}</small><b>{due.getDate()}</b><span>{DOW[due.getDay()].toUpperCase()}</span></div>
              : <div ref={calRef} className="cal none" aria-hidden><small>ANY</small><b>—</b><span>NO DATE</span></div>}
            <div>
              <h2 id="tks-sp-title">{task.title}</h2>
              <p className="sp-when">{when}</p>
              <div className="sp-go">
                {!canComplete
                  ? <span className="hint"><Ic name="lock" />Only {andList(forNames) || "the people on it"} can tick this.</span>
                  : done
                    ? <button type="button" className="bigtick on" onClick={tick}><span className="o"><Ic name="check" /></span><span className="tx"><b>Reopen</b><small>Puts it back in its pile</small></span></button>
                    : <button type="button" className="bigtick" onClick={tick} disabled={stamping}><span className="o"><Ic name="check" /></span><span className="tx"><b>{each ? "Mark my part done" : "Mark done"}</b><small>Same as ticking the circle in the list</small></span></button>}
              </div>
            </div>
          </div>

          {due ? <WhenSection task={task} today={today} due={due} finAt={finAt} late={late} /> : (
            <div className="sp-sec">
              <div className="nodate"><Ic name="cal" /><span><b>No due date.</b> It isn’t on the Timeline{canManage ? ", so edit it to add one." : "."}</span></div>
            </div>
          )}

          {task.notes
            ? <div className="sp-sec"><p className="sp-lab">Note</p><p className="pad">{task.notes}</p></div>
            : canManage && <div className="sp-sec"><button type="button" className="addn" onClick={onEdit}><Ic name="plus" />Add a note</button></div>}

          {each && <Parts task={task} detail={detail} brothers={brothers} me={me} />}

          <div className="sp-sec">
            <div className="who-line">
              <span>
                <small>For</small>
                {task.everyone
                  ? <span className="rl" style={{ ["--rc" as string]: "var(--lilac)" }}>{each ? "Everyone, each" : "Anyone"}</span>
                  : task.assignments.length === 0 ? <span className="q">No one yet</span>
                  : task.assignments.map(a => a.role ? (
                      <React.Fragment key={`r${a.id}`}>
                        <span className="rl" style={{ ["--rc" as string]: a.role.color ?? "var(--paper-3)" }}>{a.role.name}</span>
                        <RoleHolders hs={holders(a.role.id)} selfId={me.selfId} />
                      </React.Fragment>
                    ) : a.brother ? (
                      <span key={`b${a.id}`} className="pp">
                        <PAvatar id={a.brother.id} name={a.brother.name} url={a.brother.avatarUrl} size="xs" />
                        <span>{a.brother.id === me.selfId ? "You" : first(a.brother.name)}</span>
                      </span>
                    ) : null)}
              </span>
              {task.createdById != null && (
                <span>
                  <small>From</small>
                  {byId.get(task.createdById) && <PAvatar id={task.createdById} name={byId.get(task.createdById)!.name} url={byId.get(task.createdById)!.avatarUrl} size="xs" />}
                  <span>{nameOf(task.createdById)}</span>
                  <span className="q">· {shortD(new Date(task.createdAt))}</span>
                </span>
              )}
            </div>
          </div>

          <History task={task} detail={detail} failed={detailFailed} nameOf={nameOf} />
        </div>
      </section>
    </>
  );
}

function RoleHolders({ hs, selfId }: { hs: Brother[]; selfId: number | null }) {
  if (hs.length === 0) return <span className="q">(nobody yet)</span>;
  if (hs.length === 1) return <span className="q">({hs[0].id === selfId ? "you" : first(hs[0].name)})</span>;
  return <span className="q">({hs.length} people)</span>;
}

/** Start → due bookends, then the weeks between as a desk calendar beside the one number. */
function WhenSection({ task, today, due, finAt, late }: { task: Task; today: Date; due: Date; finAt: Date | null; late: boolean }) {
  const a0 = midnight(new Date(task.createdAt));
  const fin = finAt ? midnight(finAt) : null;
  const now = fin ?? today;
  const from = new Date(Math.min(a0.getTime(), due.getTime(), now.getTime()));
  const last = new Date(Math.max(due.getTime(), now.getTime()));
  // Mon-first weeks. Up to five weeks show whole; a longer stretch (a task set
  // months ahead, or long overdue) keeps just the weeks holding start, due and
  // today, with the skipped weeks counted in between.
  const weekOf = (d: Date) => plusDays(d, -((d.getDay() + 6) % 7));
  let weeks: Date[] = [];
  if (daysBetween(weekOf(from), weekOf(last)) <= 28) {
    for (let w = weekOf(from); w <= last; w = plusDays(w, 7)) weeks.push(w);
  } else {
    const keys = [a0, due, now].map(d => weekOf(d).getTime());
    weeks = [...new Set(keys)].sort((x, y) => x - y).map(t => new Date(t));
  }

  let big: string, cap: string, tone: "late" | "left" | "fin";
  if (fin) {
    const k = daysBetween(due, fin);
    big = k === 0 ? "✓" : String(Math.abs(k));
    cap = k === 0 ? "on the day" : `${Math.abs(k) === 1 ? "day" : "days"} ${k > 0 ? "late" : "early"}`;
    tone = k > 0 ? "late" : "fin";
  } else if (late) {
    const k = daysBetween(due, today);
    big = String(k); cap = `${k === 1 ? "day" : "days"} late`; tone = "late";
  } else {
    const k = daysBetween(today, due);
    big = String(k); cap = k === 0 ? "due today" : `${k === 1 ? "day" : "days"} left`; tone = "left";
  }

  const cells: React.ReactNode[] = [];
  weeks.forEach((w, wi) => {
    if (wi > 0) {
      const skipped = daysBetween(weeks[wi - 1], w) / 7 - 1;
      if (skipped > 0) cells.push(<span key={`gap${w.getTime()}`} className="dc-gap"><span>{plural(skipped, "week")} later</span></span>);
    }
    for (let i = 0; i < 7; i++) cells.push(dayCell(plusDays(w, i)));
  });
  function dayCell(d: Date) {
    const t = d.getTime();
    const c: string[] = [];
    const marks: React.ReactNode[] = [];
    if (d < from || d > last) c.push("out");
    else {
      if (t === a0.getTime()) { c.push("as"); marks.push(<span key="s" className="tag s">START</span>); }
      if (t === due.getTime()) { c.push("due"); marks.push(<span key="d" className="tag d">DUE</span>); }
      if (fin && t === fin.getTime()) { c.push("dn"); marks.push(<span key="f" className="tickm"><Ic name="check" /></span>); }
      if (!fin && t === today.getTime()) c.push("today");
      if (d > due && d <= now) c.push("late");
      else if (!fin && d > today && d < due) c.push("left");
      else if (d < now && t !== due.getTime()) c.push("gone");
    }
    return <span key={t} className={`dc ${c.join(" ")}`}><i>{d.getDate()}</i>{marks}</span>;
  }
  const span = daysBetween(a0, due);
  const gs = weeks[0], ge = plusDays(weeks[weeks.length - 1], 6);
  const monthLabel = MONL[gs.getMonth()] + (gs.getMonth() !== ge.getMonth() || gs.getFullYear() !== ge.getFullYear() ? ` – ${MONL[ge.getMonth()]}` : "");

  return (
    <>
      <div className="sp-sec ends">
        <span className="end s"><i /><span><small>Start</small><b>{longD(a0)}</b></span></span>
        <span className="len"><span>{span > 0 ? `${plural(span, "day")} to do it` : span === 0 ? "Same day" : "Set after its date"}</span></span>
        <span className="end d"><i><Ic name="flag" /></i><span><small>Due</small><b>{longD(due)}</b></span></span>
      </div>
      <div className="sp-sec when-sec">
        <div className="desk-cal">
          <p className="dc-m">{monthLabel}</p>
          <div className="dc-g">
            {["M", "T", "W", "T", "F", "S", "S"].map((x, i) => <span key={i} className="dc-h">{x}</span>)}
            {cells}
          </div>
          <p className="dc-k">
            <span className="k-as">Start</span>
            {fin ? <span className="k-dn">Done</span> : <span className="k-td">Today</span>}
            <span className="k-du">Due</span>
            {tone === "late" ? <span className="k-late">Late</span> : tone === "left" ? <span className="k-left">Still ahead</span> : null}
          </p>
        </div>
        <div className={`count ${tone}`}>
          <b>{big}</b><span>{cap}</span>
          <small>{fin ? `Finished ${shortD(fin)}` : late ? `It was due ${shortD(due)}` : `Due ${shortD(due)}`}</small>
        </div>
      </div>
    </>
  );
}

/** Everyone · each: a ring of how much of the chapter is done, and every face. */
function Parts({ task, detail, brothers, me }: { task: Task; detail: TaskDetail | null; brothers: Brother[]; me: Me }) {
  const doneN = task.doneCount ?? 0, total = task.memberCount ?? brothers.length;
  const pct = total ? Math.round((doneN / total) * 100) : 0;
  const doneIds = new Set((detail?.parts ?? []).map(p => p.brotherId));
  const roster = [...brothers].sort((a, b) => a.name.localeCompare(b.name));
  const doneB = roster.filter(b => doneIds.has(b.id));
  const left = roster.filter(b => !doneIds.has(b.id));
  const name = (b: Brother) => b.id === me.selfId ? "you" : first(b.name);
  const LIST = 8;
  return (
    <div className="sp-sec">
      <p className="sp-lab">Everyone’s part</p>
      <div className="parts">
        <div className="ring" style={{ ["--p" as string]: pct }}><b>{doneN}<small>/{total}</small></b></div>
        <div>
          {detail ? (
            <>
              <div className="faces">
                {[...doneB, ...left].map(b => (
                  <span key={b.id} className={`face${doneIds.has(b.id) ? "" : " todo"}${b.id === me.selfId ? " me" : ""}`} title={`${b.name} · ${doneIds.has(b.id) ? "done" : "not yet"}`}>
                    <PAvatar id={b.id} name={b.name} url={b.avatarUrl} size="sm" />
                  </span>
                ))}
              </div>
              <p>{left.length
                ? <><b>{left.length} still to go:</b> {left.slice(0, LIST).map(name).join(", ")}{left.length > LIST ? ` and ${left.length - LIST} more` : ""}.</>
                : <b>Everyone’s done.</b>}</p>
            </>
          ) : <div className="faces wait" aria-hidden />}
        </div>
      </div>
    </div>
  );
}

function History({ task, detail, failed, nameOf }: { task: Task; detail: TaskDetail | null; failed: boolean; nameOf: (id: number | null) => string }) {
  const each = task.everyone === "each";
  const lines: Line[] = [];
  const events: TaskHistoryEntry[] = detail?.history ?? [];
  // Tasks moved over from the old Deadlines table have no create event.
  if (detail && !events.some(e => e.action === "task.created")) {
    lines.push({ at: new Date(task.createdAt), actorId: task.createdById, text: "assigned it", tone: "c" });
  }
  // A tick through PATCH {status} is logged as an update whose only field is
  // "status", with no completed/reopened event of its own. Status is binary, so
  // replaying the log in order says which way each flip went.
  let isDone = false;
  for (const e of events) {
    const at = new Date(e.at);
    if (e.action === "task.created") lines.push({ at, actorId: e.actorId, text: "assigned it", tone: "c" });
    else if (e.action === "task.completed") { if (!each) isDone = true; lines.push({ at, actorId: e.actorId, text: each ? "did their part" : "marked it done", tone: "d" }); }
    else if (e.action === "task.reopened") { if (!each) isDone = false; lines.push({ at, actorId: e.actorId, text: each ? "unticked their part" : "reopened it", tone: "r" }); }
    else if (e.action === "task.updated") {
      const fields = e.changedFields ?? [];
      if (fields.includes("status")) {
        isDone = !isDone;
        lines.push({ at, actorId: e.actorId, text: isDone ? "marked it done" : "reopened it", tone: isDone ? "d" : "r" });
      }
      const rest = fields.filter(f => f !== "status");
      if (rest.length || fields.length === 0) lines.push({ at, actorId: e.actorId, text: editedWhat(rest), tone: "e" });
    }
  }
  lines.sort((a, b) => b.at.getTime() - a.at.getTime());
  return (
    <div className="sp-sec">
      <details className="hist-d">
        <summary>History{detail ? ` · ${plural(lines.length, "entry", "entries")}` : ""}<Ic name="chev-d" /></summary>
        {failed && !detail
          ? <p className="hist-msg">Couldn’t load the history.</p>
          : !detail
            ? <p className="hist-msg">Loading…</p>
            : (
              <ol className="hist">
                {lines.map((l, i) => (
                  <li key={i} className={l.tone}>
                    <span><b>{nameOf(l.actorId)}</b> {l.text}</span>
                    <time dateTime={l.at.toISOString()}>{fmtDate(`${l.at.getFullYear()}-${String(l.at.getMonth() + 1).padStart(2, "0")}-${String(l.at.getDate()).padStart(2, "0")}`)} · {clock(l.at)}</time>
                  </li>
                ))}
              </ol>
            )}
      </details>
    </div>
  );
}
