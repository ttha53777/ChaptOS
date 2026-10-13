"use client";
// `/` for blocks, `@` for people and roles, on a real pad. The "Try" buttons
// type for readers on a phone: they start a fresh line and type the trigger,
// so the same picker the keyboard would open opens.
import { useRef } from "react";
import { LivePad, type LivePadHandle } from "./LivePad";
import { destroyPeer, makePeer } from "./sync";
import { useLive } from "./hooks";
import { MENTIONS, PEERS } from "./roster";
import { WindowBar } from "./chrome";

const START = `## Old business
The grill. Again. Motion to buy a new one, capped at $300.
- Voted 31–9–4. Motion passes.
`;

export function SlashDemo() {
  const pad = useRef<LivePadHandle>(null);
  const peer = useLive(() => {
    const p = makePeer(PEERS.you, START);
    return { value: p, dispose: () => destroyPeer(p) };
  });

  /** Put the caret on an empty last line and type `chars` there. */
  function tryIt(chars: string) {
    const v = pad.current?.view;
    if (!v) return;
    const doc = v.state.doc;
    const last = doc.line(doc.lines);
    const needsLine = last.text.trim() !== "";
    const at = needsLine ? doc.length : last.from;
    v.focus();
    v.dispatch({ changes: { from: at, to: doc.length, insert: (needsLine ? "\n" : "") + chars }, selection: { anchor: at + (needsLine ? 1 : 0) + chars.length }, userEvent: "input.type" });
  }

  return <div className="bld bld-win bld-slash">
    <WindowBar path="chapter / week 8 / minutes" />
    <div className="bld-try" role="group" aria-label="Try it">
      <span>Try it:</span>
      <button type="button" onClick={() => tryIt("/")}><kbd>/</kbd> blocks</button>
      <button type="button" onClick={() => tryIt("- [ ] @Mar")}><kbd>@Mar</kbd> a person</button>
      <button type="button" onClick={() => tryIt("- [ ] @Tre")}><kbd>@Tre</kbd> a role</button>
    </div>
    {peer ? <LivePad ref={pad} peer={peer} mentions={MENTIONS} placeholder="Type / or @" /> : <div className="bld-pad-ph" />}
  </div>;
}
