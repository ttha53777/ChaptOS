import { Doodle, sx } from "../Doodle";
import { BILLING_BANDS, SELF_SERVE_MAX, formatPrice, type BillingBand } from "@/lib/billing/tiers";

const FREE_BAND = BILLING_BANDS[0];
const FIRST_PAID = BILLING_BANDS.find(b => (b.priceCents ?? 0) > 0) ?? BILLING_BANDS[1];

/**
 * "1–4 people" / "121+ people". Deliberately not formatRange(), which says
 * "members": this page's voice is "five of you", and the word member means
 * something specific in the product. Derived from the band either way, so the
 * numbers still can't drift.
 */
const peopleRange = (band: BillingBand) =>
  band.upTo === null ? `${band.from}+ people` : `${band.from}–${band.upTo} people`;

/**
 * What it costs — the landing page's answer, not the whole story.
 *
 * Deliberately NOT a plan chooser. A visitor never picks a band: tierForCount()
 * derives it from the headcount, and lib/billing/sync.ts pushes the change to
 * Stripe in both directions on its own. So this renders as a ladder you land on
 * rather than four cards with an upgrade button, which also removes the thing
 * that makes pricing grids exhausting — a feature-comparison matrix. There is
 * nothing to compare: no tier gates any feature anywhere in this codebase
 * (tierForCount appears only in billing, admin and pricing surfaces).
 *
 * /pricing keeps the depth: the estimator, who counts as a person, the FAQ.
 * This is the five-second version with a way through to it.
 *
 * ACCURACY — same standard as /pricing and the help centre. Every figure comes
 * from BILLING_BANDS, and the three reassurances were each checked against the
 * code rather than assumed:
 *   · "every feature at every price"   — no tier gating exists; enabledWorkflows
 *     and disabledFeatures are org config, not plan.
 *   · "nothing is taken away"          — lib/billing/guard.ts is the only raiser
 *     of PaymentRequiredError and runs on growth paths only (add member,
 *     un-archive). See app/lib/seat-wall.ts's header.
 *   · "it follows you back down"       — lib/billing/sync.ts pushes shrinks
 *     immediately with proration "none", so the saving lands on the next
 *     invoice. Don't upgrade this into "we refund the difference".
 */
export function Price() {
  return (
    <section className="section section--tight price" id="price">
      {/* The two hindmost layers. Both are decorative, both live behind .wrap,
          and the section reads identically with JS off, where each just sits at
          its resting offset. They drift against each other — the bloom back and
          the rules forward — so the band gains a back instead of being a flat
          tint with two doodles pinned to it.

          Per landing.css's motion contract, none of these carry [data-reveal]
          and none of them use transform for layout: the parallax engine owns
          the transform property on every [data-para] node. */}
      <div className="price__depth" aria-hidden="true">
        <div className="price__wash" data-para data-speed="-0.085" />
        <div className="price__rules" data-para data-speed="0.05" />
      </div>

      {/* The doodles float free of the layers behind them, one drifting each
          way. They're wrapped rather than parallaxed directly because <Doodle>
          takes a fixed prop set — and the span is what carries the position,
          so the engine's inline transform has nothing to collide with.

          `doodle` is not optional here: stroke-width lives on that class, and
          the symbols only carry stroke="currentColor". Without it these render
          at the SVG default 1px and read as empty outlines at this size. */}
      <span
        className="price__blob"
        aria-hidden="true"
        data-para
        data-speed="0.095"
        style={sx({ top: "13%", left: "3%", width: "78px", color: "var(--mint-ink)", opacity: ".3" })}
      >
        <Doodle id="wallet" className="doodle" viewBox="0 0 24 24" />
      </span>
      <span
        className="price__blob"
        aria-hidden="true"
        data-para
        data-speed="-0.07"
        style={sx({ bottom: "6%", right: "3.5%", width: "72px", color: "var(--sky-ink)", opacity: ".28" })}
      >
        <Doodle id="receipt" className="doodle" viewBox="0 0 24 24" />
      </span>
      <span
        className="price__blob"
        aria-hidden="true"
        data-para
        data-speed="0.115"
        style={sx({ top: "9%", right: "8%", width: "46px", color: "var(--lilac-ink)", opacity: ".24" })}
      >
        <Doodle id="star" className="doodle" viewBox="0 0 24 24" />
      </span>

      <div className="wrap">
        <div className="price__head">
          <span
            className="eyebrow"
            style={sx({ "--eb": "var(--mint)", justifyContent: "center" })}
            data-reveal
          >
            What it costs
          </span>
          <h2 data-reveal style={sx({ marginTop: "16px", "--d": "60ms", maxWidth: "20ch", marginInline: "auto" })}>
            One price for the whole org. No per-person math.
          </h2>
          <p className="lede" data-reveal style={sx({ marginTop: "18px", "--d": "110ms" })}>
            {/* Deliberately not .hi: this section paints its own background,
                and .hi::before is a z-index:-1 child (see landing.css's header
                note). Weight carries it at lede size better than a highlighter
                sized for an h1 anyway. */}
            Free while there are {FREE_BAND.upTo} or fewer of you, then{" "}
            {formatPrice(FIRST_PAID.priceCents)} a month for <em>everyone</em> — not each. Every
            feature is in every row.
          </p>
        </div>

        {/* The rungs rise left to right: --i drives the static offset in CSS,
            which mobile clears, and RUNG_SPEED makes that rise kinetic — the
            staircase steepens on the way in and settles as it passes. An <ol>
            because the order is the whole point.

            Two elements per rung, not one: the motion contract forbids
            [data-para] and [data-reveal] on the same node, so the <li> is the
            parallax carrier (grid cell + lift) and .rung__in holds the card
            chrome and the reveal. */}
        <div className="ladder__deck">
          {/* The section's own metaphor, drawn once behind the thing it belongs
              to: four treads for four bands, so the real ladder rides against a
              ghost of itself and you read the rise even where the cards cover
              it. Anchored to the deck rather than to the section — the point is
              that it lines up with the rungs, which nothing measured off the
              section's own height would do. It hangs below them on purpose, so
              the bottom tread and the ground line clear the cards.

              The risers sit on the grid's three gaps (a quarter, a half and
              three quarters across the 640-unit box, which preserveAspectRatio
              :none maps straight onto the columns) and the treads rise about as
              far as the cards' own lift, so the row reads as standing on the
              steps. Steeper than that and it stops echoing the ladder and turns
              into a diagonal cutting behind it.

              Coordinates are a pixel or two off-register throughout; exact
              right angles read as chart gridlines rather than as one of this
              page's doodles. Nothing here is diagonal, so the box stretching
              wider than it is tall costs the drawing nothing. */}
          <svg
            className="doodle ladder__ghost"
            viewBox="0 0 640 200"
            preserveAspectRatio="none"
            aria-hidden="true"
            data-para
            data-speed="0.06"
          >
            <line className="ladder__ghost-base" x1="6" y1="190" x2="634" y2="190" />
            <polyline points="12,189 13,169 159,167 161,150 319,151 321,132 479,134 481,114 628,113" />
          </svg>

          <ol className="ladder">
            {BILLING_BANDS.map((band, i) => {
              const tint = LADDER_TINT[i] ?? "mint";
              const isQuote = band.priceCents === null;
              return (
                <li
                  key={band.id}
                  className={`rung${isQuote ? " rung--quote" : ""}`}
                  data-para
                  data-speed={RUNG_SPEED[i] ?? RUNG_SPEED[0]}
                  data-para-min="1081"
                  style={sx({
                    "--i": i,
                    "--bt": `var(--${tint})`,
                    "--bti": `var(--${tint}-ink)`,
                  })}
                >
                  <div className="rung__in" data-reveal style={sx({ "--d": `${i * 70}ms` })}>
                    <p className="rung__range mono">{peopleRange(band)}</p>
                    <p className="rung__price">
                      {isQuote ? (
                        <span className="rung__custom">Let&apos;s talk</span>
                      ) : (
                        <>
                          <span className="n">{formatPrice(band.priceCents)}</span>
                          <span className="per">/month</span>
                        </>
                      )}
                    </p>
                    <p className="rung__note">{LADDER_NOTE[i]}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <p className="ladder__cap" data-reveal style={sx({ "--d": "120ms" })}>
          <Doodle id="loop" size={17} className="doodle doodle--thin" />
          You never pick a row. Your roster lands you on one, and it moves you
          between them on its own — in both directions.
        </p>

        <div className="assur">
          <div className="assur__i" data-reveal style={sx({ "--d": "0ms" })}>
            <span className="assur__ic" style={sx({ "--g": "var(--mint-soft)", "--gb": "#BDE7D2" })}>
              <Doodle
                id="check"
                className="doodle doodle--thin"
                size={19}
                viewBox="0 0 24 24"
                style={sx({ color: "var(--mint-ink)" })}
              />
            </span>
            <h4>Every feature at every price</h4>
            <p>
              The roster, dues and the ledger, attendance, the timeline, docs, the assistant,
              exports, the audit log — on the free plan too. No screen tells you to upgrade to
              see it.
            </p>
          </div>
          <div className="assur__i" data-reveal style={sx({ "--d": "90ms" })}>
            <span className="assur__ic" style={sx({ "--g": "var(--sky-soft)", "--gb": "#CCDFFB" })}>
              <Doodle
                id="shield"
                className="doodle doodle--thin"
                size={19}
                viewBox="0 0 24 24"
                style={sx({ color: "var(--sky-ink)" })}
              />
            </span>
            <h4>Nothing is taken away at the limit</h4>
            <p>
              Cross the free line and the <em>next</em> person you add waits for a card. Nobody
              is removed, every page keeps working, your exports keep working. It only ever
              pauses growth.
            </p>
          </div>
          <div className="assur__i" data-reveal style={sx({ "--d": "180ms" })}>
            <span className="assur__ic" style={sx({ "--g": "var(--lilac-soft)", "--gb": "#DCD2FB" })}>
              <Doodle
                id="people"
                className="doodle doodle--thin"
                size={19}
                viewBox="0 0 24 24"
                style={sx({ color: "var(--lilac-ink)" })}
              />
            </span>
            <h4>It follows you back down</h4>
            <p>
              Seniors graduate, your headcount drops, and next month&apos;s invoice is smaller.
              You don&apos;t have to ask, and there&apos;s no plan to downgrade.
            </p>
          </div>
        </div>

        <p className="price__more" data-reveal style={sx({ "--d": "240ms" })}>
          <a href="/pricing">
            See the full pricing page
            <Doodle id="arrow-r" className="doodle doodle--thin" size={18} viewBox="0 0 24 24" />
          </a>
          <span>
            Work out your own number, who counts as a person, and what happens above{" "}
            {SELF_SERVE_MAX}.
          </span>
        </p>
      </div>
    </section>
  );
}

/** Pastel per rung, ascending. Same order /pricing uses, so the pages agree. */
const LADDER_TINT = ["mint", "sky", "lilac", "butter"] as const;

/**
 * Parallax depth per rung, ascending with the lift the CSS already gives them.
 * Negative because the engine's offset is signed against the viewport centre:
 * a rung below the middle of the screen gets pulled *up*, so the far end of the
 * ladder arrives ahead of the near end and the staircase visibly steepens as
 * the section comes in, then flattens as it leaves.
 *
 * The spread is what carries it, not the magnitude — at these speeds the last
 * rung travels ~±34px against the first's ~±8px over a full pass, which is a
 * rise you feel without the row ever looking broken. Turned off below 1081 via
 * data-para-min, in step with the lift: a wrapped 2×2 ladder has to stay level.
 */
const RUNG_SPEED = ["-0.02", "-0.042", "-0.064", "-0.086"] as const;

/** One line per rung, positional — kept beside the tints they pair with. */
const LADDER_NOTE = [
  "Free forever at this size.",
  "Flat, for the whole org.",
  "Still flat, still everything.",
  "Priced with you, not off a table.",
] as const;
