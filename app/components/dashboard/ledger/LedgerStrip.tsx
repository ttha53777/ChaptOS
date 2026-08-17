import React from "react";

/** Container for the ledger strip. Auto-flows columns so hidden measures simply
 *  collapse the grid (no empty gaps). */
export function LedgerStrip({ children }: { children: React.ReactNode }) {
  return <section className="ledger" aria-label="Key measures">{children}</section>;
}

/**
 * One ledger measure. A `role="button"` div (not <button>) so the admin
 * `hideButton` can nest without invalid button-in-button markup; keyboard
 * activation is wired explicitly. `value` is the main mono number; `unitLeading`
 * renders before it (e.g. "$"), `unit` after (e.g. "%"/"h").
 *
 * `unset` marks a measure with no records behind it. The caller passes "—" as
 * the value and a reason as the note; this flag suppresses the units (an
 * em-dash has no percent sign) and tints the value so it reads as an absence.
 * A measure that was never recorded must never print a number nobody measured.
 *
 * `noteAction` is the one next move for an unset measure — a real <button>
 * inside the note line, which is legal here precisely because the tile is a div.
 * It stops propagation so it doesn't also open the tile's KPI drawer.
 *
 * `loading` means this measure's section hasn't landed yet — distinct from
 * `unset`, which is a settled answer ("nothing was ever recorded"). The label
 * stays, the number becomes a skeleton in the value's own box, and the tile stops
 * being interactive: opening a KPI drawer onto data that hasn't arrived shows a
 * second, emptier version of the same wait.
 */
export function Measure({
  label,
  value,
  unit,
  unitLeading,
  unset,
  note,
  noteWarn,
  noteGood,
  noteAction,
  spark,
  onClick,
  hideButton,
  loading = false,
  error = false,
  onRetry,
}: {
  label: string;
  value: string;
  unit?: string;
  unitLeading?: string;
  unset?: boolean;
  note?: string;
  noteWarn?: boolean;
  /** Tints the note green — a measure that is at zero because it is CLEAR, not
   *  because nothing was ever recorded. Ignored when `noteWarn` is also set. */
  noteGood?: boolean;
  noteAction?: { label: string; onClick: () => void };
  spark?: React.ReactNode;
  onClick?: () => void;
  hideButton?: React.ReactNode;
  loading?: boolean;
  /** This measure's section failed. Takes precedence over `loading`, which stays
   *  true for a failed section (it never joins `loadedSections`). Reuses the
   *  em-dash + note shape rather than a bespoke tile: an unreadable measure and
   *  an unrecorded one look the same in the strip, and the note says which. */
  error?: boolean;
  onRetry?: () => void;
}) {
  if (error) {
    return (
      <div className="measure">
        <p className="k">{label}</p>
        <p className="v unset">—</p>
        <p className="note warn">
          Couldn&apos;t load.
          {onRetry && (
            <>
              {" "}
              <button type="button" className="note-act" onClick={(e) => { e.stopPropagation(); onRetry(); }}>
                Retry
              </button>
            </>
          )}
        </p>
        {hideButton}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="measure" aria-busy="true" aria-label={`${label}, loading`}>
        <p className="k">{label}</p>
        {/* Inside the real `.v` box so the tile keeps its height and the strip
            doesn't jump a row when the number lands. */}
        <p className="v"><i className="skel val" /></p>
        <p className="note"><i className="skel line" /></p>
        {hideButton}
      </div>
    );
  }

  return (
    <div
      className="measure"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <p className="k">{label}</p>
      <p className={unset ? "v unset" : "v"}>
        {!unset && unitLeading && <small>{unitLeading}</small>}
        {value}
        {!unset && unit && <small>{unit}</small>}
      </p>
      {note && (
        <p className={noteWarn ? "note warn" : noteGood ? "note good" : "note"}>
          {note}
          {noteAction && (
            <>
              {" "}
              <button
                type="button"
                className="note-act"
                onClick={(e) => { e.stopPropagation(); noteAction.onClick(); }}
              >
                {noteAction.label}
              </button>
            </>
          )}
        </p>
      )}
      {spark}
      {hideButton}
    </div>
  );
}
