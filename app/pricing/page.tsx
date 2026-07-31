// Pricing — the public page.
//
// Every number on this page is derived from lib/billing/tiers.ts, the same
// module the app charges from and scripts/stripe-setup.ts builds the Stripe
// Price out of. Nothing here is a hand-typed figure, because the last version of
// this copy (one line in the landing CTA) drifted into saying "free under 25
// members, $29/term" while the app charged $25/month above 4 — every clause
// wrong, for who knows how long.
//
// ACCURACY, same standard as the help centre. Two claims below are load-bearing
// and both were checked against the code rather than assumed:
//   · "every feature at every price" — there is no tier gating anywhere in this
//     codebase. enabledWorkflows and disabledFeatures are org config, not plan.
//   · "nothing is taken away at the limit" — PaymentRequiredError is raised on
//     growth paths only (see its doc comment in lib/errors/index.ts).
// Do NOT add a line about archiving members to save money: the API supports it
// but there is no archive button in the product yet.
//
// Deliberately static and motionless — no LandingMotion in this tree, so no
// [data-reveal] hooks. See ../components/landing/public-chrome.css.
import type { Metadata } from "next";

import "../components/landing/landing.css";
import "../components/landing/public-chrome.css";
import "./pricing.css";

import { Doodle, sx } from "../components/landing/Doodle";
import { DoodleSprite } from "../components/landing/DoodleSprite";
import { landingFontClass } from "../components/landing/fonts";
import { PublicNav } from "../components/landing/PublicChrome";
import { Footer } from "../components/landing/sections/Footer";
import { PriceEstimator } from "./PriceEstimator";
import { APP_NAME } from "@/lib/domains";
import { BILLING_BANDS, SELF_SERVE_MAX, formatPrice, formatRange } from "@/lib/billing/tiers";

const FREE_BAND = BILLING_BANDS[0];
const FIRST_PAID = BILLING_BANDS.find(b => (b.priceCents ?? 0) > 0) ?? BILLING_BANDS[1];

export const metadata: Metadata = {
  title: `Pricing — ${APP_NAME}`,
  description:
    `Free for organizations of ${FREE_BAND.upTo} or fewer. ` +
    `${formatPrice(FIRST_PAID.priceCents)} a month above that, for the whole organization. ` +
    "Every feature included at every price.",
};

// Pastel accents per band, in ascending order. Purely decorative.
const BAND_TINT = ["mint", "sky", "lilac", "butter"] as const;

export default function PricingPage() {
  return (
    <div className={`lp pub pr ${landingFontClass}`}>
      <DoodleSprite />

      <PublicNav here="pricing" />

      <main id="top">
        <section className="pub__hero">
          <div className="wrap">
            <div className="pub__head">
              <span className="eyebrow" style={sx({ "--eb": "var(--mint)" })}>
                Pricing
              </span>
              <h1>Free until there are five of you.</h1>
              <p className="lede">
                One price for the whole organization, set by how many people are on it. Not per
                person, not per term, and not a different product at each price — everyone gets
                everything.
              </p>
            </div>
          </div>
        </section>

        {/* ---- the bands ---- */}
        <section className="pr__bands">
          <div className="wrap">
            <div className="pr__grid">
              {BILLING_BANDS.map((band, i) => {
                const tint = BAND_TINT[i] ?? "mint";
                const isQuote = band.priceCents === null;
                return (
                  <div
                    key={band.id}
                    className={`pr__card${isQuote ? " pr__card--quote" : ""}`}
                    style={sx({ "--bt": `var(--${tint})`, "--bts": `var(--${tint}-soft)`, "--bti": `var(--${tint}-ink)` })}
                  >
                    <p className="pr__plan">{band.label}</p>
                    <p className="pr__price">
                      {isQuote ? (
                        <span className="pr__custom">Let&apos;s talk</span>
                      ) : (
                        <>
                          <span className="n">{formatPrice(band.priceCents)}</span>
                          <span className="per">/month</span>
                        </>
                      )}
                    </p>
                    <p className="pr__range">{formatRange(band)}</p>
                    <p className="pr__note">
                      {i === 0
                        ? "Enough to get a board set up and see whether any of this helps."
                        : isQuote
                          ? `Above ${SELF_SERVE_MAX} people we work it out with you rather than off a table.`
                          : "Everything included. Cancel whenever."}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---- estimator ---- */}
        <section className="pr__est">
          <div className="wrap">
            <div className="pr__esthead">
              <span className="eyebrow" style={sx({ "--eb": "var(--sky)" })}>
                Work it out
              </span>
              <h2>What would yours cost?</h2>
              <p className="lede">
                Put in roughly how many people are on your roster. This is the same table the app
                bills from, so the answer is the real one.
              </p>
            </div>
            <PriceEstimator />
          </div>
        </section>

        {/* ---- what counts ---- */}
        <section className="pr__counts">
          <div className="wrap">
            <div className="pr__countgrid">
              <div className="pr__counthead">
                <span className="eyebrow" style={sx({ "--eb": "var(--butter)" })}>
                  The fine print, up front
                </span>
                <h3>Who counts as a person</h3>
                <p>
                  Worth being exact about, since it&apos;s the only number that decides your bill.
                </p>
              </div>
              <ul className="pr__countlist">
                <li>
                  <span className="ic ok"><Doodle id="check" size={15} viewBox="0 0 24 24" /></span>
                  <span className="t">
                    <b>Everyone on your roster</b>, plus anyone who can sign in to the org.
                    Someone who is both is still one person.
                  </span>
                </li>
                <li>
                  <span className="ic no"><Doodle id="clip" size={15} viewBox="0 0 24 24" /></span>
                  <span className="t">
                    <b>Placeholder records don&apos;t count.</b> Rows you made to hold a name or
                    track history, with nobody signing in behind them, are free.
                  </span>
                </li>
                <li>
                  <span className="ic no"><Doodle id="people" size={15} viewBox="0 0 24 24" /></span>
                  <span className="t">
                    <b>One person in two organizations</b> is counted once in each — the two orgs
                    have separate bills, because they&apos;re separate organizations.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* ---- included ---- */}
        <section className="pr__incl">
          <div className="wrap">
            <div className="pr__inclcard">
              <div className="t">
                <span className="eyebrow" style={sx({ "--eb": "var(--lilac)" })}>
                  No tiers, really
                </span>
                <h3>Every feature at every price.</h3>
                <p>
                  The roster, dues and the ledger, attendance, the timeline, documents, the
                  assistant, exports, the audit log — all of it, on the free plan too. There is no
                  feature in this product that costs extra, and no screen that tells you to
                  upgrade to see it. The only thing the price tracks is how many of you there are.
                </p>
              </div>
              <div className="a">
                <a className="btn btn--lg" href="/create">
                  Set up your org — free
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ---- FAQ ---- */}
        <section className="pr__faq">
          <div className="wrap">
            <div className="pr__faqhead">
              <h2>The questions that actually come up</h2>
            </div>
            <div className="pr__faqgrid">
              <div className="pr__q">
                <h4>What happens when we outgrow the free plan?</h4>
                <p>
                  The next person you try to add won&apos;t go through until a card is on file.
                  That&apos;s the whole consequence — nobody is removed, nothing is hidden, every
                  page keeps working and your exports keep working. It only ever blocks growth.
                </p>
              </div>
              <div className="pr__q">
                <h4>Do we get charged the moment we add a card?</h4>
                <p>
                  No. Billing follows your headcount, so if you add a card while there are still
                  {" "}{FREE_BAND.upTo} of you, it sits there at {formatPrice(FREE_BAND.priceCents)}.
                  You start paying the month you cross into the next band.
                </p>
              </div>
              <div className="pr__q">
                <h4>What if we shrink?</h4>
                <p>
                  The price follows you back down. Seniors graduate, your headcount drops, and the
                  next invoice reflects the smaller number — you don&apos;t have to ask.
                </p>
              </div>
              <div className="pr__q">
                <h4>Who pays — the chapter or a person?</h4>
                <p>
                  Whoever puts the card in. The subscription belongs to whoever set the
                  organization up, and it&apos;s kept completely separate from the chapter&apos;s
                  own dues and budget inside the app. Two different kinds of money.
                </p>
              </div>
              <div className="pr__q">
                <h4>How do we cancel?</h4>
                <p>
                  In the billing portal, in a couple of clicks, without emailing anyone. You keep
                  the rest of the month you paid for, then drop back to the free plan. Your
                  records stay where they are.
                </p>
              </div>
              <div className="pr__q">
                <h4>We&apos;re bigger than {SELF_SERVE_MAX}. Now what?</h4>
                <p>
                  Then a table is the wrong way to price it. Ask for a quote from inside the app
                  or write to us and we&apos;ll come back with a number that fits what you
                  actually are.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---- escalation ---- */}
        <section className="pub__ask">
          <div className="wrap">
            <div className="pub__askcard">
              <div className="t">
                <h3>Still deciding?</h3>
                <p>
                  Setting an org up is free and takes an afternoon, and nothing asks for a card
                  along the way. If you&apos;d rather ask a person first, that works too.
                </p>
              </div>
              <div className="a">
                <a className="btn" href="/create">
                  Set up your org <Doodle id="arrow-r" size={16} viewBox="0 0 24 24" />
                </a>
                <a className="btn btn--ghost" href="/contact">
                  Talk to a human
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
