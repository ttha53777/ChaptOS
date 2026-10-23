"use client";

import { useEffect, useRef, useState } from "react";
import { PaperIcon } from "../../components/paper/PaperIcon";
import { requestJson } from "../../lib/api";
import { FUNDRAISER_KINDS, kindOf } from "@/lib/fundraisers";
import type { Fundraiser } from "@/lib/api-types/fundraisers";
import { dow3, errorText } from "./parts";

const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The taped composer from the mock. Name it (the name guesses the kind, which
 *  picks the suggested shopping list), a day, optional time / place / goal. A
 *  modal <dialog>: top layer, so no transformed ancestor can trap it. */
export function NewFundraiserDialog({ defaultDate, editing, onClose, onSaved }: {
  defaultDate: string;
  /** Present = edit this one (PATCH) instead of creating. */
  editing?: Fundraiser;
  onClose: () => void; onSaved: (f: Fundraiser) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(editing?.name ?? ""), [date, setDate] = useState(editing?.date ?? defaultDate);
  const [t0, setT0] = useState(editing?.startTime ?? ""), [t1, setT1] = useState(editing?.endTime ?? "");
  const [place, setPlace] = useState(editing?.place ?? ""), [goal, setGoal] = useState(editing?.goal ? String(editing.goal) : "");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [flip, setFlip] = useState(0);

  useEffect(() => {
    const dialog = ref.current!; dialog.showModal();
    dialog.querySelector<HTMLInputElement>(".fz-nf-name")?.focus();
    return () => dialog.close();
  }, []);

  const nm = name.trim(), k = kindOf(nm), K = FUNDRAISER_KINDS[k];
  const d = date ? date.split("-").map(Number) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nm || !date || busy) return;
    setBusy(true); setError(null);
    try {
      const goalN = Number(goal.replace(/[^0-9.]/g, ""));
      const saved = await requestJson<Fundraiser>(editing ? `/api/fundraisers/${editing.id}` : "/api/fundraisers", {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nm, date, place: place.trim() || null, goal: goalN > 0 ? goalN : null,
          startTime: t0 || null, endTime: t0 && t1 ? t1 : null,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      onSaved(saved);
    } catch (err) {
      setError(errorText(err, editing ? "Couldn’t save. Try again." : "Couldn’t create the fundraiser. Try again."));
      setBusy(false);
    }
  }

  return <dialog ref={ref} className="fz-scope fz-dialog" aria-labelledby="fz-nf-title"
    onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}
    onClick={e => {
      if (e.target !== e.currentTarget || busy) return;
      const r = e.currentTarget.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
    }}>
    <form onSubmit={submit} autoComplete="off">
      <button type="button" className="fz-iconbtn fz-nf-x" aria-label="Close" disabled={busy} onClick={onClose}><PaperIcon name="x" /></button>
      <header className="fz-nf-h">
        <div>
          <p className="fz-nf-eb">{editing ? "Edit fundraiser" : "New fundraiser"}</p>
          <input id="fz-nf-title" className="fz-nf-name" placeholder="Name it" aria-label="Name" required maxLength={120} value={name} onChange={e => setName(e.target.value)} />
          <p className="fz-nf-kind" aria-live="polite">
            {!nm ? "Say what it is (“bake sale”, “car wash”) and we’ll suggest the supplies."
              : k === "other" ? "We’ll start you with a blank shopping list."
              : <><span className={`fz-chip fz-t-${K.hue}`}><PaperIcon name={K.icon} />{K.label}</span> We’ll suggest {K.suggestions.slice(0, 3).map(x => x[0].toLowerCase()).join(", ")}…</>}
          </p>
        </div>
        <span key={flip} className={`fz-cal fz-nf-cal${flip ? " flip" : ""}`} aria-hidden="true">
          {d ? <><small>{MON3[d[1] - 1]}</small><b>{d[2]}</b><i>{dow3(date)}</i></> : <><small>Day</small><b>?</b><i>&nbsp;</i></>}
        </span>
      </header>
      <div className="fz-nf-rows">
        <label className="fz-nf-row"><span className="fz-tile fz-t-sky"><PaperIcon name="cal" /></span><span className="fz-nf-l">Day</span>
          <span className="fz-nf-c"><input className="fz-nf-in" type="date" required value={date} onChange={e => { setDate(e.target.value); setFlip(n => n + 1); }} /></span></label>
        <div className={`fz-nf-row${t0 ? " has-start" : ""}`}><span className="fz-tile fz-t-lilac"><PaperIcon name="clock" /></span><span className="fz-nf-l">Time<small>optional</small></span>
          <span className="fz-nf-c">
            <input className="fz-nf-in fz-nf-tm" type="time" aria-label="Starts" value={t0} onChange={e => { setT0(e.target.value); if (!e.target.value) setT1(""); }} />
            <span className="fz-nf-end"><i>to</i><input className="fz-nf-in fz-nf-tm" type="time" aria-label="Ends" disabled={!t0} value={t1} onChange={e => setT1(e.target.value)} /></span>
          </span></div>
        <label className="fz-nf-row"><span className="fz-tile fz-t-mint"><PaperIcon name="pin" /></span><span className="fz-nf-l">Where<small>optional</small></span>
          <span className="fz-nf-c"><input className="fz-nf-in" placeholder="Add a place" maxLength={200} value={place} onChange={e => setPlace(e.target.value)} /></span></label>
        <label className="fz-nf-row"><span className="fz-tile fz-t-butter"><PaperIcon name="flag" /></span><span className="fz-nf-l">Goal<small>optional</small></span>
          <span className="fz-nf-c fz-nf-amt"><input className="fz-nf-in" inputMode="decimal" placeholder="No goal" value={goal} onChange={e => setGoal(e.target.value)} /></span></label>
      </div>
      {error && <p className="fz-nf-err" role="alert">{error}</p>}
      <div className="fz-nf-f">
        <span className="note">{editing ? "Name, day, time and place also show on the Timeline." : "You can change any of this later."}</span>
        <button type="button" className="fz-btn soft" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="fz-btn" disabled={busy || !nm || !date} style={{ ["--hs" as string]: "var(--butter)" }}><PaperIcon name="arrow-r" />{editing ? (busy ? "Saving…" : "Save") : busy ? "Creating…" : "Start the shopping list"}</button>
      </div>
    </form>
  </dialog>;
}
