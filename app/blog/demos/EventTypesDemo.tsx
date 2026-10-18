"use client";
// Settings → Event types beside the timeline it colours, drawn the way the app
// draws them: the loose-leaf settings sheet (EventTypesSection) and the
// timeline's segmented filter. Edits apply on Save, as in the app. Built-ins
// can't be deleted, and a custom type can't be deleted while events still use
// it, as the service refuses.
import { useEffect, useState } from "react";
import { Spine } from "./Spine";
import { SEMESTER, TYPES, type EvType } from "./timeline-data";
import { WindowBar } from "./chrome";

/** lib/event-types.ts EVENT_TYPE_PALETTE: the timeline paints `color`, settings dots use `colorDark`. */
const PALETTE = [
  { id: "blue", label: "Blue", color: "#3f6ea3", colorDark: "#8fb0d6" },
  { id: "rose", label: "Rose", color: "#b34f72", colorDark: "#d98ba3" },
  { id: "clay", label: "Clay", color: "#c14a37", colorDark: "#e0796b" },
  { id: "teal", label: "Teal", color: "#2f8579", colorDark: "#5fbdb0" },
  { id: "gold", label: "Gold", color: "#9a7224", colorDark: "#ddb36a" },
  { id: "green", label: "Green", color: "#4a7d4c", colorDark: "#86b988" },
  { id: "purple", label: "Purple", color: "#6d28d9", colorDark: "#a78bfa" },
  { id: "sky", label: "Sky", color: "#2f5d7c", colorDark: "#7fb3d9" },
  { id: "orchid", label: "Orchid", color: "#8b3fa3", colorDark: "#c98bd9" },
];
const dark = (c: string) => PALETTE.find(p => p.color === c)?.colorDark ?? c;
const nextColor = (types: EvType[]) => PALETTE.find(p => !types.some(t => t.color === p.color))?.color ?? PALETTE[0].color;
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);

type Toast = { ok: boolean; msg: string } | null;

function Swatches({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  return <div className="ett-sw" role="radiogroup" aria-label="Color on the timeline">
    {PALETTE.map(p => <button key={p.id} type="button" role="radio" aria-checked={p.color === value} aria-label={`Use ${p.label}`}
      className={p.color === value ? "on" : ""} style={{ background: p.colorDark }} onClick={() => onPick(p.color)} />)}
  </div>;
}

export function EventTypesDemo() {
  const [types, setTypes] = useState<EvType[]>(TYPES);
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("");
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [layer, setLayer] = useState("all");
  const [flash, setFlash] = useState<string | null>(null);

  const count = (id: string) => SEMESTER.filter(e => e.type === id).length;
  const shown = layer === "all" ? SEMESTER : SEMESTER.filter(e => e.type === layer);

  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 1400); return () => clearTimeout(t); }, [flash]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);

  function edit(t: EvType) { setAdding(false); setEditing(t.id); setLabel(t.label); setColor(t.color); }
  function save(t: EvType) {
    setTypes(ts => ts.map(x => x.id === t.id ? { ...x, label: label.trim(), color } : x));
    setEditing(null); setFlash(t.id); setToast({ ok: true, msg: `"${label.trim()}" saved` });
  }
  function remove(t: EvType) {
    const n = count(t.id);
    if (n) { setToast({ ok: false, msg: `${n} event${n > 1 ? "s" : ""} still use${n > 1 ? "" : "s"} "${t.label}". Move ${n > 1 ? "them" : "it"} to another type first.` }); setFlash(t.id); return; }
    setTypes(ts => ts.filter(x => x.id !== t.id));
    if (layer === t.id) setLayer("all");
    setToast({ ok: true, msg: `"${t.label}" removed` });
  }
  function openNew() { setEditing(null); setLabel(""); setColor(nextColor(types)); setAdding(true); }
  function create() {
    const l = label.trim();
    if (!l) return;
    const base = slugify(l) || "type";
    let id = base;
    for (let n = 2; types.some(t => t.id === id); n++) id = `${base}-${n}`;
    setTypes(ts => [...ts, { id, label: l, color, builtin: false, required: false, creatable: true }]);
    setAdding(false); setToast({ ok: true, msg: `"${l}" added` });
  }

  return <div className="bld bld-win tld-types-demo ett">
    <WindowBar path="settings / event types" />
    {flash && <style>{`.ett .tld-row[data-type="${flash}"] .tld-card{animation:ett-flash 1.3s ease both}`}</style>}
    <div className="tld-types-grid">
      <section className="ett-sheet">
        <p className="ett-crumb">Operations</p>
        <h3 className="ett-h">Event types</h3>
        <p className="ett-lede">The categories your timeline runs on. Built-ins can be renamed and recolored; your own can be added or removed.</p>

        <div className="ett-card">
          {types.map(t => editing === t.id
            ? <div key={t.id} className="ett-row ett-edit">
                <div className="ett-2">
                  <label><span className="ett-ml">Label</span>
                    <input className="ett-in" value={label} maxLength={40} autoFocus onChange={e => setLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && label.trim()) save(t); if (e.key === "Escape") setEditing(null); }} /></label>
                  <label><span className="ett-ml">Slug (permanent)</span><input className="ett-in mono" value={t.id} disabled /></label>
                </div>
                <span className="ett-ml">Color on the timeline</span>
                <Swatches value={color} onPick={setColor} />
                <div className="ett-acts">
                  <button type="button" className="ett-btn pri" disabled={!label.trim()} onClick={() => save(t)}>Save</button>
                  <button type="button" className="ett-btn" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </div>
            : <div key={t.id} className="ett-row">
                <span className="ett-dot" style={{ background: dark(t.color) }} />
                <div className="ett-main">
                  <div className="ett-key">{t.label}{t.builtin && <span className="ett-tag">Built-in</span>}</div>
                  <div className="ett-sub"><code>{t.id}</code> · {count(t.id)} event{count(t.id) === 1 ? "" : "s"}</div>
                </div>
                <div className="ett-acts">
                  <button type="button" className="ett-btn" onClick={() => edit(t)}>Edit</button>
                  {!t.builtin && <button type="button" className="ett-btn del" onClick={() => remove(t)}>Delete</button>}
                </div>
              </div>)}
        </div>

        {adding
          ? <div className="ett-new">
              <h4>New event type</h4>
              <label><span className="ett-ml">Label *</span>
                <input className="ett-in" value={label} maxLength={40} placeholder="Rush Week" autoFocus onChange={e => setLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") create(); if (e.key === "Escape") setAdding(false); }} /></label>
              {label.trim() && <p className="ett-note">Slug: <code>{slugify(label) || "type"}</code>, permanent once created.</p>}
              <span className="ett-ml">Color on the timeline</span>
              <Swatches value={color} onPick={setColor} />
              <div className="ett-acts">
                <button type="button" className="ett-btn pri" disabled={!label.trim()} onClick={create}>Create type</button>
                <button type="button" className="ett-btn" onClick={() => setAdding(false)}>Cancel</button>
              </div>
            </div>
          : <button type="button" className="ett-add" onClick={openNew}><span>+</span> Add event type</button>}

        {toast && <p className={`ett-toast ${toast.ok ? "ok" : "err"}`} role="status">{!toast.ok && <b>Couldn&apos;t delete. </b>}{toast.msg}</p>}
      </section>

      <div className="tld-types-tl">
        <div className="ett-seg" role="tablist" aria-label="Filter events">
          <button type="button" role="tab" aria-selected={layer === "all"} className={layer === "all" ? "on" : ""} onClick={() => setLayer("all")}>
            All <span className="ct">{SEMESTER.length}</span>
          </button>
          {types.map(t => <button key={t.id} type="button" role="tab" aria-selected={layer === t.id} className={layer === t.id ? "on" : ""}
            style={{ ["--c" as string]: t.color }} onClick={() => setLayer(t.id)}>
            <i />{t.label} <span className="ct">{count(t.id)}</span>
          </button>)}
        </div>
        <div className="tld-scroll">
          <Spine events={shown} types={types} empty={<p>No events of this type yet.<b>Add one from the timeline.</b></p>} />
        </div>
      </div>
    </div>
  </div>;
}
