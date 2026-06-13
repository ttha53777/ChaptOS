import React from "react";

/** Container for the ledger strip. Auto-flows columns so hidden measures simply
 *  collapse the grid (no empty gaps). */
export function LedgerStrip({ children }: { children: React.ReactNode }) {
  return <section className="ledger" aria-label="Chapter measures">{children}</section>;
}

/**
 * One ledger measure. A `role="button"` div (not <button>) so the admin
 * `hideButton` can nest without invalid button-in-button markup; keyboard
 * activation is wired explicitly. `value` is the main mono number; `unitLeading`
 * renders before it (e.g. "$"), `unit` after (e.g. "%"/"h").
 */
export function Measure({
  label,
  value,
  unit,
  unitLeading,
  note,
  noteWarn,
  spark,
  onClick,
  hideButton,
}: {
  label: string;
  value: string;
  unit?: string;
  unitLeading?: string;
  note?: string;
  noteWarn?: boolean;
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
      <p className="v">
        {unitLeading && <small>{unitLeading}</small>}
        {value}
        {unit && <small>{unit}</small>}
      </p>
      {note && <p className={noteWarn ? "note warn" : "note"}>{note}</p>}
      {spark}
      {hideButton}
    </div>
  );
}
