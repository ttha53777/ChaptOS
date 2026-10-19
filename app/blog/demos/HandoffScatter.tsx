"use client";
// The opener: where last year's files actually are. A graduated president's
// Drive, a pinned group-chat link, a forwarded email, a laptop folder. Tap a
// locked one and you're asking an alum for access. "File them" walks each into
// the chapter's library, one folder at a time.
import { useEffect, useRef, useState } from "react";
import { WindowBar } from "./chrome";
import { FOLDERS, KIND_PATH, type Kind } from "./handoff-data";

type Src = "drive" | "chat" | "mail" | "disk";
type Item = { id: string; src: Src; label: string; title: string; kind: Kind; folder: string; locked?: boolean };

/** Every file as it's found, in filing order. `label` is what it's called where it lives now. */
const ITEMS: Item[] = [
  { id: "bylaws", src: "drive", label: "Bylaws (2024 revision)", title: "Bylaws (2024 revision)", kind: "doc", folder: "bylaws", locked: true },
  { id: "handbook", src: "drive", label: "Officer handbook", title: "Officer handbook", kind: "doc", folder: "bylaws", locked: true },
  { id: "dues", src: "chat", label: "dues sheet → docs.google.com/sp…", title: "Dues tracker", kind: "sheet", folder: "money" },
  { id: "budget", src: "drive", label: "Fall budget", title: "Fall budget", kind: "sheet", folder: "money", locked: true },
  { id: "rush", src: "chat", label: "rush plan's in my drive, lmk", title: "Rush week plan", kind: "doc", folder: "rush", locked: true },
  { id: "contract", src: "mail", label: "contract_signed.pdf", title: "Grand Hall contract", kind: "link", folder: "events" },
  { id: "risk", src: "disk", label: "risk_policy_OLD.docx", title: "Risk management policy", kind: "doc", folder: "bylaws" },
  { id: "formal", src: "disk", label: "formal checklist (1).xlsx", title: "Formal checklist", kind: "sheet", folder: "events" },
];

const ic = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
const LOCK = ic("M7 11V8a5 5 0 0110 0v3M5 11h14v10H5z");
const SRC: Record<Src, { name: string; sub: string; icon: React.ReactNode }> = {
  drive: { name: "Shared with me", sub: "owner graduated in May", icon: ic(KIND_PATH.drive) },
  chat: { name: "Group chat · pinned", sub: "412 messages", icon: ic("M4 5h16v11H9l-5 4z") },
  mail: { name: "Fwd: Fwd: venue", sub: "from a personal email", icon: ic("M3 6h18v12H3zM3 7l9 6 9-6") },
  disk: { name: "Desktop › chapter stuff", sub: "someone's laptop", icon: ic("M4 5h16v11H4zM2 19h20") },
};

export function HandoffScatter() {
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(false);
  const [denied, setDenied] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const done = step >= ITEMS.length;

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  function file() {
    if (running) return;
    setDenied(null);
    setStep(0);
    setRunning(true);
    let n = 0;
    timer.current = setInterval(() => {
      n += 1;
      setStep(n);
      if (n >= ITEMS.length) { clearInterval(timer.current!); timer.current = null; setRunning(false); }
    }, 460);
  }
  function reset() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null; setRunning(false); setStep(0); setDenied(null); setAsked(false);
  }
  function knock(it: Item) {
    if (!it.locked || isFiled(it.id)) return;
    setAsked(false);
    setDenied(d => d === it.id ? null : it.id);
  }

  const filed = ITEMS.slice(0, step);
  const isFiled = (id: string) => filed.some(f => f.id === id);
  const fresh = running ? ITEMS[step - 1]?.id : null;
  const deniedItem = ITEMS.find(i => i.id === denied);

  const item = (it: Item) => {
    const f = isFiled(it.id);
    return (
      <li key={it.id} className={`${it.locked && !f ? "locked" : ""}${fresh === it.id ? " lit" : ""}${f ? " gone" : ""}${denied === it.id ? " knocked" : ""}`}>
        <button type="button" onClick={() => knock(it)} disabled={!it.locked || f} aria-label={it.locked ? `${it.label} (locked)` : it.label}>
          <span className="g">{ic(KIND_PATH[it.kind])}</span>
          <span className="l">{it.label}</span>
          {it.locked && !f && <span className="lk">{LOCK}</span>}
        </button>
      </li>
    );
  };
  const src = (s: Src, cls: string, extra?: React.ReactNode) => (
    <section className={`ho-src ${cls}`} aria-label={SRC[s].name}>
      <header><span className="ic">{SRC[s].icon}</span><b>{SRC[s].name}</b><small>{SRC[s].sub}</small></header>
      <ul>{ITEMS.filter(i => i.src === s).map(item)}</ul>
      {extra}
    </section>
  );

  return <div className="bld bld-win ho-scatter">
    <WindowBar path="where last year's files live" />
    <div className="ho-scatter-grid">
      <div className={`ho-desk${done ? " is-done" : ""}`}>
        {src("drive", "s-drive")}
        {src("chat", "s-chat", <p className="ho-chatq"><b>Tyler</b> does anyone have the venue contract??</p>)}
        {src("mail", "s-mail")}
        {src("disk", "s-disk")}

        {deniedItem && (
          <div className="ho-wall" role="dialog" aria-label="You need access">
            <span className="lk">{LOCK}</span>
            <b>You need access</b>
            <p>“{deniedItem.label}” is in someone's personal Drive.</p>
            {asked
              ? <p className="sent">Request sent to the owner, who graduated in May.</p>
              : <button type="button" className="tld-btn sm" onClick={() => setAsked(true)}>Request access</button>}
            <button type="button" className="x" onClick={() => setDenied(null)} aria-label="Close">×</button>
            {asked && <span className="ho-denied" aria-hidden>Still waiting</span>}
          </div>
        )}
      </div>

      <div className="ho-shelf">
        <div className="ho-shelf-h">
          <p className="kick">Docs<span>{filed.length ? `${filed.length} filed` : "the chapter's library"}</span></p>
          {done
            ? <button type="button" className="tld-btn ghost sm" onClick={reset}>Scatter them again</button>
            : <button type="button" className="tld-btn" style={{ ["--ac" as string]: "var(--peach)" }} onClick={file} disabled={running}>{running ? "Filing…" : "File them in Docs"}</button>}
        </div>
        <div className="ho-folders">
          {FOLDERS.map(f => {
            const inside = filed.filter(i => i.folder === f.id);
            return (
              <div key={f.id} className={`ho-mf${inside.some(i => i.id === fresh) ? " took" : ""}`} style={{ ["--fc" as string]: f.c }}>
                <span className="tab">{f.name}<i>{inside.length}</i></span>
                <ul className="body">
                  {inside.length === 0 && <li className="empty">nothing here yet</li>}
                  {inside.map(i => (
                    <li key={i.id} className={`k-${i.kind}${fresh === i.id ? " fresh" : ""}`}>
                      <span className="g">{ic(KIND_PATH[i.kind])}</span>{i.title}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className={`ho-shelf-f${done ? " on" : ""}`}>
          {done
            ? <><b>Eight files, four folders, one link.</b> Every member opens the same shelf, and nobody has to ask who has what.</>
            : <>Four places, three of them locked. <b>Try opening the handbook.</b></>}
        </p>
      </div>
    </div>
  </div>;
}
