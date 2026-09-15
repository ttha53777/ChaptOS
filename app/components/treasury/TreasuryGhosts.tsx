import React from "react";

/**
 * The uncharted stand-ins for the two Overview instruments when the books are
 * open but nothing has been logged.
 *
 * Both follow the same rule: show the real card, real header, real label — and
 * substitute geometry that makes no measurement claim. An instrument that reads
 * zero is asserting a measurement nobody took; an instrument that is visibly
 * uncharged is telling the truth.
 */

/**
 * The balance chart's stand-in: one anchor point at the opening balance and a
 * dashed FLAT line forward.
 *
 * Flat is the whole point. The balance genuinely has been this number since the
 * moment it was stated, so a horizontal line is the only honest shape — and it
 * implies no direction. (The hardcoded rising polyline this replaces on the
 * glance strip drew money going up for a chapter that had logged nothing, which
 * is the same lie in miniature.)
 */
export function GhostBalanceChart({ balanceLabel }: { balanceLabel: string }) {
  return (
    <div className="tr-ghost-stage tr-ghost-stage-low">
      <svg viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
        {/* Two dashed gridlines to hold the space a real chart's axis would */}
        <line x1="0" y1="150" x2="400" y2="150" stroke="var(--line-soft)" strokeWidth="1" strokeDasharray="3 6" />
        <line x1="0" y1="50" x2="400" y2="50" stroke="var(--line-soft)" strokeWidth="1" strokeDasharray="3 6" />
        <line x1="26" y1="100" x2="392" y2="100" stroke="var(--vio)" strokeWidth="1.5" strokeDasharray="2 7" opacity=".55" />
      </svg>
      {/* The anchor is a plain positioned dot rather than a shape inside the
          stretched viewBox above. preserveAspectRatio="none" scales x and y by
          different factors, and this card is far wider than it is tall, so any
          circle authored in that coordinate space renders as a tall ellipse —
          compensating with a fixed rx/ry ratio only works at one card width. */}
      <span className="tr-anchor-dot" aria-hidden="true" />
      <div className="tr-ghost-cap">
        <p className="t">{balanceLabel} and holding.</p>
        <p className="m">The line stays flat until the first entry — it isn&apos;t drawing a trend yet.</p>
      </div>
    </div>
  );
}

/**
 * The breakdown donut's stand-in: two concentric hairline circles — a donut
 * SILHOUETTE, not arcs.
 *
 * With no amounts, any segmented ring necessarily draws equal slices, and an
 * equal-slice donut is read as a real spend split ("we spend the same on
 * everything") rather than as an absence. So there are no segments at all.
 *
 * A dashed thick stroke was the first attempt at suggesting segments-to-come and
 * renders as a radial sunburst — don't reach for it.
 */
export function GhostDonut({ categoryCount }: { categoryCount: number }) {
  return (
    <div className="tr-ghost-stage">
      <div className="tr-ring-stack">
        <svg className="tr-ring" viewBox="0 0 140 140" aria-hidden="true">
          <circle cx="70" cy="70" r="52" fill="none" stroke="var(--line)" strokeWidth="1.25" />
          <circle cx="70" cy="70" r="37" fill="none" stroke="var(--line)" strokeWidth="1.25" />
        </svg>
        <div className="tr-ghost-cap">
          <p className="t">No slices yet.</p>
          <p className="m">
            {categoryCount > 0
              ? <>{categoryCount} {categoryCount === 1 ? "category is" : "categories are"} set up and waiting — the first entry fills one in.</>
              : <>The first entry fills this in.</>}
          </p>
        </div>
      </div>
    </div>
  );
}
