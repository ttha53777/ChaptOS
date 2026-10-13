"use client";
// The post's opening demo: tonight's minutes, live. Andre (the treasurer) is
// typing his report from his phone; the reader can write alongside him, and
// Summarize pulls the decisions and to-dos out of whatever ends up on the page.
import { useEffect, useRef, useState } from "react";
import { LivePad } from "./LivePad";
import { SummaryCard } from "./SummaryCard";
import { cloneInto, destroyPeer, ghostType, link, makePeer } from "./sync";
import { useLive, usePresence, useSeen, useSummary } from "./hooks";
import { MENTIONS, PEERS } from "./roster";
import { Spark, WindowBar } from "./chrome";

export const TONIGHT = `## Call to order
Called to order at 8:03 PM by @President. Quorum met: 41 of 52.

## Officer reports
- Treasurer:
- Social: formal is sold out at 120 tickets.

## Old business
The grill. Again. Motion to buy a new one, capped at $300.
- Voted 31–9–4. Motion passes.
- [ ] @Marcus Bell to order the grill by Friday

## New business
`;

export function LiveMinutes() {
  const box = useRef<HTMLDivElement>(null);
  const seen = useSeen(box);
  const pair = useLive(() => {
    const you = makePeer(PEERS.you, TONIGHT);
    const andre = makePeer(PEERS.andre);
    cloneInto(you, andre);
    const unlink = link(you, andre);
    return { value: { you, andre }, dispose: () => { unlink(); destroyPeer(you); destroyPeer(andre); } };
  });

  const sum = useSummary();
  const [margin, setMargin] = useState(false);
  const peers = usePresence(pair?.you.awareness ?? null);

  // Andre starts typing once the sheet is on screen.
  useEffect(() => {
    if (!seen || !pair) return;
    return ghostType(pair.andre, [
      { after: "- Treasurer:", type: " $6,240 in the account. Four still owe dues.", pause: 900 },
      { after: "Four still owe dues.", type: "\n- [ ] @Treasurer to send the dues reminder by Friday", pause: 600 },
      { after: "## New business", type: "\nFormal tickets go on sale Monday, $40 each.", pause: 1400 },
    ]);
  }, [seen, pair]);

  function summarizeNow() { setMargin(true); sum.run(); }

  return <div ref={box} className="bld bld-win bld-hero">
    <WindowBar path="chapter / week 8 / minutes" />
    <div className="bld-sheet-h">
      <span className="dot" aria-hidden />
      <span className="ttl">Chapter Meeting — Week 8</span>
      <span className="live"><i />Live</span>
      <span className="sp" />
      <span className="people" aria-label={`${peers.length} other ${peers.length === 1 ? "person" : "people"} in these notes`}>
        {peers.map(p => (
          <span key={p.id} className={`notes-avatar${p.typing ? " typing" : ""}`} style={{ borderColor: p.color, color: p.color }} title={`${p.name}${p.typing ? " · typing" : ""}`}>
            {p.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
          </span>
        ))}
      </span>
      <button type="button" className={`bld-btn sum${sum.summary ? " again" : ""}`} onClick={summarizeNow} disabled={sum.running}>
        <Spark />{sum.running ? "Summarizing…" : sum.summary ? "Re-summarize" : "Summarize"}
      </button>
    </div>
    <div className="bld-meta">
      <span>Sun, Oct 18</span><span>8:00 – 9:00 PM</span><span>Chapter room, 2nd floor</span>
      <span className="req">Required</span><span className="att">41 of 52 here</span>
    </div>
    <div className={`bld-grid${margin ? " with-margin" : ""}`}>
      {pair ? <LivePad peer={pair.you} mentions={MENTIONS} onText={sum.setText} /> : <div className="bld-pad-ph" />}
      {margin && <aside className="bld-margin">
        <SummaryCard summary={sum.summary} running={sum.running} stale={sum.stale} onToggle={sum.toggle} onResummarize={sum.run} onHide={() => setMargin(false)} />
      </aside>}
    </div>
    {!margin && <div className="bld-note">
      <b>This is live.</b> Click into the minutes and add a line while Andre types. Then press Summarize.
    </div>}
  </div>;
}
