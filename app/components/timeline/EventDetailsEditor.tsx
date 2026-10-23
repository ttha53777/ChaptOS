"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  CUSTOM_KINDS, DETAIL_KINDS, DETAIL_ORDER, DRESS_CODES, GUEST_LABEL, GUEST_MODES, MAX_EVENT_DETAILS,
  budgetTotal, collabNames, detailSummary, makeDetail, money, newDetailId, suggestedKinds,
  type DetailOf, type DetailType, type EventDetail,
} from "@/lib/event-details";
import { DETAIL_ICON, UI_ICON } from "./detail-icons";

/** A roster member the contact / sign-up pickers can choose. */
export interface DetailMember { id: number; name: string; title?: string }

/**
 * Page 2 of the event form: a drawer of detail kinds on the left and the
 * event's own page on the right (_design/Event Details Paper Mock.html).
 *
 * Each detail is a small paper object shaped like what it holds — a notepad
 * checklist, a till-receipt budget, a business-card contact, a ticket-stub cap,
 * an index card for the officer's own field. One detail is open at a time; the
 * rest fold to a one-line header with their summary, two to a row, so the page
 * stays short however many are added. Click or drag a kind to add it; drag the
 * grip (or use the arrows) to reorder.
 */
export function EventDetailsEditor({ details, onChange, category, categoryLabel, categoryColor, members, focus }: {
  details: EventDetail[];
  onChange: (next: EventDetail[]) => void;
  category: string;
  categoryLabel: string;
  categoryColor: string;
  members: DetailMember[];
  /** Open (and scroll to) this detail — a stamp on page 1 was clicked. */
  focus?: string | null;
}) {
  const [open, setOpen] = useState<string | null>(() => details[0]?.id ?? null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ add?: DetailType; move?: string } | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [grabbed, setGrabbed] = useState<string | null>(null);
  // A removed detail slides off the page first; it leaves the list when that ends.
  const [leaving, setLeaving] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const full = details.length >= MAX_EVENT_DETAILS;
  const nameOf = (id: number) => members.find(m => m.id === id)?.name;

  // A just-added detail opens with its first box focused.
  useEffect(() => {
    if (!fresh) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-detail="${fresh}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const t = setTimeout(() => el?.querySelector<HTMLElement>(".edt-fld-b input:not([type=checkbox]), .edt-fld-b select, .edt-fld-b textarea, .edt-name input")?.focus({ preventScroll: true }), 240);
    const done = setTimeout(() => setFresh(null), 600);
    return () => { clearTimeout(t); clearTimeout(done); };
  }, [fresh]);

  useEffect(() => { if (focus) jumpTo(focus); }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  function existing(type: DetailType) { return type === "custom" ? undefined : details.find(d => d.type === type); }
  function jumpTo(id: string) {
    setOpen(id);
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector<HTMLElement>(`[data-detail="${id}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.animate?.([{ transform: "rotate(0)" }, { transform: "rotate(-1.2deg)" }, { transform: "rotate(1deg)" }, { transform: "rotate(0)" }], { duration: 420, easing: "ease-out" });
    });
  }
  function add(type: DetailType, at?: number) {
    const have = existing(type);
    if (have) return jumpTo(have.id);
    if (full) return;
    const d = makeDetail(type);
    const next = [...details];
    next.splice(at == null || at > next.length ? next.length : at, 0, d);
    onChange(next);
    setOpen(d.id);
    setFresh(d.id);
  }
  function remove(id: string) {
    if (leaving) return;
    const gone = () => { setLeaving(null); onChange(details.filter(d => d.id !== id)); if (open === id) setOpen(null); };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return gone();
    setLeaving(id);
    setTimeout(gone, 280);
  }
  function move(id: string, by: number) {
    const i = details.findIndex(d => d.id === id), j = i + by;
    if (i < 0 || j < 0 || j >= details.length) return;
    const next = [...details];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  function set(next: EventDetail) { onChange(details.map(d => d.id === next.id ? next : d)); }

  // ── drag: drawer → page adds, grip → page reorders ──
  function indexAt(y: number) {
    const els = Array.from(listRef.current?.querySelectorAll<HTMLElement>(":scope > .edt-fld") ?? []);
    for (let i = 0; i < els.length; i++) { const r = els[i].getBoundingClientRect(); if (y < r.top + r.height / 2) return i; }
    return els.length;
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const at = indexAt(e.clientY);
    if (drag?.add) add(drag.add, at);
    if (drag?.move) {
      const from = details.findIndex(d => d.id === drag.move);
      if (from >= 0) {
        const next = [...details];
        const [d] = next.splice(from, 1);
        next.splice(at > from ? at - 1 : at, 0, d);
        onChange(next);
      }
    }
    setDrag(null); setDropAt(null); setGrabbed(null);
  }

  const suggested: DetailType[] = suggestedKinds(category).filter(t => t !== "custom");
  const groups = ["Plan it", "People", "On the day"] as const;
  const kindBtn = (type: DetailType) => {
    const k = DETAIL_KINDS[type], used = !!existing(type);
    return (
      <button
        key={type}
        type="button"
        className={`edt-kind${used ? " used" : ""}${type === "custom" ? " custom" : ""}`}
        data-hue={k.hue}
        draggable={!used && !full}
        disabled={full && !used}
        onDragStart={e => { setDrag({ add: type }); e.dataTransfer.setData("text/plain", type); e.dataTransfer.effectAllowed = "copy"; }}
        onDragEnd={() => { setDrag(null); setDropAt(null); }}
        onClick={() => add(type)}
        title={used ? "Already on this event — click to find it" : `Add ${k.name}`}
      >
        <span className="ti">{DETAIL_ICON[type]}</span>
        <span className="nm">{k.name}</span>
        {used && <span className="on" aria-label="Added">{UI_ICON.tick}</span>}
      </button>
    );
  };

  return (
    <div className="edt">
      <aside className="edt-drawer" aria-label="Detail drawer">
        <h3>Add a detail</h3>
        <p className="sub">{full ? `That's the most one event can hold (${MAX_EVENT_DETAILS}).` : "Click one, or drag it onto the page."}</p>
        <div className="edt-kinds-wrap">
          <div className="edt-grp"><span className="cdot" style={{ background: categoryColor }} />Good for {categoryLabel}</div>
          <div className="edt-kinds">{suggested.map(kindBtn)}</div>
          {groups.map(g => {
            const ks = DETAIL_ORDER.filter(t => DETAIL_KINDS[t].group === g && !suggested.includes(t));
            if (!ks.length) return null;
            return (
              <React.Fragment key={g}>
                <div className="edt-grp">{g}</div>
                <div className="edt-kinds">{ks.map(kindBtn)}</div>
              </React.Fragment>
            );
          })}
          <div className="edt-grp">Make your own</div>
          <div className="edt-kinds">{kindBtn("custom")}</div>
        </div>
      </aside>

      <div
        className={`edt-sheet${drag ? " drop-on" : ""}`}
        onDragOver={e => { if (!drag) return; e.preventDefault(); setDropAt(indexAt(e.clientY)); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropAt(null); }}
        onDrop={onDrop}
      >
        <div className="edt-sheet-h">
          <h3>On this event</h3>
          {details.length > 0 && <span className="mini">{details.length} detail{details.length > 1 ? "s" : ""} · drag ⠿ to reorder</span>}
        </div>

        {details.length === 0 ? (
          <div className="edt-empty">
            <svg className="doodle" viewBox="0 0 92 60" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M86 40C64 52 40 50 26 30 20 22 18 14 18 8" /><path d="M10 16l8-9 7 10" /></svg>
            <h4>Nothing extra yet</h4>
            <p>Each detail is a little form of its own. Add only what this event needs — the rest of the form stays as short as it was.</p>
            <div className="quick">
              {[...suggested, "custom" as const].map(t => (
                <button key={t} type="button" className="edt-qk" data-hue={DETAIL_KINDS[t].hue} onClick={() => add(t)}>
                  <span className="ti">{DETAIL_ICON[t]}</span>{DETAIL_KINDS[t].name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="edt-fields" ref={listRef}>
            {details.map((d, i) => (
              <React.Fragment key={d.id}>
                {dropAt === i && <div className="edt-drop" />}
                <Field
                  d={d} set={set} index={i} last={details.length - 1}
                  open={open === d.id} fresh={fresh === d.id} bye={leaving === d.id} dragging={drag?.move === d.id}
                  draggable={grabbed === d.id}
                  summary={detailSummary(d, nameOf)}
                  onToggle={() => setOpen(o => o === d.id ? null : d.id)}
                  onOpen={() => setOpen(d.id)}
                  onRemove={() => remove(d.id)}
                  onMove={by => move(d.id, by)}
                  onGrab={() => setGrabbed(d.id)}
                  onDragStart={e => { setDrag({ move: d.id }); e.dataTransfer.setData("text/plain", d.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => { setDrag(null); setDropAt(null); setGrabbed(null); }}
                >
                  <Body d={d} set={set} members={members} />
                </Field>
              </React.Fragment>
            ))}
            {dropAt === details.length && <div className="edt-drop" />}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ d, set, index, last, open, fresh, bye, dragging, draggable, summary, onToggle, onOpen, onRemove, onMove, onGrab, onDragStart, onDragEnd, children }: {
  d: EventDetail; set: (d: EventDetail) => void; index: number; last: number; open: boolean; fresh: boolean; bye: boolean; dragging: boolean; draggable: boolean;
  summary: string | null;
  onToggle: () => void; onOpen: () => void; onRemove: () => void; onMove: (by: number) => void; onGrab: () => void;
  onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void;
  children: React.ReactNode;
}) {
  const k = DETAIL_KINDS[d.type];
  // A custom field's header already shows its name, so its note is only the value.
  const note = d.type === "custom" ? (summary && d.label.trim() ? summary.slice(d.label.trim().length).replace(/^:\s*/, "") : "") : (summary ?? "Not filled in yet");
  return (
    <article
      className={`edt-fld${open ? " open" : ""}${fresh ? " fresh" : ""}${bye ? " bye" : ""}${dragging ? " dragging" : ""}`}
      data-hue={k.hue}
      data-detail={d.id}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div
        className="edt-fld-h"
        onClick={e => { if (!(e.target as HTMLElement).closest("button, input, select, label")) onToggle(); }}
      >
        <button type="button" className="edt-grip" title="Drag to reorder" aria-label="Drag to reorder" onPointerDown={onGrab}>{UI_ICON.grip}</button>
        <span className="ti">{DETAIL_ICON[d.type]}</span>
        <div className="edt-name">
          {d.type === "custom" ? (
            <CustomName d={d} open={open} onOpen={onOpen} set={set} />
          ) : k.name}
        </div>
        {note && <span className="edt-sum">{note}</span>}
        <div className="edt-acts">
          <button type="button" className="edt-ib" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>{UI_ICON.up}</button>
          <button type="button" className="edt-ib" aria-label="Move down" disabled={index === last} onClick={() => onMove(1)}>{UI_ICON.down}</button>
          <button type="button" className="edt-ib rm" aria-label={`Remove ${k.name}`} onClick={onRemove}>{UI_ICON.x}</button>
        </div>
        <button type="button" className="edt-chev" aria-expanded={open} aria-label={open ? `Fold ${k.name}` : `Open ${k.name}`} onClick={onToggle}>{UI_ICON.chev}</button>
      </div>
      {open && <div className="edt-fld-b">{children}</div>}
    </article>
  );
}

/** The custom field's name is typed in its header, so it edits while folded too. */
function CustomName({ d, open, onOpen, set }: { d: DetailOf<"custom">; open: boolean; onOpen: () => void; set: (d: EventDetail) => void }) {
  return (
    <input
      value={d.label}
      className="edt-bare"
      placeholder="Name this field…"
      aria-label="Field name"
      maxLength={80}
      onFocus={() => { if (!open) onOpen(); }}
      onChange={e => set({ ...d, label: e.target.value })}
    />
  );
}

/** Enter adds a row; the input clears for the next one. */
function AddRow({ placeholder, onAdd, mono }: { placeholder: string; onAdd: (v: string) => void; mono?: boolean }) {
  const [v, setV] = useState("");
  return (
    <div className={`edt-addrow${mono ? " mono" : ""}`}>
      <span className="plus">{UI_ICON.plus}</span>
      <input
        className="edt-bare"
        value={v}
        placeholder={placeholder}
        onChange={e => setV(e.target.value)}
        onKeyDown={e => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          e.stopPropagation();
          const t = v.trim();
          if (!t) return;
          onAdd(t);
          setV("");
        }}
        onBlur={() => { const t = v.trim(); if (t) { onAdd(t); setV(""); } }}
      />
    </div>
  );
}
const DelBtn = ({ onClick }: { onClick: () => void }) => (
  <button type="button" className="edt-ib edt-del" aria-label="Remove row" onClick={onClick}>{UI_ICON.trash}</button>
);

/** A number box that lets you type "12." on the way to "12.50". */
function NumInput({ value, onValue, className, ariaLabel, int }: { value: number | null; onValue: (n: number | null) => void; className?: string; ariaLabel: string; int?: boolean }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => { setText(t => (t === "" && value == null) || Number(t) === value ? t : value == null ? "" : String(value)); }, [value]);
  return (
    <input
      className={className}
      inputMode={int ? "numeric" : "decimal"}
      aria-label={ariaLabel}
      value={text}
      onChange={e => {
        const t = e.target.value.replace(int ? /[^\d]/g : /[^\d.]/g, "");
        setText(t);
        if (t === "" || t === ".") return onValue(null);
        const n = int ? parseInt(t, 10) : Number(t);
        if (Number.isFinite(n)) onValue(n);
      }}
    />
  );
}

function Body({ d, set, members }: { d: EventDetail; set: (d: EventDetail) => void; members: DetailMember[] }) {
  switch (d.type) {
    case "checklist": {
      const n = d.items.length, k = d.items.filter(i => i.done).length;
      return (
        <div className="edt-todo">
          {n > 0 && <div className="prog"><i style={{ width: `${(k / n) * 100}%` }} /></div>}
          {d.items.map(it => (
            <div key={it.id} className={`row${it.done ? " done" : ""}`}>
              <label className="chk">
                <input type="checkbox" checked={it.done} aria-label="Done" onChange={e => set({ ...d, items: d.items.map(x => x.id === it.id ? { ...x, done: e.target.checked } : x) })} />
                <i />{UI_ICON.tick}
              </label>
              <input className="t edt-bare" value={it.t} aria-label="Task" maxLength={200} onChange={e => set({ ...d, items: d.items.map(x => x.id === it.id ? { ...x, t: e.target.value } : x) })} />
              <DelBtn onClick={() => set({ ...d, items: d.items.filter(x => x.id !== it.id) })} />
            </div>
          ))}
          {n < 50 && <AddRow placeholder={n ? "Add another…" : "Book the room, buy ice, print the sign-in sheet…"} onAdd={t => set({ ...d, items: [...d.items, { id: newDetailId(), t: t.slice(0, 200), done: false }] })} />}
        </div>
      );
    }
    case "budget": {
      return (
        <>
          <div className="edt-rcpt">
            <div className="hd">— PLANNED COSTS —</div>
            {d.items.map(it => (
              <div key={it.id} className="row">
                <input className="l edt-bare" value={it.label} aria-label="Item" maxLength={120} onChange={e => set({ ...d, items: d.items.map(x => x.id === it.id ? { ...x, label: e.target.value } : x) })} />
                <span className="lead" />
                <span className="amt">$<NumInput className="edt-bare" value={it.amt} ariaLabel="Amount" onValue={n => set({ ...d, items: d.items.map(x => x.id === it.id ? { ...x, amt: n == null ? null : Math.min(n, 10_000_000) } : x) })} /></span>
                <DelBtn onClick={() => set({ ...d, items: d.items.filter(x => x.id !== it.id) })} />
              </div>
            ))}
            {d.items.length < 50 && (
              <AddRow mono placeholder="Add a line — e.g. Food 120" onAdd={v => {
                const m = v.match(/^(.*?)[\s$]*([\d.,]+)$/);
                const amt = m ? Number(m[2].replace(/,/g, "")) : NaN;
                set({ ...d, items: [...d.items, { id: newDetailId(), label: (m ? m[1].trim() || "Item" : v).slice(0, 120), amt: Number.isFinite(amt) ? Math.min(amt, 10_000_000) : null }] });
              }} />
            )}
            <div className="tot"><span>TOTAL</span><span>{money(budgetTotal(d))}</span></div>
          </div>
          <p className="edt-note">A plan, not a payment — nothing posts to Treasury. Only officers see it.</p>
        </>
      );
    }
    case "supplies":
      return (
        <div className="edt-signup">
          {d.items.map(it => (
            <div key={it.id} className="row">
              <input className="t edt-bare" value={it.item} aria-label="Item" maxLength={120} onChange={e => set({ ...d, items: d.items.map(x => x.id === it.id ? { ...x, item: e.target.value } : x) })} />
              <select
                className={`who edt-bare${it.who != null ? " set" : ""}`}
                aria-label="Who's bringing it"
                value={it.who ?? ""}
                onChange={e => set({ ...d, items: d.items.map(x => x.id === it.id ? { ...x, who: e.target.value ? Number(e.target.value) : null } : x) })}
              >
                <option value="">Unclaimed</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <DelBtn onClick={() => set({ ...d, items: d.items.filter(x => x.id !== it.id) })} />
            </div>
          ))}
          {d.items.length < 50 && <AddRow placeholder={d.items.length ? "Add another item…" : "Speaker, cups, folding tables…"} onAdd={t => set({ ...d, items: [...d.items, { id: newDetailId(), item: t.slice(0, 120), who: null }] })} />}
          <p className="edt-note">Members can claim an unclaimed item from the event on the Timeline.</p>
        </div>
      );
    case "contact": {
      const m = members.find(x => x.id === d.who);
      const ini = m ? m.name.split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase() : "?";
      return (
        <>
          <div className="edt-bcard">
            <span className="ava">{ini}</span>
            <select className="edt-bare" aria-label="Member" value={d.who ?? ""} onChange={e => set({ ...d, who: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Choose a member…</option>
              {members.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <span className="role">{m ? (m.title || "Member") : "From your roster"}</span>
            <div className="ln">{UI_ICON.phone}<input className="edt-bare" value={d.phone} placeholder="(555) 000-0000" inputMode="tel" aria-label="Phone" maxLength={40} onChange={e => set({ ...d, phone: e.target.value })} /></div>
          </div>
          <div className="edt-prefer">Best way to reach them
            <div className="edt-seg">
              {([["text", "Text"], ["call", "Call"]] as const).map(([v, l]) => (
                <button key={v} type="button" aria-pressed={d.prefer === v} onClick={() => set({ ...d, prefer: v })}>{l}</button>
              ))}
            </div>
          </div>
        </>
      );
    }
    case "guests":
      return (
        <>
          <div className="edt-doors">
            {GUEST_MODES.map(g => (
              <button key={g} type="button" className="door" aria-pressed={d.mode === g} onClick={() => set({ ...d, mode: g })}>
                {UI_ICON.doors[g === "plus" ? "plus" : g]}<b>{GUEST_LABEL[g].b}</b><small>{GUEST_LABEL[g].s}</small>
              </button>
            ))}
          </div>
          {d.mode === "plus" && (
            <div className="edt-subq">Guests per member
              <div className="edt-seg">
                {[1, 2, 3].map(n => <button key={n} type="button" aria-pressed={d.plus === n} onClick={() => set({ ...d, plus: n })}>{n}</button>)}
              </div>
            </div>
          )}
        </>
      );
    case "capacity":
      return (
        <div className="edt-tkt">
          <div className="main">
            <div className="lbl">Head-count cap</div>
            <div className="stepper">
              <button type="button" aria-label="Five fewer" onClick={() => set({ ...d, cap: Math.max(1, d.cap - 5) })}>−</button>
              <NumInput int className="edt-bare" value={d.cap} ariaLabel="Capacity" onValue={n => set({ ...d, cap: Math.min(100_000, Math.max(1, n ?? 1)) })} />
              <button type="button" aria-label="Five more" onClick={() => set({ ...d, cap: Math.min(100_000, d.cap + 5) })}>+</button>
            </div>
          </div>
          <div className="stub"><div><b>{d.cap}</b>ADMIT</div></div>
        </div>
      );
    case "dress":
      return (
        <>
          <div className="edt-tags">
            {DRESS_CODES.map(c => (
              <button key={c} type="button" className="tag" aria-pressed={d.pick === c} onClick={() => set({ ...d, pick: d.pick === c ? null : c })}>{c}</button>
            ))}
          </div>
          {d.pick && (
            <div className="edt-under">
              <input className="edt-inp" value={d.note} maxLength={200} onChange={e => set({ ...d, note: e.target.value })}
                placeholder={d.pick === "Theme" ? "What's the theme? e.g. Wear the colors" : "Anything else? e.g. No open-toed shoes"} />
            </div>
          )}
        </>
      );
    case "directions":
      return (
        <div className="edt-dir">
          <textarea className="edt-inp" value={d.text} maxLength={1000} placeholder="Park in Lot 4, come in the side door by the loading dock…" onChange={e => set({ ...d, text: e.target.value })} />
          <div className="code"><span>Door code</span><input className="edt-inp" value={d.code} maxLength={20} placeholder="— — — —" aria-label="Door code" onChange={e => set({ ...d, code: e.target.value })} /></div>
        </div>
      );
    case "links":
      return (
        <div className="edt-lnks">
          {d.items.map(it => (
            <div key={it.id} className="row">
              <div className="ltag">
                <input className="l edt-bare" value={it.label} placeholder="Label" aria-label="Label" maxLength={80} onChange={e => set({ ...d, items: d.items.map(x => x.id === it.id ? { ...x, label: e.target.value } : x) })} />
                <input className="u edt-bare" value={it.url} placeholder="https://" aria-label="Link" maxLength={2000} inputMode="url" onChange={e => set({ ...d, items: d.items.map(x => x.id === it.id ? { ...x, url: e.target.value } : x) })} />
              </div>
              <DelBtn onClick={() => set({ ...d, items: d.items.filter(x => x.id !== it.id) })} />
            </div>
          ))}
          {d.items.length < 20 && <AddRow placeholder={d.items.length ? "Add another link…" : "Name a link — e.g. RSVP form"} onAdd={t => set({ ...d, items: [...d.items, { id: newDetailId(), label: t.slice(0, 80), url: "" }] })} />}
        </div>
      );
    case "theme":
      return (
        <>
          <input className="edt-inp" value={d.text} maxLength={120} aria-label="Theme" placeholder="All White, Black & Gold, Y2K…" onChange={e => set({ ...d, text: e.target.value })} />
          <p className="edt-note">On a party, this is the same theme as on the Parties page.</p>
        </>
      );
    case "collabs":
      return (
        <>
          {d.items.length > 0 && (
            <div className="edt-choices edt-collabs">
              {d.items.map(it => (
                <span key={it.id} className="choice">
                  {it.name}
                  <button type="button" className="xx" aria-label={`Remove ${it.name}`} onClick={() => set({ ...d, items: d.items.filter(x => x.id !== it.id) })}>{UI_ICON.x}</button>
                </span>
              ))}
            </div>
          )}
          {d.items.length < 20 && <AddRow placeholder={d.items.length ? "Add another org…" : "KDF, DSP… — press Enter after each"} onAdd={t => {
            const have = new Set(d.items.map(i => i.name.toLowerCase()));
            const add = collabNames(t).filter(n => !have.has(n.toLowerCase()));
            if (add.length) set({ ...d, items: [...d.items, ...add.map(name => ({ id: newDetailId(), name }))].slice(0, 20) });
          }} />}
        </>
      );
    case "custom": {
      const val = typeof d.value === "string" ? d.value : "";
      return (
          <div className="edt-idx">
            <div className="kindrow"><span>Holds</span>
              <div className="edt-seg">
                {CUSTOM_KINDS.map(v => (
                  <button key={v} type="button" aria-pressed={d.kind === v} onClick={() => set({ ...d, kind: v, value: null })}>
                    {{ text: "Text", number: "Number", yesno: "Yes / No", date: "Date", choice: "Pick one" }[v]}
                  </button>
                ))}
              </div>
            </div>
            <div className="val">
              {d.kind === "text" && <textarea className="edt-inp" value={val} maxLength={2000} placeholder="Type anything…" onChange={e => set({ ...d, value: e.target.value })} />}
              {d.kind === "number" && <input className="edt-inp" value={val} inputMode="decimal" placeholder="0" style={{ maxWidth: 160 }} onChange={e => set({ ...d, value: e.target.value.replace(/[^\d.-]/g, "") })} />}
              {d.kind === "date" && <input className="edt-inp" type="date" value={val} style={{ maxWidth: 200 }} onChange={e => set({ ...d, value: e.target.value })} />}
              {d.kind === "yesno" && (
                <div className="edt-yn">
                  <button type="button" aria-pressed={d.value === true} onClick={() => set({ ...d, value: d.value === true ? null : true })}>Yes</button>
                  <button type="button" aria-pressed={d.value === false} onClick={() => set({ ...d, value: d.value === false ? null : false })}>No</button>
                </div>
              )}
              {d.kind === "choice" && (
                <>
                  <div className="edt-choices">
                    {d.options.map((o, i) => (
                      <span key={`${o}-${i}`} className="choice" role="button" tabIndex={0} aria-pressed={d.value === o}
                        onClick={() => set({ ...d, value: d.value === o ? null : o })}
                        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); set({ ...d, value: d.value === o ? null : o }); } }}>
                        {o}
                        <span className="xx" role="button" aria-label="Remove option" onClick={e => { e.stopPropagation(); set({ ...d, options: d.options.filter((_, j) => j !== i), value: d.value === o ? null : d.value }); }}>{UI_ICON.x}</span>
                      </span>
                    ))}
                  </div>
                  {d.options.length < 20 && <AddRow placeholder={d.options.length ? "Add an option…" : "Type an option and press Enter"} onAdd={t => { const o = t.slice(0, 60); if (!d.options.includes(o)) set({ ...d, options: [...d.options, o] }); }} />}
                  {d.options.length > 0 && <p className="edt-note">Tap one to choose it for this event.</p>}
                </>
              )}
            </div>
          </div>
      );
    }
  }
}
