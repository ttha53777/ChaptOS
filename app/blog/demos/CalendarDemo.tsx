"use client";
// Add to my calendar: the member dialog as the app draws it (pick a calendar,
// press one button) beside a phone. One click and the chapter's events land
// among the member's own. Copy is the app's (components/timeline/CalendarSubscription.tsx).
import { useEffect, useRef, useState } from "react";
import { TYPES, typeOf } from "./timeline-data";
import { WindowBar } from "./chrome";

type Provider = "google" | "apple";
type Block = { key: string; title: string; d: number; s: number; len: number; color: string; mine?: boolean };

const ORG = "Alpha Chapter";
const START = 15, END = 23; // the visible window, 3 PM to 11 PM
const DAYS = [{ n: "Mon", d: 26 }, { n: "Tue", d: 27 }, { n: "Wed", d: 28 }];
const C = (id: string) => typeOf(TYPES, id).color;
const MINE_C = "#8A7F71";

const MINE: Block[] = [
  { key: "econ", title: "ECON review", d: 0, s: 16, len: 1.5, color: MINE_C, mine: true },
  { key: "shift", title: "Shift · Rec", d: 1, s: 16, len: 2.5, color: MINE_C, mine: true },
  { key: "lab", title: "Chem lab", d: 2, s: 15.5, len: 2, color: MINE_C, mine: true },
];
const CHAPTER: Block[] = [
  { key: "meet", title: "Chapter Meeting", d: 0, s: 20, len: 1, color: C("chapter") },
  { key: "pumpkin", title: "Pumpkin carving", d: 1, s: 19.5, len: 1.5, color: C("party") },
  { key: "svc", title: "Service planning", d: 2, s: 19, len: 1.5, color: C("service") },
];

const fmtHour = (h: number) => `${h > 12 ? h - 12 : h}${h >= 12 ? "p" : "a"}`;

export function CalendarDemo() {
  const [provider, setProvider] = useState<Provider>("google");
  const [added, setAdded] = useState<Provider | null>(null);
  const [opening, setOpening] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);

  const done = added === provider;
  function add() {
    if (opening || done) return;
    setOpening(true);
    t.current = setTimeout(() => { setOpening(false); setAdded(provider); }, 650);
  }
  function pick(p: Provider) { setProvider(p); if (added !== p) setAdded(null); }

  const app = provider === "google" ? "Google Calendar" : "Apple Calendar";

  return <div className="bld bld-win tld-cal tlc">
    <WindowBar path="timeline / add to my calendar" />
    <div className="tlc-grid">
      <div className="tlc-dlg" role="group" aria-label="Add to my calendar">
        <div className="hd">
          <span className="tile" aria-hidden><CalIcon /></span>
          <b>Add to my calendar</b>
        </div>
        <p className="lede"><strong>{ORG}</strong>&apos;s events and deadlines in your own calendar, updated automatically.</p>
        <div className="pick" role="radiogroup" aria-label="Your calendar">
          {(["google", "apple"] as const).map(p => (
            <label key={p} className={provider === p ? "on" : ""}>
              <input type="radio" name="tlc-provider" checked={provider === p} onChange={() => pick(p)} />
              {p === "google" ? <GoogleGlyph /> : <AppleGlyph />}
              <span>{p === "google" ? "Google Calendar" : "Apple Calendar"}</span>
            </label>
          ))}
        </div>
        <button type="button" className={`cta${opening ? " busy" : ""}${!added && !opening ? " nudge" : ""}`} onClick={add} aria-disabled={opening}>
          <CalIcon />{opening ? `Opening ${app}…` : provider === "apple" ? "Open in Apple Calendar" : "Add to Google Calendar"}
        </button>
        {done
          ? <p role="status" className="added"><span className="tick"><Tick /></span>Added today. New events show up {provider === "google" ? "within a day" : "on the next refresh"}.</p>
          : <p className="hint">One click. Every event lands in your calendar.</p>}
      </div>

      <div className="tlc-side">
        <Phone provider={provider} on={done} />
        <p className="hint">{done
          ? <>Your classes stay put. The chapter&apos;s events fill in around them. <button type="button" onClick={() => setAdded(null)}>Replay</button></>
          : "Your calendar, before."}</p>
      </div>
    </div>
  </div>;
}

function Phone({ provider, on }: { provider: Provider; on: boolean }) {
  const hours = Array.from({ length: END - START }, (_, i) => START + i);
  const blocks = on ? [...MINE, ...CHAPTER] : MINE;
  let n = 0;
  return <div className={`tlc-phone ${provider}${on ? " on" : ""}`} aria-label={`Your phone's ${provider === "google" ? "Google" : "Apple"} Calendar`}>
    <div className="notch" aria-hidden />
    <div className="ph-top"><b>October</b><span>2026</span></div>
    <div className="days">
      <span />
      {DAYS.map((d, i) => <span key={d.d} className={`dh${i === 0 ? " today" : ""}`}><small>{d.n}</small><b>{d.d}</b></span>)}
    </div>
    <div className="allday">
      <span className="lab">all‑day</span>
      <div className="cells">
        {on && <span className="adc" style={{ ["--c" as string]: C("deadline"), ["--i" as string]: CHAPTER.length }}>Formal RSVPs due</span>}
      </div>
    </div>
    <div className="grid">
      <div className="gut">{hours.map(h => <span key={h}>{fmtHour(h)}</span>)}</div>
      <div className="area">
        {hours.map(h => <i key={h} className="hr" />)}
        {blocks.map(b => (
          <div key={b.key} className={`blk${b.mine ? " mine" : ""}`}
            style={{ ["--c" as string]: b.color, ["--d" as string]: b.d, ["--s" as string]: b.s - START, ["--l" as string]: b.len, ["--i" as string]: b.mine ? 0 : n++ }}>
            <b>{b.title}</b>
          </div>
        ))}
      </div>
    </div>
    <div className="cals">
      <span><i style={{ background: MINE_C }} />Personal</span>
      {on && <span className="new"><i style={{ background: C("chapter") }} />{ORG}</span>}
    </div>
  </div>;
}

const CalIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);
const Tick = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const GoogleGlyph = () => (
  <svg className="glyph" viewBox="0 0 28 28" aria-hidden>
    <rect x="2" y="3" width="24" height="23" rx="5" fill="#fff" />
    <path d="M2 8a5 5 0 0 1 5-5h14a5 5 0 0 1 5 5v2H2z" fill="#4285f4" />
    <text x="14" y="22.5" textAnchor="middle" fontSize="11" fontWeight="700" fontFamily="system-ui, sans-serif" fill="#4285f4">31</text>
  </svg>
);
const AppleGlyph = () => (
  <svg className="glyph" viewBox="0 0 28 28" aria-hidden>
    <rect x="2" y="3" width="24" height="23" rx="5" fill="#fff" />
    <text x="14" y="10.5" textAnchor="middle" fontSize="5.5" fontWeight="700" fontFamily="system-ui, sans-serif" fill="#ef4444" letterSpacing=".4">TUE</text>
    <text x="14" y="22.5" textAnchor="middle" fontSize="11" fontWeight="500" fontFamily="system-ui, sans-serif" fill="#1c1917">14</text>
  </svg>
);
