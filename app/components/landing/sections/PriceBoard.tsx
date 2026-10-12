"use client";

import { useState } from "react";
import { BILLING_BANDS, SELF_SERVE_MAX, formatPrice, tierForCount, type BillingBand } from "@/lib/billing/tiers";
import { Doodle, sx } from "../Doodle";

/** Pastel per band, ascending. Same order /pricing uses, so the pages agree. */
const TINT = ["mint", "sky", "lilac", "butter"] as const;

/** One dot per person up to the self-serve ceiling; past it the grid is full. */
const DOTS = SELF_SERVE_MAX;

/** Where the open-ended quote band stops on the slider. Display only. */
const QUOTE_CEIL = 200;

/** Each band gets an equal quarter of the slider, so 1–4 isn't a sliver. */
const STEPS = 1000;
const SEG = STEPS / BILLING_BANDS.length;

const ceilOf = (b: BillingBand) => b.upTo ?? QUOTE_CEIL;

function toCount(v: number): number {
  const i = Math.min(BILLING_BANDS.length - 1, Math.floor(v / SEG));
  const b = BILLING_BANDS[i];
  return Math.round(b.from + ((v - i * SEG) / SEG) * (ceilOf(b) - b.from));
}

function toValue(n: number): number {
  const i = BILLING_BANDS.indexOf(tierForCount(n));
  const b = BILLING_BANDS[i];
  return i * SEG + ((n - b.from) / (ceilOf(b) - b.from || 1)) * (SEG - 1);
}

/** A sensible headcount to jump to when a band card is clicked. */
const PRESET = BILLING_BANDS.map(b => Math.round((b.from + ceilOf(b)) / 2));

const rangeLabel = (b: BillingBand) => (b.upTo === null ? `${b.from}+` : `${b.from}–${b.upTo}`);

/**
 * The landing page's price answer as one control: drag to your headcount and
 * the whole roster fills in one colour against one flat price. Every figure is
 * BILLING_BANDS; the slider only decides which band is shown.
 */
export function PriceBoard() {
  const [count, setCount] = useState(32);
  const band = tierForCount(count);
  const bi = BILLING_BANDS.indexOf(band);
  const tint = TINT[bi] ?? "mint";
  const quote = band.priceCents === null;
  const free = band.priceCents === 0;
  const value = toValue(count);

  return (
    <div
      className="pboard"
      style={sx({
        "--tint": `var(--${tint})`,
        "--tint-soft": `var(--${tint}-soft)`,
        "--tint-ink": `var(--${tint}-ink)`,
      })}
    >
      <span className="pboard__hint" aria-hidden="true">
        try dragging me
        <svg className="doodle doodle--thin" viewBox="0 0 120 46">
          <use href="#d-swirl" />
        </svg>
      </span>

      <div className="pboard__main">
        <p className="pboard__count">
          <label htmlFor="price-headcount">Your chapter has</label>
          <span className="pboard__n mono">{count}</span>
          <span className="mute">people</span>
        </p>

        <div className="pboard__people" aria-hidden="true">
          {Array.from({ length: DOTS }, (_, i) => (
            <i key={i} className={i < count ? "on" : undefined} />
          ))}
        </div>
        <p className="pboard__over mono" aria-hidden="true">
          {count > DOTS ? `+ ${count - DOTS} more` : ""}
        </p>

        <div className="pboard__bands">
          {BILLING_BANDS.map((b, i) => (
            <button
              key={b.id}
              type="button"
              className={`pband${b === band ? " is-on" : ""}`}
              style={sx({ "--bs": `var(--${TINT[i]}-soft)`, "--bf": `var(--${TINT[i]})`, "--bi": `var(--${TINT[i]}-ink)` })}
              onClick={() => setCount(PRESET[i])}
              aria-pressed={b === band}
            >
              <span className="pband__r mono">{rangeLabel(b)}</span>
              <span className="pband__p">
                {b.priceCents === null ? (
                  "Let’s talk"
                ) : b.priceCents === 0 ? (
                  "Free"
                ) : (
                  <>
                    {formatPrice(b.priceCents)} <small>/mo</small>
                  </>
                )}
              </span>
            </button>
          ))}
        </div>

        <input
          id="price-headcount"
          className="pboard__range"
          type="range"
          min={0}
          max={STEPS}
          value={value}
          onChange={e => setCount(toCount(Number(e.target.value)))}
          aria-valuetext={`${count} people, ${quote ? "custom quote" : `${formatPrice(band.priceCents)} a month`}`}
          style={sx({ "--fill": `${(value / STEPS) * 100}%` })}
        />
      </div>

      <div className="pboard__tag" aria-live="polite">
        <p className="pboard__lbl">{quote ? "Big chapter?" : "Whole org pays"}</p>
        <p key={band.id} className={`pboard__big${quote ? " is-quote" : ""}`}>
          {quote ? "Let’s talk" : formatPrice(band.priceCents)}
        </p>
        <p className="pboard__per">
          {quote ? "we’ll price it with you" : free ? "free while you’re this small" : "a month, for everyone"}
        </p>
        <p className="pboard__each mono">
          {quote
            ? `${band.from}+ people`
            : free
              ? "no card needed"
              : `≈ $${((band.priceCents ?? 0) / 100 / count).toFixed(2)} a head`}
        </p>
        <a className="btn btn--sm pboard__cta" href={quote ? "/contact" : "/create"}>
          {quote ? "Get a quote" : "Start free"}
          <Doodle id="arrow-r" className="doodle doodle--thin" size={16} viewBox="0 0 24 24" />
        </a>
      </div>
    </div>
  );
}
