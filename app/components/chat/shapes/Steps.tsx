"use client";

// Steps (_design/Ask Chapt Answer System Mock.html#steps) — a how-to as a path
// through the app: where it lives as keycap crumbs, the steps on a rail, the
// fields the screen will ask for as dashed slots, and the button that goes
// there. Every label comes from a playbook written against the real screen
// (lib/ai-howto.ts); the model only picked which one.

import { IcArrow, IcChev } from "../icons";
import type { StepsShape } from "../types";
import { iv, type RowHandlers } from "./common";

export function StepsSheet({ shape, h }: { shape: StepsShape; h: RowHandlers }) {
  // Leaving for the screen goes through the same nav a row with a screen uses.
  const go = () => h.act({ kind: "generic", title: shape.screen.label, screen: shape.screen });
  return (
    <div className="shp sp in in-3">
      <div className="sp-crumbs">
        {shape.crumbs.map((c, i) => (
          <span key={`${c}-${i}`} className="sp-cw">
            {i > 0 && <IcChev size={11} />}
            <span className={`crumb${i === shape.crumbs.length - 1 ? " end" : ""}`}>{c}</span>
          </span>
        ))}
      </div>
      <ol className="sp-l">
        {shape.steps.map((s, i) => (
          <li key={`${s.title}-${i}`} style={iv(i)}>
            <span className="sp-n">{i + 1}</span>
            <div>
              <b>{s.title}</b>
              {s.hint && <p>{s.hint}</p>}
              {s.fields && s.fields.length > 0 && (
                <div className="flds">
                  {s.fields.map(f => <span key={f.label} className="fld"><i>{f.label}</i>{f.example}</span>)}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className="sp-foot">
        <button type="button" className="sp-go" onClick={go}>Open {shape.screen.label}<IcArrow /></button>
        {shape.perm && (
          <span className={`sp-perm${shape.perm.ok ? "" : " no"}`}>
            {shape.perm.ok ? `You'll need ${shape.perm.label}. You have it.` : `This needs ${shape.perm.label}, which you don't have.`}
          </span>
        )}
      </div>
    </div>
  );
}
