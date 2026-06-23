import React from "react";

/**
 * Chapter-health dial + metric breakdown, the briefing-header counterpart to the
 * old ChapterMomentumWidget. Reads the exact `calcHealthScore` output (score,
 * label, breakdown keyed Attendance/GPA/Dues/Service/Deadlines). The dial arc
 * length is score/100 of the circle's circumference. Clicking anywhere on the
 * widget (label, breakdown, or dial) opens the health detail drawer.
 */

const R = 40;
const CIRC = 2 * Math.PI * R; // ≈ 251.3

// Breakdown key → short bar label, in the mock's order.
const ROWS: [string, string][] = [
  ["Attendance", "ATT"],
  ["GPA", "GPA"],
  ["Dues", "DUES"],
  ["Service", "SVC"],
  ["Deadlines", "DDL"],
];

export function HealthDial({
  score,
  label,
  breakdown,
  onExpand,
}: {
  score: number;
  label: "Healthy" | "Needs Attention" | "Critical";
  breakdown: Record<string, number>;
  onExpand?: () => void;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const arc = score >= 80 ? "var(--ok)" : score >= 60 ? "var(--gold)" : "var(--rose)";
  const dash = (clamped / 100) * CIRC;

  return (
    <button
      type="button"
      className="health"
      onClick={onExpand}
      aria-label={`Chapter health ${score} of 100 — ${label}. View detail.`}
      title="View health detail"
    >
      <div className="meta">
        <p className="label">Chapter health</p>
        <p className="state">{label}</p>
        <div className="bk">
          {ROWS.map(([key, abbr]) => {
            const v = Math.round(breakdown[key] ?? 0);
            return (
              <React.Fragment key={key}>
                <span className="k">{abbr}</span>
                <span className="bar"><i style={{ width: `${v}%` }} /></span>
                <span className="v">{v}</span>
              </React.Fragment>
            );
          })}
        </div>
      </div>
      <div className="dial">
        <svg width="100%" height="100%" viewBox="0 0 92 92">
          <circle cx="46" cy="46" r={R} fill="none" style={{ stroke: "var(--line)" }} strokeWidth="5" />
          <circle
            cx="46"
            cy="46"
            r={R}
            fill="none"
            style={{ stroke: arc }}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${dash.toFixed(1)} ${CIRC.toFixed(1)}`}
          />
        </svg>
        <div className="num"><span>{score}</span></div>
      </div>
    </button>
  );
}
