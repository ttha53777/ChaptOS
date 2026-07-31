import { Doodle, sx } from "../Doodle";
import { BILLING_BANDS, formatPrice } from "@/lib/billing/tiers";

const FREE_BAND = BILLING_BANDS[0];
const FIRST_PAID = BILLING_BANDS.find(b => (b.priceCents ?? 0) > 0) ?? BILLING_BANDS[1];

/**
 * The countdown and the three step labels are filled in by term() after mount,
 * not on the server: rendering a date server-side would either hydrate-mismatch
 * or bake a stale number into the static output. The markup ships the em-dash
 * placeholder the mock uses.
 */
export function Cta() {
  return (
    <section className="cta" id="start">
      <Doodle
        id="mug"
        className="cta__blob"
        viewBox="0 0 24 24"
        style={sx({ top: "9%", left: "2%", width: "104px", color: "var(--peach-ink)", opacity: ".32" })}
      />
      <Doodle
        id="plant"
        className="cta__blob"
        viewBox="0 0 24 24"
        style={sx({ bottom: "13%", right: "2%", width: "98px", color: "var(--mint-ink)", opacity: ".32" })}
      />
      <Doodle
        id="star"
        className="cta__blob"
        viewBox="0 0 24 24"
        style={sx({ top: "16%", right: "9%", width: "74px", color: "var(--lilac-ink)", opacity: ".3" })}
      />

      <div className="wrap">
        <div className="cta__card" data-reveal="scale">
          {/* Two variants, switched by a class on the parent rather than an
              innerHTML overwrite — React owns this subtree. `display:contents`
              on the wrappers keeps all four pieces as direct flex children so
              the 10px gap survives. A visitor arriving mid-term gets a nudge
              that doesn't lie about the calendar. */}
          <p className="cta__count" data-term-card>
            <Doodle id="cal" size={16} style={{ alignSelf: "center" }} />
            <span className="t-soon">
              <span data-term-label>Fall term</span> starts in{" "}
              <span className="k" data-term-days>
                —
              </span>{" "}
              <span data-term-unit>days</span>
            </span>
            <span className="t-mid">Mid-term is the second-best time to start</span>
          </p>

          <h2>
            Be the board that
            <br />
            didn&apos;t inherit a mess.
          </h2>

          <p className="lede cta__lede">
            Setup takes an afternoon. Describe the org, bring your people in, and walk into
            your first meeting with the roster, the dues, the calendar and the record already
            in one place.
          </p>

          <div className="cta__actions">
            <a className="btn btn--lg" href="/create">
              Set up your org — free
            </a>
            <a className="btn btn--ghost btn--lg" href="#ask">
              Ask it something first
            </a>
          </div>

          <div className="plan">
            <div className="plan__step" style={sx({ "--st": "var(--peach-ink)" })}>
              <p className="plan__when" data-term-w1>
                This week
              </p>
              <h4>Describe your org</h4>
              <p>
                A short interview drafts your pages, seats, vocabulary and first term. You
                edit the blueprint, then sign in. ~20 minutes.
              </p>
              <Doodle
                id="arrow-r"
                className="plan__arrow doodle doodle--thin"
                viewBox="0 0 24 24"
                style={sx({ color: "var(--line-2)" })}
              />
            </div>
            <div className="plan__step" style={sx({ "--st": "var(--sky-ink)" })}>
              <p className="plan__when" data-term-w2>
                Before day one
              </p>
              <h4>Bring your people in</h4>
              <p>
                Paste the roster from whatever sheet you have, or send one invite link. Seats
                already carry their powers, so exec is exec on day one.
              </p>
              <Doodle
                id="arrow-r"
                className="plan__arrow doodle doodle--thin"
                viewBox="0 0 24 24"
                style={sx({ color: "var(--line-2)" })}
              />
            </div>
            <div className="plan__step" style={sx({ "--st": "var(--mint-ink)" })}>
              <p className="plan__when" data-term-w3>
                Week one
              </p>
              <h4>Just open the dashboard</h4>
              <p>
                It tells you what&apos;s late and what&apos;s this week. You spend the term
                on the org instead of on the spreadsheet about the org.
              </p>
            </div>
          </div>

          {/* Derived from BILLING_BANDS, not typed by hand. The previous version
              of this line claimed "free under 25 members · $29/term · advisor and
              campus-wide plans" — a wrong limit, a wrong price, a wrong billing
              period, and two plans that never existed. A hardcoded price is a
              promise that rots. */}
          <p className="cta__fine">
            Free for orgs of {FREE_BAND.upTo} or fewer, forever ·{" "}
            {formatPrice(FIRST_PAID.priceCents)}/month above that, for the whole org ·
            Every feature on every plan · <a href="/pricing">See pricing</a>
          </p>
        </div>
      </div>
    </section>
  );
}
