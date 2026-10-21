"use client";

import React, { useEffect } from "react";
import {
  MAX_DASH_NUMBERS,
  presetLayout,
  sameDashboardLayout,
  setWidgetHidden,
  type DashPreset,
  type DashStatId,
  type DashWidgetId,
  type DashboardLayout,
} from "@/lib/dashboard-layout";
import { PaperIcon, type PaperIconName, type PaperTone } from "../../paper/PaperIcon";
import { thumbSvg } from "./thumbs";
import type { DashStat } from "./DashNumbers";
import { DashPortal } from "./DashPortal";

export interface TrayWidget {
  id: DashWidgetId;
  label: string;
  blurb: string;
  tone: PaperTone;
}

/** Sticky bar shown while arranging. */
export function DashEditBar({ onWidgets, onReset, onDone, saving }: { onWidgets: () => void; onReset: () => void; onDone: () => void; saving?: boolean }) {
  return (
    <div className="edit-bar" role="region" aria-label="Arranging the dashboard">
      <span className="pp-tile pp-t-lilac" aria-hidden="true"><PaperIcon name="grip" /></span>
      <p><b>Arrange the dashboard.</b><span className="eb-more"> Drag a card by its handle, tap a number to swap it, hide what you don&apos;t use. Everyone in the org sees this layout.</span></p>
      <button type="button" className="ba-chip eb-widgets" onClick={onWidgets}><PaperIcon name="plus" /> Widgets &amp; numbers</button>
      <button type="button" className="ba-chip eb-ghost" onClick={onReset}><PaperIcon name="refresh" /> Reset</button>
      <button type="button" className="ba-chip eb-done" onClick={onDone} disabled={saving}>{saving ? "Saving…" : "Done"}</button>
    </div>
  );
}

/**
 * "Make it yours": the Customize sheet. Presets, then every widget this org can
 * have as an on/off gallery, then the headline numbers. Changes apply to the
 * page behind it live; nothing is saved until Done on the edit bar.
 */
export function DashCustomizeTray({
  open,
  onClose,
  layout,
  onChange,
  widgets,
  stats,
  numbers,
  onNumbers,
  presets,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  layout: DashboardLayout;
  onChange: (next: DashboardLayout) => void;
  widgets: TrayWidget[];
  stats: Partial<Record<DashStatId, DashStat>>;
  /** The numbers currently shown, in order. */
  numbers: DashStatId[];
  onNumbers: (next: DashStatId[]) => void;
  presets: DashPreset[];
  onReset: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open, onClose]);

  const statIds = Object.keys(stats) as DashStatId[];
  const full = numbers.length >= MAX_DASH_NUMBERS;

  return (
    <DashPortal>
      <div className={`dt-scrim${open ? " on" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside className={`dt${open ? " on" : ""}`} aria-label="Widgets and numbers" aria-hidden={!open} inert={!open}>
        <div className="dt-h">
          <div>
            <h3>Make it yours</h3>
            <p>Show what your org actually uses. Everyone sees the same page.</p>
          </div>
          <button type="button" className="dt-close" onClick={onClose} aria-label="Close"><PaperIcon name="x" /></button>
        </div>

        <div className="dt-b">
          <div className="dt-sec">Start from a layout</div>
          <div className="dt-presets">
            {presets.map(p => {
              const on = sameDashboardLayout(presetLayout(p), layout);
              const icons = (p.layout.numbers ?? numbers).map(k => stats[k as DashStatId]).filter(Boolean).slice(0, 4) as DashStat[];
              return (
                <button key={p.id} type="button" className={`dt-preset${on ? " on" : ""}`} aria-pressed={on} onClick={() => onChange(presetLayout(p))}>
                  <span className="pv">
                    {icons.map((s, i) => <i key={i} style={{ "--c": s.tone } as React.CSSProperties}><PaperIcon name={s.icon} /></i>)}
                  </span>
                  <b>{p.name}</b>
                  <small>{p.blurb}</small>
                </button>
              );
            })}
          </div>

          <div className="dt-sec">Widgets <span>tap to show or hide</span></div>
          <div className="dt-gal">
            {widgets.map(w => {
              const on = !layout.hidden.includes(w.id);
              return (
                <button key={w.id} type="button" className={`gw pp-t-${w.tone}${on ? " on" : ""}`} aria-pressed={on} onClick={() => onChange(setWidgetHidden(layout, w.id, on))}>
                  <span className="th" dangerouslySetInnerHTML={{ __html: thumbSvg(w.id) }} />
                  <span className="tx"><b>{w.label}</b><small>{w.blurb}</small></span>
                  <span className={`sw${on ? " on" : ""}`} aria-hidden="true" />
                </button>
              );
            })}
          </div>

          <div className="dt-sec">Headline numbers <span>up to {MAX_DASH_NUMBERS}, in this order</span></div>
          <div className="dt-nums">
            {statIds.map(k => {
              const s = stats[k]!;
              const at = numbers.indexOf(k);
              const on = at > -1;
              return (
                <button
                  key={k}
                  type="button"
                  className={`dt-num${on ? " on" : ""}`}
                  aria-pressed={on}
                  disabled={!on && full}
                  onClick={() => onNumbers(on ? numbers.filter(x => x !== k) : [...numbers, k])}
                >
                  <span className="dn-tile" style={{ "--c": s.tone } as React.CSSProperties}><PaperIcon name={s.icon as PaperIconName} /></span>
                  <span className="dt-num-l">{s.label}</span>
                  {on ? <small>{at + 1}</small> : null}
                  <span className={`sw${on ? " on" : ""}`} aria-hidden="true" />
                </button>
              );
            })}
          </div>
          {full && <p className="dt-note">That&apos;s the most the strip holds. Switch one off to add another.</p>}
        </div>

        <div className="dt-f">
          <button type="button" className="ba-chip eb-ghost" onClick={onReset}><PaperIcon name="refresh" /> Reset</button>
          <button type="button" className="ba-chip eb-done" onClick={onClose}>Back to the page</button>
        </div>
      </aside>
    </DashPortal>
  );
}
