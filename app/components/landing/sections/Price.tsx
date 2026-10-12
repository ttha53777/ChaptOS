import { Doodle, sx } from "../Doodle";
import { PriceBoard } from "./PriceBoard";

/**
 * What it costs — the landing page's answer, not the whole story.
 *
 * Deliberately NOT a plan chooser. A visitor never picks a band: tierForCount()
 * derives it from the headcount, and lib/billing/sync.ts pushes the change to
 * Stripe in both directions on its own. So the section is one headcount slider
 * (PriceBoard) that lands you on a band, with no feature-comparison matrix —
 * there is nothing to compare, since no tier gates any feature.
 *
 * /pricing keeps the depth: the estimator, who counts as a person, the FAQ.
 * This is the five-second version with a way through to it. Every figure comes
 * from BILLING_BANDS; the promises are checked against the code (see PROMISES).
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
          <h2 data-reveal style={sx({ marginTop: "16px", "--d": "60ms" })}>
            One price for the <span className="hi">whole</span> org.
          </h2>
          <p className="lede" data-reveal style={sx({ marginTop: "12px", "--d": "110ms" })}>
            Not per person. Drag to your headcount.
          </p>
        </div>

        <div data-reveal style={sx({ "--d": "160ms" })}>
          <PriceBoard />
        </div>

        <ul className="promises">
          {PROMISES.map((p, i) => (
            <li
              key={p.text}
              className="promise"
              data-reveal
              style={sx({ "--d": `${220 + i * 70}ms`, "--g": `var(--${p.tint}-soft)`, "--gi": `var(--${p.tint}-ink)` })}
            >
              <span className="promise__ic">
                <Doodle id={p.icon} className="doodle doodle--thin" size={17} viewBox="0 0 24 24" />
              </span>
              {p.text}
            </li>
          ))}
        </ul>

        <p className="price__more" data-reveal style={sx({ "--d": "420ms" })}>
          <span>You never pick a plan — your roster does.</span>
          <a href="/pricing">
            Full pricing details
            <Doodle id="arrow-r" className="doodle doodle--thin" size={18} viewBox="0 0 24 24" />
          </a>
        </p>
      </div>
    </section>
  );
}

/**
 * Each checked against the code, same standard as /pricing:
 *   · every feature   — no tier gating exists; enabledWorkflows and
 *     disabledFeatures are org config, not plan.
 *   · nothing locks   — lib/billing/guard.ts only raises PaymentRequiredError on
 *     growth paths (add member, un-archive); nobody is removed, pages keep working.
 *   · shrinks back    — lib/billing/sync.ts pushes shrinks with proration "none",
 *     so the saving lands on the next invoice. Not a refund.
 */
const PROMISES = [
  { icon: "check", tint: "mint", text: "Every feature, every price" },
  { icon: "shield", tint: "sky", text: "Nothing locks at the limit" },
  { icon: "loop", tint: "lilac", text: "Shrinks back on its own" },
] as const;
