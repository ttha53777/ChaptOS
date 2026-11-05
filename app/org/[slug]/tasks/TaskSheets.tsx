"use client";

/**
 * The New / Edit task and poll sheets — _design/Task Poll Forms Paper Mock.html,
 * on real data. Mounted inside the shared <Modal> by the Tasks page, and (task
 * only) by the dashboard's quick actions. The caller owns the request.
 *
 * Task: who is three picture tiles — People (faces), Roles (name tags),
 * Everyone. Everyone carries one switch: every member ticks their own
 * (everyone = "each") or one person does it for the chapter ("any"); the crowd
 * strip under it acts the rule out. "When" is a day row plus Any time / a time
 * picker. The footer previews the row as it will land on the list; the Tasks
 * page flies that preview into the pile on save (task-fly.ts).
 *
 * Poll: no audience to pick — every poll goes to the whole chapter and everyone
 * has to vote. An older targeted poll keeps its audience when edited.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { PAvatar, Ic, MON, isoOf, plusDays, dateOf, dFrom, first } from "./PaperTasks";
import { fmtDueTime, type PollFormInitial, type PollFormValue, type RoleOption, type TaskEveryoneMode, type TaskFormInitial, type TaskFormValue } from "./task-forms";
import { fmtDate, type Brother } from "../../../data";
import "./task-sheets.css";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CROWD_MAX = 12;

function names(xs: string[]): string {
  if (xs.length <= 2) return xs.join(" and ");
  return `${xs.slice(0, 2).join(", ")} and ${xs.length - 2} more`;
}

/** The roster as faces, capped so a big chapter still fits one strip. */
function Crowd({ people, kind, mode }: { people: Brother[]; kind: "task" | "poll"; mode: TaskEveryoneMode }) {
  const shown = people.length > CROWD_MAX ? people.slice(0, CROWD_MAX - 1) : people;
  const more = people.length - shown.length;
  return (
    <div className={`tsh-crowd ${kind} ${mode}`} aria-hidden>
      <div className="ppl">
        {shown.map((b, i) => (
          <span key={b.id} className="f" style={{ ["--i" as string]: i }}><PAvatar id={b.id} name={b.name} url={b.avatarUrl} size="sm" /><span className="t" /></span>
        ))}
        {more > 0 && <span className="f"><span className="ptk-av sm more">+{more}</span><span className="t" /></span>}
      </div>
      <span className="arrow"><Ic name="arrow-r" /></span>
      <span className="one"><span className="t">1</span><small>first one in</small></span>
    </div>
  );
}

type WhoMode = "people" | "roles" | "all";

// ── task sheet ───────────────────────────────────────────────────────────────
export function PaperTaskSheet({
  brothers, roles, selfId, today, minDate, maxDate, initial, editing, error, saving, onSubmit, onDelete, onCancel, peopleLoading,
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
  /** The request is in flight: hold the buttons. */
  saving?: boolean;
  onSubmit: (value: TaskFormValue) => void;
  onDelete?: () => void;
  onCancel: () => void;
  /** Opened before the roster loaded (the dashboard's quick actions). */
  peopleLoading?: boolean;
}) {
  const init = initial ?? { title: "", dueDate: "", dueTime: "", notes: "", brotherIds: [], roleIds: [], everyone: null };
  const inTerm = (iso: string) => (!minDate || iso >= minDate) && (!maxDate || iso <= maxDate);
  const QUICK = useMemo(() => [
    { key: "today", label: "Today", iso: isoOf(today) },
    { key: "tom", label: "Tomorrow", iso: isoOf(plusDays(today, 1)) },
    { key: "week", label: "Next week", iso: isoOf(plusDays(today, 7)) },
  ], [today]);

  const [title, setTitle] = useState(init.title);
  // An ISO date, or "" for no date. A new task starts on tomorrow when the term allows.
  const [due, setDue] = useState<string>(() => {
    if (editing) return init.dueDate;
    const tom = QUICK[1].iso;
    return inTerm(tom) ? tom : "";
  });
  const [picking, setPicking] = useState(!!init.dueDate && !QUICK.some(q => q.iso === init.dueDate));
  const [time, setTime] = useState(init.dueTime ?? "");
  const [mode, setMode] = useState<WhoMode>(init.everyone ? "all" : init.roleIds.length && !init.brotherIds.length ? "roles" : "people");
  const [brotherIds, setBrotherIds] = useState<number[]>(init.everyone ? [] : init.brotherIds);
  const [roleIds, setRoleIds] = useState<number[]>(init.everyone ? [] : init.roleIds);
  const [ev, setEv] = useState<TaskEveryoneMode>(init.everyone ?? "each");
  const [q, setQ] = useState("");
  const [notes, setNotes] = useState(init.notes);
  const [showNote, setShowNote] = useState(!!init.notes);
  const [local, setLocal] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const clockRef = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(brothers.map(b => [b.id, b])), [brothers]);
  const members = useMemo(() => [...brothers].sort((a, b) => (a.id === selfId ? -1 : b.id === selfId ? 1 : a.name.localeCompare(b.name))), [brothers, selfId]);
  const holders = (roleId: number) => brothers.filter(b => b.roles?.some(r => r.id === roleId));
  const nameOf = (id: number) => (id === selfId ? "You" : first(byId.get(id)?.name ?? "Someone"));
  const toggle = (list: number[], id: number) => list.includes(id) ? list.filter(x => x !== id) : [...list, id];

  // Who it reaches right now: picked people plus whoever holds a picked role.
  const reachIds = useMemo(() => {
    if (mode === "all") return brothers.map(b => b.id);
    const ids = new Set(brotherIds);
    for (const b of brothers) if (b.roles?.some(r => roleIds.includes(r.id))) ids.add(b.id);
    return [...ids];
  }, [mode, brothers, brotherIds, roleIds]);

  function submit() {
    let err: string | null = null;
    if (!title.trim()) err = "Say what needs doing.";
    else if (due && due !== init.dueDate && !inTerm(due)) err = "That date is outside this semester.";
    else if (mode !== "all" && brotherIds.length + roleIds.length === 0) err = mode === "roles" ? "Pick at least one role, or choose People or Everyone." : "Pick at least one person, or choose Roles or Everyone.";
    setLocal(err);
    if (err) { if (!title.trim()) titleRef.current?.focus(); return; }
    const all = mode === "all";
    onSubmit({
      title: title.trim(),
      dueDate: due,
      dueTime: due ? time : "",
      notes: notes.trim(),
      assigneeBrotherIds: all ? [] : brotherIds,
      assigneeRoleIds: all ? [] : roleIds,
      everyone: all ? ev : null,
    });
  }

  const pickDay = (iso: string) => { setDue(iso); setPicking(false); setLocal(null); };
  const dayKey = !due ? "none" : picking ? "pick" : QUICK.find(x => x.iso === due)?.key ?? "pick";
  const d = due ? dateOf(due) : null;
  const readback = d
    ? <>Due <b>{DOW[d.getDay()]}, {fmtDate(due)}</b>{time && <> at <b>{fmtDueTime(time)}</b></>}</>
    : <>No due date</>;

  const sub = (m: WhoMode) => m === "people" ? (brotherIds.length ? `${brotherIds.length} picked` : "Pick names")
    : m === "roles" ? (roleIds.length ? `${roleIds.length} role${roleIds.length === 1 ? "" : "s"}` : "By title")
    : `All ${brothers.length}`;
  const say = mode === "all"
    ? (ev === "each" ? <><b>{brothers.length}</b> people, each on their own</> : <>Any <b>one</b> of {brothers.length}</>)
    : reachIds.length ? <><b>{reachIds.length}</b> {reachIds.length === 1 ? "person" : "people"}</> : <>Nobody yet</>;

  // The row as it will land on the list.
  const prevWho = mode === "all"
    ? ev === "each"
      ? <><span className="tks-who all tsh-who each"><Ic name="people" />Everyone</span><span className="tsh-prog"><i />0 of {brothers.length}</span></>
      : <span className="tks-who all tsh-who any"><Ic name="hand" />Anyone · one tick</span>
    : reachIds.length
      ? <span className="tks-who tsh-who">
          {reachIds.slice(0, 3).map(id => { const b = byId.get(id); return b ? <PAvatar key={id} id={id} name={b.name} url={b.avatarUrl} size="xs" /> : null; })}
          {mode === "roles" && !brotherIds.length ? roles.filter(r => roleIds.includes(r.id)).map(r => r.name).join(", ") : names(reachIds.map(nameOf))}
        </span>
      : <span className="tks-who tsh-who none">Nobody yet</span>;
  const past = due ? dFrom(due, today) < 0 : false;
  const shown = local ?? error ?? null;
  const needle = q.trim().toLowerCase();
  const showB = members.filter(b => !needle || `${b.name} ${b.role ?? ""}`.toLowerCase().includes(needle));
  const nx = mode === "people" ? "16.6%" : mode === "roles" ? "50%" : "83.3%";
  const everyoneCopy = ev === "each"
    ? <><b>{brothers.length} separate ticks.</b> Each person ticks their own. It’s done when all {brothers.length} have. <span className="k">New members get it too.</span></>
    : <><b>One tick for the whole chapter.</b> Whoever gets to it first ticks it, and it’s off everyone’s list.</>;

  return (
    <form className="ptk-sheet tks-scope tks-sheet tsh" noValidate onSubmit={e => { e.preventDefault(); if (!saving) submit(); }}
      onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (!saving) submit(); } }}>
      <div className="mh">
        <span className="tile"><Ic name="box" /></span>
        <h2>{editing ? "Edit task" : "New task"}</h2>
      </div>
      <div className="mb">
        <div className="fld">
          <label htmlFor="tsh-title">What needs doing</label>
          <input id="tsh-title" ref={titleRef} className="inp big" value={title} autoFocus autoComplete="off" maxLength={200}
            placeholder="Book the room for chapter" onChange={e => { setTitle(e.target.value); setLocal(null); }} />
        </div>

        <div className="fld">
          <div className="tsh-h"><span className="lab">When it’s due</span><span className="say">{readback}</span></div>
          <div className="tsh-when">
            <i>Day</i>
            <div className="chips" role="group" aria-label="Due day">
              {QUICK.map(x => (
                <button key={x.key} type="button" aria-pressed={dayKey === x.key} disabled={!inTerm(x.iso)}
                  title={inTerm(x.iso) ? fmtDate(x.iso) : "Outside this semester"} onClick={() => pickDay(x.iso)}>{x.label}</button>
              ))}
              {dayKey === "pick" ? (
                <label className="tsh-pick on"><Ic name="cal" />
                  <input ref={dateRef} className="edt-bare" type="date" value={due} min={minDate} max={maxDate} aria-label="Due date"
                    onChange={e => { if (e.target.value) { setDue(e.target.value); setLocal(null); } }}
                    onClick={() => { try { dateRef.current?.showPicker(); } catch { /* not supported */ } }} />
                </label>
              ) : (
                <button type="button" aria-pressed={false} onClick={() => {
                  setPicking(true);
                  const two = isoOf(plusDays(today, 14));
                  setDue(due && !QUICK.some(x => x.iso === due) ? due : inTerm(two) ? two : maxDate ?? two);
                  setLocal(null);
                  window.setTimeout(() => { try { dateRef.current?.showPicker(); } catch { dateRef.current?.focus(); } }, 0);
                }}><Ic name="cal" />Pick a date</button>
              )}
              <button type="button" className="ghost" aria-pressed={dayKey === "none"} onClick={() => { setDue(""); setPicking(false); setTime(""); setLocal(null); }}>No date</button>
            </div>
            {due && <>
              <i>Time</i>
              <div className="chips" role="group" aria-label="Due time">
                <button type="button" aria-pressed={!time} onClick={() => setTime("")}>Any time</button>
                <label className={`tsh-pick${time ? " on" : ""}`}><Ic name="clock" />
                  <input ref={clockRef} className="edt-bare" type="time" step={900} value={time} aria-label="Due time"
                    onChange={e => setTime(e.target.value)}
                    onClick={() => { try { clockRef.current?.showPicker(); } catch { /* not supported */ } }} />
                </label>
              </div>
            </>}
          </div>
        </div>

        <div className="fld">
          <div className="tsh-h"><span className="lab">Who’s on it</span><span className="say">{say}</span></div>
          <div className="tsh-modes" role="radiogroup" aria-label="Who’s on it">
            <button type="button" className="mode" data-m="people" role="radio" aria-checked={mode === "people"} onClick={() => { setMode("people"); setLocal(null); }}>
              <span className="ok"><Ic name="check" /></span>
              <span className="pic pic-people">
                {members.filter(b => b.id !== selfId).slice(0, 2).map(b => <PAvatar key={b.id} id={b.id} name={b.name} url={b.avatarUrl} size="sm" />)}
              </span>
              <b>People</b><small>{sub("people")}</small>
            </button>
            <button type="button" className="mode" data-m="roles" role="radio" aria-checked={mode === "roles"} onClick={() => { setMode("roles"); setLocal(null); }}>
              <span className="ok"><Ic name="check" /></span>
              <span className="pic pic-roles">
                {(roles.length ? roles.slice(0, 2) : [{ id: -1, name: "Treasurer", color: null }, { id: -2, name: "Secretary", color: null }]).map((r, i) => (
                  <span key={r.id} className="tagmini" style={{ ["--tc" as string]: r.color ?? (i ? "var(--rose)" : "var(--mint)") }}>{r.name}</span>
                ))}
              </span>
              <b>Roles</b><small>{sub("roles")}</small>
            </button>
            <button type="button" className="mode" data-m="all" role="radio" aria-checked={mode === "all"} onClick={() => { setMode("all"); setLocal(null); }}>
              <span className="ok"><Ic name="check" /></span>
              <span className="pic pic-all">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ ["--av" as string]: `var(--pp-${["peach", "sky", "mint", "butter", "lilac", "rose"][i % 6]})` }} />)}</span>
              <b>Everyone</b><small>{sub("all")}</small>
            </button>
          </div>

          <div className="tsh-panel" key={mode} style={{ ["--nx" as string]: nx }}>
            {mode === "people" && (
              peopleLoading && brothers.length === 0
                ? <div className="tsh-faces" aria-busy="true">{[0, 1, 2, 3, 4, 5].map(i => <span key={i} className="face wait" />)}</div>
                : <>
                    {brothers.length > 8 && (
                      <div className="tsh-find"><Ic name="search" />
                        <input className="inp" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Find someone" aria-label="Find someone" autoComplete="off" />
                      </div>
                    )}
                    <div className="tsh-faces">
                      {showB.map(b => (
                        <button key={b.id} type="button" className="face" aria-pressed={brotherIds.includes(b.id)}
                          onClick={() => { setBrotherIds(ids => toggle(ids, b.id)); setLocal(null); }}>
                          <span className="av"><PAvatar id={b.id} name={b.name} url={b.avatarUrl} size="sm" /></span>
                          <span className="nm"><b>{b.id === selfId ? "You" : b.name}</b><small>{b.role || "Member"}</small></span>
                        </button>
                      ))}
                      {needle && showB.length === 0 && <p className="empty">No one called “{q.trim()}”.</p>}
                    </div>
                    <div className="tsh-tray">
                      {brotherIds.length ? <>
                        {brotherIds.map(id => { const b = byId.get(id); return b ? (
                          <span key={id} className="pk"><PAvatar id={id} name={b.name} url={b.avatarUrl} size="xs" />{nameOf(id)}
                            <button type="button" aria-label={`Remove ${b.name}`} onClick={() => setBrotherIds(ids => ids.filter(x => x !== id))}><Ic name="x" /></button>
                          </span>
                        ) : null; })}
                        {brotherIds.length > 1 && <button type="button" className="clr" onClick={() => setBrotherIds([])}>Clear</button>}
                      </> : <span className="none">Tap faces above to pick people.</span>}
                    </div>
                  </>
            )}
            {mode === "roles" && (
              roles.length === 0
                ? <p className="tsh-empty">This chapter has no roles yet. Pick People or Everyone instead.</p>
                : <>
                    <div className="tsh-tags">
                      {roles.map(r => {
                        const hs = holders(r.id);
                        return (
                          <button key={r.id} type="button" className="tag" aria-pressed={roleIds.includes(r.id)} style={{ ["--tc" as string]: r.color ?? "var(--mint)" }}
                            onClick={() => { setRoleIds(ids => toggle(ids, r.id)); setLocal(null); }} title={`Whoever holds ${r.name}, now and later`}>
                            <span className="ok"><Ic name="check" /></span><span className="sw" />
                            <b>{r.name}</b>
                            <span className="hold">
                              <span className="stk">{hs.slice(0, 4).map(b => <PAvatar key={b.id} id={b.id} name={b.name} url={b.avatarUrl} size="xs" />)}</span>
                              <small>{hs.length ? names(hs.map(b => nameOf(b.id))) : "Nobody holds it yet"}</small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="tsh-reach">
                      {roleIds.length
                        ? reachIds.length
                          ? <><span className="stk">{reachIds.slice(0, 8).map((id, i) => { const b = byId.get(id); return b ? <span key={id} style={{ animationDelay: `${i * 30}ms` }}><PAvatar id={id} name={b.name} url={b.avatarUrl} size="sm" /></span> : null; })}</span>
                              <span>Right now that’s <b>{reachIds.length} {reachIds.length === 1 ? "person" : "people"}</b>: {names(reachIds.map(nameOf))}</span></>
                          : <span>Nobody holds {roleIds.length === 1 ? "that role" : "those roles"} yet. It’ll reach whoever does.</span>
                        : <span className="none">Pick one or more roles. Everyone holding them gets it, now and later.</span>}
                    </div>
                  </>
            )}
            {mode === "all" && <>
              <div className="tsh-sw-row">
                <button type="button" className={`sw-lab${ev === "each" ? " on" : ""}`} onClick={() => setEv("each")}><Ic name="people" />Everyone does it</button>
                <button type="button" className="sw" role="switch" aria-checked={ev === "any"} aria-label="Just one person"
                  onClick={() => setEv(ev === "each" ? "any" : "each")}><i /></button>
                <button type="button" className={`sw-lab${ev === "any" ? " on" : ""}`} onClick={() => setEv("any")}><Ic name="hand" />Just one person</button>
              </div>
              <Crowd people={members} kind="task" mode={ev} />
              <p className="tsh-ev-say" aria-live="polite">{everyoneCopy}</p>
            </>}
          </div>
        </div>

        {showNote ? (
          <div className="fld">
            <div className="tsh-h"><label className="lab" htmlFor="tsh-note">Note <i>· optional</i></label>
              <button type="button" className="tsh-rm" onClick={() => { setNotes(""); setShowNote(false); }}>Remove</button></div>
            <textarea id="tsh-note" className="inp tsh-note edt-bare" rows={3} maxLength={2000} value={notes} autoFocus={!init.notes}
              placeholder="Links, details, what “done” looks like…" onChange={e => setNotes(e.target.value)} />
          </div>
        ) : (
          <button type="button" className="addnote" onClick={() => setShowNote(true)}><Ic name="plus" />Add a note</button>
        )}
      </div>

      {shown && <p className="err" role="alert">{shown}</p>}

      <div className="mf">
        <div className="tsh-land">
          <div className="lk">{editing ? "How it’ll look" : "How it’ll look on the list"}</div>
          <div className={`tsh-prow ${past ? "over" : "up"}`} data-task-preview>
            <span className="tc" />
            <span className="mid">
              <b className={title.trim() ? "" : "ph"}>{title.trim() || "Your task"}</b>
              <span className="meta">
                {prevWho}
                {due && time && <span className="tsh-at">by {fmtDueTime(time)}</span>}
                {notes.trim() && <span className="tsh-nt"><Ic name="doc" />Note</span>}
              </span>
            </span>
            {d ? <span className={`tks-stub${dFrom(due, today) === 0 ? " today" : ""}`} aria-hidden><small>{MON[d.getMonth()]}</small><b>{d.getDate()}</b></span>
              : <span className="tks-stub none" aria-hidden><small>ANY</small><b>—</b></span>}
          </div>
        </div>
        <div className="acts">
          {editing && onDelete && <button type="button" className="tks-btn soft danger" onClick={onDelete}><Ic name="trash" />Delete</button>}
          <button type="button" className="tks-btn soft" onClick={onCancel}>Cancel</button>
          <button type="submit" className="tks-btn" disabled={saving}>{saving ? "Saving…" : editing ? "Save" : "Add task"}</button>
        </div>
      </div>
    </form>
  );
}

// ── poll sheet ───────────────────────────────────────────────────────────────
type CloseKey = string | "none"; // an ISO date, or "none" (when I close it)

export function PaperPollSheet({
  brothers, selfId, today, minDate, maxDate, initial, editing, optionsLocked, error, saving, onSubmit, onCancel,
}: {
  brothers: Brother[];
  selfId: number | null;
  today: Date;
  minDate?: string;
  maxDate?: string;
  initial?: PollFormInitial;
  editing: boolean;
  optionsLocked: boolean;
  error?: string | null;
  saving?: boolean;
  onSubmit: (value: PollFormValue) => void;
  onCancel: () => void;
}) {
  const fri = (5 - today.getDay() + 7) % 7 || 7;
  const quick = [
    { label: "Tomorrow", iso: isoOf(plusDays(today, 1)) },
    { label: DAY_NAME[plusDays(today, fri).getDay()].slice(0, 3), iso: isoOf(plusDays(today, fri)) },
    { label: "Next week", iso: isoOf(plusDays(today, 7)) },
  ].filter((x, i, all) => all.findIndex(y => y.iso === x.iso) === i);
  const inTerm = (iso: string) => (!minDate || iso >= minDate) && (!maxDate || iso <= maxDate);
  const legacy = !!initial && !initial.everyone;

  const [question, setQuestion] = useState(initial?.question ?? "");
  const [opts, setOpts] = useState<string[]>(initial?.options.length ? initial.options : ["", ""]);
  const defaultClose = quick.find(x => x.label !== "Tomorrow" && inTerm(x.iso))?.iso ?? "none";
  const [close, setClose] = useState<CloseKey>(initial ? (initial.closeDate || "none") : defaultClose);
  const [picking, setPicking] = useState(!!initial?.closeDate && !quick.some(x => x.iso === initial.closeDate));
  const [local, setLocal] = useState<string | null>(null);
  const qRef = useRef<HTMLInputElement>(null);
  const optRefs = useRef<(HTMLInputElement | null)[]>([]);
  const focusNext = useRef<number | null>(null);
  const members = useMemo(() => [...brothers].sort((a, b) => (a.id === selfId ? -1 : b.id === selfId ? 1 : a.name.localeCompare(b.name))), [brothers, selfId]);

  useEffect(() => {
    if (focusNext.current == null) return;
    optRefs.current[focusNext.current]?.focus();
    focusNext.current = null;
  }, [opts.length]);

  const filled = opts.map(o => o.trim()).filter(Boolean);
  function setOpt(i: number, v: string) { setOpts(o => o.map((x, j) => j === i ? v : x)); setLocal(null); }
  function addOpt() { if (opts.length >= 10) return; focusNext.current = opts.length; setOpts(o => [...o, ""]); }
  function removeOpt(i: number) { setOpts(o => o.filter((_, j) => j !== i)); }

  function submit() {
    const lower = filled.map(l => l.toLowerCase());
    const closeIso = close !== "none" ? close : "";
    let err: string | null = null;
    if (!question.trim()) err = "Write the question.";
    else if (filled.length < 2) err = "Give at least two choices.";
    else if (lower.some((l, i) => lower.indexOf(l) !== i)) err = "Two choices say the same thing.";
    else if (closeIso && closeIso !== initial?.closeDate && !inTerm(closeIso)) err = "That date is outside this semester.";
    setLocal(err);
    if (err) { if (!question.trim()) qRef.current?.focus(); return; }
    onSubmit({ question: question.trim(), closeDate: closeIso, options: filled });
  }

  const shown = local ?? error ?? null;
  const n = brothers.length;
  const cd = close !== "none" ? dateOf(close) : null;

  return (
    <form className="ptk-sheet tks-scope tks-sheet tsh poll" noValidate onSubmit={e => { e.preventDefault(); if (!saving) submit(); }}
      onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (!saving) submit(); } }}>
      <div className="mh">
        <span className="tile"><Ic name="bars" /></span>
        <h2>{editing ? "Edit poll" : "New poll"}</h2>
      </div>
      <div className="mb">
        <div className="fld">
          <label htmlFor="tsh-q">What are you asking</label>
          <input id="tsh-q" ref={qRef} className="inp big" value={question} autoFocus autoComplete="off" maxLength={300}
            placeholder="Where should we hold spring formal?" onChange={e => { setQuestion(e.target.value); setLocal(null); }} />
        </div>

        <div className="fld">
          <span className="lab">The choices <i>· 2 to 10</i></span>
          {optionsLocked ? (
            <>
              <div className="popts">
                {opts.map((o, i) => <div key={i} className="popt two"><span className="bx" aria-hidden /><span className="inp locked">{o}</span></div>)}
              </div>
              <p className="hint"><Ic name="lock" />Votes are in, so the choices are locked.</p>
            </>
          ) : (
            <>
              <div className="popts">
                {opts.map((o, i) => (
                  <div key={i} className={`popt${opts.length > 2 ? "" : " two"}`}>
                    <span className="bx" aria-hidden />
                    <input ref={el => { optRefs.current[i] = el; }} className="inp" value={o} maxLength={120} autoComplete="off"
                      placeholder={`Choice ${i + 1}`} aria-label={`Choice ${i + 1}`}
                      onChange={e => setOpt(i, e.target.value)}
                      onKeyDown={e => {
                        if (e.key !== "Enter" || e.metaKey || e.ctrlKey) return;
                        e.preventDefault();
                        if (i === opts.length - 1) { if (o.trim() && opts.length < 10) addOpt(); }
                        else optRefs.current[i + 1]?.focus();
                      }} />
                    {opts.length > 2 && (
                      <button type="button" className="rm" onClick={() => removeOpt(i)} aria-label={`Remove choice ${i + 1}`}><Ic name="x" /></button>
                    )}
                  </div>
                ))}
              </div>
              {opts.length < 10 && <button type="button" className="addnote" onClick={addOpt}><Ic name="plus" />Add a choice</button>}
            </>
          )}
        </div>

        <div className="fld">
          <div className="tsh-h"><span className="lab">Who votes</span>
            <span className="say">{legacy ? <><b>{initial!.assigneeCount}</b> {initial!.assigneeCount === 1 ? "person" : "people"}</> : <>All <b>{n}</b> must vote</>}</span></div>
          <div className="tsh-panel solo">
            {legacy
              ? <p className="tsh-ev-say">This older poll goes to the {initial!.assigneeCount === 1 ? "person" : "people"} it was sent to. New polls go to the whole chapter.</p>
              : <>
                  <Crowd people={members} kind="poll" mode="each" />
                  <p className="tsh-ev-say"><b>The whole chapter votes.</b> All {n} ballots get collected. It sits on everyone’s plate until they vote, and anyone who joins later gets it too.</p>
                </>}
          </div>
        </div>

        <div className="fld">
          <span className="lab">When it closes</span>
          <div className="chips" role="group" aria-label="When it closes">
            {quick.map(x => (
              <button key={x.iso} type="button" aria-pressed={!picking && close === x.iso} disabled={!inTerm(x.iso)}
                title={inTerm(x.iso) ? fmtDate(x.iso) : "Outside this semester"}
                onClick={() => { setClose(x.iso); setPicking(false); setLocal(null); }}>
                {x.label} <small>{fmtDate(x.iso)}</small>
              </button>
            ))}
            {picking ? (
              <label className="tsh-pick on"><Ic name="cal" />
                <input className="edt-bare" type="date" value={close !== "none" ? close : ""} min={minDate} max={maxDate} aria-label="Close date"
                  onChange={e => { if (e.target.value) { setClose(e.target.value); setLocal(null); } }} />
              </label>
            ) : (
              <button type="button" aria-pressed={false} onClick={() => { setPicking(true); setClose(close !== "none" && !quick.some(x => x.iso === close) ? close : isoOf(plusDays(today, 14))); setLocal(null); }}>
                <Ic name="cal" />Pick a date
              </button>
            )}
            <button type="button" aria-pressed={close === "none"} onClick={() => { setClose("none"); setPicking(false); setLocal(null); }}>When I close it</button>
          </div>
        </div>
      </div>

      {shown && <p className="err" role="alert">{shown}</p>}

      <div className="mf">
        <div className="tsh-land">
          <div className="lk">How it’ll look in Votes</div>
          <div className="tsh-prow">
            <span className="tc bx" />
            <span className="mid">
              <b className={question.trim() ? "" : "ph"}>{question.trim() || "Your question"}</b>
              <span className="meta">
                {legacy
                  ? <span className="tks-who tsh-who">{initial!.assigneeCount} voters</span>
                  : <><span className="tks-who all tsh-who each"><Ic name="people" />Everyone votes</span><span className="tsh-prog"><i />0 of {n}</span></>}
                <span className="tsh-at">{filled.length} choice{filled.length === 1 ? "" : "s"}</span>
              </span>
            </span>
            {cd ? <span className="tks-stub lilac" aria-hidden><small>{MON[cd.getMonth()]}</small><b>{cd.getDate()}</b></span>
              : <span className="tks-stub none" aria-hidden><small>OPEN</small><b>—</b></span>}
          </div>
        </div>
        <div className="acts">
          <button type="button" className="tks-btn soft" onClick={onCancel}>Cancel</button>
          <button type="submit" className="tks-btn lilac" disabled={saving}>{saving ? "Saving…" : editing ? "Save" : "Open the vote"}</button>
        </div>
      </div>
    </form>
  );
}
