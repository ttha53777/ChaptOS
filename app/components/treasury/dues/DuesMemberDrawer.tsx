"use client";

/**
 * One member's tab, line by line (GET /api/dues/members/[id]): what they were
 * billed, what they paid, what was waived, and what's still open.
 *
 * A right-hand drawer on desktop and a bottom sheet on phones (paper-dues.css).
 * The same drawer for everyone; a treasurer (`manage`) also gets Record payment,
 * Waive some, Bill <name>, and Take off on each open charge.
 *
 * A payment is an ordinary Dues income transaction (it lands in the books); a
 * waiver moves no money and only lowers the tab. Both are capped at what the
 * member owes — the server refuses more with a 409 anyway.
 */
import React, { useEffect, useRef, useState } from "react";
import type { MemberDuesBook } from "@/lib/api-types/dues";
import type { PaymentMethod } from "@/lib/api-types";
import { apiErrorMessage, requestJson } from "../../../lib/api";
import { BrotherAvatar } from "../../BrotherAvatar";
import { PaperIcon } from "../../paper/PaperIcon";
import type { DuesPerson } from "./DuesTab";
import { STANDING, dueLine, fmtDay, money } from "./dues-ui";
import { parseDollars, recordPayment, voidLine, voidWaiver, waive } from "./dues-api";

/** What a write tells the tab: the toast to show (with an optional undo) and whether the books moved. */
export interface DuesWriteDone { msg: string; undo?: () => Promise<string>; tx?: boolean }

export interface DrawerManage {
  /** Open the Hand out sheet with just this person picked. */
  onBill: () => void;
  /** After any write: refresh the board, roster and (for a payment) the books, then toast. */
  onDone: (done: DuesWriteDone) => Promise<void>;
}

const METHODS: { k: PaymentMethod; l: string }[] = [
  { k: "venmo", l: "Venmo" }, { k: "zelle", l: "Zelle" }, { k: "cash", l: "Cash" }, { k: "card", l: "Card" },
];

export function DuesMemberDrawer({
  person, today, selfId, avatarRevision, onClose, manage, refreshKey = 0,
}: {
  person: DuesPerson;
  today: string;
  selfId: number | null;
  avatarRevision: number;
  onClose: () => void;
  /** Treasurer controls; absent for everyone else. */
  manage?: DrawerManage;
  /** Bump to re-fetch after a write. */
  refreshKey?: number;
}) {
  const [book, setBook]   = useState<MemberDuesBook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    requestJson<MemberDuesBook>(`/api/dues/members/${person.id}`)
      .then(b => { if (live) setBook(b); })
      .catch(e => { if (live) setError(apiErrorMessage(e, "Couldn't load this tab.")); });
    return () => { live = false; };
  }, [person.id, refreshKey]);

  // Escape closes; focus starts on the close button so keyboard users land inside.
  useEffect(() => { closeRef.current?.focus(); }, [person.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const s = book?.standing;
  const first = person.name.split(/\s+/)[0];

  // ── treasurer controls ──
  const [mode, setMode]       = useState<null | "pay" | "waive">(null);
  const [amt, setAmt]         = useState("");
  const [method, setMethod]   = useState<PaymentMethod>("venmo");
  const [reason, setReason]   = useState("");
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState<string | null>(null);
  const [takeOff, setTakeOff] = useState<number | null>(null);
  const amtRef = useRef<HTMLInputElement>(null);

  // A different person, or a refreshed book, closes any half-done form.
  useEffect(() => { setMode(null); setTakeOff(null); setErr(null); }, [person.id, refreshKey]);
  useEffect(() => { if (mode) { amtRef.current?.focus(); amtRef.current?.select(); } }, [mode]);

  function open(m: "pay" | "waive") {
    setMode(m); setErr(null); setReason("");
    setAmt(s ? String(s.owes) : "");
  }

  const owes = s?.owes ?? 0;
  const amount = parseDollars(amt);
  const tooMuch = amount > owes + 1e-9;

  async function submit() {
    if (!manage || !mode || !amount || tooMuch) return;
    setBusy(true); setErr(null);
    try {
      const left = Math.round((owes - amount) * 100) / 100;
      if (mode === "pay") {
        await recordPayment({ brotherId: person.id, name: person.name, amount, method, date: today });
        await manage.onDone({ msg: `${money(amount)} from ${first} posted to the books${left ? "" : " · all square"}`, tx: true });
      } else {
        const w = await waive({ brotherId: person.id, amount, reason: reason.trim() || null });
        await manage.onDone({
          msg: `${money(amount)} waived for ${first}${left ? "" : " · all square"}`,
          undo: async () => { await voidWaiver(w.waiverId); return `Waiver undone. ${first} owes ${money(owes)} again.`; },
        });
      }
    } catch (e) {
      setErr(apiErrorMessage(e, mode === "pay" ? "Couldn't record that payment. Nothing was posted." : "Couldn't waive that. Nothing changed."));
    } finally {
      setBusy(false);
    }
  }

  async function doTakeOff(chargeId: number, name: string) {
    if (!manage) return;
    setBusy(true); setErr(null);
    try {
      await voidLine(chargeId, person.id);
      await manage.onDone({ msg: `${first} taken off ${name}` });
    } catch (e) {
      setErr(apiErrorMessage(e, "Couldn't take them off that charge."));
      setTakeOff(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="du-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="du-drawer" role="dialog" aria-modal="true" aria-label={`${person.name}'s dues`}>
        <div className="du-dr-h">
          <BrotherAvatar brother={{ id: person.id, name: person.name, avatarUrl: person.avatarUrl }} selfId={selfId} avatarRevision={avatarRevision} size="md" className="du-av-lg" />
          <div><h3>{person.name}</h3><p>{person.title}</p></div>
          <button ref={closeRef} type="button" className="du-x" onClick={onClose} aria-label="Close"><PaperIcon name="x" /></button>
        </div>

        <div className="du-dr-b">
          {error && <div className="du-empty">{error}</div>}
          {!book && !error && <div className="tr-skel" style={{ height: 160, borderRadius: 18 }} />}

          {book && s && <>
            <div className="du-acct" data-s={s.standing}>
              <p className="du-k">On their tab</p>
              <div className="du-row1">
                <b>{s.owes ? money(s.owes) : s.billed ? "Square" : "—"}</b>
                <span className="du-stp" data-s={s.standing}>
                  {s.standing === "overdue" ? `${s.lateDays} days late` : s.standing === "due" ? (s.nextDueDate ? `Due ${fmtDay(s.nextDueDate)}` : "Owes") : STANDING[s.standing].chip}
                </span>
              </div>
              {s.billed > 0 && <>
                <div className="du-acct-bar"><i style={{ width: `${(s.paid / s.billed) * 100}%` }} /></div>
                <p className="du-acct-sub">{money(s.paid)} of {money(s.billed)} paid</p>
              </>}
              {manage && (
                <div className="du-acts">
                  <button type="button" disabled={!owes} aria-pressed={mode === "pay"} onClick={() => mode === "pay" ? setMode(null) : open("pay")}>
                    <span className="du-g" style={{ "--g": "var(--pp-mint)" } as React.CSSProperties}><PaperIcon name="wallet" /></span>Record payment
                  </button>
                  <button type="button" disabled={!owes} aria-pressed={mode === "waive"} onClick={() => mode === "waive" ? setMode(null) : open("waive")}>
                    <span className="du-g" style={{ "--g": "var(--pp-butter)" } as React.CSSProperties}><PaperIcon name="flag" /></span>Waive some
                  </button>
                  <button type="button" onClick={manage.onBill}>
                    <span className="du-g" style={{ "--g": "var(--pp-peach)" } as React.CSSProperties}><PaperIcon name="plus" /></span>Bill {first}
                  </button>
                </div>
              )}
              {manage && mode && owes > 0 && (
                <form className="du-inline" onSubmit={e => { e.preventDefault(); void submit(); }}>
                  <b>{mode === "pay" ? `Record what ${first} paid` : "Waive part of the tab"}</b>
                  <p>{mode === "pay" ? "Posts a Dues income row to the books and takes it off the tab." : "Lowers what they owe. No money moves, so nothing hits the books."}</p>
                  <div className="du-r">
                    <label className="du-money du-w130"><span>$</span><input ref={amtRef} inputMode="decimal" value={amt} onChange={e => setAmt(e.target.value)} aria-label="Amount" /></label>
                    {mode === "pay"
                      ? METHODS.map(m => <button key={m.k} type="button" className="du-sg" aria-pressed={method === m.k} onClick={() => setMethod(m.k)}>{m.l}</button>)
                      : <input className="du-txt du-why" value={reason} maxLength={200} onChange={e => setReason(e.target.value)} placeholder="Why? e.g. hardship, scholarship" aria-label="Reason" />}
                  </div>
                  {tooMuch && <p className="du-bad">{first} only owes {money(owes)}.</p>}
                  {err && <p className="du-bad" role="alert">{err}</p>}
                  <div className="du-r du-mt12">
                    <button type="submit" className="du-btn du-sm" disabled={busy || !amount || tooMuch}>{busy ? "Saving…" : mode === "pay" ? "Record payment" : "Waive it"}</button>
                    <button type="button" className="du-link" onClick={() => setMode(null)}>Cancel</button>
                  </div>
                </form>
              )}
              {manage && !mode && err && <p className="du-bad" role="alert">{err}</p>}
            </div>

            <p className="du-sec-t">Their dues, line by line</p>
            {book.entries.length ? (
              <div className="du-book">
                {book.entries.map(e => (
                  <div key={`${e.kind}-${e.refId}`} className="du-bk">
                    <span className="du-d">{fmtDay(e.date)}</span>
                    <span className="du-t"><b>{e.title}</b>{e.detail && <small>{e.detail}</small>}</span>
                    <span className={`du-a${e.amount < 0 ? " du-neg" : ""}`}>{e.amount < 0 ? `−${money(-e.amount)}` : `+${money(e.amount)}`}</span>
                  </div>
                ))}
                <div className="du-bk du-tot"><span /><span className="du-t">Still owes</span><span className="du-a">{money(s.owes)}</span></div>
              </div>
            ) : <div className="du-empty">Nothing billed to {first} yet.</div>}

            {book.open.length > 0 && <>
              <p className="du-sec-t">What’s still open</p>
              <div className="du-book">
                {book.open.map(o => (
                  <div key={o.chargeId} className={`du-bk${manage ? " du-bk-act" : ""}`}>
                    <span className="du-d">{o.dueDate ? fmtDay(o.dueDate) : "—"}</span>
                    <span className="du-t"><b>{o.name}</b><small>{dueLine(o.dueDate, today)}</small></span>
                    <span className="du-a">{money(o.rest)}</span>
                    {manage && (takeOff === o.chargeId ? (
                      <span className="du-off-q">
                        Take {first} off {o.name}?
                        <button type="button" className="du-link du-rose" disabled={busy} onClick={() => doTakeOff(o.chargeId, o.name)}>Take off</button>
                        <button type="button" className="du-link" onClick={() => setTakeOff(null)}>Keep</button>
                      </span>
                    ) : (
                      <button type="button" className="du-link du-off-b" onClick={() => setTakeOff(o.chargeId)} aria-label={`Take ${first} off ${o.name}`}>Take off</button>
                    ))}
                  </div>
                ))}
              </div>
            </>}
          </>}
        </div>
      </aside>
    </>
  );
}
