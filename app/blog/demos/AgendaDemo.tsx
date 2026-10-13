"use client";
// Add a meeting, pick an agenda: the minutes open with it already written. The
// filling is the app's own (lib/agenda-template.ts: agendaValues + fillAgenda,
// the same pair createCalendar runs on the server).
import { useEffect, useState } from "react";
import { agendaSections, agendaValues, fillAgenda } from "@/lib/agenda-template";
import { LivePad } from "./LivePad";
import { destroyPeer, makePeer } from "./sync";
import { useLive } from "./hooks";
import { MENTIONS, PEERS } from "./roster";
import { WindowBar } from "./chrome";

const TEMPLATES = [
  {
    id: "weekly", name: "Weekly chapter", tone: "sky", isDefault: true, title: "Chapter Meeting — Week 8",
    body: `{{meeting_date}} · {{meeting_time}} · {{location}}

## Call to order
Called to order at __ by @President. Quorum: __ of 52.

## Officer reports
- Treasurer:
- Secretary:
- Social:

## Old business

## New business

## Adjourn
`,
  },
  {
    id: "exec", name: "Exec board", tone: "lilac", isDefault: false, title: "Exec board",
    body: `{{meeting_title}} · {{meeting_date}}, {{meeting_time}}

## Reports
- @President:
- @Treasurer:
- @Social:

## This week
- [ ]

## Needs a chapter vote
`,
  },
  {
    id: "committee", name: "Committee check-in", tone: "mint", isDefault: false, title: "Formal committee",
    body: `{{meeting_title}} · {{location}}

## Where we are

## Blockers

## Next steps
- [ ]
`,
  },
] as const;

export function AgendaDemo() {
  const [tplId, setTplId] = useState<(typeof TEMPLATES)[number]["id"]>("weekly");
  const [title, setTitle] = useState<string>(TEMPLATES[0].title);
  const [titleTouched, setTitleTouched] = useState(false);
  const [date, setDate] = useState("2026-10-18");
  const [start, setStart] = useState("20:00");
  const [end, setEnd] = useState("21:00");
  const [location, setLocation] = useState("Chapter room, 2nd floor");
  const tpl = TEMPLATES.find(t => t.id === tplId)!;
  const filled = fillAgenda(tpl.body, agendaValues({ title, date, startTime: start, endTime: end, location }));

  const peer = useLive(() => {
    const p = makePeer(PEERS.you);
    return { value: p, dispose: () => destroyPeer(p) };
  });
  // The pad shows what this meeting's minutes would open with.
  useEffect(() => {
    if (!peer) return;
    peer.doc.transact(() => { peer.text.delete(0, peer.text.length); peer.text.insert(0, filled); });
  }, [peer, filled]);

  function pick(id: typeof tplId) {
    setTplId(id);
    // As in the app: the title follows the template until someone types one.
    if (!titleTouched) setTitle(TEMPLATES.find(t => t.id === id)!.title);
  }

  return <div className="bld bld-win bld-agenda">
    <WindowBar path="chapter / add meeting" />
    <div className="bld-agenda-grid">
      <form className="bld-form" onSubmit={e => e.preventDefault()}>
        <p className="kick">New meeting</p>
        <label className="sr-only" htmlFor="bld-mt-title">Title</label>
        <input id="bld-mt-title" className="ttl" value={title} onChange={e => { setTitleTouched(true); setTitle(e.target.value); }} />
        <label className="row"><span>Date</span><input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} /></label>
        <div className="row">
          <span className="lbl">Time</span>
          <span className="times">
            <input type="time" aria-label="Starts" value={start} onChange={e => e.target.value && setStart(e.target.value)} />
            <i>→</i>
            <input type="time" aria-label="Ends" value={end} onChange={e => e.target.value && setEnd(e.target.value)} />
          </span>
        </div>
        <label className="row"><span>Where</span><input value={location} onChange={e => setLocation(e.target.value)} /></label>
        <div className="row">
          <span className="lbl">Agenda</span>
          <div className="tpls" role="radiogroup" aria-label="Agenda template">
            {TEMPLATES.map(t => (
              <button key={t.id} type="button" role="radio" aria-checked={t.id === tplId} className={`tpl tone-${t.tone}${t.id === tplId ? " on" : ""}`} onClick={() => pick(t.id)}>
                <span className="nm">{t.name}{t.isDefault && <em> ★ default</em>}</span>
                <span className="sub">{agendaSections(t.body).length} sections</span>
              </button>
            ))}
          </div>
        </div>
        <p className="hint">Change anything here and watch the minutes on the right. Templates fill in the date, time and room for you.</p>
      </form>
      <div className="bld-agenda-pad">
        <p className="cap">The minutes, before anyone opens a laptop</p>
        {peer ? <LivePad peer={peer} mentions={MENTIONS} tools={false} /> : <div className="bld-pad-ph" />}
      </div>
    </div>
  </div>;
}
