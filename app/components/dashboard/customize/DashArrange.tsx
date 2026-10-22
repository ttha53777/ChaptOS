"use client";

import React, { useEffect, useState } from "react";
import { PaperIcon } from "../../paper/PaperIcon";
import { DashPortal } from "./DashPortal";

/**
 * Arrange mode's header. It takes the briefing's place on the page, so entering
 * the mode doesn't push anything down and the two buttons that matter sit
 * where the greeting was.
 */
export function ArrangeBar({ onUndo, canUndo, onDone, saving }: { onUndo: () => void; canUndo: boolean; onDone: () => void; saving?: boolean }) {
  return (
    <section id="sec-dashboard" className="ar-bar" aria-label="Arranging the dashboard">
      <div className="ar-msg">
        <b>Drag cards where you want them.</b>
        <span>Everyone in the org sees this layout. <i>×</i> puts a card in the tray below.</span>
      </div>
      <div className="ar-bar-b">
        <button type="button" className="ar-btn ghost" onClick={onUndo} disabled={!canUndo}><PaperIcon name="refresh" /> Undo</button>
        <button type="button" className="ar-btn ink" onClick={onDone} disabled={saving}>{saving ? "Saving…" : "Done"}</button>
      </div>
    </section>
  );
}

export interface ArrangeNote { id: number; message: string }

/**
 * One toast for the whole mode, replaced (not stacked) by each change, with
 * Undo on it. Undo also lives on the bar and on ⌘Z; this is the one that's
 * where you're looking right after a card moves.
 */
export function ArrangeToast({ note, onUndo }: { note: ArrangeNote | null; onUndo?: () => void }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!note) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), 3200);
    return () => clearTimeout(t);
  }, [note]);
  if (!note) return null;
  return (
    <DashPortal>
      <div className={`ar-toast${on ? " on" : ""}`} role="status" aria-live="polite">
        <span>{note.message}</span>
        {onUndo && <button type="button" onClick={() => { setOn(false); onUndo(); }}>Undo</button>}
      </div>
    </DashPortal>
  );
}
