"use client";
// Summarize, on notes the reader can change. Edit a line, add a to-do with an
// @owner, and the summary goes stale until you re-run it; ticked items stay
// ticked across re-runs, as they do in the app.
import { useEffect } from "react";
import { LivePad } from "./LivePad";
import { SummaryCard } from "./SummaryCard";
import { destroyPeer, makePeer } from "./sync";
import { useLive, useSummary } from "./hooks";
import { MENTIONS, PEERS } from "./roster";
import { Spark, WindowBar } from "./chrome";

const NOTES = `## Treasury report
Balance is $6,240. Nine members still owe fall dues.
- [ ] @Treasurer to send the dues reminder by Friday

## Old business
The grill. Again. Motion to buy a new one, capped at $300.
- Voted 31–9–4. Motion passes.
- [ ] @Marcus Bell to order the grill by Sep 27
- [ ] @Treasurer to pay Marcus back by Sep 30

## New business
Formal moves to Nov 14, approved without objection.
- [ ] @Social to send the theme poll by Monday
`;

export function SummarizeDemo() {
  const peer = useLive(() => {
    const p = makePeer(PEERS.you, NOTES);
    return { value: p, dispose: () => destroyPeer(p) };
  });
  const sum = useSummary();
  const { run } = sum;
  // Open with a summary already in the margin, so there's something to tick.
  useEffect(() => { if (peer) run(); }, [peer, run]);

  return <div className="bld bld-win bld-summ">
    <WindowBar path="chapter / week 4 / minutes" />
    <div className="bld-sheet-h">
      <span className="dot" aria-hidden />
      <span className="ttl">Chapter Meeting — Week 4</span>
      <span className="sp" />
      <button type="button" className="bld-btn sum again" onClick={sum.run} disabled={sum.running}>
        <Spark />{sum.running ? "Summarizing…" : "Re-summarize"}
      </button>
    </div>
    <div className="bld-grid with-margin">
      {peer ? <LivePad peer={peer} mentions={MENTIONS} onText={sum.setText} /> : <div className="bld-pad-ph" />}
      <aside className="bld-margin">
        <SummaryCard summary={sum.summary} running={sum.running} stale={sum.stale} onToggle={sum.toggle} onResummarize={sum.run} />
      </aside>
    </div>
  </div>;
}
