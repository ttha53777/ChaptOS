"use client";
// The minutes pad, live, for the blog. The editing is the app's own: the same
// CodeMirror extensions (notes-markdown.ts formatting, notes-commands.ts keys)
// and the same y-codemirror binding as CollaborativeNotesEditor, minus the
// network session. Each pad edits a local Y.Doc (./sync.ts) instead.
//
// The toolbar, / and @ pickers below are a trimmed copy of the ones in
// CollaborativeNotesEditor.tsx, which are inlined there with its session.
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import { notesMarkdown, lineKind, type LineKind, type MentionTarget } from "@/app/components/meeting-notes/notes-markdown";
import { notesKeymap, setKind, toggleCheck, wrap } from "@/app/components/meeting-notes/notes-commands";
import "@/app/components/meeting-notes/notes-editor.css";
import type { Peer } from "./sync";

export interface LivePadHandle { view: EditorView | null }

type Pop = { type: "slash" | "at"; q: string; from: number; to: number; x: number; y: number; toolbar?: boolean };
const BLOCKS: { kind: LineKind; name: string; hint: string; md: string }[] = [
  { kind: "h", name: "Section", hint: "Starts a numbered agenda item", md: "##" },
  { kind: "li", name: "Bullet", hint: "A plain point", md: "-" },
  { kind: "todo", name: "Checklist", hint: "Something to tick off in the room", md: "[ ]" },
  { kind: "hr", name: "Divider", hint: "A break between parts", md: "---" },
];
type PopItem = { kind: "block"; block: (typeof BLOCKS)[number] } | { kind: "mention"; target: MentionTarget };

const Ic = ({ d }: { d: React.ReactNode }) => (
  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
);
const ICON = {
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>,
  check: <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M8 12.5l3 3 5.5-6.5" /></>,
  at: <><circle cx="12" cy="12" r="3.6" /><path d="M15.6 12v1.4a2.6 2.6 0 005.2 0V12a8.8 8.8 0 10-3.5 7" /></>,
  div: <path d="M3.5 12h3M10.5 12h3M17.5 12h3" />,
  people: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19c.7-3.2 3-5 6-5s5.3 1.8 6 5" /><path d="M16 5.6a3 3 0 010 5.8M17.5 14.3c1.8.6 3 2.2 3.5 4.7" /></>,
};
const blockGlyph = (k: LineKind) => k === "h" ? "§" : <Ic d={k === "li" ? ICON.list : k === "todo" ? ICON.check : ICON.div} />;

export function LivePad({ peer, mentions, placeholder, compact, tools = true, onText, onFocus, ref }: {
  peer: Peer;
  mentions: MentionTarget[];
  placeholder?: string;
  /** Phone-width pad: a shorter toolbar. */
  compact?: boolean;
  tools?: boolean;
  onText?: (text: string) => void;
  onFocus?: () => void;
  ref?: Ref<LivePadHandle>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const cb = useRef({ onText, onFocus }); cb.current = { onText, onFocus };
  const [kind, setKindState] = useState<LineKind>("p");
  const [pop, setPop] = useState<Pop | null>(null);
  const [popIdx, setPopIdx] = useState(0);
  const popRef = useRef<{ pop: Pop | null; idx: number; items: PopItem[] }>({ pop: null, idx: 0, items: [] });
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useImperativeHandle(ref, () => ({ get view() { return viewRef.current; } }), []);

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({ parent: host.current, state: EditorState.create({
      doc: peer.text.toString(),
      extensions: [
        EditorView.lineWrapping,
        notesMarkdown(() => mentions),
        cmPlaceholder(placeholder ?? "Type / for blocks, @ for a person or role…"),
        Prec.highest(keymap.of(popKeys)),
        keymap.of([...notesKeymap, ...yUndoManagerKeymap, ...defaultKeymap]),
        yCollab(peer.text, peer.awareness),
        EditorView.contentAttributes.of({ "aria-label": "Meeting minutes", spellcheck: "false", autocapitalize: "sentences" }),
        EditorView.updateListener.of(u => {
          if (u.docChanged) cb.current.onText?.(u.state.doc.toString());
          if (u.docChanged || u.selectionSet) { setKindState(lineKind(u.state.doc.lineAt(u.state.selection.main.head).text).kind); syncPop(u.view); }
          if (u.docChanged && u.transactions.some(t => t.isUserEvent("input") || t.isUserEvent("delete"))) {
            peer.awareness.setLocalStateField("typing", true);
            clearTimeout(typingTimer.current);
            typingTimer.current = setTimeout(() => peer.awareness.setLocalStateField("typing", false), 1600);
          }
        }),
        EditorView.domEventHandlers({
          focus: () => { cb.current.onFocus?.(); return false; },
          blur: () => { peer.awareness.setLocalStateField("typing", false); setPop(p => p?.toolbar ? p : null); return false; },
          mousedown: (event, v) => {
            const box = (event.target as HTMLElement).closest?.(".cm-md-cb");
            if (!box) return false;
            event.preventDefault();
            return toggleCheck(v, v.posAtDOM(box));
          },
        }),
      ],
    }) });
    viewRef.current = view;
    cb.current.onText?.(view.state.doc.toString());
    return () => { view.destroy(); viewRef.current = null; };
    // The peer is fixed for a pad's life; mentions are a module constant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer]);

  // ── / blocks and @mentions ─────────────────────────────────────────────────
  const items: PopItem[] = useMemo(() => {
    if (!pop) return [];
    const q = pop.q.toLowerCase();
    if (pop.type === "slash") return BLOCKS.filter(b => !q || b.name.toLowerCase().includes(q) || b.kind.startsWith(q)).map(block => ({ kind: "block" as const, block }));
    const hit = (name: string) => !q || name.toLowerCase().split(/\s+/).some(w => w.startsWith(q));
    const people = mentions.filter(m => m.kind === "person" && hit(m.name)).slice(0, q ? 5 : 4);
    const roles = mentions.filter(m => m.kind === "role" && hit(m.name)).slice(0, q ? 4 : 3);
    return [...people, ...roles].map(target => ({ kind: "mention" as const, target }));
  }, [pop, mentions]);
  const idx = Math.min(popIdx, Math.max(0, items.length - 1));
  popRef.current = { pop, idx, items };

  function syncPop(view: EditorView) {
    const sel = view.state.selection.main;
    setPop(prev => {
      if (prev?.toolbar) return prev;
      if (!sel.empty || !view.hasFocus) return null;
      const line = view.state.doc.lineAt(sel.head);
      const before = line.text.slice(0, sel.head - line.from);
      const slash = /^\/(\w*)$/.exec(line.text);
      const at = /(?:^|\s)@(\w*)$/.exec(before);
      const next = slash && sel.head === line.to ? { type: "slash" as const, q: slash[1], from: line.from, to: line.to }
        : at ? { type: "at" as const, q: at[1], from: sel.head - at[1].length - 1, to: sel.head } : null;
      if (!next) return null;
      if (!prev || prev.type !== next.type) setPopIdx(0);
      const c = view.coordsAtPos(sel.head);
      return { ...next, x: c?.left ?? 0, y: c?.bottom ?? 0 };
    });
  }

  function pick(i: number) {
    const view = viewRef.current, p = popRef.current.pop, item = popRef.current.items[i];
    if (!view || !p || !item) return;
    setPop(null);
    if (item.kind === "mention") {
      const insert = `@${item.target.name} `;
      view.dispatch({ changes: { from: p.from, to: p.to, insert }, selection: { anchor: p.from + insert.length }, userEvent: "input.complete" });
      view.focus();
      return;
    }
    const k = item.block.kind;
    const line = view.state.doc.lineAt(p.toolbar ? view.state.selection.main.head : p.from);
    const blank = p.toolbar ? !line.text.slice(lineKind(line.text).marker).trim() : true;
    const body = k === "hr" ? "---\n" : k === "h" ? "## " : k === "li" ? "- " : "- [ ] ";
    const [from, to, insert] = blank ? [line.from, line.to, body] : [line.to, line.to, `\n${body}`];
    view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length }, scrollIntoView: true, userEvent: "input.format" });
    view.focus();
  }

  const popKeys = [
    { key: "ArrowDown", run: () => move(1) },
    { key: "ArrowUp", run: () => move(-1) },
    { key: "Enter", run: () => choose() },
    { key: "Tab", run: () => choose() },
    { key: "Escape", run: () => { if (!popRef.current.pop) return false; setPop(null); return true; } },
  ];
  function move(d: number) {
    const { pop: p, items: list, idx: i } = popRef.current;
    if (!p) return false;
    if (list.length) setPopIdx((i + d + list.length) % list.length);
    return true;
  }
  function choose() {
    const { pop: p, items: list, idx: i } = popRef.current;
    if (!p || !list.length) return false;
    pick(i);
    return true;
  }

  // The popover is position:fixed, so when the post scrolls it follows the
  // caret (or, opened from the toolbar, just closes).
  const open = !!pop;
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setPop(p => {
        const v = viewRef.current;
        if (!p || !v || p.toolbar) return null;
        const c = v.coordsAtPos(v.state.selection.main.head);
        return c ? { ...p, x: c.left, y: c.bottom } : null;
      }));
    };
    window.addEventListener("scroll", follow, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", follow); };
  }, [open]);

  useEffect(() => {
    if (!pop?.toolbar) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.(".notes-pop, .tb-slash")) setPop(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [pop?.toolbar]);

  const run = (fn: (v: EditorView) => void) => { const v = viewRef.current; if (v) fn(v); };
  function mention() {
    run(v => {
      const { head } = v.state.selection.main;
      const prev = v.state.sliceDoc(Math.max(0, head - 1), head);
      const insert = (prev && !/\s/.test(prev) ? " " : "") + "@";
      v.focus();
      v.dispatch({ changes: { from: head, insert }, selection: { anchor: head + insert.length }, userEvent: "input" });
    });
  }
  function slashFromToolbar(e: React.MouseEvent<HTMLButtonElement>) {
    if (pop?.toolbar) { setPop(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    setPopIdx(0);
    setPop({ type: "slash", q: "", from: 0, to: 0, x: r.right, y: r.bottom, toolbar: true });
  }

  return <div className={`collaborative-notes bld-pad${compact ? " compact" : ""}`}>
    <div className="notes-pad">
      {tools && (
        <div className="notes-tools" role="toolbar" aria-label="Formatting" onMouseDown={e => { if ((e.target as HTMLElement).closest("button")) e.preventDefault(); }}>
          <button type="button" className={`tb${kind === "h" ? " on" : ""}`} onClick={() => run(v => setKind(v, "h"))} title="Section heading  (## )"><b>§</b>{!compact && "Section"}</button>
          {!compact && <button type="button" className="tb" onClick={() => run(v => wrap(v, "**"))} title="Bold  ⌘B" aria-label="Bold"><b>B</b></button>}
          {!compact && <button type="button" className="tb" onClick={() => run(v => wrap(v, "*"))} title="Italic  ⌘I" aria-label="Italic"><em>i</em></button>}
          <span className="tsep" />
          <button type="button" className={`tb${kind === "li" ? " on" : ""}`} onClick={() => run(v => setKind(v, "li"))} title="Bullet  (- )" aria-label="Bullet"><Ic d={ICON.list} /></button>
          <button type="button" className={`tb${kind === "todo" ? " on" : ""}`} onClick={() => run(v => setKind(v, "todo"))} title="Checklist  ([ ] )" aria-label="Checklist"><Ic d={ICON.check} /></button>
          <span className="tsep" />
          <button type="button" className="tb" onClick={mention} title="Mention a person or role  (@)" aria-label="Mention"><Ic d={ICON.at} />{!compact && "Mention"}</button>
          <span className="sp" />
          <button type="button" className={`tb tb-slash${pop?.toolbar ? " on" : ""}`} onClick={slashFromToolbar} title="Insert a block  (/)" aria-haspopup="listbox"><kbd>/</kbd></button>
        </div>
      )}
      <div ref={host} className="notes-editor-host" />
    </div>

    {pop && (
      <div
        className="notes-pop"
        role="listbox"
        aria-label={pop.type === "slash" ? "Insert block" : "Mention a person or role"}
        style={pop.toolbar ? { right: Math.max(8, window.innerWidth - pop.x), top: pop.y + 6 } : { left: Math.max(8, Math.min(pop.x, window.innerWidth - 310)), top: pop.y + 300 > window.innerHeight - 10 ? Math.max(10, pop.y - 330) : pop.y + 8 }}
        onMouseDown={e => e.preventDefault()}
      >
        {pop.type === "slash" && <div className="ph">Insert block</div>}
        {!items.length && <div className="empty">{pop.type === "slash" ? "No block called that." : "No one, and no role, by that name."}</div>}
        {items.map((it, i) => {
          const head = it.kind === "mention" && (i === 0 || (items[i - 1].kind === "mention" && (items[i - 1] as { target: MentionTarget }).target.kind !== it.target.kind))
            ? <div className="grp-h">{it.target.kind === "person" ? "People" : "Roles"}</div> : null;
          return <div key={i}>{head}
            <button type="button" role="option" aria-selected={i === idx} className={`opt${i === idx ? " sel" : ""}`} onMouseEnter={() => setPopIdx(i)} onClick={() => pick(i)}>
              {it.kind === "block"
                ? <><span className="g">{blockGlyph(it.block.kind)}</span><span><span className="nm2">{it.block.name}</span><small>{it.block.hint}</small></span><code>{it.block.md}</code></>
                : it.target.kind === "person"
                  ? <><span className={`av tone-${it.target.tone}`}>{it.target.initials}</span><span><span className="nm2">{it.target.name}</span><small>{it.target.sub}</small></span><code /></>
                  : <><span className="g role"><Ic d={ICON.people} /></span><span><span className="nm2">{it.target.name}</span><small>{it.target.sub}</small></span><code>role</code></>}
            </button>
          </div>;
        })}
      </div>
    )}
  </div>;
}
