"use client";
// Hand over a seat. Pick a role, pick who was elected, and everything that
// belongs to the role (what it can do and its open tasks) moves to them in one
// go. The old holder stays on the roster as a member.
import { useEffect, useRef, useState } from "react";
import { WindowBar } from "./chrome";
import { INCOMING, P, SEATS, first, initials, type Who } from "./handoff-data";

const Av = ({ who, sm }: { who: Who; sm?: boolean }) =>
  <span className={`ho-av${sm ? " sm" : ""}`} style={{ ["--t" as string]: P[who].tone }}>{initials(P[who].name)}</span>;

export function SeatHandoff() {
  const [holders, setHolders] = useState<Record<string, Who>>(() => Object.fromEntries(SEATS.map(s => [s.id, s.holder])));
  const [pick, setPick] = useState(SEATS[1].id);
  const [moving, setMoving] = useState<{ seat: string; from: Who; to: Who; n: number } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const seat = SEATS.find(s => s.id === pick)!;
  const holder = holders[seat.id];
  const handed = SEATS.filter(s => holders[s.id] !== s.holder).length;
  const allNew = handed === SEATS.length;
  const lines = seat.can.length + seat.tasks.length;
  const busy = !!moving && moving.n < lines;

  function hand(to: Who) {
    if (busy || to === holder) return;
    timers.current.forEach(clearTimeout); timers.current = [];
    setMoving({ seat: seat.id, from: holder, to, n: 0 });
    setHolders(h => ({ ...h, [seat.id]: to }));
    for (let i = 1; i <= lines; i++) {
      timers.current.push(setTimeout(() => setMoving(m => m && { ...m, n: i }), 160 + i * 130));
    }
  }
  function reset() {
    timers.current.forEach(clearTimeout); timers.current = [];
    setHolders(Object.fromEntries(SEATS.map(s => [s.id, s.holder])));
    setMoving(null);
  }

  // Each line of the seat's contents shows who it belongs to; while a handoff
  // plays, lines tick over to the new holder one by one.
  const m = moving?.seat === seat.id ? moving : null;
  let idx = 0;
  const owner = () => {
    idx += 1;
    if (!m) return { who: holder, flip: false };
    return idx <= m.n ? { who: m.to, flip: idx === m.n } : { who: m.from, flip: false };
  };
  const tag = (o: { who: Who; flip: boolean }) =>
    <span className={`to${o.flip ? " flip" : ""}`}><Av who={o.who} sm />{first(P[o.who].name)}</span>;

  return <div className="bld bld-win ho-seats">
    <WindowBar path="settings › roles" />
    <div className="ho-seats-grid">
      <div className="ho-board">
        <div className="hd">
          <b>Officers</b>
          <span className={`yr${allNew ? " new" : ""}`}>{allNew ? "2026–27 board" : handed ? `${handed} of 4 handed over` : "2025–26 board"}</span>
        </div>
        <ul>
          {SEATS.map(s => {
            const h = holders[s.id], changed = h !== s.holder;
            return (
              <li key={s.id}>
                <button type="button" className={`ho-seat${pick === s.id ? " on" : ""}${changed ? " changed" : ""}`} style={{ ["--c" as string]: s.c }} onClick={() => setPick(s.id)}>
                  <span className="role">{s.role}</span>
                  <span className="who" key={h}><Av who={h} sm />{P[h].name}</span>
                  {changed && <span className="new">new</span>}
                </button>
              </li>
            );
          })}
        </ul>
        {allNew
          ? <div className="ho-board-f"><span className="ho-stamp" aria-hidden>Handed over<small>2026–27</small></span><button type="button" className="tld-btn ghost sm" onClick={reset}>Seat the old board</button></div>
          : <p className="ho-board-f hint">The old board stays on the roster as members. Only the seats change hands.</p>}
      </div>

      <div className="ho-seat-d" style={{ ["--c" as string]: seat.c }}>
        <div className="hd">
          <span className="role">{seat.role}</span>
          <span className="holder" key={holder}><Av who={holder} />{P[holder].name}{holder !== seat.holder && <em>since today</em>}</span>
        </div>

        <div className="hand">
          <span className="kick">Hand this seat to</span>
          <div className="cands">
            {INCOMING[seat.id].map(w => (
              <button key={w} type="button" className={`cand${holder === w ? " on" : ""}`} onClick={() => hand(w)} disabled={busy}>
                <Av who={w} sm />{P[w].name}
              </button>
            ))}
            {holder !== seat.holder && !busy && (
              <button type="button" className="cand undo" onClick={() => hand(seat.holder)}>Undo</button>
            )}
          </div>
        </div>

        <div className="comes">
          <h5>What it can do</h5>
          <ul>{seat.can.map(c => <li key={c}><span className="ck">✓</span><span className="t">{c}</span>{tag(owner())}</li>)}</ul>
          <h5>Open tasks <span>{seat.tasks.length}</span></h5>
          <ul>{seat.tasks.map(t => <li key={t.t}><span className="bx" /><span className="t">{t.t}<small>{t.due}</small></span>{tag(owner())}</li>)}</ul>
        </div>
        <p className="ho-foot">
          {m && !busy
            ? <><b>{first(P[m.to].name)}</b> has the {seat.role.toLowerCase()}'s access and open tasks. {first(P[m.from].name)} keeps a member's.</>
            : <>No passwords to pass on. Assigned to the role, so they move with it.</>}
        </p>
      </div>
    </div>
  </div>;
}
