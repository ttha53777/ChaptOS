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
import type { Brother, Task } from "../../../data";
import type { TaskDetail } from "@/lib/api-types";
import { requestJson } from "../../../lib/api";
import { Ic, PAvatar, burst } from "./PaperTasks";
import { DOW, MON, deskCal, first, forNames as forNamesOf, historyLines, historyStamp, longD, partsOf, plural, shortD, spotHead, andList, type Me } from "@/lib/tasks/list";

const FOCUSABLE = 'button:not([disabled]), [href], input, textarea, select, summary, [tabindex]:not([tabindex="-1"])';

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

  const { each, done, due, late, tone, finAt, chip, when: w } = spotHead(task, today, nameOf);

  // ── the sentence under the title ──
  let when: React.ReactNode;
  if (w.kind === "done") {
    when = <><b>{w.who}</b>{w.on ? <> on {w.on}</> : null}{w.rel}.</>;
  } else if (w.kind === "none") {
    when = <>No date. It waits at the bottom of <b>Upcoming</b> until someone gets to it.</>;
  } else if (w.kind === "late") {
    when = <>Was due <b>{w.day}</b>. <em>{w.ago}.</em></>;
  } else {
    when = <>Due <b>{w.day}</b>{w.tail}</>;
  }

  // ── who it's for ──
  const forNames = forNamesOf(task, me.selfId);
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
  const { a0, fin, big, cap, tone, cells: grid, spanText, monthLabel, foot } = deskCal(task, today, due, finAt, late);
  const cells: React.ReactNode[] = grid.map(c => c.kind === "gap"
    ? <span key={c.key} className="dc-gap"><span>{c.label}</span></span>
    : <span key={c.key} className={`dc ${c.cls.join(" ")}`}><i>{c.day}</i>{c.marks.map(m => m === "s"
        ? <span key="s" className="tag s">START</span>
        : m === "d" ? <span key="d" className="tag d">DUE</span>
        : <span key="f" className="tickm"><Ic name="check" /></span>)}</span>);

  return (
    <>
      <div className="sp-sec ends">
        <span className="end s"><i /><span><small>Start</small><b>{longD(a0)}</b></span></span>
        <span className="len"><span>{spanText}</span></span>
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
          <small>{foot}</small>
        </div>
      </div>
    </>
  );
}

/** Everyone · each: a ring of how much of the chapter is done, and every face. */
function Parts({ task, detail, brothers, me }: { task: Task; detail: TaskDetail | null; brothers: Brother[]; me: Me }) {
  const { doneN, total, pct, doneIds, faces, left, leftNames } = partsOf(task, detail, brothers, me.selfId);
  return (
    <div className="sp-sec">
      <p className="sp-lab">Everyone’s part</p>
      <div className="parts">
        <div className="ring" style={{ ["--p" as string]: pct }}><b>{doneN}<small>/{total}</small></b></div>
        <div>
          {detail ? (
            <>
              <div className="faces">
                {faces.map(b => (
                  <span key={b.id} className={`face${doneIds.has(b.id) ? "" : " todo"}${b.id === me.selfId ? " me" : ""}`} title={`${b.name} · ${doneIds.has(b.id) ? "done" : "not yet"}`}>
                    <PAvatar id={b.id} name={b.name} url={b.avatarUrl} size="sm" />
                  </span>
                ))}
              </div>
              <p>{left.length
                ? <><b>{left.length} still to go:</b> {leftNames}.</>
                : <b>Everyone’s done.</b>}</p>
            </>
          ) : <div className="faces wait" aria-hidden />}
        </div>
      </div>
    </div>
  );
}

function History({ task, detail, failed, nameOf }: { task: Task; detail: TaskDetail | null; failed: boolean; nameOf: (id: number | null) => string }) {
  const lines = historyLines(task, detail);
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
                    <time dateTime={l.at.toISOString()}>{historyStamp(l.at)}</time>
                  </li>
                ))}
              </ol>
            )}
      </details>
    </div>
  );
}
