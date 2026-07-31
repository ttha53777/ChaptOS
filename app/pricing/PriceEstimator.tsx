"use client";

/**
 * "How many of you are there?" → the real answer.
 *
 * A client island on an otherwise static page. It's here because the bands are
 * the one thing visitors have to do arithmetic on — "we're 38, which row is
 * that, and is 38 the number that counts?" — and answering it badly is how a
 * pricing page loses people.
 *
 * It calls tierForCount, the same function the app bills from, so this can't
 * quote a different price than the invoice.
 */

import { useState } from "react";
import { SELF_SERVE_MAX, formatPrice, formatRange, needsQuote, tierForCount } from "@/lib/billing/tiers";

const MAX_INPUT = 999;

export function PriceEstimator() {
  const [raw, setRaw] = useState("38");

  // Empty input is a real state, not zero — blanking the field to retype
  // shouldn't flash "$0, Free" at you.
  const trimmed = raw.trim();
  const parsed = trimmed === "" ? null : Number(trimmed);
  const count =
    parsed === null || !Number.isFinite(parsed) ? null : Math.min(MAX_INPUT, Math.max(1, Math.floor(parsed)));

  const band = count === null ? null : tierForCount(count);
  const quote = count !== null && needsQuote(count);

  return (
    <div className="pr__estcard">
      <label className="pr__estfield" htmlFor="pr-count">
        <span>People on your roster</span>
        <input
          id="pr-count"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_INPUT}
          value={raw}
          onChange={e => setRaw(e.target.value)}
        />
      </label>

      <div className="pr__estarrow" aria-hidden="true">→</div>

      <div className="pr__estout" aria-live="polite">
        {band === null ? (
          <p className="pr__estempty">Put a number in.</p>
        ) : quote ? (
          <>
            <p className="pr__estprice"><span className="pr__custom">Let&apos;s talk</span></p>
            <p className="pr__estband">
              Above {SELF_SERVE_MAX} we price per organization —{" "}
              <a href="/contact">ask us for a quote</a>.
            </p>
          </>
        ) : (
          <>
            <p className="pr__estprice">
              <span className="n">{formatPrice(band.priceCents)}</span>
              <span className="per">/month</span>
            </p>
            <p className="pr__estband">
              {band.label} · {formatRange(band)}
              {band.priceCents === 0 && " · nothing to pay"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
