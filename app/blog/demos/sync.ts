// Live collaboration for the blog demos, without a server: each pad owns a
// Y.Doc + Awareness exactly as NotesSession does in the app, and `link` relays
// updates between them in the page with a little network-like latency. The
// editors on top are the app's real y-codemirror binding, so remote edits,
// presence and named cursors are the product's own behaviour.
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";

export type Peer = { doc: Y.Doc; awareness: Awareness; text: Y.Text };

export function makePeer(user: { name: string; color: string }, seed?: string): Peer {
  const doc = new Y.Doc();
  const text = doc.getText("notes");
  if (seed) text.insert(0, seed);
  const awareness = new Awareness(doc);
  awareness.setLocalStateField("user", { name: user.name, color: user.color, colorLight: `${user.color}33` });
  return { doc, awareness, text };
}

/** Make `b` a copy of `a` (call before linking, so both start from one history). */
export function cloneInto(a: Peer, b: Peer) {
  Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc), "remote");
}

const REMOTE = "remote";

/** Relay document and presence updates both ways. Returns an unlink. */
export function link(a: Peer, b: Peer, latency = 140): () => void {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void) => { const t = setTimeout(() => { timers.delete(t); fn(); }, latency + Math.random() * 60); timers.add(t); };
  const pipeDoc = (from: Peer, to: Peer) => (update: Uint8Array, origin: unknown) => {
    if (origin !== REMOTE) later(() => Y.applyUpdate(to.doc, update, REMOTE));
  };
  const pipeAw = (from: Peer, to: Peer) => ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    if (origin === REMOTE) return;
    const changed = [...added, ...updated, ...removed];
    later(() => applyAwarenessUpdate(to.awareness, encodeAwarenessUpdate(from.awareness, changed), REMOTE));
  };
  const ab = pipeDoc(a, b), ba = pipeDoc(b, a), aab = pipeAw(a, b), aba = pipeAw(b, a);
  a.doc.on("update", ab); b.doc.on("update", ba);
  a.awareness.on("update", aab); b.awareness.on("update", aba);
  // Introduce each side's presence to the other right away.
  applyAwarenessUpdate(b.awareness, encodeAwarenessUpdate(a.awareness, [a.doc.clientID]), REMOTE);
  applyAwarenessUpdate(a.awareness, encodeAwarenessUpdate(b.awareness, [b.doc.clientID]), REMOTE);
  return () => {
    timers.forEach(clearTimeout);
    a.doc.off("update", ab); b.doc.off("update", ba);
    a.awareness.off("update", aab); b.awareness.off("update", aba);
  };
}

export function destroyPeer(p: Peer) { p.awareness.destroy(); p.doc.destroy(); }

/**
 * A scripted collaborator: types `script` into its own doc, one character at a
 * time, with its cursor where it types (so the linked pad shows a named caret).
 * Each step finds its line by a substring and appends to the end of it, or
 * starts a new line after it when the step begins with "\n".
 */
export function ghostType(p: Peer, steps: { after: string; type: string; pause?: number }[], opts: { speed?: number; shouldStop?: () => boolean; onDone?: () => void } = {}) {
  let cancelled = false;
  const speed = opts.speed ?? 1;
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms / speed));
  const caret = (index: number) => {
    const rel = Y.createRelativePositionFromTypeIndex(p.text, index);
    p.awareness.setLocalStateField("cursor", { anchor: rel, head: rel });
  };
  void (async () => {
    for (const step of steps) {
      if (cancelled || opts.shouldStop?.()) return;
      await wait(step.pause ?? 700);
      const s = p.text.toString();
      const at = s.indexOf(step.after);
      if (at === -1) continue;
      let pos = s.indexOf("\n", at + step.after.length);
      if (pos === -1) pos = s.length;
      // Anchor to the character before the caret (assoc -1), not an index: the
      // reader may be typing elsewhere in the doc, which shifts every index.
      let anchor = Y.createRelativePositionFromTypeIndex(p.text, pos, -1);
      caret(pos);
      for (const ch of step.type) {
        if (cancelled || opts.shouldStop?.()) return;
        await wait(ch === " " ? 70 : 38 + Math.random() * 70);
        pos = Y.createAbsolutePositionFromRelativePosition(anchor, p.doc)?.index ?? pos;
        p.text.insert(pos, ch);
        pos++;
        anchor = Y.createRelativePositionFromTypeIndex(p.text, pos, -1);
        caret(pos);
      }
    }
    await wait(1200);
    if (!cancelled) { p.awareness.setLocalStateField("cursor", null); opts.onDone?.(); }
  })();
  return () => { cancelled = true; };
}
