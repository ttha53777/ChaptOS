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
 */
export function Measure({
  label,
  value,
  unit,
  unitLeading,
  unset,
  note,
  noteWarn,
  noteAction,
  spark,
  onClick,
  hideButton,
}: {
  label: string;
  value: string;
  unit?: string;
  unitLeading?: string;
  unset?: boolean;
  note?: string;
  noteWarn?: boolean;
  noteAction?: { label: string; onClick: () => void };
  spark?: React.ReactNode;
  onClick?: () => void;
  hideButton?: React.ReactNode;
}) {
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
        <p className={noteWarn ? "note warn" : "note"}>
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
