import React from "react";
import { PaperIcon } from "../../paper/PaperIcon";

/**
 * Customize mode's control pill on a widget: a drag handle for the fast path,
 * nudge arrows for touch and keyboard, and hide. Bands (fixed-place widgets)
 * pass only `onHide`.
 */
export function EditChrome({
  label,
  onMove,
  onHide,
  inRail,
}: {
  label: string;
  onMove?: (dir: "up" | "down" | "swap") => void;
  onHide: () => void;
  /** Which way "move to the other column" points. */
  inRail?: boolean;
}) {
  return (
    <div className="ed" role="group" aria-label={`Arrange ${label}`}>
      {onMove && (
        <>
          <span className="ed-grip" title="Drag to move" aria-hidden="true"><PaperIcon name="grip" /></span>
          <button type="button" title="Move up" aria-label={`Move ${label} up`} onClick={() => onMove("up")}><PaperIcon name="chev-u" /></button>
          <button type="button" title="Move down" aria-label={`Move ${label} down`} onClick={() => onMove("down")}><PaperIcon name="chev-d" /></button>
          <button type="button" title={inRail ? "Move to the wide column" : "Move to the side column"} aria-label={`Move ${label} to the other column`} onClick={() => onMove("swap")}><PaperIcon name="swap" /></button>
        </>
      )}
      <button type="button" className="ed-x" title="Hide" aria-label={`Hide ${label}`} onClick={onHide}><PaperIcon name="x" /></button>
    </div>
  );
}
