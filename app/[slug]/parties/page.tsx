"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useOrgPath } from "../../hooks/useOrgPath";
import { Sidebar } from "../../components/Sidebar";
import { Modal, FieldLabel, ConfirmDialog } from "../../components/dashboard/primitives";
import { inputDuskCls } from "../../components/dashboard/styles";
import { useChapter } from "../../context/ChapterContext";
import { PartyEvent, Brother, fmt$, fmtDate } from "../../data";
import { requestJson } from "../../lib/api";
import { todayStr, daysFromToday } from "../../lib/dates";
import { ScheduleFields, initialSchedule, scheduleFromValue, type ScheduleValue } from "../../components/timeline/ScheduleFields";
import { scheduleDate, type Schedule } from "@/lib/calendar-feed/schedule";
import { PaperIcon } from "../../components/paper/PaperIcon";
import "../../components/dashboard/dashboard-ledger.css";
import "./parties-ledger.css";

// ─── helpers ──────────────────────────────────────────────────────────────────

function profit(p: PartyEvent) { return p.doorRevenue - p.expenses; }
function needsWrapUp(p: PartyEvent) { return !p.completed && p.date < todayStr(); }
function isUpcoming(p: PartyEvent) { return !p.completed && p.date >= todayStr(); }

// "Open · All White · with KDF" — only the parts that exist.
function subLine(p: PartyEvent) {
  return [p.partyType, p.theme, p.collabOrg ? `with ${p.collabOrg}` : ""].filter(Boolean).join(" · ");
}

// ─── paper-look helpers ─────────────────────────────────────────────────────────

/** "9:00 PM" from the linked calendar entry, else its legacy free text. */
function partyTime(p: PartyEvent): string {
  const s = p.schedule;
  if (s && s.kind === "timed") {
    return new Date(s.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: s.timeZone });
  }
  return p.time ?? "";
}
const dow = (date: string) => new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
const monDay = (date: string) => new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
/** "+$1,240" / "−$80", whole dollars. */
function signed$(n: number) { return `${n >= 0 ? "+" : "−"}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`; }
function upcomingLabel(date: string) {
  const n = daysFromToday(date);
  return n <= 0 ? "Today" : n === 1 ? "Tomorrow" : n <= 7 ? `In ${n} days` : "Upcoming";
}
/** The seal on the wrap-up envelope: the org's initials. */
function orgInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => [...w][0]).join("").toUpperCase();
}

/** Open/Closed as the wristband you'd get at the door. */
function Wristband({ type }: { type: PartyEvent["partyType"] }) {
  return <span className={`pty-band${type === "Closed" ? " closed" : ""}`}>{type}</span>;
}

// ─── types ────────────────────────────────────────────────────────────────────

type ModalKind = "add" | "edit" | "wrap-up";

const ADD_FORM_EMPTY = {
  name: "", date: todayStr(), partyType: "Open" as "Open" | "Closed",
  theme: "", collabOrg: "",
};

// Door revenue + expenses + notes only — outside guest count is no longer tracked.
const WRAP_FORM_EMPTY = {
  doorRevenue: "", expenses: "", notes: "",
};

// What the wrap-up submit hands back: money fields plus (optionally) member roll.
type WrapUpSubmit = {
  doorRevenue: string;
  expenses: string;
  notes: string;
  attendedIds?: number[];
  mandatory?: boolean;
};

// The party's date comes from its schedule. A legacy free-text time is left as
// written (no schedule sent) until someone sets a real start and end.
type PartyWhen = { date: string; schedule?: Schedule };
function partyWhen(value: ScheduleValue): PartyWhen | { error: string } {
  const result = scheduleFromValue(value);
  if ("error" in result) return result;
  return result.schedule ? { date: scheduleDate(result.schedule), schedule: result.schedule } : { date: value.date };
}

const PARTY_TYPES: { v: "Open" | "Closed"; blurb: string }[] = [
  { v: "Open",   blurb: "Anyone with a wristband. Door money counts." },
  { v: "Closed", blurb: "Members and their plus-ones." },
];

// Ledger keeps the select; Paper picks the type off two wristband cards.
function PartyTypeField({ value, onChange }: { value: "Open" | "Closed"; onChange: (v: "Open" | "Closed") => void }) {
  return (
    <div className="cef-field pty-type-field">
      <label className="cef-label" htmlFor="party-type">Party type</label>
      <select id="party-type" className="cef-input lg-only" value={value} onChange={e => onChange(e.target.value as "Open" | "Closed")}>
        <option value="Open">Open</option>
        <option value="Closed">Closed</option>
      </select>
      <div className="pty-types pp-only" role="radiogroup" aria-label="Party type">
        {PARTY_TYPES.map(t => (
          <label key={t.v}>
            <input type="radio" name="party-type" value={t.v} checked={value === t.v} onChange={() => onChange(t.v)} />
            <span className="o"><Wristband type={t.v} />{t.blurb}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function PartyWhenField({ value, onChange, error }: { value: ScheduleValue; onChange: (v: ScheduleValue) => void; error: string }) {
  return (
    <div className="cef-field">
      <span className="cef-label">When</span>
      <ScheduleFields value={value} onChange={onChange} legacyReadOnly />
      {error && <p role="alert" className="cef-hint sched-warn">{error}</p>}
    </div>
  );
}

// ─── Add party form ───────────────────────────────────────────────────────────

function AddPartyForm({ onSubmit, onClose }: {
  onSubmit: (data: typeof ADD_FORM_EMPTY & PartyWhen) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(ADD_FORM_EMPTY);
  const [when, setWhen] = useState(() => initialSchedule(null, { date: ADD_FORM_EMPTY.date, isNew: true }));
  const [whenError, setWhenError] = useState("");
  const set = (k: keyof typeof ADD_FORM_EMPTY) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <form onSubmit={e => {
      e.preventDefault();
      const timing = partyWhen(when);
      if ("error" in timing) { setWhenError(timing.error); return; }
      onSubmit({ ...form, ...timing });
    }} className="cef-root cef">
      <div className="cef-field">
        <label className="cef-label" htmlFor="party-name">Party name</label>
        <input id="party-name" className="cef-input" required value={form.name} onChange={set("name")} placeholder="Spring Rush Social" />
      </div>
      <PartyWhenField value={when} onChange={setWhen} error={whenError} />
      <div className="pty-form-grid grid grid-cols-2 gap-3">
        <PartyTypeField value={form.partyType} onChange={partyType => setForm(f => ({ ...f, partyType }))} />
        <div className="cef-field">
          <label className="cef-label" htmlFor="party-theme">Theme<span className="opt">opt</span></label>
          <input id="party-theme" className="cef-input" value={form.theme} onChange={set("theme")} placeholder="All White, Black & Gold…" />
        </div>
        <div className="cef-field">
          <label className="cef-label" htmlFor="party-collab">Collab org<span className="opt">opt</span></label>
          <input id="party-collab" className="cef-input" value={form.collabOrg} onChange={set("collabOrg")} placeholder="KDF, DSP…" />
        </div>
      </div>
      <div className="pty-foot flex gap-2 justify-end pt-1">
        <span className="pty-fnote pp-only">Lands on the Timeline as a party.</span>
        <button type="button" onClick={onClose}
          className="ui-btn-ghost rounded-lg border border-[rgba(var(--ink-rgb),0.12)] bg-transparent px-4 py-2 text-[13px] font-medium text-[color:var(--ink-soft)] hover:bg-[rgba(var(--ink-rgb),0.04)] transition-colors">
          Cancel
        </button>
        <button type="submit"
          className="rounded-lg bg-[color:var(--vio-deep)] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#6d28d9] transition-colors">
          Add Party
        </button>
      </div>
    </form>
  );
}

// ─── Edit party form ──────────────────────────────────────────────────────────

function EditPartyForm({ party, onSubmit, onClose }: {
  party: PartyEvent;
  onSubmit: (data: Partial<PartyEvent>) => void;
  onClose: () => void;
}) {
  const [name,      setName]      = useState(party.name);
  const [when,      setWhen]      = useState(() => initialSchedule(party.schedule, { date: party.date, time: party.time, isNew: false }));
  const [whenError, setWhenError] = useState("");
  const [partyType, setPartyType] = useState<"Open" | "Closed">(party.partyType);
  const [theme,     setTheme]     = useState(party.theme);
  const [collabOrg, setCollabOrg] = useState(party.collabOrg);

  return (
    <form onSubmit={e => {
      e.preventDefault();
      const timing = partyWhen(when);
      if ("error" in timing) { setWhenError(timing.error); return; }
      onSubmit({ name, ...timing, partyType, theme, collabOrg });
    }} className="cef-root cef">
      <div className="cef-field">
        <label className="cef-label" htmlFor="party-name">Party name</label>
        <input id="party-name" className="cef-input" required value={name} onChange={e => setName(e.target.value)} />
      </div>
      <PartyWhenField value={when} onChange={setWhen} error={whenError} />
      <div className="pty-form-grid grid grid-cols-2 gap-3">
        <PartyTypeField value={partyType} onChange={setPartyType} />
        <div className="cef-field">
          <label className="cef-label" htmlFor="party-theme">Theme<span className="opt">opt</span></label>
          <input id="party-theme" className="cef-input" value={theme} onChange={e => setTheme(e.target.value)} placeholder="All White…" />
        </div>
        <div className="cef-field">
          <label className="cef-label" htmlFor="party-collab">Collab org<span className="opt">opt</span></label>
          <input id="party-collab" className="cef-input" value={collabOrg} onChange={e => setCollabOrg(e.target.value)} placeholder="KDF, DSP…" />
        </div>
      </div>
      <div className="pty-foot flex gap-2 justify-end pt-1">
        <span className="pty-fnote pp-only">Changes carry to its Timeline entry.</span>
        <button type="button" onClick={onClose}
          className="ui-btn-ghost rounded-lg border border-[rgba(var(--ink-rgb),0.12)] bg-transparent px-4 py-2 text-[13px] font-medium text-[color:var(--ink-soft)] hover:bg-[rgba(var(--ink-rgb),0.04)] transition-colors">
          Cancel
        </button>
        <button type="submit"
          className="rounded-lg bg-[color:var(--vio-deep)] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#6d28d9] transition-colors">
          Save Changes
        </button>
      </div>
    </form>
  );
}

// ─── Wrap-up form (two steps: money → roll) ───────────────────────────────────
// Step 2 (roster + mandatory toggle) is skipped entirely when the party already
// has attendance logged — then submitting step 1 just saves the money.

function WrapUpForm({ party, brothers, alreadyRolled, onSubmit, onClose }: {
  party: PartyEvent;
  brothers: Brother[];
  alreadyRolled: boolean;
  onSubmit: (data: WrapUpSubmit) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState(WRAP_FORM_EMPTY);
  // Roster defaults to ALL PRESENT — tap to un-check no-shows.
  const [present, setPresent] = useState<Set<number>>(() => new Set(brothers.map(b => b.id)));
  const [mandatory, setMandatory] = useState(party.mandatory ?? false);
  const [find, setFind] = useState("");

  const set = (k: keyof typeof WRAP_FORM_EMPTY) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));
  const togglePresent = (id: number) =>
    setPresent(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // A search hides rows; it never drops them — everyone still ticked still submits.
  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    return q ? brothers.filter(b => b.name.toLowerCase().includes(q)) : brothers;
  }, [brothers, find]);
  // All / None act on the rows in view, so "find Sam → None" unticks just Sam.
  function markShown(on: boolean) {
    setPresent(prev => { const n = new Set(prev); for (const b of shown) on ? n.add(b.id) : n.delete(b.id); return n; });
  }

  const profitPreview = (Number(form.doorRevenue) || 0) - (Number(form.expenses) || 0);
  const canTakeRoll = brothers.length > 0 && !alreadyRolled;

  function submitMoneyOnly() { onSubmit(form); }
  function submitWithRoll()  { onSubmit({ ...form, attendedIds: [...present], mandatory }); }

  const ghostCls = "ui-btn-ghost rounded-lg border border-[rgba(var(--ink-rgb),0.12)] bg-transparent px-4 py-2 text-[13px] font-medium text-[color:var(--ink-soft)] hover:bg-[rgba(var(--ink-rgb),0.04)] transition-colors";
  const primaryCls = "rounded-lg bg-[color:var(--vio-deep)] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#6d28d9] transition-colors";

  return (
    <div className="pty-wrap space-y-3">
      <div className="pty-wrap-head rounded-lg bg-[rgba(var(--ink-rgb),0.04)] px-4 py-3 mb-1 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[color:var(--ink)]">{party.name}</p>
          <p className="text-[11px] text-[color:var(--muted)] mt-0.5">{fmtDate(party.date)} · {subLine(party)}</p>
        </div>
        {canTakeRoll && (
          <div className="pty-steps flex gap-1.5 shrink-0" aria-label={`Step ${step} of 2`}>
            <span className={`h-1.5 w-1.5 rounded-full ${step === 1 ? "on bg-[color:var(--vio)]" : "bg-[color:var(--faint)]"}`} />
            <span className={`h-1.5 w-1.5 rounded-full ${step === 2 ? "on bg-[color:var(--vio)]" : "bg-[color:var(--faint)]"}`} />
          </div>
        )}
      </div>

      {step === 1 && (
        <form onSubmit={e => { e.preventDefault(); canTakeRoll ? setStep(2) : submitMoneyOnly(); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel tone="dusk">Door Revenue ($) *</FieldLabel>
              <div className="pty-amt"><input type="number" min="0" step="0.01" inputMode="decimal" className={inputDuskCls} required autoFocus value={form.doorRevenue} onChange={set("doorRevenue")} placeholder="0.00" /></div>
            </div>
            <div>
              <FieldLabel tone="dusk">Expenses ($) *</FieldLabel>
              <div className="pty-amt"><input type="number" min="0" step="0.01" inputMode="decimal" className={inputDuskCls} required value={form.expenses} onChange={set("expenses")} placeholder="0.00" /></div>
            </div>
          </div>
          <div className="pty-pv rounded-lg bg-[rgba(var(--ink-rgb),0.04)] px-3 py-2.5 text-center">
            <p className="text-[10px] text-[color:var(--faint)] mb-0.5">Net preview</p>
            <p className={`text-[18px] font-bold tabular-nums ${profitPreview >= 0 ? "text-[color:var(--ok)]" : "neg text-[color:var(--rose)]"}`}>
              <span className="lg-only">{fmt$(profitPreview)}</span><span className="pp-only">{signed$(profitPreview)}</span>
            </p>
          </div>
          <div>
            <FieldLabel tone="dusk">Post-event notes</FieldLabel>
            <textarea className={`${inputDuskCls} resize-none`} rows={2} value={form.notes} onChange={set("notes")} placeholder="How did it go?" />
          </div>
          <div className="pty-foot flex gap-2 justify-end pt-1">
            <span className="pty-fnote pp-only">{canTakeRoll ? "Next you’ll tick off who came." : "The roll’s already in — this just saves the money."}</span>
            <button type="button" onClick={onClose} className={ghostCls}>Cancel</button>
            <button type="submit" className={primaryCls}>
              {canTakeRoll ? "Next: Who came? →" : "Mark Completed"}
            </button>
          </div>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={e => { e.preventDefault(); submitWithRoll(); }} className="space-y-3">
          <div className="pty-rh flex items-center justify-between">
            <FieldLabel tone="dusk">Who came? ({present.size}/{brothers.length})</FieldLabel>
            <div className="sp flex gap-2">
              <button type="button" onClick={() => markShown(true)}
                className="text-[10px] uppercase tracking-wider text-[color:var(--muted)] hover:text-[color:var(--ink)]">All</button>
              <button type="button" onClick={() => markShown(false)}
                className="text-[10px] uppercase tracking-wider text-[color:var(--muted)] hover:text-[color:var(--ink)]">None</button>
            </div>
          </div>
          {brothers.length > 8 && (
            <input type="search" className={`${inputDuskCls} pty-find`} value={find} onChange={e => setFind(e.target.value)}
              placeholder="Find a member…" aria-label="Find a member" autoComplete="off" />
          )}
          <div className="pty-rl max-h-[220px] overflow-y-auto rounded-lg border border-[rgba(var(--ink-rgb),0.08)] divide-y divide-[rgba(var(--ink-rgb),0.05)]">
            {shown.map(b => {
              const on = present.has(b.id);
              return (
                <button type="button" key={b.id} onClick={() => togglePresent(b.id)} aria-pressed={on}
                  className={`pty-ri${on ? " on" : ""} flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[rgba(var(--ink-rgb),0.03)] transition-colors`}>
                  <span className={`bx flex h-4 w-4 items-center justify-center rounded border ${on ? "border-[color:var(--ok)] bg-[color:var(--ok)]/20" : "border-[rgba(var(--ink-rgb),0.18)]"}`}>
                    {on && <svg className="h-3 w-3 text-[color:var(--ok)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M20 6L9 17l-5-5" /></svg>}
                  </span>
                  <span className={`nm text-[13px] ${on ? "text-[color:var(--ink)]" : "text-[color:var(--muted)]"}`}>{b.name}</span>
                </button>
              );
            })}
            {shown.length === 0 && <p className="pty-rl-none px-3 py-3 text-[12px] text-[color:var(--muted)]">Nobody by that name.</p>}
          </div>
          <label className="pty-req flex items-center gap-2.5 rounded-lg bg-[rgba(var(--ink-rgb),0.03)] px-3 py-2.5 cursor-pointer">
            <input type="checkbox" checked={mandatory} onChange={e => setMandatory(e.target.checked)}
              className="h-4 w-4 accent-[color:var(--vio)]" />
            <span className="text-[12px] text-[color:var(--ink-soft)]"><b className="pp-only">Mandatory</b><span className="lg-only">Mandatory</span> — count this toward each brother&rsquo;s attendance %</span>
          </label>
          <div className="pty-foot flex gap-2 justify-end pt-1">
            <span className="pty-fnote pp-only">Everyone starts ticked — untick the no-shows.</span>
            <button type="button" onClick={() => setStep(1)} className={ghostCls}>← Back</button>
            <button type="submit" className={primaryCls}>Mark Completed</button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Ledger row ───────────────────────────────────────────────────────────────

type Roll = { present: number; eligible: number };

function LedgerRow({ party, orgName, attendance, expanded, onToggle, onWrapUp, onEdit, onDelete, onOpenTimeline, canParties }: {
  party: PartyEvent;
  orgName: string;
  attendance?: Roll;
  expanded: boolean;
  onToggle: () => void;
  onWrapUp: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenTimeline: () => void;
  canParties: boolean;
}) {
  const p = profit(party);
  const due = needsWrapUp(party);
  const upcoming = isUpcoming(party);
  const day = Number(party.date.split("-")[2]);
  const time = partyTime(party);
  const attPct = attendance && attendance.eligible > 0
    ? Math.round((attendance.present / attendance.eligible) * 100)
    : null;

  return (
    <div className={`pty-row${expanded ? " open" : ""}${upcoming ? " future" : ""}${due ? " due" : ""}`} data-id={party.id}>
      <button type="button" className="lead" onClick={onToggle} aria-expanded={expanded}>
        <div className="led-date">
          <div className="dnum">{day}</div>
          <div className="mon">{new Date(party.date + "T12:00:00").toLocaleString("en-US", { month: "short" })}</div>
        </div>
        <div className="led-main">
          <div className="t">
            <span className={`vdot${due ? " due" : upcoming ? " open" : ""}`} />
            <span className="nm">{party.name}</span>
          </div>
          <div className="sub lg-only">{subLine(party)}</div>
          <div className="sline pp-only">
            <Wristband type={party.partyType} />
            {party.theme && <span>{party.theme}</span>}
            {party.collabOrg && <span className="x">with {party.collabOrg}</span>}
            <span className="x">{dow(party.date)}{time && ` · ${time}`}</span>
          </div>
        </div>
      </button>

      <div className="led-state">
        {party.completed ? (
          <div className={`net ${p >= 0 ? "pos" : "neg"}`}>
            <div className={`nv ${p >= 0 ? "pos" : "neg"}`}>
              <span className="lg-only">{p >= 0 ? "+" : ""}{fmt$(p)}</span><span className="pp-only">{signed$(p)}</span>
            </div>
            <div className="nk">net</div>
          </div>
        ) : due && canParties ? (
          <button type="button" className="pty-badge wrap" onClick={onWrapUp}>Wrap up →</button>
        ) : due ? (
          <span className="pty-badge wrap" style={{ cursor: "default" }}>Needs wrap-up</span>
        ) : (
          <span className="pty-badge up"><span className="lg-only">Upcoming</span><span className="pp-only">{upcomingLabel(party.date)}</span></span>
        )}
        <span className="chev" onClick={onToggle} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 6l6 6-6 6" /></svg>
        </span>
      </div>

      <div className="drawer">
        <div className="drawer-inner lg-only">
          {party.completed && <>
            <div className="dstat"><div className="dk">Door</div><div className="dv">{fmt$(party.doorRevenue)}</div></div>
            <div className="dstat"><div className="dk">Spent</div><div className="dv">{fmt$(party.expenses)}</div></div>
            <div className="dstat"><div className="dk">Net</div><div className="dv">{p >= 0 ? "+" : ""}{fmt$(p)}</div></div>
          </>}
          {attendance && attendance.eligible > 0 && (
            <div className="dstat"><div className="dk">Attendance</div><div className="dv">{attendance.present}/{attendance.eligible} · {attPct}%</div></div>
          )}
          {party.theme &&     <div className="dstat"><div className="dk">Theme</div><div className="dv">{party.theme}</div></div>}
          {party.collabOrg && <div className="dstat"><div className="dk">Collab</div><div className="dv">{party.collabOrg}</div></div>}
          <div className="dnote">
            {party.notes
              ? `“${party.notes}”`
              : upcoming ? "Numbers open until it's wrapped up."
              : due ? "Happened already — no figures recorded yet."
              : "No notes."}
          </div>
          {party.attendanceEventId != null && (
            <div className="dactions">
              <button type="button" className="mini" onClick={onOpenTimeline}>Open in Timeline →</button>
            </div>
          )}
          {canParties && (
            <div className="dactions">
              {due && <button type="button" className="mini" onClick={onWrapUp}>Wrap up</button>}
              <button type="button" className="mini" onClick={onEdit}>Edit</button>
              <button type="button" className="mini danger" onClick={onDelete}>Delete</button>
            </div>
          )}
        </div>

        {/* Paper: the night's till receipt beside its notes, facts and roll call. */}
        {expanded && (
          <div className="pty-dr pp-only">
            <div className="pty-rw">
              <div className="pty-rc">
                <p className="hd">{orgName} · the house<b>{party.name}</b>{dow(party.date)} {monDay(party.date)}{time && ` · ${time}`}</p>
                <hr />
                {party.completed ? <>
                  <p className="ln"><span>Door</span><span>{fmt$(party.doorRevenue)}</span></p>
                  <p className="ln"><span>Spent</span><span>−{fmt$(party.expenses)}</span></p>
                  <hr />
                  <p className={`ln tot${p < 0 ? " neg" : ""}`}><span>Net</span><span>{p >= 0 ? "+" : "−"}{fmt$(Math.abs(p))}</span></p>
                </> : <>
                  <p className={`open${due ? " due" : ""}`}>{due ? "NO FIGURES" : "TAB OPEN"}</p>
                  <p className="sm">{due ? "Happened already — no figures recorded yet." : "Numbers open until it’s wrapped up."}</p>
                </>}
                {attendance && attendance.eligible > 0 && <>
                  <hr />
                  <p className="ln"><span>Members</span><span>{attendance.present}/{attendance.eligible} · {attPct}%</span></p>
                </>}
                {party.attendance > 0 && <p className="ln"><span>Thru door</span><span>{party.attendance}</span></p>}
                <p className="ft">{party.completed ? "*** CLOSED OUT ***" : "*** OPEN TAB ***"}</p>
              </div>
            </div>
            <div className="pty-side">
              <p className={`pty-note${party.notes ? " q" : " quiet"}`}>
                {party.notes || (upcoming ? "Numbers open until it’s wrapped up." : due ? "Happened already — no figures recorded yet." : "No notes.")}
              </p>
              <div className="pty-facts">
                <Wristband type={party.partyType} />
                {party.theme && <span><PaperIcon name="star" />{party.theme}</span>}
                {party.collabOrg && <span><PaperIcon name="people" />with {party.collabOrg}</span>}
                {party.mandatory && <span><PaperIcon name="check" />Mandatory — counts toward attendance</span>}
              </div>
              {attendance && attendance.eligible > 0 && (
                <div className="pty-roll">
                  <p className="pty-k">Who came<b>{attendance.present} of {attendance.eligible}</b></p>
                  <div className="pty-dots" aria-hidden="true">
                    {Array.from({ length: attendance.eligible }, (_, i) => <i key={i} className={i < attendance.present ? "p" : ""} />)}
                  </div>
                </div>
              )}
              <div className="pty-acts">
                {due && canParties && <button type="button" className="pb" onClick={onWrapUp}><PaperIcon name="check" />Wrap up</button>}
                {party.attendanceEventId != null && <button type="button" className="pb soft" onClick={onOpenTimeline}><PaperIcon name="timeline" />Open in Timeline</button>}
                {canParties && <button type="button" className="pb soft" onClick={onEdit}><PaperIcon name="pencil" />Edit</button>}
                {canParties && <button type="button" className="pb del" onClick={onDelete}><PaperIcon name="trash" />Delete</button>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type AttendanceRow = { partyId: number; present: number; eligible: number };

export default function PartiesPage() {
  const router = useRouter();
  const orgPath = useOrgPath();
  const searchParams = useSearchParams();
  const deepLinkedId = searchParams.get("open");
  const openedLink = useRef<string | null>(null);
  const { currentUser, partyList, setPartyList, brotherList, isLoading, can } = useChapter();
  const canParties = can("MANAGE_PARTIES");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedId,  setExpandedId]  = useState<number | null>(null);
  const [modal,       setModal]       = useState<ModalKind | null>(null);
  const [editingId,   setEditingId]   = useState<number | null>(null);
  const [wrapUpId,    setWrapUpId]    = useState<number | null>(null);
  const [pageError,      setPageError]      = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => {
    if (isLoading || !deepLinkedId || openedLink.current === deepLinkedId) return;
    const party = partyList.find(p => String(p.id) === deepLinkedId);
    if (!party) return;
    openedLink.current = deepLinkedId;
    setExpandedId(party.id);
    requestAnimationFrame(() => {
      document.querySelector(`[data-id="${party.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [deepLinkedId, partyList, isLoading]);

  // Per-party member roll, fetched separately so the parties list shape stays put.
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const loadAttendance = useCallback(() => {
    requestJson<AttendanceRow[]>("/api/parties/attendance-summary")
      .then(setAttendanceRows)
      .catch(() => { /* summary is best-effort; metric falls back to "—" */ });
  }, []);
  useEffect(() => { loadAttendance(); }, [loadAttendance]);

  // ── persistence helper ────────────────────────────────────────────────────────
  const persist = useCallback((
    promise: Promise<unknown>,
    errMsg: string,
    rollback: () => void,
    onSuccess?: (r: unknown) => void,
  ) => {
    promise
      .then(r => { setPageError(null); onSuccess?.(r); })
      .catch(() => { setPageError(errMsg); rollback(); });
  }, []);

  // ── derived lists (all from partyList, newest first) ───────────────────────────
  const sorted = useMemo(
    () => [...partyList].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id),
    [partyList],
  );

  const wrapUpParty = useMemo(() => partyList.find(p => p.id === wrapUpId)  ?? null, [partyList, wrapUpId]);
  const editParty   = useMemo(() => partyList.find(p => p.id === editingId) ?? null, [partyList, editingId]);

  // ── takings summary (completed parties only) ───────────────────────────────────
  const completed   = useMemo(() => partyList.filter(p => p.completed), [partyList]);
  const totalRevenue  = useMemo(() => completed.reduce((s, p) => s + p.doorRevenue, 0), [completed]);
  const totalExpenses = useMemo(() => completed.reduce((s, p) => s + p.expenses,    0), [completed]);
  const totalNet      = totalRevenue - totalExpenses;
  const keptPct       = totalRevenue > 0 ? Math.round((totalNet / totalRevenue) * 100) : 0;
  const bestParty     = useMemo(() => {
    if (!completed.length) return null;
    return completed.reduce((a, b) => profit(b) > profit(a) ? b : a);
  }, [completed]);

  // ── avg member attendance across parties that have roll logged ─────────────────
  // partyAttendance maps partyId → { present, eligible } from the summary endpoint.
  // Empty until a party is rolled → avgAttendance is null and the metric renders "—".
  const partyAttendance = useMemo<Record<number, { present: number; eligible: number }>>(() => {
    const m: Record<number, { present: number; eligible: number }> = {};
    for (const r of attendanceRows) m[r.partyId] = { present: r.present, eligible: r.eligible };
    return m;
  }, [attendanceRows]);
  const rolledCount = useMemo(() => Object.values(partyAttendance).filter(a => a.eligible > 0).length, [partyAttendance]);
  const avgAttendance = useMemo(() => {
    const rolled = Object.values(partyAttendance).filter(a => a.eligible > 0);
    if (rolled.length === 0) return null;
    const sum = rolled.reduce((s, a) => s + a.present / a.eligible, 0);
    return Math.round((sum / rolled.length) * 100);
  }, [partyAttendance]);

  // Paper's night-by-night strip: closed parties oldest → newest, bars scaled to the biggest swing.
  const chron = useMemo(() => [...completed].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id), [completed]);
  const maxSwing = useMemo(() => Math.max(1, ...chron.map(p => Math.abs(profit(p)))), [chron]);
  function jumpTo(id: number) {
    setExpandedId(id);
    requestAnimationFrame(() => {
      document.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  // ── needs-wrap-up (past, not completed) — the one task ─────────────────────────
  const needWrap = useMemo(
    () => partyList.filter(needsWrapUp).sort((a, b) => a.date.localeCompare(b.date)), // most overdue first
    [partyList],
  );
  const heroParty = needWrap[0] ?? null;

  const orgName = currentUser?.org?.name ?? "ChaptOS";

  // ── mutations ─────────────────────────────────────────────────────────────────

  function handleAdd(form: typeof ADD_FORM_EMPTY & PartyWhen) {
    const tempId = Date.now();
    const entry: PartyEvent = {
      id: tempId, name: form.name, date: form.date, schedule: form.schedule ?? null, partyType: form.partyType,
      theme: form.theme, collabOrg: form.collabOrg,
      doorRevenue: 0, attendance: 0, expenses: 0, notes: "",
      completed: false, completedAt: null,
    };
    setPartyList(prev => [...prev, entry]);
    setModal(null);
    setExpandedId(tempId);
    persist(
      requestJson<PartyEvent>("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, date: form.date, schedule: form.schedule, partyType: form.partyType, theme: form.theme, collabOrg: form.collabOrg }),
      }),
      "Could not save party. Changes reverted.",
      () => { setPartyList(prev => prev.filter(p => p.id !== tempId)); setExpandedId(null); },
      saved => {
        const s = saved as PartyEvent;
        setPartyList(prev => prev.map(p => p.id === tempId ? s : p));
        setExpandedId(s.id);
      },
    );
  }

  function handleEdit(updates: Partial<PartyEvent>) {
    if (!editingId) return;
    const prev = partyList.find(p => p.id === editingId);
    setPartyList(list => list.map(p => p.id === editingId ? { ...p, ...updates } : p));
    setModal(null);
    setEditingId(null);
    persist(
      requestJson<PartyEvent>(`/api/parties/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }),
      "Could not save changes. Changes reverted.",
      () => { if (prev) setPartyList(list => list.map(p => p.id === editingId ? prev : p)); },
    );
  }

  function handleWrapUp(form: WrapUpSubmit) {
    if (!wrapUpId) return;
    const id = wrapUpId;
    if (id > 1_000_000_000) {
      setPageError("Party is still saving. Wait a moment, then try again.");
      return;
    }
    const prev = partyList.find(p => p.id === id);
    // Optimistic money/completed; roll persists server-side and is reflected after refetch.
    const optimistic = {
      doorRevenue: Number(form.doorRevenue) || 0,
      expenses:    Number(form.expenses)    || 0,
      notes:       form.notes,
      completed:   true,
    };
    setPartyList(list => list.map(p => p.id === id
      ? { ...p, ...optimistic, completedAt: new Date().toISOString() }
      : p
    ));
    setModal(null);
    setWrapUpId(null);
    persist(
      requestJson<PartyEvent>(`/api/parties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wrapUp:      true,
          doorRevenue: Number(form.doorRevenue) || 0,
          expenses:    Number(form.expenses)    || 0,
          notes:       form.notes,
          ...(form.attendedIds !== undefined ? { attendedIds: form.attendedIds, mandatory: !!form.mandatory } : {}),
        }),
      }),
      "Could not mark party completed. Changes reverted.",
      () => { if (prev) setPartyList(list => list.map(p => p.id === id ? prev : p)); },
      saved => { setPartyList(list => list.map(p => p.id === id ? saved as PartyEvent : p)); loadAttendance(); },
    );
  }

  function handleDelete(id: number) {
    const prev = partyList.find(p => p.id === id);
    setPartyList(list => list.filter(p => p.id !== id));
    if (expandedId === id) setExpandedId(null);
    persist(
      requestJson<void>(`/api/parties/${id}`, { method: "DELETE" }),
      "Could not delete party. Changes reverted.",
      () => { if (prev) setPartyList(list => [...list, prev].sort((a, b) => a.id - b.id)); },
    );
  }

  function openWrapUp(id: number) { setWrapUpId(id); setModal("wrap-up"); }
  function openEdit(id: number)   { setEditingId(id); setModal("edit"); }
  function closeModal() { setModal(null); setEditingId(null); setWrapUpId(null); }

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden bg-[color:var(--paper)]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="Parties" onNavClick={() => {}} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* ── Toolbar (mobile hamburger + breadcrumb) ── */}
        <header className="toolbar-frosted dash-toolbar pty-toolbar-bar relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-[rgba(var(--ink-rgb),0.05)] px-4 sm:px-6 lg:hidden">
          <button onClick={() => setSidebarOpen(true)}
            className="tb-icon-btn flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--muted)] hover:bg-[rgba(var(--ink-rgb),0.07)] lg:hidden"
            aria-label="Open menu">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="pty-crumb truncate">Parties</span>
        </header>

        {/* ── Scrollable dusk ledger pane ── */}
        <main className="page-ambient flex-1 overflow-y-auto">
          <div className="dash dash-parties" data-dashboard-theme="dusk">

            {pageError && (
              <div className="pty-toast" role="status">
                <span>{pageError}</span>
                <button onClick={() => setPageError(null)} aria-label="Dismiss">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* ── Briefing ── */}
            <section className="pty-briefing" aria-label="Parties">
              <div>
                <p className="kicker">
                  <span className="today">
                    <span className="lg-only">{new Date(todayStr() + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
                    <span className="pp-only">{dow(todayStr())} · {monDay(todayStr())}</span>
                  </span>
                  <span className="lg-only">&ensp;·&ensp;</span>Parties&ensp;·&ensp;{orgName}
                </p>
                <h1>The <em>house</em> ledger.</h1>
                {!isLoading && <p className="sub">
                  {completed.length > 0
                    ? <>{completed.length} {completed.length === 1 ? "party" : "parties"} closed out and the books are <b>{totalNet >= 0 ? "net positive" : "in the red"}</b>.</>
                    : "No parties closed out yet."}
                  {needWrap.length > 0
                    ? ` ${needWrap.length} ${needWrap.length === 1 ? "party is" : "parties are"} still waiting on numbers — close ${needWrap.length === 1 ? "it" : "them"} out and you're square.`
                    : " Everything's accounted for."}
                </p>}
              </div>
              <div className="pty-actions">
                {canParties && (
                  <button className="pty-add" onClick={() => setModal("add")}>
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    Add party
                  </button>
                )}
                <button
                  className="pty-ask pp-only"
                  onClick={() => window.dispatchEvent(new CustomEvent("chapt:ask", { detail: { q: "What did the door clear this semester?" } }))}
                >
                  <PaperIcon name="spark" />Ask what the door cleared<kbd>⌘K</kbd>
                </button>
              </div>
            </section>

            {isLoading ? (
              <>
                <div className="pty-skel glance" />
                <div className="pty-sec" style={{ marginTop: 32 }}><h2>Every party</h2><span className="rule" /></div>
                <div className="pty-skel">
                  {[...Array(5)].map((_, i) => (
                    <div className="ln" key={i}><span className="bar w1" /><span className="bar w2" /></div>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* ── 1 · The one task ── */}
                {heroParty && canParties && (
                  <div className="pty-needs">
                    <svg className="flap pp-only" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0 L50 34 L100 0" /></svg>
                    <span className="seal pp-only" aria-hidden="true">{orgInitials(orgName)}</span>
                    <div className="nd-icon">
                      <svg className="lg-only" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></svg>
                      <PaperIcon name="clock" className="pp-ic pp-only" />
                    </div>
                    <div className="nd-body">
                      <div className="nd-tag">Needs wrap-up · {Math.max(0, -daysFromToday(heroParty.date))} {-daysFromToday(heroParty.date) === 1 ? "day" : "days"} ago</div>
                      <div className="nd-title">{heroParty.name}</div>
                      <div className="nd-meta">{subLine(heroParty)} · <b><span className="pp-only">{dow(heroParty.date)}, </span>{fmtDate(heroParty.date)}</b> — add the door &amp; expenses so the semester totals are right.</div>
                      {needWrap.length > 1 && <div className="nd-more">+{needWrap.length - 1} more waiting below</div>}
                    </div>
                    <button className="pty-do" onClick={() => openWrapUp(heroParty.id)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      Close it out
                    </button>
                  </div>
                )}

                {/* ── 2 · Did we net money ── */}
                {completed.length > 0 && (
                  <div className="pty-takings">
                    <div className="head-num">
                      <div className="k">Net this semester</div>
                      <div className={`v${totalNet >= 0 ? "" : " neg"}`}>
                        <span className="lg-only">{totalNet >= 0 ? "+" : ""}{fmt$(totalNet)}</span><span className="pp-only">{signed$(totalNet)}</span>
                      </div>
                      <div className="note">across {completed.length} closed {completed.length === 1 ? "party" : "parties"}</div>
                    </div>
                    <div className="vrule" />
                    <div className="breakdown">
                      <div className="bd"><div className="k">Door taken</div><div className="v">{fmt$(totalRevenue)}</div><div className="sub">gross revenue</div></div>
                      <div className="bd"><div className="k">Spent</div><div className="v">{fmt$(totalExpenses)}</div><div className="sub">kept {keptPct}%</div></div>
                      <div className="bd"><div className="k">Avg attendance</div><div className="v">{avgAttendance !== null ? `${avgAttendance}%` : "—"}</div><div className="sub">
                        <span className="lg-only">{avgAttendance !== null ? "of chapter" : "no roll yet"}</span>
                        <span className="pp-only">{avgAttendance !== null ? `of members, ${rolledCount} rolled` : "no roll taken yet"}</span>
                      </div></div>
                      <div className="bd best"><div className="k">Best night</div><div className="v">
                        <span className="lg-only">{bestParty ? `+${fmt$(profit(bestParty))}` : "—"}</span>
                        <span className="pp-only">{bestParty ? signed$(profit(bestParty)) : "—"}</span>
                      </div><div className="sub">{bestParty?.name ?? "none yet"}</div></div>
                    </div>
                    <div className="pty-strip pp-only">
                      <div className="hh"><p className="pty-k">Night by night</p><small>net per closed party — tap one to open it</small></div>
                      <div className="bars">
                        {chron.map(p => {
                          const n = profit(p);
                          const h = Math.max(6, Math.round(Math.abs(n) / maxSwing * 100));
                          return (
                            <button type="button" key={p.id} className={`bar ${n >= 0 ? "pos" : "neg"}`} onClick={() => jumpTo(p.id)} title={`${p.name} · ${signed$(n)}`}>
                              <b>{signed$(n)}</b>
                              <span className="up">{n >= 0 && <i style={{ "--h": `${h}%` } as React.CSSProperties} />}</span>
                              <span className="dn">{n < 0 && <i style={{ "--h": `${h}%` } as React.CSSProperties} />}</span>
                              <small>{p.name}</small>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── 3 · The ledger ── */}
                <div className="pty-sec">
                  <h2>Every party</h2>
                  <span className="rule" />
                  <span className="cnt">{sorted.length} total · newest first</span>
                </div>

                {sorted.length === 0 ? (
                  <div className="pty-empty">
                    <div className="pty-empty-copy">
                      <div className="ic lg-only">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                      </div>
                      <div className="t">No parties yet<span className="pp-only">.</span></div>
                      <div className="h lg-only">{canParties ? "Add your first party to start tracking the books." : "Nothing here yet."}</div>
                      <div className="h pp-only">{canParties
                        ? "Add your first party to start tracking the books — after the night, close it out with the door and what you spent, and the semester’s net keeps itself."
                        : "Nothing here yet. Once an officer adds a party, it lands in this book."}</div>
                      {canParties && (
                        <button className="pty-add pp-only" onClick={() => setModal("add")}>
                          <PaperIcon name="plus" />Add party
                        </button>
                      )}
                    </div>
                    <div className="pty-blank pp-only" aria-hidden="true"><span style={{ left: 14 }}>Date</span><span style={{ left: 68 }}>Party</span><span style={{ right: 16 }}>Net</span></div>
                  </div>
                ) : (
                  <div className="pty-ledger">
                    <div className="pty-cols pp-only" aria-hidden="true"><span>Date</span><span>Party</span><span>Net</span><span /></div>
                    {sorted.map(p => (
                      <LedgerRow
                        key={p.id}
                        party={p}
                        orgName={orgName}
                        attendance={partyAttendance[p.id]}
                        expanded={expandedId === p.id}
                        onToggle={() => setExpandedId(id => id === p.id ? null : p.id)}
                        onWrapUp={() => openWrapUp(p.id)}
                        onEdit={() => openEdit(p.id)}
                        onDelete={() => setConfirmDeleteId(p.id)}
                        onOpenTimeline={() => router.push(orgPath(`/timeline?event=${p.attendanceEventId}`))}
                        canParties={canParties}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

          </div>
        </main>
      </div>

      {/* modals */}
      {modal === "add" && (
        <Modal title="Add Party" onClose={closeModal} tone="dusk" icon="note" accent="rose">
          <AddPartyForm onSubmit={handleAdd} onClose={closeModal} />
        </Modal>
      )}
      {modal === "edit" && editParty && (
        <Modal title="Edit Party" onClose={closeModal} tone="dusk" icon="note" accent="rose">
          <EditPartyForm party={editParty} onSubmit={handleEdit} onClose={closeModal} />
        </Modal>
      )}
      {modal === "wrap-up" && wrapUpParty && (
        <Modal title="Mark Completed" onClose={closeModal} tone="dusk" icon="receipt" accent="rose">
          <WrapUpForm
            party={wrapUpParty}
            brothers={brotherList}
            alreadyRolled={partyAttendance[wrapUpParty.id] !== undefined}
            onSubmit={handleWrapUp}
            onClose={closeModal}
          />
        </Modal>
      )}
      {confirmDeleteId !== null && (() => {
        const party = partyList.find(p => p.id === confirmDeleteId);
        return party ? (
          <ConfirmDialog
            title="Delete Party"
            message={<>Delete <span className="font-semibold text-[color:var(--ink)]">{party.name}</span>? Its timeline entry, financial totals, attendance records, and excuses will also be removed. This cannot be undone.</>}
            onCancel={() => setConfirmDeleteId(null)}
            onConfirm={() => { handleDelete(confirmDeleteId); setConfirmDeleteId(null); }}
            tone="dusk"
          />
        ) : null;
      })()}
    </div>
  );
}
