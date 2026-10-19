"use client";

/**
 * Edit one charge: rename it, move its due date, change the note members see,
 * or take it back entirely.
 *
 * Taking back voids every live line and lowers each balance. The server refuses
 * (409) once anyone has paid toward it — that copy is shown verbatim, because
 * it says what to do instead (waive, or take people off one by one).
 *
 * The carried-over "Earlier balance" can be renamed but not taken back from
 * here: it's what members owed before the ledger existed, so wiping it in one
 * click would erase real debts with no record of why.
 */
import React, { useEffect, useRef, useState } from "react";
import type { DuesChargeSummary } from "@/lib/api-types/dues";
import { apiErrorMessage } from "../../../lib/api";
import { PaperIcon } from "../../paper/PaperIcon";
import { updateCharge, voidCharge } from "./dues-api";
import { money, plural } from "./dues-ui";

export function ChargeEditSheet({ charge, today, onClose, onSaved, onTakenBack }: {
  charge: DuesChargeSummary;
  today: string;
  onClose: () => void;
  onSaved: () => void;
  onTakenBack: () => void;
}) {
  const [name, setName]       = useState(charge.name);
  const [noDue, setNoDue]     = useState(charge.dueDate === null);
  const [dueDate, setDueDate] = useState(charge.dueDate ?? today);
  const [note, setNote]       = useState(charge.note ?? "");
  const [busy, setBusy]       = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const nextDue = noDue ? null : dueDate;
  const changes: { name?: string; dueDate?: string | null; note?: string | null } = {};
  if (name.trim() !== charge.name) changes.name = name.trim();
  if (nextDue !== charge.dueDate) changes.dueDate = nextDue;
  if ((note.trim() || null) !== charge.note) changes.note = note.trim() || null;
  const dirty = Object.keys(changes).length > 0;
  const valid = !!name.trim() && (noDue || /^\d{4}-\d{2}-\d{2}$/.test(dueDate));

  async function save() {
    if (!dirty || !valid) return;
    setBusy(true); setError(null);
    try { await updateCharge(charge.id, changes); onSaved(); }
    catch (e) { setError(apiErrorMessage(e, "Couldn't save that. Try again.")); setBusy(false); }
  }

  async function takeBack() {
    setBusy(true); setError(null);
    try { await voidCharge(charge.id); onTakenBack(); }
    catch (e) { setError(apiErrorMessage(e, "Couldn't take it back. Try again.")); setBusy(false); setConfirm(false); }
  }

  const carry = charge.audienceKind === "carryover";

  return (
    <>
      <div className="du-scrim" onClick={onClose} aria-hidden="true" />
      <section className="du-sheet du-sheet-sm" role="dialog" aria-modal="true" aria-label={`Edit ${charge.name}`}>
        <div className="du-sh-h">
          <span className="du-g"><PaperIcon name="pencil" /></span>
          <div><h3>Edit charge</h3><p>{charge.audienceLabel} · {plural(charge.people, "person", "people")} · {money(charge.total)} billed</p></div>
          <button type="button" className="du-x" onClick={onClose} aria-label="Close"><PaperIcon name="x" /></button>
        </div>
        <div className="du-form">
          <div className="du-fld du-mt0">
            <label htmlFor="du-ce-name" className="du-lb">Name</label>
            <input id="du-ce-name" ref={nameRef} className="du-txt" value={name} maxLength={60} onChange={e => setName(e.target.value)} />
          </div>
          <div className="du-fld">
            <span className="du-lb">Due date</span>
            <div className="du-dates">
              <div className="du-dt" aria-pressed={!noDue} role="button" tabIndex={0} onClick={() => setNoDue(false)} onKeyDown={e => { if (e.key === "Enter") setNoDue(false); }}>
                <b>Due on</b>
                <input type="date" value={dueDate} aria-label="Due date" onChange={e => { setDueDate(e.target.value); setNoDue(false); }} />
              </div>
              <button type="button" className="du-dt" aria-pressed={noDue} onClick={() => setNoDue(true)}><b>No due date</b><small>never late</small></button>
            </div>
            {!noDue && dueDate < today && charge.outstanding > 0 && <p className="du-hint">A date in the past makes everyone who still owes on this overdue.</p>}
          </div>
          <div className="du-fld">
            <label htmlFor="du-ce-note" className="du-lb">Note for members <span className="du-opt">(optional)</span></label>
            <textarea id="du-ce-note" className="du-txt" value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="Where to pay, a payment plan, who to ask" />
          </div>

          {error && <div className="du-err" role="alert">{error}</div>}

          <div className="du-ce-acts">
            <button type="button" className="du-btn" disabled={!dirty || !valid || busy} onClick={save}>Save changes</button>
            <button type="button" className="du-link" onClick={onClose}>Cancel</button>
          </div>

          <div className="du-danger">
            {carry ? (
              <p>This is what members owed before charges were tracked one by one. To clear some of it, open a member and waive it, so there’s a record of why.</p>
            ) : confirm ? (
              <>
                <p><b>Take back “{charge.name}”?</b> It comes off {plural(charge.people, "tab")} and {money(charge.outstanding)} stops being owed. Nothing hits the books.</p>
                <div className="du-r">
                  <button type="button" className="du-btn du-danger-btn" disabled={busy} onClick={takeBack}>Take it back</button>
                  <button type="button" className="du-link" onClick={() => setConfirm(false)}>Keep it</button>
                </div>
              </>
            ) : (
              <>
                <p>Billed the wrong people or the wrong amount? Take it back and hand it out again.</p>
                <button type="button" className="du-btn du-ghost du-danger-ghost" onClick={() => setConfirm(true)}><PaperIcon name="trash" />Take back this charge</button>
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
