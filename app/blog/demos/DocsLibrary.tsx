"use client";
// The library itself: pinned index cards up top, a manila folder per subject,
// and an Unfiled pile. Officers file a doc by dragging it onto a folder's tab
// (or tapping the doc, then the folder), pin what people ask for, and search
// across everything. Switch to a member's view and it's the same shelf.
import { useEffect, useRef, useState } from "react";
import { WindowBar } from "./chrome";
import { FOLDERS, KIND_HOST, KIND_LABEL, KIND_PATH, LIBRARY, type Kind, type LibDoc } from "./handoff-data";

const ic = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
const PIN = ic("M9 4h6l-1 6 4 4H6l4-4zM12 14v6");
const GO = ic("M7 17L17 7M9 7h8v8");
const KINDS: Kind[] = ["doc", "sheet", "form", "drive", "link"];

type As = "officer" | "member";

export function DocsLibrary() {
  const [docs, setDocs] = useState<LibDoc[]>(LIBRARY);
  const [as, setAs] = useState<As>("officer");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind | "all">("all");
  const [held, setHeld] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  const [shut, setShut] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (toastT.current) clearTimeout(toastT.current); }, []);

  const officer = as === "officer";
  const needle = q.trim().toLowerCase();
  const filtering = !!needle || kind !== "all";
  const match = (d: LibDoc) =>
    (kind === "all" || d.kind === kind) &&
    (!needle || `${d.title} ${d.note} ${FOLDERS.find(f => f.id === d.folder)?.name ?? ""}`.toLowerCase().includes(needle));

  const say = (t: string) => {
    setToast(t);
    if (toastT.current) clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), 2600);
  };

  function fileInto(id: string, folder: string | null) {
    const d = docs.find(x => x.id === id);
    setHeld(null); setOver(null);
    if (!d || d.folder === folder) return;
    setDocs(ds => ds.map(x => x.id === id ? { ...x, folder } : x));
    setLanded(id);
    setShut(s => { const n = new Set(s); if (folder) n.delete(folder); return n; });
    setTimeout(() => setLanded(l => l === id ? null : l), 900);
    say(`Filed “${d.title}” in ${FOLDERS.find(f => f.id === folder)?.name ?? "Unfiled"}`);
  }
  const togglePin = (id: string) => setDocs(ds => ds.map(x => x.id === id ? { ...x, pinned: !x.pinned } : x));
  const open = (d: LibDoc) => say(`Opening “${d.title}” in a new tab`);
  function tapRow(d: LibDoc) {
    if (!officer) return open(d);
    setHeld(h => h === d.id ? null : d.id);
  }

  // `/` jumps to search, as it does on the real page, once the reader has
  // clicked into the demo (so it never steals the key from the rest of the post).
  const armed = useRef(false);
  useEffect(() => {
    const down = (e: PointerEvent) => { armed.current = !!root.current?.contains(e.target as Node); };
    const key = (e: KeyboardEvent) => {
      if (!armed.current) return;
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === "/" && !typing) { e.preventDefault(); search.current?.focus(); }
      if (e.key === "Escape") { setHeld(null); if (e.target === search.current) { setQ(""); search.current?.blur(); } }
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
  }, []);

  const pinned = docs.filter(d => d.pinned && match(d));
  const sections: { id: string | null; name: string; c: string }[] = [
    ...FOLDERS, { id: null, name: "Unfiled", c: "var(--line-2)" },
  ];
  const total = docs.length;
  const count = (k: Kind | "all") => docs.filter(d => k === "all" || d.kind === k).length;

  const row = (d: LibDoc) => (
    <li key={d.id}
      className={`ho-row k-${d.kind}${held === d.id ? " held" : ""}${landed === d.id ? " landed" : ""}`}
      draggable={officer}
      onDragStart={e => { e.dataTransfer.setData("text/plain", d.id); e.dataTransfer.effectAllowed = "move"; setHeld(d.id); }}
      onDragEnd={() => { setOver(null); }}>
      <button type="button" className="main" onClick={() => tapRow(d)} aria-pressed={officer ? held === d.id : undefined}>
        <span className="fav">{ic(KIND_PATH[d.kind])}</span>
        <span className="what">
          <b>{needle ? <Hi text={d.title} q={needle} /> : d.title}</b>
          {d.note && <small>{d.note}</small>}
        </span>
        <span className="host">{KIND_HOST[d.kind]}</span>
        <span className="kind">{KIND_LABEL[d.kind]}</span>
      </button>
      {officer
        ? <button type="button" className={`pin${d.pinned ? " on" : ""}`} onClick={() => togglePin(d.id)} aria-label={`Pin ${d.title}`} title="Pin to the top">{PIN}</button>
        : <button type="button" className="pin go" onClick={() => open(d)} aria-label={`Open ${d.title}`}>{GO}</button>}
    </li>
  );

  return <div ref={root} className={`bld bld-win ho-lib${held ? " holding" : ""}${officer ? "" : " as-member"}`}>
    <WindowBar path="chaptos.com/alpha-beta/docs" />
    <div className="ho-lib-in">
      <div className="ho-lib-head">
        <div>
          <p className="kick">Docs</p>
          <h4>The chapter's <em>library</em></h4>
          <p className="meta"><b>{total}</b> docs · <b>{FOLDERS.length}</b> folders · open to all <b>52</b> members</p>
        </div>
        <div className="ho-as" role="group" aria-label="Viewing as">
          <span>Viewing as</span>
          <button type="button" className={officer ? "on" : ""} onClick={() => { setAs("officer"); setHeld(null); }}>Secretary</button>
          <button type="button" className={officer ? "" : "on"} onClick={() => { setAs("member"); setHeld(null); }}>New member</button>
        </div>
      </div>

      <div className="ho-tools">
        <label className="ho-search">
          {ic("M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4")}
          <input ref={search} value={q} onChange={e => setQ(e.target.value)} placeholder="Search the library" aria-label="Search the library" />
          {q ? <button type="button" onClick={() => setQ("")} aria-label="Clear search">×</button> : <kbd>/</kbd>}
        </label>
        <div className="ho-seg" role="tablist" aria-label="Kind">
          {(["all", ...KINDS] as const).map(k => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} className={`${kind === k ? "on" : ""} k-${k}`} onClick={() => setKind(k)}>
              {k === "all" ? "All" : KIND_LABEL[k]}<span className="ct">{count(k)}</span>
            </button>
          ))}
        </div>
      </div>

      {pinned.length > 0 && (
        <div className="ho-pins">
          {pinned.map(d => (
            <div key={d.id} className={`ho-card k-${d.kind}`}>
              <span className="tape" />
              <span className="top"><span className="fav">{ic(KIND_PATH[d.kind])}</span><span className="kind">{KIND_LABEL[d.kind]}</span>
                {officer && <button type="button" className="unpin" onClick={() => togglePin(d.id)} aria-label={`Unpin ${d.title}`}>×</button>}
              </span>
              <b>{d.title}</b>
              <small>{d.note || "No note"}</small>
              <button type="button" className="go" onClick={() => open(d)}>Open {GO}</button>
            </div>
          ))}
        </div>
      )}

      <div className="ho-secs">
        {sections.map(s => {
          const key = s.id ?? "unfiled";
          const all = docs.filter(d => d.folder === s.id && !d.pinned);
          const rows = all.filter(match);
          if (s.id === null && all.length === 0 && !held) return null;
          if (filtering && rows.length === 0) return null;
          const closed = shut.has(key) && !filtering;
          const target = officer && !!held && docs.find(d => d.id === held)?.folder !== s.id;
          return (
            <section key={key} className={`ho-sec${s.id ? "" : " unfiled"}${closed ? " closed" : ""}${over === key ? " over" : ""}${target ? " target" : ""}`}
              style={{ ["--fc" as string]: s.c }}
              onDragOver={e => { if (!officer) return; e.preventDefault(); setOver(key); }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(o => o === key ? null : o); }}
              onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id) fileInto(id, s.id); }}>
              <button type="button" className="ho-tab"
                onClick={() => {
                  if (held) return fileInto(held, s.id);
                  setShut(sh => { const n = new Set(sh); if (n.has(key)) n.delete(key); else n.add(key); return n; });
                }}
                aria-expanded={!closed}>
                <span className="nm">{s.name}</span><span className="ct">{all.length}</span>
                {target && <span className="drop">File here</span>}
              </button>
              {closed
                ? <div className="ho-lip" />
                : <ul className="ho-ledger">
                    {rows.map(row)}
                    {rows.length === 0 && <li className="ho-none">{s.id ? "Drop a doc on the tab to file it here." : "Nothing loose."}</li>}
                  </ul>}
            </section>
          );
        })}
        {filtering && pinned.length === 0 && docs.filter(d => !d.pinned).filter(match).length === 0 && (
          <p className="ho-empty">Nothing matches “{q}”. Try “dues” or “contract”.</p>
        )}
      </div>

      <p className="ho-lib-f">
        {officer
          ? held ? <>Now tap a folder's tab to file it there.</> : <>Drag a loose doc onto a folder's tab, or tap the doc and then the folder.</>
          : <>Same shelf, nothing to request. Arranging it takes the Docs permission, which comes with the seat.</>}
      </p>
    </div>
    {toast && <div className="ho-toast" role="status">{toast}</div>}
  </div>;
}

function Hi({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}
