"use client";
// A whole room in one set of minutes. Four copies of the doc, all linked to
// each other through ./sync.ts: the reader's laptop, Andre's and Sam's phones,
// and Jordan running the meeting from the front. Andre, Sam and Jordan each
// type their own part at the same time; the reader can join in anywhere, or
// take over either phone. "Play again" starts the room over.
import { useEffect, useRef, useState } from "react";
import { LivePad } from "./LivePad";
import { cloneInto, destroyPeer, ghostType, link, makePeer, type Peer } from "./sync";
import { useLive, usePresence, useSeen } from "./hooks";
import { MENTIONS, PEERS } from "./roster";

const START = `## Officer reports
- Treasurer:
- Social:

## New business
`;

type Script = Parameters<typeof ghostType>[1];
const SCRIPTS: Record<"andre" | "sam" | "jordan", Script> = {
  andre: [
    { after: "- Treasurer:", type: " $6,240 in the account. Four still owe dues.", pause: 500 },
    { after: "Four still owe dues.", type: "\n- [ ] @Treasurer to send the dues reminder by Friday", pause: 500 },
  ],
  sam: [
    { after: "- Social:", type: " formal is sold out, 120 tickets.", pause: 900 },
    { after: "120 tickets.", type: "\n- [ ] @Sam Okafor to post the waitlist link by Monday", pause: 500 },
  ],
  jordan: [
    { after: "## New business", type: "\nMotion to start chapter at 7:30 from next week.", pause: 1300 },
    { after: "from next week.", type: "\n- Voted 28–6–2. Motion passes.", pause: 500 },
  ],
};

function Faces({ awareness }: { awareness: Peer["awareness"] }) {
  const peers = usePresence(awareness);
  return <span className="people">{peers.map(p => (
    <span key={p.id} className={`notes-avatar${p.typing ? " typing" : ""}`} style={{ borderColor: p.color, color: p.color }} title={`${p.name}${p.typing ? " · typing" : ""}`}>
      {p.name === "You" ? "You" : p.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
    </span>
  ))}</span>;
}

function Room({ onDone }: { onDone: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const seen = useSeen(box);
  const [took, setTook] = useState({ andre: false, sam: false });
  const tookRef = useRef(took); tookRef.current = took;
  const onDoneRef = useRef(onDone); onDoneRef.current = onDone;
  const room = useLive(() => {
    const you = makePeer(PEERS.you, START);
    const andre = makePeer(PEERS.andre), sam = makePeer(PEERS.sam), jordan = makePeer(PEERS.jordan);
    const all = [you, andre, sam, jordan];
    for (const p of all.slice(1)) cloneInto(you, p);
    // Everyone hears everyone, as on one realtime channel.
    const unlinks = all.flatMap((a, i) => all.slice(i + 1).map(b => link(a, b, 160)));
    return { value: { you, andre, sam, jordan }, dispose: () => { unlinks.forEach(u => u()); all.forEach(destroyPeer); } };
  });

  useEffect(() => {
    if (!seen || !room) return;
    let left = 3;
    const done = () => { if (--left === 0) onDoneRef.current(); };
    const stops = [
      ghostType(room.andre, SCRIPTS.andre, { shouldStop: () => tookRef.current.andre, onDone: done }),
      ghostType(room.sam, SCRIPTS.sam, { shouldStop: () => tookRef.current.sam, onDone: done }),
      ghostType(room.jordan, SCRIPTS.jordan, { onDone: done }),
    ];
    return () => stops.forEach(s => s());
  }, [seen, room]);

  return <div ref={box} className="bld-room">
    <div className="bld-win laptop">
      <div className="bld-bar"><i /><i /><i /><span>you · laptop · taking the minutes</span>{room && <Faces awareness={room.you.awareness} />}</div>
      {room ? <LivePad peer={room.you} mentions={MENTIONS} placeholder="Type here…" /> : <div className="bld-pad-ph" />}
    </div>
    {(["andre", "sam"] as const).map(who => (
      <div key={who} className="bld-win phone">
        <div className="bld-bar"><span className="notch" /><span>{who} · phone</span></div>
        {room ? <LivePad peer={room[who]} mentions={MENTIONS} compact tools={false} onFocus={() => setTook(t => ({ ...t, [who]: true }))} /> : <div className="bld-pad-ph" />}
      </div>
    ))}
  </div>;
}

export function RoomDemo() {
  const [run, setRun] = useState(0);
  const [done, setDone] = useState(false);
  return <div className="bld bld-duo">
    <Room key={run} onDone={() => setDone(true)} />
    <div className="bld-room-foot">
      <span className="who">
        <i style={{ background: PEERS.andre.color }} />Andre, treasurer
        <i style={{ background: PEERS.sam.color }} />Sam, social chair
        <i style={{ background: PEERS.jordan.color }} />Jordan, running the meeting
      </span>
      <button type="button" className={done ? "ready" : ""} onClick={() => { setDone(false); setRun(r => r + 1); }}>↻ Play again</button>
    </div>
  </div>;
}
