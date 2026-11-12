import React from "react";
import { fmt$ } from "../../../data";
import { useVocab } from "../../../hooks/useVocab";
import { SectionError } from "./SectionError";
import { PaperIcon, PaperTile } from "../../paper/PaperIcon";
import { MiniAreaChart } from "./MiniAreaChart";
import "../treasury-card.css";

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
 *
 * "Unset" itself splits in two (_design/Treasury Widget Day One Mock.html):
 *   never opened — no opening balance and no entries. The officer gets a
 *                  welcome that sends them to /treasury, where TreasuryOpenBooks
 *                  asks the one question; a member gets a closed book and no
 *                  button. Nothing is entered on the dashboard.
 *   opened       — an opening balance but no entries yet. The balance gets full
 *                  ink; there's no projection (it would equal the balance) and
 *                  no chart, just a dot where the line will start.
 *
 * The card is a size container (treasury-card.css): moved into the main column
 * or the top spot, the welcome lays its art beside the copy instead of above it.
 */
export function TreasuryRail({
  balance,
  projected,
  trend,
  openingBalance = null,
  loading = false,
  error = false,
  onRetry,
  onLogTransaction,
  onOpenBooks,
}: {
  balance: number | null;
  projected: number | null;
  trend: { month: string; balance: number }[];
  /**
   * A stated opening balance is itself an entry: the org told us what was in the
   * account, so the headline is a real number even before the first transaction.
   */
  openingBalance?: number | null;
  loading?: boolean;
  /** The treasury fetch failed. Takes precedence over `loading`, which stays true
   *  for a failed section (it never joins `loadedSections`). */
  error?: boolean;
  onRetry?: () => void;
  /** Undefined without MANAGE_TREASURY — copy stands, button doesn't. */
  onLogTransaction?: () => void;
  /** Undefined without MANAGE_TREASURY: members get the closed-book state. */
  onOpenBooks?: () => void;
}) {
  const v = useVocab();

  if (error) {
    return (
      <section id="sec-treasury" className="card" aria-label={v("Treasury")}>
        <div className="card-h">
          <PaperTile icon="receipt" tone="mint" />
          <h2>{v("Treasury")}</h2>
        </div>
        <SectionError what="the books" onRetry={onRetry} />
      </section>
    );
  }

  if (loading) {
    return (
      <section id="sec-treasury" className="card" aria-label={v("Treasury")}>
        <div className="card-h">
          <PaperTile icon="receipt" tone="mint" />
          <h2>{v("Treasury")}</h2>
        </div>
        <div className="rail-skel" aria-busy="true" aria-label={`Loading ${v("Treasury").toLowerCase()}`}>
          <i className="big" />
          <i className="sm" />
        </div>
      </section>
    );
  }

  if (balance === null || projected === null || (trend.length === 0 && openingBalance === null)) {
    return (
      <section id="sec-treasury" className="card tc" aria-label={v("Treasury")}>
        <div className="card-h">
          <PaperTile icon="receipt" tone="mint" />
          <h2>{v("Treasury")}</h2>
          {onOpenBooks && <span className="tc-chip">New</span>}
        </div>
        {onOpenBooks ? (
          <div className="tc-wl">
            <OpenLedgerArt />
            <div className="tc-wl-copy">
              <h3 className="tc-wl-h">Keep all the <span className="tc-hi">money</span> in one place.</h3>
              <p className="tc-wl-p">Dues, expenses and the bank balance, all on one page. To start, all you need is what’s in the account today.</p>
              <div className="tc-wl-act">
                <button type="button" className="tc-btn" onClick={onOpenBooks}>
                  Set up the {v("Treasury").toLowerCase()}<PaperIcon name="arrow-r" />
                </button>
                <p className="tc-wl-fine">About two minutes · you can change it later</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="tc-mb">
            <div className="tc-book" aria-hidden="true"><span className="cv" /><span className="pg" /><span className="bd" /><span className="lb" /></div>
            <div>
              <h3>The books aren’t open yet.</h3>
              <p>Once an officer enters the opening balance, the balance and where it’s heading will show up here.</p>
            </div>
          </div>
        )}
      </section>
    );
  }

  if (trend.length === 0) {
    return (
      <section id="sec-treasury" className="card tc" aria-label={v("Treasury")}>
        <div className="card-h">
          <PaperTile icon="receipt" tone="mint" />
          <h2>{v("Treasury")}</h2>
          <span className="sub">Net balance</span>
        </div>
        <div className="treasury-body">
          <div className="tc-op-num">
            <span className="big">{fmt$(balance)}</span>
            <span className="tc-op-tag"><PaperIcon name="check" />Books open</span>
          </div>
          <p className="treasury-note">Opening balance</p>
          <div className="tc-start" aria-hidden="true">
            {/* The dot is its own unstretched svg so it stays round at any card width. */}
            <div className="tc-start-track">
              <svg className="tc-start-ln" viewBox="0 0 300 36" preserveAspectRatio="none"><path className="ln" d="M8 18 H300" /></svg>
              <svg className="tc-start-pt" viewBox="0 0 16 36">
                <circle className="ring" cx="8" cy="18" r="6" />
                <circle className="dot" cx="8" cy="18" r="4" />
              </svg>
            </div>
            <div className="tc-start-lb"><b>OPENING</b><span>next entry →</span></div>
          </div>
          <p className="tc-op-next">The line starts moving with your <b>first entry</b>. The end-of-term projection appears once there’s a trend to project.</p>
        </div>
        {onLogTransaction && (
          <div className="card-f">
            <button type="button" onClick={onLogTransaction}>
              <PaperIcon name="pencil" />Log the first transaction<PaperIcon name="arrow-r" />
            </button>
          </div>
        )}
      </section>
    );
  }

  const start = trend[0]?.balance ?? balance;
  const delta = balance - start;
  const months = [...trend.map((t) => t.month.toUpperCase()), "PROJ"];

  return (
    <section id="sec-treasury" className="card" aria-label={v("Treasury")}>
      <div className="card-h">
        <PaperTile icon="receipt" tone="mint" />
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
          <MiniAreaChart trend={trend} projected={projected} stroke="var(--tchart-stroke, var(--vio))" />
          <div className="months">
            {months.map((m, i) => (
              <span key={m + i} style={i === months.length - 1 ? { color: "var(--tchart-stroke, var(--vio))" } : undefined}>{m}</span>
            ))}
          </div>
        </div>
      </div>
      {onLogTransaction && (
        <div className="card-f">
          <button type="button" onClick={onLogTransaction}>
            <PaperIcon name="pencil" />Log a transaction<PaperIcon name="arrow-r" />
          </button>
        </div>
      )}
    </section>
  );
}

/** An open ledger waiting for its first line: no numbers, no direction. */
function OpenLedgerArt() {
  return (
    <svg className="tc-art" viewBox="0 0 220 132" aria-hidden="true">
      <path className="sh" transform="translate(5 5)" d="M22 34C55 24 88 26 110 38C132 26 165 24 198 34V106C165 98 132 100 110 112C88 100 55 98 22 106Z" />
      <path className="pg" d="M22 34C55 24 88 26 110 38V112C88 100 55 98 22 106Z" />
      <path className="pg" d="M110 38C132 26 165 24 198 34V106C165 98 132 100 110 112Z" />
      <path className="sp" d="M110 38V112" />
      <path className="rl" d="M36 50L96 53M36 63L96 66M36 76L96 79M36 89L80 91" />
      <path className="hl" d="M122 50L186 46L186 57L122 61Z" />
      <text className="dl" x="126" y="59">$</text>
      <path className="rl" d="M138 56.5L182 53.5" strokeDasharray="2 4" />
      <path className="rl" d="M124 72L186 68M124 85L186 81M124 98L168 95" />
      <g className="ink">
        <path className="cn" d="M14 116v-5a15 5.4 0 0 1 30 0v5a15 5.4 0 0 1-30 0Z" />
        <ellipse className="cn-t" cx="29" cy="111" rx="15" ry="5.4" />
        <path className="cn" d="M17 108v-5a15 5.4 0 0 1 30 0v5a15 5.4 0 0 1-30 0Z" />
        <ellipse className="cn-t" cx="32" cy="103" rx="15" ry="5.4" />
      </g>
      <g className="pencil">
        <g className="ink" transform="translate(150 118) rotate(-40)">
          <rect className="er" x="-10" y="-5" width="9" height="10" rx="2.5" />
          <rect className="wd" x="-1.5" y="-5" width="5" height="10" />
          <rect className="pe" x="3.5" y="-5" width="52" height="10" />
          <path className="wd" d="M55.5 -5L69 0L55.5 5Z" />
          <path className="ld" d="M65 -1.5L69 0L65 1.5Z" stroke="none" />
        </g>
      </g>
      <path className="s1 twk" d="M200 8c.6 4 2.6 6 6.6 6.6-4 .6-6 2.6-6.6 6.6-.6-4-2.6-6-6.6-6.6 4-.6 6-2.6 6.6-6.6Z" />
      <path className="s2 twk b" d="M12 16c.4 2.8 1.8 4.2 4.6 4.6-2.8.4-4.2 1.8-4.6 4.6-.4-2.8-1.8-4.2-4.6-4.6 2.8-.4 4.2-1.8 4.6-4.6Z" />
    </svg>
  );
}
