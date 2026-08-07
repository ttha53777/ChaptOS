import React from "react";
import { fmt$ } from "../../../data";
import { useVocab } from "../../../hooks/useVocab";
import { MiniAreaChart } from "./MiniAreaChart";

/**
 * Treasury rail card — live balance, delta since the start of the trend, the
 * projected end-of-period figure, and the hand-rolled MiniAreaChart. Replaces
 * the Recharts "Treasury Trend" panel. Carries `id="sec-treasury"` (the sidebar
 * anchor that had no home before).
 *
 * `balance`/`projected` are null while the treasury fetch is in flight and when
 * it fails. Both render the empty state rather than a placeholder number —
 * inventing a balance is the one thing a treasury card must never do.
 *
 * Three distinct states, which this card used to collapse into one:
 *   loading   — the fetch hasn't landed. A pending answer is not a negative one,
 *               so it gets a skeleton, not "no transactions yet".
 *   unset     — the fetch landed and the books are empty (`trend` is built from
 *               transaction/party months, so an empty trend means no entries).
 *               `balance` is a real, measured 0 here, but a $0 headline says
 *               nothing an invitation to start the books doesn't say better.
 *   populated — real numbers.
 */
export function TreasuryRail({
  balance,
  projected,
  trend,
  loading = false,
  onLogTransaction,
}: {
  balance: number | null;
  projected: number | null;
  trend: { month: string; balance: number }[];
  loading?: boolean;
  /** Undefined without MANAGE_TREASURY — copy stands, button doesn't. */
  onLogTransaction?: () => void;
}) {
  const v = useVocab();

  if (loading) {
    return (
      <section id="sec-treasury" className="card" aria-label={v("Treasury")}>
        <div className="card-h">
          <h2>{v("Treasury")}</h2>
        </div>
        <div className="rail-skel" aria-busy="true" aria-label={`Loading ${v("Treasury").toLowerCase()}`}>
          <i className="big" />
          <i className="sm" />
        </div>
      </section>
    );
  }

  if (balance === null || projected === null || trend.length === 0) {
    return (
      <section id="sec-treasury" className="card" aria-label={v("Treasury")}>
        <div className="card-h">
          <h2>{v("Treasury")}</h2>
        </div>
        <div className="rail-empty">
          No transactions yet. The books start with your first entry.
          {onLogTransaction && (
            <button type="button" className="a" onClick={onLogTransaction}>Log a transaction →</button>
          )}
        </div>
      </section>
    );
  }

  const start = trend[0]?.balance ?? balance;
  const delta = balance - start;
  const months = [...trend.map((t) => t.month.toUpperCase()), "PROJ"];

  return (
    <section id="sec-treasury" className="card" aria-label={v("Treasury")}>
      <div className="card-h">
        <h2>{v("Treasury")}</h2>
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
