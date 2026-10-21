"use client";

import React, { useEffect, useRef, useState } from "react";
import { MAX_DASH_NUMBERS, setNumberSlot, type DashStatId } from "@/lib/dashboard-layout";
import { LedgerStrip } from "../ledger/LedgerStrip";
import { PaperIcon, type PaperIconName } from "../../paper/PaperIcon";
import { EditChrome } from "./EditChrome";
import { DashPortal } from "./DashPortal";

export interface DashStat {
  label: string;
  icon: PaperIconName;
  /** A CSS colour for the picker's tile, e.g. "var(--pp-mint-ink)". */
  tone: string;
  /** The rendered <Measure>. Customize mode clones it with an `editSlot`. */
  el: React.ReactElement<{ editSlot?: React.ReactNode }>;
}

/**
 * The headline numbers. Outside Customize mode this is the ledger strip as it
 * always was. Inside it, every tile becomes a "Swap" target with a remove
 * button, an "Add a number" tile appears while there's room, and the whole
 * band can be hidden.
 *
 * The picker is `position: fixed` and anchored to the tapped tile, because the
 * paper tiles clip their overflow and the strip wraps at narrow widths.
 */
export function DashNumbers({
  ids,
  stats,
  editing,
  onChange,
  onHide,
}: {
  /** The numbers to show, already filtered to what this org can show. */
  ids: DashStatId[];
  stats: Partial<Record<DashStatId, DashStat>>;
  editing: boolean;
  onChange: (next: DashStatId[]) => void;
  onHide: () => void;
}) {
  const [pick, setPick] = useState<{ slot: number; x: number; y: number; top: number; flip: boolean } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!editing) setPick(null); }, [editing]);
  useEffect(() => {
    if (!pick) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !popRef.current?.contains(e.target as Node)) setPick(null);
    };
    const away = () => setPick(null);
    const t = setTimeout(() => document.addEventListener("pointerdown", close), 0);
    document.addEventListener("keydown", close);
    document.addEventListener("scroll", away, { capture: true, passive: true });
    window.addEventListener("resize", away);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
      document.removeEventListener("scroll", away, { capture: true });
      window.removeEventListener("resize", away);
    };
  }, [pick]);

  const open = (slot: number, el: HTMLElement) => {
    if (pick?.slot === slot) { setPick(null); return; }
    const r = el.getBoundingClientRect();
    const w = Math.min(272, window.innerWidth - 32);
    setPick({ slot, x: Math.max(16, Math.min(r.left, window.innerWidth - w - 16)), y: r.bottom + 8, top: r.top, flip: r.bottom + 360 > window.innerHeight && r.top > 360 });
  };

  const all = Object.keys(stats) as DashStatId[];
  if (!editing && ids.length === 0) return null;

  const strip = (
    <LedgerStrip>
      {ids.map((k, i) => {
        const s = stats[k];
        if (!s) return null;
        if (!editing) return <React.Fragment key={k}>{s.el}</React.Fragment>;
        return React.cloneElement(s.el, {
          key: k,
          editSlot: (
            <>
              <button type="button" className={`dn-cover${pick?.slot === i ? " on" : ""}`} aria-label={`Swap ${s.label}`} aria-haspopup="menu" onClick={e => open(i, e.currentTarget)}>
                <span className="dn-swap"><PaperIcon name="refresh" /> Swap</span>
              </button>
              <button type="button" className="dn-x" title="Remove" aria-label={`Remove ${s.label}`} onClick={() => onChange(ids.filter(x => x !== k))}>
                <PaperIcon name="x" />
              </button>
            </>
          ),
        });
      })}
      {editing && ids.length < MAX_DASH_NUMBERS && ids.length < all.length && (
        <button type="button" className="measure dn-add" onClick={e => open(ids.length, e.currentTarget)} aria-haspopup="menu">
          <PaperIcon name="plus" />
          <span>Add a number</span>
        </button>
      )}
    </LedgerStrip>
  );

  return (
    <div className="dw-band dn" data-w="numbers">
      {strip}
      {editing && <EditChrome label="Headline numbers" onHide={onHide} />}
      {pick && (
        <DashPortal>
        <div
          ref={popRef}
          className="dn-pick"
          role="menu"
          style={pick.flip ? { left: pick.x, bottom: window.innerHeight - pick.top + 8 } : { left: pick.x, top: pick.y }}
        >
          <p>{pick.slot < ids.length ? "Show in this spot" : "Add a number"}</p>
          {all.map(k => {
            const s = stats[k]!;
            const at = ids.indexOf(k);
            const here = at === pick.slot;
            return (
              <button
                key={k}
                type="button"
                role="menuitem"
                className={here ? "on" : ""}
                onClick={() => { onChange(setNumberSlot(ids, pick.slot, k)); setPick(null); }}
                disabled={pick.slot >= ids.length && at > -1}
              >
                <span className="dn-tile" style={{ "--c": s.tone } as React.CSSProperties}><PaperIcon name={s.icon} /></span>
                {s.label}
                {here ? <PaperIcon name="check" className="pp-ic dn-on" /> : at > -1 ? <small>in spot {at + 1}</small> : null}
              </button>
            );
          })}
        </div>
        </DashPortal>
      )}
    </div>
  );
}
