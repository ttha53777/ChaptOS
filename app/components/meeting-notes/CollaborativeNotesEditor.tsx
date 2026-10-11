"use client";
import { useEffect, useRef, useState, useImperativeHandle, useMemo, type Ref } from "react";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import { NotesSession, type NotesStatus, type NotesLegs, type Collaborator } from "@/app/lib/collaboration/notes-session";
import { NOTES_TEXT_LIMIT, type NotesSnapshot } from "@/lib/collaboration/notes-protocol";
import { AgendaBody } from "@/app/components/agenda-templates/AgendaBody";
import { notesMarkdown, lineKind, mentionsIn, type LineKind, type MentionTarget } from "./notes-markdown";
import { notesKeymap, setKind, toggleCheck, wrap } from "./notes-commands";
import "./notes-editor.css";

export interface NotesEditorHandle {
  flush(): Promise<NotesSnapshot>;
  /** The minutes as they stand in this tab (markdown), or null before they open. */
  text(): string | null;
}
export type { MentionTarget };

type Pop = { type: "slash" | "at"; q: string; from: number; to: number; x: number; y: number; toolbar?: boolean };
type Reveal = "no" | "live" | "offline" | "read";

const BLOCKS: { kind: LineKind; name: string; hint: string; md: string }[] = [
  { kind: "h", name: "Section", hint: "Starts a numbered agenda item", md: "##" },
  { kind: "li", name: "Bullet", hint: "A plain point", md: "-" },
  { kind: "todo", name: "Checklist", hint: "Something to tick off in the room", md: "[ ]" },
  { kind: "hr", name: "Divider", hint: "A break between parts", md: "---" },
];
type PopItem = { kind: "block"; block: (typeof BLOCKS)[number] } | { kind: "mention"; target: MentionTarget };
const SKELETON = ["h:30%", "64%", "48%", "", "h:38%", "92%", "71%", "58%", "", "h:26%", "86%", "100%", "44%", "", "h:34%", "62%"];
const SLOW_MS = 5000;

const Ic = ({ d, className = "ic" }: { d: React.ReactNode; className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
);
const ICON = {
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>,
  check: <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M8 12.5l3 3 5.5-6.5" /></>,
  at: <><circle cx="12" cy="12" r="3.6" /><path d="M15.6 12v1.4a2.6 2.6 0 005.2 0V12a8.8 8.8 0 10-3.5 7" /></>,
  div: <path d="M3.5 12h3M10.5 12h3M17.5 12h3" />,
  tpl: <><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="M9 3.5V2.5h6v1M8.5 9h7M8.5 13h7M8.5 17h4" /></>,
  people: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19c.7-3.2 3-5 6-5s5.3 1.8 6 5" /><path d="M16 5.6a3 3 0 010 5.8M17.5 14.3c1.8.6 3 2.2 3.5 4.7" /></>,
  wifi: <><path d="M2.5 9a14 14 0 0119 0M5.5 12.5a9.5 9.5 0 0113 0M9 16a4.5 4.5 0 016 0" /><circle cx="12" cy="19.3" r=".9" /><path d="M3 3l18 18" /></>,
};
const blockGlyph = (k: LineKind) => k === "h" ? "§" : <Ic d={k === "li" ? ICON.list : k === "todo" ? ICON.check : ICON.div} />;

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const firstNames = (peers: Collaborator[]) => [...new Map(peers.map(p => [p.actorId, p.name.split(" ")[0]])).values()];
const andList = (xs: string[]) => xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;

function countStats(doc: string, targets: MentionTarget[]) {
  let mentions = 0, todos = 0, done = 0;
  for (const line of doc.split("\n")) {
    const k = lineKind(line);
    if (k.kind === "todo") { todos++; if (k.done) done++; }
    mentions += mentionsIn(line, targets).length;
  }
  return { words: (doc.match(/[^\s#*\-[\]@]\S*/g) ?? []).length, mentions, todos, done };
}

export default function CollaborativeNotesEditor({ eventId, slug, ref, onSaved, onState, onPeers, mentions, fallback, dateLabel, fromAgenda, onCopy }: {
  eventId: number; slug: string; ref?: Ref<NotesEditorHandle>;
  onSaved: (value: NotesSnapshot) => void;
  onState: (state: NotesStatus) => void;
  onPeers: (peers: Collaborator[]) => void;
  /** People and roles the minutes can @mention. */
  mentions: MentionTarget[];
  /** The last saved minutes, for "Read last saved copy" when the pad can't open. */
  fallback: string;
  /** "Oct 7" — the connecting card's kicker. */
  dateLabel: string;
  /** The meeting started from an agenda template. */
  fromAgenda?: boolean;
  onCopy?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const sessionRef = useRef<NotesSession | null>(null);
  const callbacks = useRef({ onSaved, onState, onPeers, onCopy }); callbacks.current = { onSaved, onState, onPeers, onCopy };
  const mentionsRef = useRef(mentions); mentionsRef.current = mentions;
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<NotesStatus>({ saving: "loading", connection: "Connecting…" });
  const [legs, setLegs] = useState<NotesLegs>({ stage: "bootstrap" });
  const [ready, setReady] = useState(false);
  const [peers, setPeers] = useState<Collaborator[]>([]);
  const [limitError, setLimitError] = useState("");
  const [revealed, setRevealed] = useState<Reveal>("no");
  const [inking, setInking] = useState(false);
  const [slow, setSlow] = useState<null | "asking" | "waiting">(null);
  const [joinStarted, setJoinStarted] = useState<number | null>(null);
  const [, tick] = useState(0);
  const [kind, setKindState] = useState<LineKind>("p");
  const [stats, setStats] = useState({ words: 0, mentions: 0, todos: 0, done: 0 });
  const [pop, setPop] = useState<Pop | null>(null);
  const [popIdx, setPopIdx] = useState(0);
  const popRef = useRef<{ pop: Pop | null; idx: number; items: PopItem[] }>({ pop: null, idx: 0, items: [] });

  useImperativeHandle(ref, () => ({
    flush: async () => {
      if (!sessionRef.current) throw new Error("Notes are still loading.");
      return sessionRef.current.flush();
    },
    text: () => sessionRef.current?.doc.getText("notes").toString() ?? null,
  }), []);

  // ── the session ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let view: EditorView | undefined;
    setReady(false); setRevealed("no"); setSlow(null); setJoinStarted(null); setLegs({ stage: "bootstrap" });
    const session = new NotesSession(eventId, slug, value => callbacks.current.onSaved(value));
    sessionRef.current = session;
    const unsubscribe = session.subscribe(() => {
      if (cancelled) return;
      const nextPeers = session.collaborators();
      setPeers(nextPeers); callbacks.current.onPeers(nextPeers);
      setStatus(session.status); callbacks.current.onState(session.status);
      setLegs(session.legs);
      if (view && !session.editable) { view.destroy(); view = undefined; viewRef.current = null; }
    });
    void session.start().then(() => {
      if (cancelled || !host.current) return;
      const text = session.doc.getText("notes");
      view = new EditorView({ parent: host.current, state: EditorState.create({
        doc: text.toString(),
        extensions: [
          EditorView.lineWrapping,
          notesMarkdown(() => mentionsRef.current),
          placeholder("Start typing meeting minutes…  (type / for blocks)"),
          Prec.highest(keymap.of(popKeys)),
          keymap.of([...notesKeymap, ...yUndoManagerKeymap, ...defaultKeymap,
            { key: "Mod-Shift-c", run: () => { callbacks.current.onCopy?.(); return true; } }]),
          yCollab(text, session.awareness),
          EditorView.contentAttributes.of({ "aria-label": "Meeting minutes", spellcheck: "true", autocapitalize: "sentences" }),
          EditorState.changeFilter.of(transaction => {
            if (transaction.newDoc.length <= NOTES_TEXT_LIMIT || transaction.newDoc.length < transaction.startState.doc.length) return true;
            setLimitError("Notes are limited to 50,000 characters. Remove some text before adding more.");
            return false;
          }),
          EditorView.updateListener.of(u => {
            if (u.docChanged) setStats(countStats(u.state.doc.toString(), mentionsRef.current));
            if (u.docChanged || u.selectionSet) { setKindState(lineKind(u.state.doc.lineAt(u.state.selection.main.head).text).kind); syncPop(u.view); }
          }),
          EditorView.domEventHandlers({
            blur: () => { session.stopTyping(); setPop(p => p?.toolbar ? p : null); return false; },
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
      setStats(countStats(text.toString(), mentionsRef.current));
      setReady(true);
      setJoinStarted(Date.now());
    }).catch(error => {
      if (!cancelled) { const next: NotesStatus = { saving: "error", connection: "Unavailable", error: error instanceof Error ? error.message : "Couldn't open notes." }; setStatus(next); callbacks.current.onState(next); }
    });
    return () => { cancelled = true; unsubscribe(); view?.destroy(); viewRef.current = null; sessionRef.current = null; void session.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, slug, attempt]);

  // The roster can land after the pad opens; redraw so mentions turn into chips.
  useEffect(() => {
    const v = viewRef.current;
    if (!v) return;
    v.dispatch({});
    setStats(countStats(v.state.doc.toString(), mentions));
  }, [mentions]);

  // ── connecting → revealed ──────────────────────────────────────────────────
  const failed = !ready && status.saving === "error";
  const conn = status.connection;
  useEffect(() => {
    if (!ready || revealed !== "no") return;
    if (conn === "Live" || conn === "Live updates unavailable") {
      const t = setTimeout(() => reveal("live"), conn === "Live" ? 550 : 900);
      return () => clearTimeout(t);
    }
    if (conn === "Offline" || slow) return;
    const t = setInterval(() => {
      tick(n => n + 1);
      if (joinStarted && Date.now() - joinStarted > SLOW_MS) setSlow("asking");
    }, 1000);
    return () => clearInterval(t);
  }, [ready, revealed, conn, slow, joinStarted]);

  function reveal(how: Reveal) {
    setRevealed(how);
    if (how === "read") return;
    setInking(true);
    setTimeout(() => setInking(false), 1100);
    requestAnimationFrame(() => viewRef.current?.focus());
  }

  // ── popovers: / blocks and @mentions ───────────────────────────────────────
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
      const next: Omit<Pop, "x" | "y"> | null = slash && sel.head === line.to ? { type: "slash", q: slash[1], from: line.from, to: line.to }
        : at ? { type: "at", q: at[1], from: sel.head - at[1].length - 1, to: sel.head } : null;
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

  // ── toolbar ────────────────────────────────────────────────────────────────
  const editable = ready && (revealed === "live" || revealed === "offline");
  const run = (fn: (v: EditorView) => void) => { const v = viewRef.current; if (v && editable) fn(v); };
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
  useEffect(() => {
    if (!pop?.toolbar) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.(".notes-pop, .tb-slash")) setPop(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [pop?.toolbar]);

  // ── the connecting card ────────────────────────────────────────────────────
  type Step = { cls: "" | "run" | "ok" | "bad" | "warn"; detail?: React.ReactNode };
  const order = ["bootstrap", "local", "join", "open"] as const;
  const at = order.indexOf(legs.stage);
  const s1: Step = failed && at === 0 ? { cls: "bad", detail: status.error }
    : at === 0 ? { cls: "run" }
    : { cls: "ok", detail: legs.savedAt ? `rev ${legs.seq ?? 0} · last saved ${clock(legs.savedAt)}` : "Nothing saved yet — a clean sheet" };
  const s2: Step = at < 1 ? { cls: "" } : at === 1 ? (failed ? { cls: "bad", detail: status.error } : { cls: "run" })
    : legs.localFailed ? { cls: "warn", detail: "Couldn’t read this device’s copy — keep this tab open until it saves" }
    : { cls: "ok", detail: legs.unsent ? "Edits made here weren’t sent yet — merging them in" : "This device is up to date" };
  const names = firstNames(peers);
  const waited = joinStarted ? Math.round((Date.now() - joinStarted) / 1000) : 0;
  const s3: Step = at < 2 ? { cls: "" }
    : failed ? { cls: "bad", detail: status.error }
    : !ready ? { cls: "run", detail: "Opening a live channel…" }
    : conn === "Live" ? { cls: "ok", detail: names.length ? <>{andList(names)} {names.length === 1 ? "is" : "are"} here<span className="nl-avs">{peers.slice(0, 4).map(p => <span key={p.clientId} className="av" style={{ borderColor: p.color, color: p.color }}>{initials(p.name)}</span>)}</span></> : "You’re the first one here" }
    : conn === "Offline" ? { cls: "warn", detail: "No connection — you’re offline" }
    : conn === "Live updates unavailable" ? { cls: "warn", detail: "Live updates are off — saves every few seconds" }
    : slow ? { cls: "warn", detail: `Still knocking — ${waited}s so far` }
    : { cls: "run", detail: "Opening a live channel…" };
  const offlineAtOpen = failed && typeof navigator !== "undefined" && !navigator.onLine;
  const heading = failed ? (offlineAtOpen ? <>You’re <span>offline</span></> : <>Couldn’t open the <span>minutes</span></>)
    : ready && conn === "Offline" ? <>You’re <span>offline</span></>
    : <>Opening the <span>minutes</span></>;
  const sub = failed ? (offlineAtOpen ? "The minutes need a connection to open on this device. The last saved copy is safe on the server." : "Nothing was lost — the last saved copy is safe on the server.")
    : ready && conn === "Offline" ? "You can still take minutes. They stay on this device and merge with everyone else’s when you’re back."
    : "Getting the latest copy so everyone writes on the same page.";
  const pencil = failed ? Math.max(20, at * 30) : [4, 38, 62, 80][at] + (ready ? 20 * Number(conn === "Live") : 0);
  const retry = () => { setStatus({ saving: "loading", connection: "Connecting…" }); setAttempt(n => n + 1); };

  const loading = revealed === "no";
  const offlineNow = revealed !== "no" && revealed !== "read" && conn === "Offline";
  const hasError = !loading && (!!status.error || !!limitError);

  return <div className={`collaborative-notes${loading ? " loading" : ""}${inking ? " reveal" : ""}`}>
    {offlineNow && (
      <div className="notes-banner" role="status">
        <Ic d={ICON.wifi} />
        <span><b>Offline.</b> Your edits are saved on this device and merge when you reconnect.</span>
        <button type="button" onClick={() => sessionRef.current?.retry()}>Try again</button>
      </div>
    )}
    <div className="notes-pad">
      <div className="notes-tools" role="toolbar" aria-label="Formatting" onMouseDown={e => { if ((e.target as HTMLElement).closest("button")) e.preventDefault(); }}>
        <button type="button" className={`tb${kind === "h" ? " on" : ""}`} disabled={!editable} onClick={() => run(v => setKind(v, "h"))} title="Section heading  (## )"><b>§</b>Section</button>
        <button type="button" className="tb" disabled={!editable} onClick={() => run(v => wrap(v, "**"))} title="Bold  ⌘B" aria-label="Bold"><b>B</b></button>
        <button type="button" className="tb" disabled={!editable} onClick={() => run(v => wrap(v, "*"))} title="Italic  ⌘I" aria-label="Italic"><em>i</em></button>
        <span className="tsep" />
        <button type="button" className={`tb${kind === "li" ? " on" : ""}`} disabled={!editable} onClick={() => run(v => setKind(v, "li"))} title="Bullet  (- )" aria-label="Bullet"><Ic d={ICON.list} /></button>
        <button type="button" className={`tb${kind === "todo" ? " on" : ""}`} disabled={!editable} onClick={() => run(v => setKind(v, "todo"))} title="Checklist  ([ ] )" aria-label="Checklist"><Ic d={ICON.check} /></button>
        <span className="tsep" />
        <button type="button" className="tb" disabled={!editable} onClick={mention} title="Mention a person or role  (@)"><Ic d={ICON.at} />Mention</button>
        <button type="button" className="tb" disabled={!editable} onClick={() => run(v => setKind(v, "hr"))} title="Divider  (---)" aria-label="Divider"><Ic d={ICON.div} /></button>
        <span className="sp" />
        {fromAgenda && <span className="tag-agenda" title="These minutes started from an agenda template"><Ic d={ICON.tpl} />Agenda</span>}
        <button type="button" className={`tb tb-slash${pop?.toolbar ? " on" : ""}`} disabled={!editable} onClick={slashFromToolbar} title="Insert a block  (/)" aria-haspopup="listbox"><kbd>/</kbd></button>
      </div>

      <div ref={host} className="notes-editor-host" hidden={revealed === "read"} />
      {revealed === "read" && (
        <div className="notes-read" role="document" aria-label="Meeting minutes (last saved copy)">
          {fallback.trim() ? <AgendaBody body={fallback} /> : <p className="notes-read-empty">No minutes were saved for this meeting yet.</p>}
        </div>
      )}

      {loading && (
        <div className="notes-loader" aria-live="polite">
          <div className="nl-skel" aria-hidden>
            {SKELETON.map((w, i) => <i key={i} className={w.startsWith("h:") ? "h" : ""} style={{ "--w": w ? w.replace("h:", "") : "0" } as React.CSSProperties} />)}
          </div>
          <div className="nl-lc" key={attempt}>
            <div className="nl-kick">Minutes · {dateLabel}</div>
            <h3>{heading}</h3>
            <p className="nl-sub">{sub}</p>
            <ol className="nl-steps">
              {([["Pulling the last saved minutes", s1], ["Checking this device’s copy", s2], ["Joining the room", s3]] as const).map(([t, s]) => (
                <li key={t} className={`nl-st ${s.cls}`}><span className="o" /><div><span className="t">{t}</span><span className="d">{s.detail}</span></div></li>
              ))}
            </ol>
            <div className="nl-pencil"><i style={{ "--p": `${pencil}%` } as React.CSSProperties} /></div>
            {failed ? (
              <div className="nl-ctas">
                <button type="button" className="nl-btn pri" onClick={retry}>Try again</button>
                <button type="button" className="nl-btn q" onClick={() => reveal("read")}>Read last saved copy</button>
              </div>
            ) : ready && conn === "Offline" ? (
              <div className="nl-ctas">
                <button type="button" className="nl-btn pri" onClick={() => reveal("offline")}>Write offline</button>
                <button type="button" className="nl-btn q" onClick={() => sessionRef.current?.retry()}>Retry</button>
              </div>
            ) : slow === "asking" ? (<>
              <p className="nl-msg">Taking longer than usual. You don’t have to wait — start writing and it catches up when the room opens.</p>
              <div className="nl-ctas">
                <button type="button" className="nl-btn pri" onClick={() => reveal("live")}>Start writing</button>
                <button type="button" className="nl-btn q" onClick={() => setSlow("waiting")}>Keep waiting</button>
              </div>
            </>) : slow === "waiting" ? <p className="nl-msg">Waiting… you can still close this and come back.</p> : null}
          </div>
        </div>
      )}
    </div>

    <div className="notes-foot" role="status" aria-live="polite">
      {hasError ? <>
        <span className="err">{status.connection !== "Live" && `${status.connection} · `}{limitError || status.error}</span>
        <button type="button" onClick={() => { setLimitError(""); void sessionRef.current?.flush().catch(() => {}); }}>Retry</button>
        <button type="button" onClick={() => { const text = sessionRef.current?.doc.getText("notes").toString(); if (text !== undefined) void navigator.clipboard.writeText(text); }}>Copy notes</button>
      </> : revealed === "read" ? <span>Read only — the last saved copy. <button type="button" onClick={retry}>Try opening again</button></span>
      : !loading && <>
        <span><b>{stats.words}</b> word{stats.words === 1 ? "" : "s"}</span>
        <span><b>{stats.mentions}</b> mention{stats.mentions === 1 ? "" : "s"}</span>
        {stats.todos > 0 && <span><b>{stats.done}/{stats.todos}</b> checked</span>}
        <span className="hint">Type <kbd>/</kbd> for blocks · <kbd>@</kbd> for a person or role · <kbd>⌘↵</kbd> ticks a box</span>
      </>}
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
        {!items.length && <div className="empty">{pop.type === "slash" ? "No block called that." : "No one — and no role — by that name."}</div>}
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

function initials(name: string) { return name.split(/\s+/).slice(0, 2).map(s => s[0]).join("").toUpperCase(); }
