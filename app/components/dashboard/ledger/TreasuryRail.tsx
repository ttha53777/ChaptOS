import React from "react";
import { fmt$ } from "../../../data";
import { MiniAreaChart } from "./MiniAreaChart";

/**
 * Treasury rail card — live balance, delta since the start of the trend, the
 * projected end-of-period figure, and the hand-rolled MiniAreaChart. Replaces
 * the Recharts "Treasury Trend" panel. Carries `id="sec-treasury"` (the sidebar
 * anchor that had no home before).
 */
export function TreasuryRail({
  balance,
  projected,
  trend,
}: {
  balance: number;
  projected: number;
  trend: { month: string; balance: number }[];
}) {
  const start = trend[0]?.balance ?? balance;
  const delta = balance - start;
  const months = [...trend.map((t) => t.month.toUpperCase()), "PROJ"];

  return (
    <section id="sec-treasury" className="card" aria-label="Treasury">
      <div className="card-h">
        <h2>Treasury</h2>
        <span className="sub">Net balance</span>
      </div>
      <div className="treasury-body">
        <div className="treasury-num">
          <span className="big">{fmt$(balance)}</span>
          {delta !== 0 && (
            <span className="delta">{delta > 0 ? "▲" : "▼"} {fmt$(Math.abs(delta))}</span>
          )}
        </div>
        <p className="treasury-note">Projected {fmt$(projected)} by end of period</p>
        <div className="tchart">
          <MiniAreaChart trend={trend} projected={projected} />
          <div className="months">
            {months.map((m, i) => (
              <span key={m + i} style={i === months.length - 1 ? { color: "var(--vio)" } : undefined}>{m}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
