"use client";
// The attendance card from the minutes margin, with the roll open: tap a name
// to move it between present, excused and absent. An optional meeting takes no
// roll at all, as in the app (recordAttendance requires a mandatory meeting).
import { useState } from "react";
import { ROLL } from "./roster";
import { WindowBar } from "./chrome";

type Mark = "present" | "excused" | "absent";
const NEXT: Record<Mark, Mark> = { present: "excused", excused: "absent", absent: "present" };
const initial = (): Mark[] => ROLL.map((_, i) => i < 44 ? "present" : i < 47 ? "excused" : "absent");

export function RollCall() {
  const [marks, setMarks] = useState<Mark[]>(initial);
  const [required, setRequired] = useState(true);
  const count = (m: Mark) => marks.filter(x => x === m).length;
  const [p, e, a] = [count("present"), count("excused"), count("absent")];
  const pct = (n: number) => `${(n / ROLL.length) * 100}%`;
  const expected = ROLL.length - e;

  return <div className="bld bld-win bld-roll">
    <WindowBar path="chapter / week 4 / attendance" />
    <div className="bld-roll-h">
      <div>
        <p className="kick">Attendance</p>
        <p className="big">{required ? <><b>{p}</b> of {expected} expected</> : <>No roll taken</>}</p>
      </div>
      <label className={`sw${required ? " on" : ""}`}>
        <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} />
        <span className="track" aria-hidden><i /></span>
        <span className="tx">{required ? "Required: counts toward standing" : "Optional: no roll, no one dinged"}</span>
      </label>
    </div>
    <div className={`bld-roll-body${required ? "" : " off"}`} aria-disabled={!required}>
      <div className="meter" aria-hidden>
        <i className="p" style={{ width: pct(p) }} /><i className="e" style={{ width: pct(e) }} /><i className="a" style={{ width: pct(a) }} />
      </div>
      <div className="legend">
        <span className="p">Present {p}</span><span className="e">Excused {e}</span><span className="a">Absent {a}</span>
        <span className="sp" />
        <button type="button" onClick={() => setMarks(ROLL.map(() => "present"))} disabled={!required}>Everyone’s here</button>
        <button type="button" onClick={() => setMarks(initial())} disabled={!required}>Reset</button>
      </div>
      <div className="names">
        {ROLL.map((name, i) => (
          <button key={name} type="button" className={`nm ${marks[i]}`} disabled={!required}
            onClick={() => setMarks(m => m.map((x, j) => j === i ? NEXT[x] : x))}
            aria-label={`${name}: ${marks[i]}. Tap to change.`}>
            {name}
          </button>
        ))}
      </div>
      <p className="hint">Tap a name to switch it between present, excused and absent.</p>
    </div>
  </div>;
}
